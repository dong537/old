"""Offline behavior tests for the private, cross-stage MCA progress audit."""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/audit-mca-pipeline-progress.py'
spec = importlib.util.spec_from_file_location('mca_pipeline_progress', SCRIPT)
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def wrapper(response, *, request=None, parent=None):
    raw = json.dumps(response, ensure_ascii=False, separators=(',', ':')).encode()
    value = {'response': response, 'responseSha256': hashlib.sha256(raw).hexdigest(),
             'rawBodyBase64': base64.b64encode(raw).decode(), 'httpStatus': 200,
             'fetchedAtUtc': '2026-11-19T00:00:00+00:00'}
    if request is not None:
        value['request'] = request
    if parent is not None:
        value.update({'parentId': parent, 'method': 'GET',
                      'sourceUrl': 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/' + parent})
    return value


def list_page(code, page, records):
    return wrapper({'code': 0, 'data': {'current': page, 'size': 10,
                                       'total': len(records), 'records': records}},
                   request={'method': 'POST',
                            'url': 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/queryOrganizationDataList',
                            'params': {'current': page, 'size': 10, 'areaCode': code}})


def detail_endpoint(name, identifier):
    return wrapper({'code': 0, 'data': {'axbe0001': identifier}},
                   request={'method': 'POST',
                            'url': 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/' + name,
                            'params': {'axbe0001': identifier}})


class PipelineProgressTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'mca-private'
        self.root.mkdir()

    def test_empty_pipeline_reports_unknown_coverage_not_complete(self):
        report = audit_module.audit(self.root)
        self.assertFalse(report['nationalComplete'])
        self.assertFalse(report['snapshotVerified'])
        self.assertFalse(report['publishable'])
        self.assertEqual(report['observed']['uniqueIdsFromValidPages'], 0)
        self.assertEqual(report['manifests']['firstPages']['state'], 'not_started')
        self.assertEqual(report['statuses']['tree']['state'], 'not_started')

    def test_tree_old_seed_pages_and_paired_details_are_counted_without_leaking_values(self):
        tree = self.root / 'area-tree-20261119/responses'
        seed = wrapper({'code': 0, 'data': []}, parent='-1')
        seed.pop('rawBodyBase64')
        seed['responseSha256'] = hashlib.sha256(json.dumps(
            seed['response'], ensure_ascii=False, sort_keys=True,
            separators=(',', ':')).encode()).hexdigest()
        seed['provenance'] = {'kind': 'cached-json-payload',
                              'originalHttpBodyAvailable': False}
        save(tree / '-1.json', seed)
        save(tree / 'parent1.json', wrapper({'code': 0, 'data': []}, parent='parent1'))
        save(self.root / 'area-tree-20261119/manifest.json',
             {'savedResponses': 1, 'pendingParentIds': ['parent1'],
              'treeWalkComplete': False})
        code = '110000000000'
        records = [{'axbe0001': 'ENTITY001', 'axbe0003': 'one'},
                   {'axbe0001': 'short77', 'axbe0003': 'two'}]
        save(self.root / f'national-area-first-pages-20261119/area-{code}/pages/00001.json',
             list_page(code, 1, records))
        save(self.root / f'area-{code}-older/pages/00001.json',
             list_page(code, 1, [{'axbe0001': 'ENTITY001', 'axbe0003': 'changed'}]))
        endpoint_names = ('orgBaseDetail', 'yangLaoOrgDetail')
        endpoints = {name: detail_endpoint(name, 'ENTITY001') for name in endpoint_names}
        new_dir = self.root / 'national-observed-details-20261119'
        save(new_dir / 'details/ENTITY001.json',
             {'schemaVersion': 1, 'institutionId': 'ENTITY001', 'endpoints': endpoints})
        for name in endpoint_names:
            save(new_dir / f'detail-checkpoints/ENTITY001/{name}.json', endpoints[name])
        report = audit_module.audit(self.root)
        self.assertEqual(report['tree']['responseFiles'], 2)
        self.assertEqual(report['tree']['validResponses'], 2)
        self.assertEqual(report['tree']['originalHttpBodyUnavailable'], 1)
        self.assertEqual(report['tree']['manifestSavedResponses'], 1)
        self.assertEqual(report['observed']['uniqueIdsFromValidPages'], 2)
        self.assertEqual(report['observed']['idsWithValidDetailPairs'], 1)
        self.assertEqual(report['observed']['idsStillMissingDetailPairs'], 1)
        self.assertEqual(report['literalListFieldDisagreements']['axbe0003'], 1)
        self.assertEqual(report['issues']['shortInstitutionIdObserved'], 1)
        self.assertEqual(report['observed']['shortIds']['rowOccurrences'], 1)
        self.assertEqual(report['observed']['shortIds']['uniqueIdCount'], 1)
        self.assertEqual(report['observed']['shortIds']['rowsWithVerifiedRawHttp'], 1)
        serialized = json.dumps(report, ensure_ascii=False)
        self.assertNotIn('ENTITY001', serialized)
        self.assertNotIn('changed', serialized)
        self.assertFalse(report['nationalComplete'])

    def test_tampered_raw_body_excludes_page_and_rate_limit_is_visible(self):
        code = '440000000000'
        page = list_page(code, 1, [{'axbe0001': 'ENTITY001'}])
        page['responseSha256'] = '0' * 64
        save(self.root / f'national-area-first-pages-20261119/area-{code}/pages/00001.json',
             page)
        save(self.root / 'batch-runs/tree-20261119-a.status.json',
             {'phase': 'finished', 'startedAtUtc': '2026-11-19T00:00:00+00:00',
              'exitCode': 2, 'rateLimited': True, 'error': 'HTTP 429'})
        now = datetime(2026, 11, 19, tzinfo=timezone.utc)
        save(self.root / 'rate-limit.json',
             {'detectedAtUtc': now.isoformat(),
              'cooldownUntilUtc': (now + timedelta(hours=1)).isoformat()})
        report = audit_module.audit(self.root, now=now)
        self.assertEqual(report['pages']['firstPages']['pageFiles'], 1)
        self.assertEqual(report['pages']['firstPages']['validPages'], 0)
        self.assertEqual(report['observed']['uniqueIdsFromValidPages'], 0)
        self.assertGreater(report['issues']['rawBodyHashOrJsonMismatch'], 0)
        self.assertTrue(report['statuses']['tree']['blocked'])
        self.assertTrue(report['rateLimit']['active'])

    def test_level_four_page_and_incremental_detail_are_visible_in_aggregate(self):
        code, identifier = '440101001000', 'L4ONLY01'
        save(self.root /
             f'national-level4-first-pages-v1/area-{code}/pages/00001.json',
             list_page(code, 1, [{'axbe0001': identifier,
                                  'areaCode': code}]))
        detail_dir = self.root / 'national-level4-observed-details-v1'
        endpoints = {name: detail_endpoint(name, identifier)
                     for name in ('orgBaseDetail', 'yangLaoOrgDetail')}
        save(detail_dir / f'details/{identifier}.json',
             {'schemaVersion': 1, 'institutionId': identifier,
              'endpoints': endpoints})
        for name, endpoint in endpoints.items():
            save(detail_dir / f'detail-checkpoints/{identifier}/{name}.json',
                 endpoint)
        report = audit_module.audit(self.root)
        self.assertEqual(report['pages']['level4FirstPages']['validPages'], 1)
        self.assertEqual(report['details']['validDetailPairs'], 1)
        self.assertEqual(report['observed']['uniqueIdsFromValidPages'], 1)
        self.assertEqual(report['observed']['idsStillMissingDetailPairs'], 0)
        self.assertIn('level4Details', report['manifests'])
        self.assertNotIn(identifier, json.dumps(report))

    def test_report_cannot_be_written_outside_private_root(self):
        report = audit_module.audit(self.root)
        with self.assertRaisesRegex(ValueError, 'private MCA cache root'):
            audit_module.write_private_report(
                self.root, Path(self.temp.name) / 'public.json', report)
        target = self.root / 'pipeline-progress-audit.json'
        audit_module.write_private_report(self.root, target, report)
        self.assertEqual(json.loads(target.read_text(encoding='utf-8'))['publishable'], False)


if __name__ == '__main__':
    unittest.main()
