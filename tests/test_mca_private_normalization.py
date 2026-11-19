"""Offline checks for the private MCA normalization preview."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'normalize-mca-private.py'


def write_page(root, page, records, total):
    folder = root / 'area-440000000000' / 'pages'
    folder.mkdir(parents=True, exist_ok=True)
    payload = {
        'fetchedAtUtc': '2026-11-18T12:00:00+00:00',
        'request': {'params': {'current': page, 'size': 10, 'areaCode': '440000000000'}},
        'httpStatus': 200,
        'response': {'code': 0, 'data': {'current': page, 'size': 10, 'total': total, 'records': records}},
    }
    (folder / f'{page:05d}.json').write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')


def write_manifest(root, total, complete=False):
    folder = root / 'area-440000000000'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'manifest.json').write_text(json.dumps({
        'scope': 'area-440000000000', 'total': total, 'serverPageSize': 10,
        'expectedPages': (total + 9) // 10, 'complete': complete,
        'firstFetchedAtUtc': '2026-11-18T12:00:00+00:00',
    }), encoding='utf-8')


def detail_endpoint(identifier, data):
    return {
        'request': {'params': {'axbe0001': identifier}},
        'httpStatus': 200,
        'response': {'code': 0, 'data': data},
    }


def run_normalizer(root):
    result = subprocess.run(
        [sys.executable, str(SCRIPT), '--root', str(root), '--area-code', '440000000000'],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    folder = root / 'area-440000000000'
    return (
        json.loads((folder / 'normalized-preview.json').read_text(encoding='utf-8')),
        json.loads((folder / 'field-gap-report.json').read_text(encoding='utf-8')),
        json.loads((folder / 'quality-report.json').read_text(encoding='utf-8')),
    )


class McaPrivateNormalizationTests(unittest.TestCase):
    def test_check_sort_normalizes_only_explicit_sorted_private_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'area-440113000000-check-sort-1'
            pages = folder / 'pages'
            pages.mkdir(parents=True)
            (folder / 'manifest.json').write_text(json.dumps({
                'scope': folder.name, 'filters': {'areaCode': '440113000000', 'checkSort': 1},
                'total': 1, 'serverPageSize': 10, 'expectedPages': 1, 'complete': False,
            }), encoding='utf-8')
            (pages / '00001.json').write_text(json.dumps({
                'fetchedAtUtc': '2026-11-19T00:00:00+00:00',
                'request': {'params': {'current': 1, 'size': 10,
                                       'areaCode': '440113000000', 'checkSort': 1}},
                'httpStatus': 200,
                'response': {'code': 0, 'data': {'current': 1, 'size': 10, 'total': 1,
                                                'records': [{'axbe0001': 'sorted-id',
                                                             'axbe0003': 'sorted institution'}]}},
            }), encoding='utf-8')
            sibling = root / 'area-440113000000' / 'pages'
            sibling.mkdir(parents=True)
            (sibling / '00001.json').write_text(json.dumps({
                'response': {'data': {'records': [{'axbe0001': 'other-id',
                                                  'outsideSortedScope': 'private'}]}},
            }), encoding='utf-8')

            result = subprocess.run(
                [sys.executable, str(SCRIPT), '--root', str(root),
                 '--area-code', '440113000000', '--check-sort'],
                cwd=ROOT, text=True, capture_output=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            preview = json.loads((folder / 'normalized-preview.json').read_text(encoding='utf-8'))
            gap = json.loads((folder / 'field-gap-report.json').read_text(encoding='utf-8'))
            quality = json.loads((folder / 'quality-report.json').read_text(encoding='utf-8'))
            self.assertEqual(preview['scope'], folder.name)
            self.assertFalse(preview['publishable'])
            self.assertEqual([row['mcaId'] for row in preview['observations']], ['sorted-id'])
            self.assertEqual(quality['scope'], folder.name)
            self.assertNotIn('list.outsideSortedScope', gap['fields'])
            self.assertFalse((root / 'area-440113000000' / 'normalized-preview.json').exists())

    def test_check_sort_rejects_missing_or_noninteger_page_parameter(self):
        for value in (None, 0, '1', True):
            with self.subTest(value=value), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                folder = root / 'area-440113000000-check-sort-1'
                pages = folder / 'pages'
                pages.mkdir(parents=True)
                (folder / 'manifest.json').write_text(json.dumps({
                    'scope': folder.name, 'filters': {'areaCode': '440113000000',
                                                      'checkSort': 1},
                    'total': 1, 'serverPageSize': 10, 'expectedPages': 1,
                }), encoding='utf-8')
                params = {'current': 1, 'size': 10, 'areaCode': '440113000000'}
                if value is not None:
                    params['checkSort'] = value
                (pages / '00001.json').write_text(json.dumps({
                    'request': {'params': params}, 'httpStatus': 200,
                    'response': {'code': 0, 'data': {'current': 1, 'size': 10,
                                                    'total': 1,
                                                    'records': [{'axbe0001': 'id-a'}]}},
                }), encoding='utf-8')
                result = subprocess.run(
                    [sys.executable, str(SCRIPT), '--root', str(root),
                     '--area-code', '440113000000', '--check-sort'],
                    cwd=ROOT, text=True, capture_output=True, check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('saved page query mismatch', result.stderr)
                self.assertFalse((folder / 'normalized-preview.json').exists())

    def test_preserves_zero_null_and_labels_partial_preview(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=11)
            write_page(root, 1, [
                {'axbe0001': 'id-a', 'axbe0003': ' 测试养老院　', 'axbe0004': '1',
                 'axbe0004Name': '养老机构', 'areaCode': '440000000000',
                 'areaCodeName': '广东省', 'axbe0013': '测试路 1 号',
                 'ahae2347': 0, 'ahae2323': None, 'axbe8004': 0.0,
                 'axbe8003': 0.0, 'evaluationCount': 0, 'overallEvaluation': 0.0},
            ], total=11)
            preview, gaps, quality = run_normalizer(root)
            self.assertFalse(preview['publishable'])
            self.assertEqual(preview['observations'][0]['list']['name'], '测试养老院')
            self.assertEqual(preview['observations'][0]['list']['listedBeds'], 0)
            self.assertIsNone(preview['observations'][0]['list']['nursingBeds'])
            self.assertEqual(preview['observations'][0]['list']['listedFeeMinRaw'], 0.0)
            self.assertEqual(preview['observations'][0]['list']['ratingCount'], 0)
            self.assertEqual(quality['missingPages'], [2])
            self.assertEqual(quality['observedRows'], 1)
            self.assertIn('list.ahae2347', gaps['fields'])
            self.assertEqual(gaps['fields']['list.ahae2347']['existingField'], 'registeredBeds (different definition)')

    def test_all_observed_paths_are_audited_without_contact_values_in_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=1)
            write_page(root, 1, [{
                'axbe0001': 'id-a', 'axbe0003': '示例养老院',
                'ahae0012': '13812345678', 'unexpectedField': 'private-marker',
            }], total=1)
            preview, gaps, quality = run_normalizer(root)
            self.assertEqual(gaps['fields']['list.unexpectedField']['status'], 'unreviewed')
            self.assertEqual(gaps['fields']['list.ahae0012']['status'], 'restricted')
            self.assertEqual(quality['unreviewedPathCount'], 1)
            self.assertNotIn('13812345678', json.dumps((preview, gaps, quality), ensure_ascii=False))
            self.assertNotIn('private-marker', json.dumps((preview, gaps, quality), ensure_ascii=False))

    def test_gap_report_separates_actual_projection_contact_and_privacy_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=1)
            write_page(root, 1, [{
                'axbe0001': 'id-a', 'axbe0003': 'sample institution',
                'ahae0012': '13812345678', 'ahae0635': '1',
                'ahae2343': 4, 'infoDatail': None,
            }], total=1)
            details = root / 'area-440000000000' / 'details'
            details.mkdir(parents=True)
            (details / 'id-a.json').write_text(json.dumps({
                'institutionId': 'id-a',
                'endpoints': {
                    'orgBaseDetail': detail_endpoint('id-a', {
                        'axbe0001': 'id-a', 'axbe0004Name': 'unverified type',
                        'ahae2572': 'private-contact-name',
                        'ahae2573': '13812345678',
                        'ahae2574': 'private-extra',
                        'orgBaseInfo': {'infoDetail': 'private-profile-text'},
                    }),
                    'yangLaoOrgDetail': detail_endpoint('id-a', {
                        'axbe0001': 'id-a', 'ahae2343': 1,
                        'hae4List': [{'axbe4001': 'private-unclear'}],
                    }),
                },
            }), encoding='utf-8')

            preview, gaps, quality = run_normalizer(root)
            fields = gaps['fields']
            self.assertEqual(fields['list.axbe0001'].get('projectedTo'), 'observations[].mcaId')
            self.assertEqual(fields['list.axbe0003'].get('projectedTo'), 'observations[].list.name')
            self.assertEqual(fields['orgBaseDetail.axbe0001']['projectionStatus'], 'validated')
            self.assertEqual(fields['yangLaoOrgDetail.axbe0001']['status'], 'distinct')
            self.assertEqual(fields['yangLaoOrgDetail.axbe0001']['projectionStatus'], 'validated')
            self.assertEqual(fields['list.ahae0635']['status'], 'pending-semantics')
            self.assertEqual(fields['list.ahae0635']['projectionStatus'], 'unprojected')
            self.assertEqual(fields['orgBaseDetail.axbe0004Name']['projectionStatus'], 'unprojected')
            self.assertEqual(fields['list.ahae0012']['status'], 'restricted')
            self.assertEqual(fields['orgBaseDetail.ahae2572']['status'], 'restricted')
            self.assertEqual(fields['orgBaseDetail.ahae2573']['status'], 'restricted')
            self.assertEqual(fields['orgBaseDetail.ahae2574']['status'], 'privacy-review')
            self.assertEqual(fields['orgBaseDetail.orgBaseInfo.infoDetail']['status'], 'privacy-review')
            self.assertEqual(fields['yangLaoOrgDetail.hae4List[].axbe4001']['status'], 'privacy-review')
            self.assertEqual(fields['list.infoDatail']['projectionStatus'], 'unprojected')
            self.assertIn('list.ahae0635', gaps['unprojectedNonNullPaths'])
            self.assertIn('list.ahae2343', gaps['unprojectedNonNullPaths'])
            self.assertIn('orgBaseDetail.axbe0004Name', gaps['unprojectedNonNullPaths'])
            self.assertIn('yangLaoOrgDetail.ahae2343', gaps['unprojectedNonNullPaths'])
            self.assertIn('list.infoDatail', gaps['unprojectedNullOnlyPaths'])
            self.assertNotIn('list.ahae0012', gaps['unprojectedNonNullPaths'])
            self.assertEqual(gaps['fieldPathCount'], len(fields))
            self.assertEqual(quality['unprojectedNonNullPathCount'], len(gaps['unprojectedNonNullPaths']))
            self.assertEqual(quality['privacyReviewPathCount'], len(gaps['privacyReviewPaths']))
            derived = json.dumps((preview, gaps, quality), ensure_ascii=False)
            for private in ('13812345678', 'private-contact-name', 'private-extra',
                            'private-profile-text', 'private-unclear'):
                self.assertNotIn(private, derived)

    def test_detail_axbe0004_label_is_not_assumed_to_be_list_type_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=1)
            write_page(root, 1, [{
                'axbe0001': 'id-a', 'axbe0003': 'sample institution',
                'axbe0004': '1', 'axbe0004Name': '养老机构',
                'ahde8404': '03',
            }], total=1)
            details = root / 'area-440000000000' / 'details'
            details.mkdir(parents=True)
            (details / 'id-a.json').write_text(json.dumps({
                'institutionId': 'id-a',
                'endpoints': {
                    'orgBaseDetail': detail_endpoint('id-a', {
                        'axbe0001': 'id-a', 'axbe0004': '养老机构',
                        'axbe0004Name': None,
                    }),
                    'yangLaoOrgDetail': detail_endpoint('id-a', {
                        'axbe0001': 'id-a',
                    }),
                },
            }, ensure_ascii=False), encoding='utf-8')

            preview, gaps, _quality = run_normalizer(root)
            self.assertEqual(preview['observations'][0]['list']['facilityTypeCode'], '1')
            self.assertEqual(gaps['fields']['orgBaseDetail.axbe0004']['proposedField'],
                             'facilityTypeLabel')
            self.assertEqual(gaps['fields']['orgBaseDetail.axbe0004']['projectionStatus'],
                             'unprojected')
            self.assertEqual(gaps['fields']['list.ahde8404']['proposedField'],
                             'platformStarCode')
            self.assertEqual(gaps['fields']['list.ahde8404']['projectionStatus'],
                             'unprojected')
            self.assertNotIn('facilityTypeCode', preview['details']['id-a'])

    def test_endpoint_key_comparison_does_not_treat_list_as_complete_detail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=1)
            write_page(root, 1, [{
                'axbe0001': 'id-a', 'axbe0003': 'sample institution', 'ahae2347': 10,
            }], total=1)
            details = root / 'area-440000000000' / 'details'
            details.mkdir(parents=True)
            (details / 'id-a.json').write_text(json.dumps({
                'institutionId': 'id-a',
                'endpoints': {
                    'orgBaseDetail': detail_endpoint('id-a', {
                        'axbe0001': 'id-a', 'axbe0003': 'sample institution',
                        'orgBaseInfo': {'infoDetail': 'private-profile-text'},
                    }),
                    'yangLaoOrgDetail': detail_endpoint('id-a', {
                        'ahae2347': 10, 'hae4List': [{'axbe4001': 'private-unclear'}],
                    }),
                },
            }), encoding='utf-8')
            _preview, gaps, _quality = run_normalizer(root)
            comparison = gaps.get('endpointTopLevelComparison')
            self.assertIsNotNone(comparison)
            self.assertEqual(comparison['orgBaseKeyCount'], 3)
            self.assertEqual(comparison['yangLaoKeyCount'], 2)
            self.assertEqual(comparison['sharedDetailKeys'], [])
            self.assertIn('orgBaseInfo', comparison['orgBaseOnlyKeys'])
            self.assertIn('hae4List', comparison['yangLaoOnlyKeys'])
            self.assertEqual(comparison['detailKeysAbsentFromList'],
                             ['hae4List', 'orgBaseInfo'])
            self.assertFalse(comparison['orgBaseCoveredByYangLao'])
            self.assertFalse(comparison['yangLaoCoveredByOrgBase'])
            self.assertFalse(comparison['listCoversBothDetails'])
            self.assertEqual(comparison['basis'], 'top-level key names only; no semantic equivalence')

    def test_field_gap_report_is_limited_to_the_requested_area(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=1)
            write_page(root, 1, [{'axbe0001': 'gd-id', 'axbe0003': '广东院'}], total=1)
            other = root / 'area-110000000000' / 'pages'
            other.mkdir(parents=True)
            (other / '00001.json').write_text(json.dumps({
                'response': {'data': {'records': [{'axbe0001': 'bj-id', 'outsideScope': 'secret'}]}},
            }), encoding='utf-8')
            _preview, gaps, quality = run_normalizer(root)
            self.assertNotIn('list.outsideScope', gaps['fields'])
            self.assertEqual(quality['unreviewedPathCount'], 0)

    def test_complete_manifest_does_not_hide_missing_pages_or_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=11, complete=True)
            write_page(root, 1, [{'axbe0001': 'id-a'}], total=11)
            _preview, _gaps, quality = run_normalizer(root)
            self.assertTrue(quality['manifestClaimsComplete'])
            self.assertFalse(quality['sourceManifestComplete'])
            self.assertEqual(quality['missingPages'], [2])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=2, complete=True)
            write_page(root, 1, [{'axbe0001': 'id-a'}, {'axbe0001': 'id-a'}], total=2)
            _preview, _gaps, quality = run_normalizer(root)
            self.assertFalse(quality['sourceManifestComplete'])
            self.assertEqual(quality['duplicateIdCount'], 1)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=1, complete=True)
            write_page(root, 1, [{'axbe0001': 'id-a'}], total=2)
            _preview, _gaps, quality = run_normalizer(root)
            self.assertFalse(quality['sourceManifestComplete'])
            self.assertEqual(quality['totalDriftPages'], [1])

    def test_invalid_detail_endpoint_status_code_or_request_id_is_not_counted(self):
        for defect in ('http', 'code', 'request-id'):
            with self.subTest(defect=defect), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                write_manifest(root, total=1, complete=True)
                write_page(root, 1, [{'axbe0001': 'id-a'}], total=1)
                details = root / 'area-440000000000' / 'details'
                details.mkdir(parents=True)
                base = detail_endpoint('id-a', {'axbe0001': 'id-a', 'ahae0021': 100})
                care = detail_endpoint('id-a', {'ahae2347': 100})
                if defect == 'http':
                    base['httpStatus'] = 500
                elif defect == 'code':
                    care['response']['code'] = 1
                else:
                    base['request']['params']['axbe0001'] = 'other-id'
                (details / 'id-a.json').write_text(json.dumps({
                    'institutionId': 'id-a',
                    'endpoints': {'orgBaseDetail': base, 'yangLaoOrgDetail': care},
                }), encoding='utf-8')
                preview, gaps, quality = run_normalizer(root)
                self.assertEqual(quality['savedDetails'], 0)
                self.assertEqual(quality['invalidDetailFiles'], ['id-a.json'])
                self.assertEqual(gaps['observedDetailFiles'], 0)
                self.assertEqual(preview['details'], {})

    def test_complete_manifest_rejects_wrong_lengths_even_when_total_and_ids_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=15, complete=True)
            write_page(root, 1, [{'axbe0001': f'id-{n}'} for n in range(9)], total=15)
            write_page(root, 2, [{'axbe0001': f'id-{n}'} for n in range(9, 15)], total=15)
            _preview, _gaps, quality = run_normalizer(root)
            self.assertEqual(quality['observedRows'], 15)
            self.assertEqual(quality['uniqueIds'], 15)
            self.assertEqual(quality['missingPages'], [])
            self.assertEqual(quality['pageLengthMismatchPages'], [1, 2])
            self.assertFalse(quality['sourceManifestComplete'])

    def test_nonfinite_numbers_are_rejected_not_exported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=1)
            write_page(root, 1, [{
                'axbe0001': 'id-a', 'ahae2347': float('nan'),
                'ahae2323': float('inf'), 'axbe8004': float('-inf'),
            }], total=1)
            preview, _gaps, quality = run_normalizer(root)
            record = preview['observations'][0]['list']
            self.assertIsNone(record['listedBeds'])
            self.assertIsNone(record['nursingBeds'])
            self.assertIsNone(record['listedFeeMinRaw'])
            self.assertEqual(quality['fieldTypeIssues']['listedBeds:nonfinite'], 1)
            self.assertEqual(quality['fieldTypeIssues']['nursingBeds:nonfinite'], 1)
            self.assertEqual(quality['fieldTypeIssues']['listedFeeMinRaw:nonfinite'], 1)

    def test_duplicate_conflicts_and_detail_mismatches_are_visible(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root, total=20)
            base = {'axbe0001': 'id-a', 'axbe0003': '甲院', 'ahae2347': 100,
                    'ahae2323': 110, 'axbe8004': 5000, 'axbe8003': 3000}
            write_page(root, 1, [base], total=20)
            write_page(root, 2, [{**base, 'axbe0003': '乙院'}], total=20)
            details = root / 'area-440000000000' / 'details'
            details.mkdir(parents=True)
            (details / 'id-a.json').write_text(json.dumps({
                'institutionId': 'id-a', 'endpoints': {
                    'orgBaseDetail': detail_endpoint('id-a', {'axbe0001': 'id-a', 'ahae0021': 200}),
                    'yangLaoOrgDetail': detail_endpoint('id-a', {'ahae2347': 90, 'ahae2323': 50}),
                },
            }), encoding='utf-8')
            preview, _gaps, quality = run_normalizer(root)
            self.assertEqual(len(preview['observations']), 2)
            self.assertEqual(quality['duplicateIdCount'], 1)
            self.assertEqual(quality['conflictingDuplicateIdCount'], 1)
            self.assertEqual(quality['invalidNursingBedRows'], 2)
            self.assertEqual(quality['invertedFeeRows'], 2)
            self.assertEqual(quality['listDetailBedConflictIds'], ['id-a'])
            self.assertEqual(preview['details']['id-a']['areaSqm'], 200)
            self.assertFalse(preview['publishable'])


if __name__ == '__main__':
    unittest.main()
