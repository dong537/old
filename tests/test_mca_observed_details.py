"""Offline behavior tests for observed-ID detail queue and collection."""

import base64
import hashlib
import json
import runpy
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'collect-mca-observed-details.py'
BUILDER = ROOT / 'scripts' / 'build-mca-area-seeds.py'
FIRST = ROOT / 'scripts' / 'collect-mca-area-first-pages.py'
AREA_API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'
PARENT_CODE = '440000000000'
CHILD_CODE = '440100000000'
ID1, ID2 = 'ID000001', 'ID000002'


class ObservedDetailsTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.builder = runpy.run_path(str(BUILDER))
        self.first = runpy.run_path(str(FIRST))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.tree = self.root / 'area-tree-20261119'
        (self.tree / 'responses').mkdir(parents=True)
        self.write_tree('-1', [{'id': 'province', 'pid': '-1', 'level': 1,
                                'name': 'province', 'sbcode': PARENT_CODE}])
        self.write_tree('province', [{'id': 'city', 'pid': 'province', 'level': 2,
                                      'name': 'city', 'sbcode': CHILD_CODE}])
        self.write_tree('city', [])
        (self.tree / 'manifest.json').write_text(json.dumps({
            'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-3',
            'maxLevel': 3, 'treeWalkComplete': True, 'rateLimited': False,
            'lastError': None, 'pendingParentIds': [],
            'savedResponses': 3, 'discoveredNodes': 2,
            'rootNodes': 1, 'queryableRootNodes': 1, 'excludedRootNodes': 0,
            'auditedAtUtc': '2026-11-19T00:00:00+00:00',
        }), encoding='utf-8')
        self.seed = self.root / 'national-area-tree-seeds-20261119.json'
        seed_doc = self.builder['build_seeds'](self.tree)
        self.seed.write_text(json.dumps(seed_doc, ensure_ascii=False), encoding='utf-8')
        self.first_dir = self.root / 'national-area-first-pages-20261119'
        self.followup_dir = self.root / 'national-area-followup-pages-20261119'
        self.output = self.root / 'national-observed-details-20261119'
        observations = {}
        for seed in seed_doc['seeds']:
            code = seed['sbcode']
            rows = [ID1, ID2] if code == PARENT_CODE else [ID2]
            path = self.first_dir / f'area-{code}' / 'pages' / '00001.json'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(self.first_wrapper(code, rows)), encoding='utf-8')
            observation = self.first['checked_cached_page'](path, code)
            observation['sourceNodeId'] = seed['sourceNodeId']
            observations[code] = observation
        seed_sha = hashlib.sha256(self.seed.read_bytes()).hexdigest()
        progress = self.first['progress_document'](
            self.seed, seed_sha, seed_doc['seeds'], observations)
        (self.first_dir / 'manifest.json').write_text(json.dumps(progress), encoding='utf-8')
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')
        self.calls = []

    def write_tree(self, parent, children):
        body = {'code': 0, 'data': children}
        raw = json.dumps(body).encode()
        wrapper = {'schemaVersion': 1, 'parentId': parent,
                   'sourceUrl': AREA_API + parent, 'method': 'GET',
                   'httpStatus': 200, 'fetchedAtUtc': '2026-11-18T23:00:00+00:00',
                   'responseSha256': hashlib.sha256(raw).hexdigest(),
                   'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
                   'response': body}
        (self.tree / 'responses' / f'{parent}.json').write_text(
            json.dumps(wrapper), encoding='utf-8')

    def first_wrapper(self, code, identifiers):
        body = {'code': 0, 'data': {'current': 1, 'size': 10,
                'total': len(identifiers),
                'records': [{'axbe0001': item, 'areaCode': code}
                            for item in identifiers]}}
        raw = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        return {
            'schemaVersion': 1, 'fetchedAtUtc': datetime.now(timezone.utc).isoformat(),
            'request': {'url': self.module['FETCHER']['API_BASE'] +
                        self.module['FETCHER']['LIST_PATH'],
                        'method': 'POST', 'params': {'current': 1, 'size': 10,
                                                     'areaCode': code, 'checkSort': 1}},
            'httpStatus': 200, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': body,
        }

    def detail_wrapper(self, endpoint, identifier):
        payload = {'code': 0, 'data': {'axbe0001': identifier}}
        raw = json.dumps(payload).encode()
        return {
            'schemaVersion': 1, 'requestedAtUtc': datetime.now(timezone.utc).isoformat(),
            'fetchedAtUtc': datetime.now(timezone.utc).isoformat(),
            'request': {'url': self.module['FETCHER']['API_BASE'] + endpoint,
                        'method': 'POST', 'params': {'axbe0001': identifier}},
            'httpStatus': 200, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': payload,
        }

    def fake_detail(self, identifier, folder, limiter, timeout, attempts, *, preserve_raw=False):
        self.calls.append((identifier, limiter.interval, attempts, preserve_raw))
        endpoints = {}
        for name in self.module['FETCHER']['DETAIL_PATHS']:
            wrapper = self.detail_wrapper(name, identifier)
            checkpoint = folder / 'detail-checkpoints' / identifier / f'{name}.json'
            self.module['FETCHER']['save_json'](checkpoint, wrapper)
            endpoints[name] = wrapper
        self.module['FETCHER']['save_json'](folder / 'details' / f'{identifier}.json', {
            'schemaVersion': 1, 'institutionId': identifier, 'endpoints': endpoints,
        })
        return identifier

    def run_batch(self, run_id, *, max_ids=1):
        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'collect_detail': self.fake_detail}):
            return self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir,
                self.output, run_id, max_ids=max_ids, max_requests=5,
                interval=60, jitter=10, timeout=1)

    def add_drifted_followup(self):
        parent_path = self.first_dir / f'area-{PARENT_CODE}' / 'pages' / '00001.json'
        identifiers = [ID1, ID2] + [f'ID{i:06d}' for i in range(3, 11)]
        first = self.first_wrapper(PARENT_CODE, identifiers)
        first['response']['data']['total'] = 11
        first_raw = json.dumps(first['response'], ensure_ascii=False,
                               separators=(',', ':')).encode('utf-8')
        first['responseSha256'] = hashlib.sha256(first_raw).hexdigest()
        first['rawBodyBase64'] = base64.b64encode(first_raw).decode('ascii')
        parent_path.write_text(json.dumps(first), encoding='utf-8')
        child_path = self.first_dir / f'area-{CHILD_CODE}' / 'pages' / '00001.json'
        child_path.write_text(json.dumps(self.first_wrapper(CHILD_CODE, ['ID000011'])),
                              encoding='utf-8')
        seed_doc = json.loads(self.seed.read_text(encoding='utf-8'))
        observations = {}
        for seed in seed_doc['seeds']:
            code = seed['sbcode']
            path = self.first_dir / f'area-{code}' / 'pages' / '00001.json'
            observation = self.first['checked_cached_page'](path, code)
            observation['sourceNodeId'] = seed['sourceNodeId']
            observations[code] = observation
        progress = self.first['progress_document'](
            self.seed, hashlib.sha256(self.seed.read_bytes()).hexdigest(),
            seed_doc['seeds'], observations)
        (self.first_dir / 'manifest.json').write_text(json.dumps(progress), encoding='utf-8')
        response = {'code': 0, 'data': {'current': 2, 'size': 10, 'total': 12,
                    'records': [{'axbe0001': ID2, 'areaCode': PARENT_CODE}]}}
        raw = json.dumps(response).encode()
        wrapper = {
            'schemaVersion': 1, 'requestedAtUtc': datetime.now(timezone.utc).isoformat(),
            'fetchedAtUtc': datetime.now(timezone.utc).isoformat(),
            'request': {'url': self.module['FETCHER']['API_BASE'] +
                        self.module['FETCHER']['LIST_PATH'],
                        'method': 'POST', 'params': {'current': 2, 'size': 10,
                                                     'areaCode': PARENT_CODE,
                                                     'checkSort': 1}},
            'httpStatus': 200, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'), 'response': response,
        }
        path = self.followup_dir / f'area-{PARENT_CODE}' / 'pages' / '00002.json'
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        return path

    def test_queue_deduplicates_ids_and_keeps_all_source_pages(self):
        queue = self.module['build_queue'](
            self.seed, self.tree, self.first_dir, self.followup_dir)
        self.assertEqual(queue['uniqueIdCount'], 2)
        self.assertEqual(queue['sourceObservationCount'], 3)
        by_id = {item['institutionId']: item for item in queue['items']}
        self.assertEqual(len(by_id[ID2]['sourcePages']), 2)
        self.assertEqual({item['areaCode'] for item in by_id[ID2]['sourcePages']},
                         {PARENT_CODE, CHILD_CODE})
        self.assertFalse(queue['nationalComplete'])

    def test_queue_keeps_short_alphanumeric_id_returned_by_official_list(self):
        short_id = 'A123456'
        path = self.first_dir / f'area-{PARENT_CODE}' / 'pages' / '00001.json'
        path.write_text(json.dumps(self.first_wrapper(PARENT_CODE, [short_id, ID2])),
                        encoding='utf-8')
        seed_doc = json.loads(self.seed.read_text(encoding='utf-8'))
        observations = {}
        for seed in seed_doc['seeds']:
            code = seed['sbcode']
            first_path = self.first_dir / f'area-{code}' / 'pages' / '00001.json'
            observation = self.first['checked_cached_page'](first_path, code)
            observation['sourceNodeId'] = seed['sourceNodeId']
            observations[code] = observation
        progress = self.first['progress_document'](
            self.seed, hashlib.sha256(self.seed.read_bytes()).hexdigest(),
            seed_doc['seeds'], observations)
        (self.first_dir / 'manifest.json').write_text(json.dumps(progress),
                                                       encoding='utf-8')
        queue = self.module['build_queue'](
            self.seed, self.tree, self.first_dir, self.followup_dir)
        self.assertIn(short_id, {item['institutionId'] for item in queue['items']})

    def test_serial_detail_rounds_resume_without_requerying_saved_ids(self):
        first = self.run_batch('detail-001')
        self.assertEqual(first['exitCode'], 1)
        self.assertEqual(self.calls, [(ID1, 60, 1, True)])
        second = self.run_batch('detail-002')
        self.assertEqual(second['exitCode'], 0)
        self.assertEqual([call[0] for call in self.calls], [ID1, ID2])
        detail = json.loads((self.output / 'details' / f'{ID2}.json').read_text(encoding='utf-8'))
        self.assertEqual(set(detail['endpoints']), set(self.module['FETCHER']['DETAIL_PATHS']))
        self.assertFalse(second['nationalComplete'])
        self.assertTrue(second['detailsCompleteForObservedIds'])

    def test_bad_source_or_detail_cache_refuses_new_request(self):
        manifest = self.first_dir / 'manifest.json'
        value = json.loads(manifest.read_text(encoding='utf-8'))
        value['allFirstPagesCached'] = False
        manifest.write_text(json.dumps(value), encoding='utf-8')
        status = self.run_batch('bad-source')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])
        value['allFirstPagesCached'] = True
        manifest.write_text(json.dumps(value), encoding='utf-8')
        self.run_batch('detail-001')
        checkpoint = self.output / 'detail-checkpoints' / ID1 / 'orgBaseDetail.json'
        bad = json.loads(checkpoint.read_text(encoding='utf-8'))
        bad['responseSha256'] = '0' * 64
        checkpoint.write_text(json.dumps(bad), encoding='utf-8')
        self.calls.clear()
        status = self.run_batch('detail-002')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_detail_resume_rejects_large_page_manifest_provenance_change(self):
        first = self.run_batch('detail-001')
        self.assertEqual(first['exitCode'], 1)
        manifest_path = self.output / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['sourceLargeManifestSha256'] = '0' * 64
        manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
        self.calls.clear()
        second = self.run_batch('detail-002')
        self.assertEqual(second['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_429_stops_entire_detail_round(self):
        def limited(identifier, folder, limiter, timeout, attempts, *, preserve_raw=False):
            self.calls.append(identifier)
            limiter.trip('HTTP 429 during detail test', '3600')
            raise self.module['FETCHER']['FetchError']('HTTP 429')
        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'collect_detail': limited}):
            status = self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir,
                self.output, 'limited', max_ids=2, max_requests=5,
                interval=60, jitter=10, timeout=1)
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [ID1])
        self.assertTrue(status['rateLimited'])
        self.assertTrue((self.root / 'rate-limit.json').exists())

    def test_business_drift_keeps_observed_ids_but_marks_coverage_unverified(self):
        self.add_drifted_followup()
        queue = self.module['build_queue'](
            self.seed, self.tree, self.first_dir, self.followup_dir)
        by_id = {item['institutionId']: item for item in queue['items']}
        self.assertEqual(len(by_id[ID2]['sourcePages']), 2)
        self.assertEqual(by_id[ID2]['listCoverageIssues'],
                         ['duplicateIds', 'totalDrift'])
        self.assertFalse(by_id[ID2]['listCoverageVerified'])
        self.assertFalse(by_id[ID1]['listCoverageVerified'])
        self.assertTrue(by_id['ID000011']['listCoverageVerified'])
        self.assertEqual(queue['areaIssues'][PARENT_CODE],
                         ['duplicateIds', 'totalDrift'])
        status = self.run_batch('drift-detail', max_ids=1)
        self.assertEqual(status['exitCode'], 1)
        self.assertEqual([call[0] for call in self.calls], [ID1])
        self.assertFalse(status['nationalComplete'])

    def test_corrupt_followup_hash_blocks_all_detail_requests(self):
        path = self.add_drifted_followup()
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        wrapper['responseSha256'] = '0' * 64
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        status = self.run_batch('corrupt-source')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_expected_queue_hash_rejects_source_growth_before_requests(self):
        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'collect_detail': self.fake_detail}):
            status = self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir,
                self.output, 'fixed-queue', max_ids=1, max_requests=5,
                interval=60, jitter=10, timeout=1,
                expected_source_sha='b' * 64)
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
