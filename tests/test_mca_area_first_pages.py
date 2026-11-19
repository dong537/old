"""Offline behavior tests for conservative first-page area sampling."""

import base64
import hashlib
import json
import runpy
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'collect-mca-area-first-pages.py'
BUILDER = ROOT / 'scripts' / 'build-mca-area-seeds.py'
API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'


def node(identifier, parent, level, code):
    return {'id': identifier, 'pid': parent, 'level': level,
            'name': identifier, 'sbcode': code}


class AreaFirstPageTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.builder = runpy.run_path(str(BUILDER))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.tree = self.root / 'area-tree-20261119'
        self.responses = self.tree / 'responses'
        self.responses.mkdir(parents=True)
        self.output = self.root / 'national-area-first-pages-20261119'
        self.seed_path = self.root / 'national-area-tree-seeds-20261119.json'
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')
        self.write_tree_wrapper('-1', [node('province', '-1', 1, '440000000000')])
        self.write_tree_wrapper('province', [node('city', 'province', 2, '440100000000')])
        self.write_tree_wrapper('city', [node('county', 'city', 3, '440113000000')])
        (self.tree / 'manifest.json').write_text(json.dumps({
            'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-3',
            'maxLevel': 3, 'treeWalkComplete': True, 'rateLimited': False,
            'lastError': None, 'pendingParentIds': [],
            'savedResponses': 3, 'discoveredNodes': 3,
            'rootNodes': 1, 'queryableRootNodes': 1, 'excludedRootNodes': 0,
            'auditedAtUtc': '2026-11-19T00:00:00+00:00',
        }), encoding='utf-8')
        document = self.builder['build_seeds'](self.tree)
        self.seed_path.write_text(json.dumps(document, ensure_ascii=False), encoding='utf-8')
        self.calls = []

    def write_tree_wrapper(self, parent, children):
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
        (self.responses / f'{parent}.json').write_text(json.dumps(wrapper), encoding='utf-8')

    def fake_fetch(self, page, code, folder, limiter, timeout, attempts,
                   check_sort=False, preserve_raw=False):
        self.calls.append((page, code, limiter.interval, attempts, check_sort,
                           preserve_raw, limiter.hourly_state_path))
        body = {'code': 0, 'data': {
            'current': 1, 'size': 10, 'total': 1,
            'records': [{'axbe0001': code + '-institution'}],
        }}
        wrapper = {
            'schemaVersion': 1, 'fetchedAtUtc': datetime.now(timezone.utc).isoformat(),
            'request': {'url': self.module['FETCHER']['API_BASE'] +
                        self.module['FETCHER']['LIST_PATH'],
                        'method': 'POST', 'params': {'current': 1, 'size': 10,
                                                     'areaCode': code, 'checkSort': 1}},
            'httpStatus': 200, 'responseSha256': 'a' * 64, 'response': body,
        }
        raw = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        wrapper['responseSha256'] = hashlib.sha256(raw).hexdigest()
        wrapper['rawBodyBase64'] = base64.b64encode(raw).decode('ascii')
        self.module['FETCHER']['save_json'](folder / 'pages' / '00001.json', wrapper)
        return 1

    def run_batch(self, run_id, *, max_areas=1):
        with patch.dict(self.module['run_batch'].__globals__['FETCHER'],
                        {'fetch_page': self.fake_fetch}):
            return self.module['run_batch'](
                self.seed_path, self.tree, self.output, run_id,
                max_areas=max_areas, max_requests=3, interval=60, jitter=10,
                timeout=1)

    def test_one_page_per_code_and_resumable_distinct_run_status(self):
        first = self.run_batch('first-001')
        self.assertEqual(first['exitCode'], 1)
        self.assertEqual(first['newlySaved'], 1)
        self.assertEqual(self.calls, [(1, '440000000000', 60, 1, True, True,
                                       self.root / 'hourly-request-budget.json')])
        second = self.run_batch('first-002')
        self.assertEqual(second['exitCode'], 1)
        self.assertEqual(second['reusedCache'], 1)
        self.assertEqual(second['newlySaved'], 1)
        self.assertEqual([item[1] for item in self.calls],
                         ['440000000000', '440100000000'])
        progress = json.loads((self.output / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(progress['completedAreaCount'], 2)
        self.assertFalse(progress['nationalComplete'])
        self.assertFalse(progress['publishable'])
        self.assertTrue((self.output / 'batch-runs' / 'first-001.status.json').exists())
        self.assertTrue((self.output / 'batch-runs' / 'first-002.status.json').exists())
        third = self.run_batch('first-003')
        self.assertEqual(third['exitCode'], 0)
        self.assertEqual(third['newlySaved'], 1)
        fourth = self.run_batch('first-004')
        self.assertEqual(fourth['exitCode'], 0)
        self.assertEqual(fourth['newlySaved'], 0)
        self.assertEqual(len(self.calls), 3)

    def test_rejects_incomplete_or_tampered_seed_before_fetch(self):
        document = json.loads(self.seed_path.read_text(encoding='utf-8'))
        document['treeWalkComplete'] = False
        self.seed_path.write_text(json.dumps(document), encoding='utf-8')
        status = self.run_batch('bad-seed')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])
        self.assertFalse((self.output / 'manifest.json').exists())

    def test_tree_regression_invalidates_previously_generated_seed(self):
        path = self.tree / 'manifest.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        manifest['treeWalkComplete'] = False
        path.write_text(json.dumps(manifest), encoding='utf-8')
        status = self.run_batch('regressed-tree')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_missing_shared_budget_or_active_cooldown_sends_no_request(self):
        (self.root / 'hourly-request-budget.json').unlink()
        status = self.run_batch('missing-budget')
        self.assertEqual(status['exitCode'], 2)
        self.assertIn('budget missing', status['error'])
        self.assertEqual(self.calls, [])
        (self.root / 'rate-limit.json').write_text(json.dumps({
            'cooldownUntilUtc': '2099-01-01T00:00:00+00:00',
        }), encoding='utf-8')
        status = self.run_batch('cooldown-active')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_invalid_cached_page_stops_globally_without_refetch(self):
        self.run_batch('first-001')
        path = self.output / 'area-440000000000' / 'pages' / '00001.json'
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        wrapper['request']['params']['areaCode'] = 'wrong'
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        self.calls.clear()
        status = self.run_batch('first-002')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_first_page_without_original_http_bytes_is_rejected_on_resume(self):
        self.run_batch('first-001')
        path = self.output / 'area-440000000000' / 'pages' / '00001.json'
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        del wrapper['rawBodyBase64']
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'original HTTP bytes'):
            self.module['checked_cached_page'](path, '440000000000')
        self.calls.clear()
        status = self.run_batch('first-002')
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [])

    def test_real_fetch_page_preserves_exact_http_bytes_and_legacy_default(self):
        # Only transport/clock are isolated; keep the full real write path.
        body = {'code': 0, 'data': {'current': 1, 'size': 10, 'total': 1,
                                  'records': [{'axbe0001': 'id-1'}]}}
        raw = b' ' + json.dumps(body).encode() + bytes([10])
        class Response:
            status = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self): return raw
        methods = []
        def transport(request, **_kwargs):
            methods.append(request.get_method())
            return Response()
        fetcher = self.module['FETCHER']
        with patch.dict(fetcher['request_json'].__globals__, {
                'urlopen': transport,
                'SERVER_CLOCK': SimpleNamespace(timestamp_ms=lambda *_args: '1795048911322')}):
            for preserve in (False, True):
                folder = self.root / ('raw' if preserve else 'legacy')
                args = (1, '440000000000', folder, fetcher['RateLimiter'](0), 1, 1, True)
                if preserve:
                    fetcher['fetch_page'](*args, preserve_raw=True)
                else:
                    fetcher['fetch_page'](*args)
                path = folder / 'pages/00001.json'
                wrapper = json.loads(path.read_text(encoding='utf-8'))
                self.assertEqual(wrapper['responseSha256'], hashlib.sha256(raw).hexdigest())
                if preserve:
                    self.assertEqual(base64.b64decode(wrapper['rawBodyBase64']), raw)
                    self.assertEqual(self.module['checked_cached_page'](path, '440000000000')['firstPageRows'], 1)
                else:
                    self.assertNotIn('rawBodyBase64', wrapper)
        self.assertEqual(methods, ['POST', 'POST'])

    def test_raw_hash_or_raw_json_tampering_blocks_without_refetch(self):
        self.run_batch('first-001')
        path = self.output / 'area-440000000000/pages/00001.json'
        original = path.read_text(encoding='utf-8')
        manifest = (self.output / 'manifest.json').read_bytes()
        for kind in ('hash', 'json'):
            with self.subTest(kind=kind):
                wrapper = json.loads(original)
                if kind == 'hash':
                    raw = base64.b64decode(wrapper['rawBodyBase64']) + b' '
                    wrapper['rawBodyBase64'] = base64.b64encode(raw).decode('ascii')
                else:
                    wrapper['response']['data']['records'][0]['axbe0001'] = 'tampered-id'
                path.write_text(json.dumps(wrapper), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'original HTTP bytes'):
                    self.module['checked_cached_page'](path, '440000000000')
                self.calls.clear()
                status = self.run_batch('tampered-' + kind)
                self.assertEqual(status['exitCode'], 2)
                self.assertEqual(status['requestsThisRun'], 0)
                self.assertEqual(self.calls, [])
                self.assertEqual((self.output / 'manifest.json').read_bytes(), manifest)

    def test_429_stops_all_areas_and_persists_site_cooldown(self):
        def limited(*args, **_kwargs):
            limiter = args[3]
            limiter.trip('HTTP 429 during test', '3600')
            self.calls.append(('429', args[1]))
            raise self.module['FETCHER']['FetchError']('HTTP 429')
        with patch.dict(self.module['run_batch'].__globals__['FETCHER'],
                        {'fetch_page': limited}):
            status = self.module['run_batch'](
                self.seed_path, self.tree, self.output, 'limited',
                max_areas=3, max_requests=3, interval=60, jitter=10, timeout=1)
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(status['rateLimited'])
        self.assertTrue((self.root / 'rate-limit.json').exists())

    def test_business_error_stops_after_first_code(self):
        def failed(*args, **_kwargs):
            self.calls.append(('business-error', args[1]))
            raise self.module['FETCHER']['FetchError']('business code 500')
        with patch.dict(self.module['run_batch'].__globals__['FETCHER'],
                        {'fetch_page': failed}):
            status = self.module['run_batch'](
                self.seed_path, self.tree, self.output, 'business-error',
                max_areas=3, max_requests=3, interval=60, jitter=10, timeout=1)
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(self.calls, [('business-error', '440000000000')])
        self.assertIn('business code', status['error'])

    def test_clean_request_budget_stop_is_resumable(self):
        def budget_stop(*args, **_kwargs):
            self.calls.append(('budget', args[1]))
            raise self.module['FETCHER']['BudgetExhausted']('hourly budget')
        with patch.dict(self.module['run_batch'].__globals__['FETCHER'],
                        {'fetch_page': budget_stop}):
            status = self.module['run_batch'](
                self.seed_path, self.tree, self.output, 'budget-stop',
                max_areas=3, max_requests=3, interval=60, jitter=10, timeout=1)
        self.assertEqual(status['exitCode'], 1)
        self.assertEqual(self.calls, [('budget', '440000000000')])
        self.assertTrue(status['requestBudgetReached'])
        self.assertIsNone(status['error'])

    def test_refuses_interval_below_sixty_before_status_or_network(self):
        for interval in (59, float('nan')):
            with self.subTest(interval=interval), self.assertRaisesRegex(ValueError, 'bounded'):
                self.module['run_batch'](
                    self.seed_path, self.tree, self.output, 'too-fast',
                    interval=interval, jitter=0)
        self.assertEqual(self.calls, [])
        self.assertFalse((self.output / 'batch-runs' / 'too-fast.status.json').exists())


if __name__ == '__main__':
    unittest.main()
