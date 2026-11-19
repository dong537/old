"""Offline behavior tests for bounded official-area pages 2..N."""

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
SCRIPT = ROOT / 'scripts' / 'collect-mca-area-followup-pages.py'
BUILDER = ROOT / 'scripts' / 'build-mca-area-seeds.py'
FIRST = ROOT / 'scripts' / 'collect-mca-area-first-pages.py'
API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'
CODES = ('440000000000', '440100000000', '440113000000')
TOTALS = {CODES[0]: 15, CODES[1]: 25, CODES[2]: 35}


def node(identifier, parent, level, code):
    return {'id': identifier, 'pid': parent, 'level': level,
            'name': identifier, 'sbcode': code}


class FollowupPageTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.builder = runpy.run_path(str(BUILDER))
        self.first = runpy.run_path(str(FIRST))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.tree = self.root / 'area-tree-20261119'
        responses = self.tree / 'responses'
        responses.mkdir(parents=True)
        self.write_tree('-1', [node('province', '-1', 1, CODES[0])])
        self.write_tree('province', [node('city', 'province', 2, CODES[1])])
        self.write_tree('city', [node('county', 'city', 3, CODES[2])])
        (self.tree / 'manifest.json').write_text(json.dumps({
            'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-3',
            'maxLevel': 3, 'treeWalkComplete': True, 'rateLimited': False,
            'lastError': None, 'pendingParentIds': [], 'savedResponses': 3,
            'discoveredNodes': 3, 'rootNodes': 1,
            'queryableRootNodes': 1, 'excludedRootNodes': 0,
            'auditedAtUtc': '2026-11-19T00:00:00+00:00',
        }), encoding='utf-8')
        self.seed = self.root / 'national-area-tree-seeds-20261119.json'
        seed_doc = self.builder['build_seeds'](self.tree)
        self.seed.write_text(json.dumps(seed_doc, ensure_ascii=False), encoding='utf-8')
        self.first_dir = self.root / 'national-area-first-pages-20261119'
        self.followup_dir = self.root / 'national-area-followup-pages-20261119'
        observations = {}
        for seed in seed_doc['seeds']:
            code = seed['sbcode']
            path = self.first_dir / f'area-{code}' / 'pages' / '00001.json'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(self.page_wrapper(code, 1)), encoding='utf-8')
            observation = self.first['checked_cached_page'](path, code)
            observation['sourceNodeId'] = seed['sourceNodeId']
            observations[code] = observation
        seed_sha = hashlib.sha256(self.seed.read_bytes()).hexdigest()
        progress = self.first['progress_document'](
            self.seed, seed_sha, seed_doc['seeds'], observations)
        self.first_dir.mkdir(exist_ok=True)
        (self.first_dir / 'manifest.json').write_text(json.dumps(progress), encoding='utf-8')
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')
        self.calls = []

    def write_tree(self, parent, children):
        body = {'code': 0, 'data': children}
        raw = json.dumps(body).encode()
        wrapper = {
            'schemaVersion': 1, 'parentId': parent,
            'sourceUrl': API + parent, 'method': 'GET', 'httpStatus': 200,
            'fetchedAtUtc': '2026-11-18T23:00:00+00:00',
            'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': body,
        }
        path = self.tree / 'responses' / f'{parent}.json'
        path.write_text(json.dumps(wrapper), encoding='utf-8')

    def page_wrapper(self, code, page, *, total=None, ids=None, record_code=None):
        total = TOTALS[code] if total is None else total
        count = min(10, max(0, total - (page - 1) * 10))
        ids = ids if ids is not None else [f'{code}-id-{n}' for n in
                                        range((page - 1) * 10, (page - 1) * 10 + count)]
        payload = {'code': 0, 'data': {
            'current': page, 'size': 10, 'total': total,
            'records': [{'axbe0001': identifier,
                         'areaCode': record_code or code} for identifier in ids],
        }}
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        wrapper = {
            'schemaVersion': 1, 'requestedAtUtc': datetime.now(timezone.utc).isoformat(),
            'fetchedAtUtc': datetime.now(timezone.utc).isoformat(),
            'request': {'url': self.module['FETCHER']['API_BASE'] +
                        self.module['FETCHER']['LIST_PATH'],
                        'method': 'POST',
                        'params': {'current': page, 'size': 10,
                                   'areaCode': code, 'checkSort': 1}},
            'httpStatus': 200, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': payload,
        }
        return wrapper

    def fake_request(self, endpoint, params, limiter, timeout, attempts, *, preserve_raw=False):
        self.calls.append((endpoint, params.copy(), limiter.interval, attempts, preserve_raw))
        return self.page_wrapper(params['areaCode'], params['current'])

    def run_batch(self, run_id, *, max_areas=1, max_requests=10):
        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'request_json': self.fake_request}):
            return self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir, run_id,
                max_areas=max_areas, max_requests=max_requests,
                max_expected_pages=3, interval=60, jitter=10, timeout=1)

    def test_small_area_pages_resume_and_keep_raw_responses(self):
        first = self.run_batch('followup-001')
        self.assertEqual(first['exitCode'], 1)
        self.assertEqual([call[1]['current'] for call in self.calls], [2])
        self.assertTrue(all(call[3:] == (1, True) for call in self.calls))
        page = self.followup_dir / f'area-{CODES[0]}' / 'pages' / '00002.json'
        saved = json.loads(page.read_text(encoding='utf-8'))
        self.assertEqual(json.loads(base64.b64decode(saved['rawBodyBase64'])),
                         saved['response'])
        self.assertTrue(saved['requestedAtUtc'])
        second = self.run_batch('followup-002')
        self.assertEqual(second['exitCode'], 0)
        self.assertEqual([call[1]['current'] for call in self.calls], [2, 2, 3])
        audit = json.loads((self.followup_dir / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(audit['selectedAreaCount'], 2)
        self.assertEqual(audit['skippedLargeAreaCount'], 1)
        self.assertTrue(audit['areas'][CODES[0]]['observedPagesComplete'])
        self.assertTrue(audit['areas'][CODES[0]]['directHangReviewRequired'])
        self.assertTrue(audit['areas'][CODES[1]]['observedPagesComplete'])
        self.assertFalse(audit['nationalComplete'])
        self.assertFalse(audit['snapshotVerified'])

    def test_duplicate_and_total_drift_mark_area_unverified(self):
        def duplicate(endpoint, params, limiter, timeout, attempts, *, preserve_raw=False):
            self.calls.append(params.copy())
            code, page = params['areaCode'], params['current']
            if code == CODES[0]:
                return self.page_wrapper(code, page, ids=[f'{code}-id-0'] * 5)
            return self.page_wrapper(code, page, total=26)
        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'request_json': duplicate}):
            status = self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir, 'drift',
                max_areas=2, max_requests=10, max_expected_pages=3,
                interval=60, jitter=10, timeout=1)
        self.assertEqual(status['exitCode'], 1)
        audit = json.loads((self.followup_dir / 'manifest.json').read_text(encoding='utf-8'))
        self.assertIn('duplicateIds', audit['areas'][CODES[0]]['issues'])
        self.assertIn('totalDrift', audit['areas'][CODES[1]]['issues'])
        self.assertFalse(audit['areas'][CODES[0]]['observedPagesComplete'])
        self.assertFalse(audit['areas'][CODES[1]]['observedPagesComplete'])
        self.assertEqual([x['current'] for x in self.calls], [2, 2])

    def test_large_observation_keeps_raw_pages_after_duplicate(self):
        large_dir = self.root / 'national-area-large-pages-20261119'
        interrupted = False

        def drifting(endpoint, params, limiter, timeout, attempts, *, preserve_raw=False):
            nonlocal interrupted
            self.calls.append(params.copy())
            code, page = params['areaCode'], params['current']
            if page == 3 and not interrupted:
                interrupted = True
                raise self.module['FETCHER']['BudgetExhausted']('test budget')
            if page == 2:
                identifiers = [f'{code}-id-0', *(
                    f'{code}-id-{n}' for n in range(11, 20))]
                return self.page_wrapper(code, page, ids=identifiers)
            return self.page_wrapper(code, page)

        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'request_json': drifting}):
            first = self.module['run_batch'](
                self.seed, self.tree, self.first_dir, large_dir, 'large-001',
                max_areas=1, max_requests=12, max_expected_pages=5000,
                page_mode='large', interval=60, jitter=10, timeout=1)
            status = self.module['run_batch'](
                self.seed, self.tree, self.first_dir, large_dir, 'large-002',
                max_areas=1, max_requests=12, max_expected_pages=5000,
                page_mode='large', interval=60, jitter=10, timeout=1)
        self.assertEqual(first['exitCode'], 1)
        self.assertEqual(first['newlySavedPages'], 1)
        self.assertEqual(status['exitCode'], 0)
        self.assertEqual(status['areasPagesObservedComplete'], 1)
        self.assertEqual(status['areasUnverified'], 1)
        self.assertEqual([x['current'] for x in self.calls], [2, 3, 3, 4])
        manifest = json.loads((large_dir / 'manifest.json').read_text(encoding='utf-8'))
        area = manifest['areas'][CODES[2]]
        self.assertEqual(area['savedFollowupPages'], 3)
        self.assertIn('duplicateIds', area['issues'])
        self.assertFalse(area['observedPagesComplete'])
        self.assertFalse(manifest['snapshotVerified'])
        self.assertFalse(manifest['publishable'])
        detail = runpy.run_path(str(ROOT / 'scripts' / 'collect-mca-observed-details.py'))
        queue = detail['build_queue'](
            self.seed, self.tree, self.first_dir, self.followup_dir,
            large_dir=large_dir)
        self.assertIn(f'{CODES[2]}-id-34',
                      {item['institutionId'] for item in queue['items']})
        self.assertFalse(queue['snapshotVerified'])

    def test_429_stops_globally_and_persists_cooldown(self):
        def limited(endpoint, params, limiter, timeout, attempts, *, preserve_raw=False):
            self.calls.append(params.copy())
            limiter.trip('HTTP 429 during followup test', '3600')
            raise self.module['FETCHER']['FetchError']('HTTP 429')
        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'request_json': limited}):
            status = self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir, 'limited',
                max_areas=2, max_requests=10, max_expected_pages=3,
                interval=60, jitter=10, timeout=1)
        self.assertEqual(status['exitCode'], 2)
        self.assertTrue(status['rateLimited'])
        self.assertEqual(len(self.calls), 1)
        self.assertTrue((self.root / 'rate-limit.json').exists())

    def test_incomplete_first_pages_refuse_network(self):
        path = self.first_dir / 'manifest.json'
        first = json.loads(path.read_text(encoding='utf-8'))
        first['allFirstPagesCached'] = False
        path.write_text(json.dumps(first), encoding='utf-8')
        status = self.run_batch('bad-first')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_core_request_can_preserve_exact_http_body(self):
        raw = b'{"code":0,"data":{"records":[],"total":0}}'
        seen = []
        class Clock:
            def timestamp_ms(self, *_args):
                return '100000'
        class Limiter:
            def wait(self):
                pass
        class Response:
            status = 200
            headers = {'Date': 'Thu, 19 Nov 2026 00:00:00 GMT'}
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self):
                return raw
        def opener(request, timeout):
            seen.append(request)
            return Response()
        request_json = self.module['FETCHER']['request_json']
        with patch.dict(request_json.__globals__, {
            'SERVER_CLOCK': Clock(), 'urlopen': opener,
        }):
            saved = request_json('queryOrganizationDataList',
                                 {'current': 2, 'size': 10}, Limiter(), 1, 1,
                                 preserve_raw=True)
        self.assertEqual(base64.b64decode(saved['rawBodyBase64']), raw)
        self.assertTrue(saved['requestedAtUtc'])
        self.assertEqual(len(seen), 1)

    def test_area_code_outside_official_subtree_is_unverified(self):
        def wrong_code(endpoint, params, limiter, timeout, attempts, *, preserve_raw=False):
            self.calls.append(params.copy())
            return self.page_wrapper(params['areaCode'], params['current'],
                                     record_code='999999000000')
        globals_ = self.module['run_batch'].__globals__
        with patch.dict(globals_['FETCHER'], {'request_json': wrong_code}):
            status = self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir, 'wrong-code',
                max_areas=1, max_requests=10, max_expected_pages=3,
                interval=60, jitter=10, timeout=1)
        self.assertEqual(status['exitCode'], 1)
        audit = json.loads((self.followup_dir / 'manifest.json').read_text(encoding='utf-8'))
        self.assertIn('areaCodeOutsideOfficialSubtree',
                      audit['areas'][CODES[0]]['issues'])
        self.assertFalse(audit['areas'][CODES[0]]['institutionListComplete'])

    def test_tampered_followup_cache_blocks_resume_before_network(self):
        self.run_batch('followup-001')
        path = self.followup_dir / f'area-{CODES[0]}' / 'pages' / '00002.json'
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        wrapper['responseSha256'] = '0' * 64
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        self.calls.clear()
        status = self.run_batch('followup-002')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_rejects_short_interval_before_network(self):
        with self.assertRaisesRegex(ValueError, 'bounded'):
            self.module['run_batch'](
                self.seed, self.tree, self.first_dir, self.followup_dir,
                'too-fast', interval=59)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
