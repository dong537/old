"""Offline behavior checks for the private observed MCA JSON catalog."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import unittest


SCRIPT = runpy.run_path(str(Path(__file__).resolve().parents[1]
                            / 'scripts/build-mca-observed-catalog.py'),
                        run_name='mca_catalog_test')


class McaObservedCatalogTest(unittest.TestCase):
    def test_cli_requires_explicit_mirror_location(self):
        with contextlib.redirect_stderr(io.StringIO()) as output:
            with self.assertRaises(SystemExit) as caught:
                SCRIPT['main']([])
        self.assertEqual(caught.exception.code, 2)
        self.assertIn('--mirror', output.getvalue())

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.mirror = self.root / 'mirror'
        self.output = self.root / 'catalog'

    def lane(self, name, documents):
        base = self.mirror / name
        files = []
        for category, relative, document in documents:
            raw = SCRIPT['canonical'](document)
            sha = SCRIPT['digest'](raw)
            object_path = base / 'objects' / sha[:2] / (sha + '.json')
            object_path.parent.mkdir(parents=True, exist_ok=True)
            object_path.write_bytes(raw)
            files.append({'category': category, 'sourceRelativePath': relative,
                          'objectRelativePath': 'objects/' + sha[:2] + '/' + sha + '.json',
                          'sha256': sha, 'bytes': len(raw)})
        snapshot = {'schemaVersion': 1, 'publishable': False,
                    'fileCount': len(files), 'files': files,
                    'capturedAtUtc': '2026-11-20T00:00:00+00:00'}
        raw = SCRIPT['canonical'](snapshot)
        sha = SCRIPT['digest'](raw)
        (base / 'snapshots').mkdir(parents=True, exist_ok=True)
        (base / 'snapshots' / (sha + '.json')).write_bytes(raw)
        (base / 'latest.json').write_bytes(SCRIPT['canonical']({
            'schemaVersion': 1, 'snapshotSha256': sha}))
        return files

    def fixture(self, endpoint_id='ABCD1234', base_tag='公办 · 医养结合'):
        rows = [
            {'axbe0001': 'ABCD1234', 'axbe0003': '旧名称',
             'axbe0013': '甲地址', 'ahae2347': 0, 'ahae2323': None,
             'axbe8004': 0, 'ahde8404': '00', 'evaluationCount': 0,
             'overallEvaluation': 0.0, 'ahae0702Name': None,
             'tag': '公办 · 医养结合',
             'unknownList': {'raw': [None, 0, '']}},
            {'axbe0001': '116010', 'axbe0003': '列表独有机构',
             'ahae2347': 80, 'areaCode': '360000000000',
             'ahde8404': '05', 'evaluationCount': 3,
             'overallEvaluation': 4.5, 'ahae0702Name': '社区嵌入式',
             'tag': '  原始标签  '},
        ]
        wrapper = {'httpStatus': 200, 'responseSha256': 'response-list',
                   'fetchedAtUtc': '2026-11-20T00:00:00+00:00',
                   'response': {'code': 0, 'data': {'records': rows}}}
        self.lane('', [('institutionListPage', 'pages/00001.json', wrapper)])
        self.lane('province-root-pages', [])
        self.lane('area-page-observations', [])
        base = {'httpStatus': 200, 'responseSha256': 'response-base',
                'fetchedAtUtc': '2026-11-20T01:00:00+00:00',
                'response': {'code': 0, 'data': {
                    'axbe0001': endpoint_id, 'axbe0003': '新名称',
                    'axbe0013': '甲地址', 'axbe8004': None,
                    'evaluationCount': 0, 'overallEvaluation': 0.0,
                    'ahae0702Name': None, 'tag': base_tag,
                    'unknownBase': {'contact': '仅私有原值'}}}}
        care = {'httpStatus': 200, 'responseSha256': 'response-care',
                'fetchedAtUtc': '2026-11-20T01:00:00+00:00',
                'response': {'code': 0, 'data': {
                    'ahae2347': 50, 'ahae2323': 0,
                    'hae8List': [{'field': None, 'zero': 0}]}}}
        detail = {'institutionId': 'ABCD1234',
                  'fetchedAtUtc': '2026-11-20T01:00:00+00:00',
                  'endpoints': {'orgBaseDetail': base, 'yangLaoOrgDetail': care}}
        files = self.lane('detail-collection', [
            ('committedDetailItemEvidence',
             'run/items/ABCD1234/details/ABCD1234.json', detail)])
        self.lane('newpage-detail-collection', [])
        self.lane('unified-detail-collection', [])
        return files[0]

    def test_build_retains_raw_fields_zero_and_list_only_id(self):
        self.fixture()
        result = SCRIPT['build'](self.mirror, self.output)
        self.assertEqual(result['recordCount'], 2)
        self.assertEqual(result['withDetailCount'], 1)
        self.assertEqual(result['listObservationCount'], 2)
        self.assertEqual(result['detailObservationCount'], 1)
        target = Path(result['output'])
        index = json.loads((target / 'index.json').read_text(encoding='utf-8'))
        rows = {row['mcaId']: row for row in index['records']}
        self.assertIsNone(rows['ABCD1234']['name'])
        self.assertIsNone(rows['ABCD1234']['listedBeds'])
        self.assertEqual(rows['ABCD1234']['nursingBeds'], 0)
        self.assertEqual(rows['ABCD1234']['listedMonthlyFeeMin'], 0)
        self.assertIn('name', rows['ABCD1234']['conflictFields'])
        self.assertFalse(rows['116010']['hasDetail'])
        self.assertIsNone(rows['116010']['address'])
        self.assertTrue((target / rows['116010']['detailPath']).is_file())
        detail = json.loads((target / rows['ABCD1234']['detailPath']).read_text(encoding='utf-8'))
        self.assertEqual(detail['detailObservations'][0]['endpoints']['orgBaseDetail']
                         ['sourceFields']['axbe0001'], 'ABCD1234')
        self.assertNotIn('axbe0001', detail['detailObservations'][0]['endpoints']
                         ['yangLaoOrgDetail']['sourceFields'])
        self.assertNotIn('name', detail['selectedFieldSources'])
        self.assertNotIn('listedBeds', detail['selectedFieldSources'])
        self.assertEqual(detail['listObservations'][0]['sourceFields']['axbe0003'], '旧名称')
        self.assertEqual(detail['detailObservations'][0]['endpoints']['orgBaseDetail']
                         ['sourceFields']['axbe0003'], '新名称')
        self.assertEqual(detail['listObservations'][0]['sourceFields']['unknownList']['raw'],
                         [None, 0, ''])
        self.assertEqual(detail['detailObservations'][0]['endpoints']['orgBaseDetail']
                         ['sourceFields']['unknownBase']['contact'], '仅私有原值')
        self.assertEqual(detail['detailObservations'][0]['endpoints']['yangLaoOrgDetail']
                         ['sourceFields']['hae8List'][0]['zero'], 0)
        self.assertEqual(SCRIPT['build'](self.mirror, self.output)['snapshotId'],
                         result['snapshotId'])

    def test_corrupt_object_keeps_previous_pointer(self):
        entry = self.fixture()
        first = SCRIPT['build'](self.mirror, self.output)
        pointer = (self.output / 'current.json').read_bytes()
        path = self.mirror / 'detail-collection' / entry['objectRelativePath']
        path.write_bytes(b'{}')
        with self.assertRaisesRegex(ValueError, 'SHA or length mismatch'):
            SCRIPT['build'](self.mirror, self.output)
        self.assertEqual((self.output / 'current.json').read_bytes(), pointer)
        self.assertEqual(json.loads(pointer)['snapshotId'], first['snapshotId'])

    def test_detail_endpoint_must_match_pair_id(self):
        self.fixture(endpoint_id='WRONG123')
        with self.assertRaisesRegex(ValueError, 'detail endpoint ID differs'):
            SCRIPT['build'](self.mirror, self.output)
        self.assertFalse((self.output / 'current.json').exists())

    def test_explicit_null_detail_endpoint_id_is_rejected(self):
        self.fixture(endpoint_id=None)
        with self.assertRaisesRegex(ValueError, 'detail endpoint ID differs'):
            SCRIPT['build'](self.mirror, self.output)
        self.assertFalse((self.output / 'current.json').exists())

    def test_new_platform_fields_preserve_codes_zero_null_and_raw_tags(self):
        self.fixture()
        target = Path(SCRIPT['build'](self.mirror, self.output)['output'])
        index = json.loads((target / 'index.json').read_text(encoding='utf-8'))
        rows = {row['mcaId']: row for row in index['records']}
        first, second = rows['ABCD1234'], rows['116010']
        self.assertEqual(first['platformStarCode'], '00')
        self.assertEqual(first['evaluationCount'], 0)
        self.assertEqual(first['overallEvaluation'], 0.0)
        self.assertIsNone(first['functionPositioningLabel'])
        self.assertEqual(first['platformTagsRaw'], '公办 · 医养结合')
        self.assertEqual(second['platformStarCode'], '05')
        self.assertEqual(second['evaluationCount'], 3)
        self.assertEqual(second['overallEvaluation'], 4.5)
        self.assertEqual(second['functionPositioningLabel'], '社区嵌入式')
        self.assertEqual(second['platformTagsRaw'], '  原始标签  ')
        detail = json.loads((target / first['detailPath']).read_text(encoding='utf-8'))
        self.assertEqual(detail['listObservations'][0]['sourceFields']['ahde8404'], '00')
        self.assertEqual(detail['detailObservations'][0]['endpoints']['orgBaseDetail']
                         ['sourceFields']['tag'], '公办 · 医养结合')

    def test_new_platform_field_conflict_keeps_raw_candidates(self):
        self.fixture(base_tag='不同标签')
        target = Path(SCRIPT['build'](self.mirror, self.output)['output'])
        index = json.loads((target / 'index.json').read_text(encoding='utf-8'))
        row = next(row for row in index['records'] if row['mcaId'] == 'ABCD1234')
        self.assertIsNone(row['platformTagsRaw'])
        self.assertIn('platformTagsRaw', row['conflictFields'])
        detail = json.loads((target / row['detailPath']).read_text(encoding='utf-8'))
        self.assertNotIn('platformTagsRaw', detail['selectedFieldSources'])
        self.assertEqual(detail['listObservations'][0]['sourceFields']['tag'],
                         '公办 · 医养结合')
        self.assertEqual(detail['detailObservations'][0]['endpoints']['orgBaseDetail']
                         ['sourceFields']['tag'], '不同标签')

    def test_existing_snapshot_must_be_complete_and_match_current_transform(self):
        self.fixture()
        for mutation in ('invalid-index', 'changed-index', 'invalid-fields',
                         'missing-detail', 'extra-file'):
            with self.subTest(mutation=mutation):
                output = self.root / ('catalog-' + mutation)
                first = SCRIPT['build'](self.mirror, output)
                target = Path(first['output'])
                pointer = (output / 'current.json').read_bytes()
                detail_path = next((target / 'details').glob('*.json'))
                if mutation == 'invalid-index':
                    (target / 'index.json').write_text('{"corrupt":true}')
                elif mutation == 'changed-index':
                    index = json.loads((target / 'index.json').read_text(encoding='utf-8'))
                    index['records'][0]['name'] = '过期映射摘要'
                    (target / 'index.json').write_text(json.dumps(index), encoding='utf-8')
                elif mutation == 'invalid-fields':
                    (target / 'field-catalog.json').write_text('{"fields":[]}')
                elif mutation == 'missing-detail':
                    detail_path.unlink()
                else:
                    (target / 'unexpected.json').write_text('{}')
                with self.assertRaisesRegex(ValueError, 'existing catalog snapshot'):
                    SCRIPT['build'](self.mirror, output)
                self.assertEqual((output / 'current.json').read_bytes(), pointer)
                if mutation == 'missing-detail':
                    self.assertFalse(detail_path.exists())
                elif mutation == 'invalid-index':
                    self.assertEqual((target / 'index.json').read_text(), '{"corrupt":true}')


if __name__ == '__main__':
    unittest.main()
