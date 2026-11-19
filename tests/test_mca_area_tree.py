"""Offline behavior checks for the private MCA administrative tree collector."""

import base64
from contextlib import nullcontext, redirect_stderr, redirect_stdout
import hashlib
from io import StringIO
import json
import runpy
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'fetch-mca-area-tree.py'


def collector():
    assert SCRIPT.is_file(), 'MCA area-tree collector script is missing'
    return runpy.run_path(str(SCRIPT))


def node(identifier, parent, level, sbcode):
    return {'id': identifier, 'pid': parent, 'level': level, 'name': identifier,
            'code': identifier + ':' + str(sbcode), 'sbcode': sbcode,
            'pathName': 'test:' + identifier}


def write_seed(path):
    root = [node('bj-opaque', '-1', 1, '110000000000'),
            node('gd-opaque', '-1', 1, '440000000000'),
            node('hn-opaque', '-1', 1, '410000000000'),
            node('tw-opaque', '-1', 1, None)]
    guangdong = [node('gz-opaque', 'gd-opaque', 2, '440100000000')]
    value = {'requestedAt': '2026-11-18T20:10:21+08:00', 'requests': [
        {'path': '/console/area/childs/-1', 'httpStatus': 200,
         'body': {'code': 0, 'data': root}},
        {'path': '/console/area/childs/gd-opaque', 'httpStatus': 200,
         'body': {'code': 0, 'data': guangdong}},
    ]}
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    return hashlib.sha256(path.read_bytes()).hexdigest()


def live_wrapper(parent, children):
    response = {'code': 0, 'data': children}
    raw = json.dumps(response, ensure_ascii=False).encode('utf-8')
    return {'schemaVersion': 1, 'parentId': parent,
            'sourceUrl': 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/' + parent,
            'method': 'GET', 'fetchedAtUtc': '2026-11-18T12:11:00+00:00',
            'httpStatus': 200, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': response, 'provenance': {'kind': 'live-http'}}


class McaAreaTreeTests(unittest.TestCase):
    def test_main_refuses_site_cooldown_before_collecting(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temporary:
            site_root = Path(temporary)
            (site_root / 'rate-limit.json').write_text(
                json.dumps({'cooldownUntilUtc': '2099-01-01T00:00:00+00:00'}),
                encoding='utf-8',
            )
            with patch.dict(m['main'].__globals__, {
                'SITE_ROOT': site_root,
                'collect_tree': lambda *_a, **_kw: self.fail('cooldown must stop collection'),
            }), patch.object(sys, 'argv', ['fetch-mca-area-tree.py']):
                with self.assertRaisesRegex(m['FetchError'], 'cooldown'):
                    m['main']()

    def test_main_uses_the_shared_hourly_budget_file(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temporary:
            site_root = Path(temporary)
            seen = []
            def collect(seed, output, limiter, *, max_level, timeout):
                seen.append((limiter.hourly_state_path, limiter.interval, limiter.max_requests))
                return {key: 0 for key in (
                    'scope', 'rootNodes', 'queryableRootNodes', 'savedResponses',
                    'discoveredNodes', 'treeWalkComplete', 'requestsThisRun',
                    'requestBudgetReached')}
            with patch.dict(m['main'].__globals__, {
                'SITE_ROOT': site_root,
                'exclusive_run_lock': lambda root: nullcontext(),
                'enforce_site_cooldown': lambda root: None,
                'collect_tree': collect,
            }), patch.object(sys, 'argv', ['fetch-mca-area-tree.py']), redirect_stdout(StringIO()):
                m['main']()
            self.assertEqual(seen, [(site_root / 'hourly-request-budget.json', 45.0, 20)])

    def test_main_rejects_short_interval_and_oversized_request_budget(self):
        m = collector()
        for arguments in (['--interval', '44'], ['--max-requests', '61']):
            with self.subTest(arguments=arguments):
                with patch.object(sys, 'argv', ['fetch-mca-area-tree.py', *arguments]), redirect_stderr(StringIO()):
                    with self.assertRaises(SystemExit) as error:
                        m['main']()
                self.assertEqual(error.exception.code, 2)

    def test_seeded_root_traverses_official_ids_and_resumes_after_request_budget(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed = root / 'source.json'
            sha = write_seed(seed)
            output = root / 'private-tree'
            calls = []

            def fetch(parent, limiter, timeout):
                limiter.wait()
                calls.append(parent)
                return live_wrapper(parent, [])

            first = m['collect_tree'](seed, output, m['RateLimiter'](0, 0, 1),
                                      max_level=2, timeout=1, seed_sha256=sha, fetch=fetch)
            self.assertEqual(calls, ['bj-opaque'])
            self.assertFalse(first['treeWalkComplete'])
            self.assertTrue(first['requestBudgetReached'])
            self.assertEqual(first['requestsThisRun'], 1)
            second = m['collect_tree'](seed, output, m['RateLimiter'](0, 0, 1),
                                       max_level=2, timeout=1, seed_sha256=sha, fetch=fetch)
            self.assertEqual(calls, ['bj-opaque', 'hn-opaque'])
            self.assertTrue(second['treeWalkComplete'])
            self.assertEqual(second['rootNodes'], 4)
            self.assertEqual(second['queryableRootNodes'], 3)
            self.assertEqual(second['excludedRootNodes'], 1)
            self.assertEqual(second['seedSnapshotSha256'], sha)
            cached = json.loads((output / 'responses' / 'gd-opaque.json').read_text(encoding='utf-8'))
            self.assertEqual(cached['provenance']['sourceSnapshotSha256'], sha)
            self.assertFalse(cached['provenance']['originalHttpBodyAvailable'])
            self.assertFalse((output / 'responses' / '440000000000.json').exists())

    def test_run_id_writes_immutable_owned_manifest(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed = root / 'source.json'
            sha = write_seed(seed)
            output = root / 'private-tree'
            run_id = 'tree-20261119-owned'

            def fetch(parent, limiter, timeout):
                limiter.wait()
                return live_wrapper(parent, [])

            result = m['collect_tree'](
                seed, output, m['RateLimiter'](0, 0, 5),
                max_level=2, timeout=1, seed_sha256=sha,
                fetch=fetch, run_id=run_id)
            owned = output / 'run-manifests' / f'{run_id}.json'
            self.assertEqual(json.loads(owned.read_text(encoding='utf-8')), result)
            self.assertEqual(result['runId'], run_id)
            with self.assertRaisesRegex(ValueError, 'already exists'):
                m['collect_tree'](
                    seed, output, m['RateLimiter'](0, 0, 5),
                    max_level=2, timeout=1, seed_sha256=sha,
                    fetch=fetch, run_id=run_id)

    def test_invalid_saved_response_stops_without_refetching(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed = root / 'source.json'
            sha = write_seed(seed)
            output = root / 'private-tree'
            def fetch_empty(parent, limiter, timeout):
                limiter.wait()
                return live_wrapper(parent, [])
            m['collect_tree'](seed, output, m['RateLimiter'](0, 0, 2),
                              max_level=2, timeout=1, seed_sha256=sha, fetch=fetch_empty)
            path = output / 'responses' / 'bj-opaque.json'
            damaged = json.loads(path.read_text(encoding='utf-8'))
            damaged['responseSha256'] = '0' * 64
            path.write_text(json.dumps(damaged), encoding='utf-8')
            def unexpected_fetch(*args):
                raise AssertionError('damaged cache must not trigger a new request')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                m['collect_tree'](seed, output, m['RateLimiter'](0, 0, 2),
                                  max_level=2, timeout=1, seed_sha256=sha, fetch=unexpected_fetch)
            manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['pendingParentIds'][0], 'bj-opaque')
            self.assertFalse(manifest['treeWalkComplete'])
            self.assertEqual(manifest['requestsThisRun'], 0)

    def test_main_persists_429_cooldown_even_when_collection_fails(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temporary:
            site_root = Path(temporary)
            def rate_limited(seed, output, limiter, *, max_level, timeout):
                limiter.trip('HTTP 429 during area-tree collection', '3600')
                raise m['FetchError']('HTTP 429; stopped')
            with patch.dict(m['main'].__globals__, {
                'SITE_ROOT': site_root,
                'exclusive_run_lock': lambda root: nullcontext(),
                'enforce_site_cooldown': lambda root: None,
                'collect_tree': rate_limited,
            }), patch.object(sys, 'argv', ['fetch-mca-area-tree.py']):
                with self.assertRaisesRegex(m['FetchError'], '429'):
                    m['main']()
            cooldown = json.loads((site_root / 'rate-limit.json').read_text(encoding='utf-8'))
            self.assertIn('429', cooldown['reason'])
            self.assertTrue(cooldown['cooldownUntilUtc'])

    def test_rejects_child_with_wrong_official_parent_without_saving_it(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed = root / 'source.json'
            sha = write_seed(seed)
            output = root / 'private-tree'
            def wrong_parent(parent, limiter, timeout):
                limiter.wait()
                return live_wrapper(parent, [node('child-opaque', 'wrong-parent', 2, '110101000000')])
            with self.assertRaisesRegex(ValueError, 'pid'):
                m['collect_tree'](seed, output, m['RateLimiter'](0, 0, 3),
                                  max_level=2, timeout=1, seed_sha256=sha, fetch=wrong_parent)
            self.assertFalse((output / 'responses' / 'bj-opaque.json').exists())

    def test_signed_get_preserves_exact_response_bytes_and_uses_node_id(self):
        m = collector()
        raw = json.dumps({'code': 0, 'data': []}, separators=(',', ':')).encode()
        seen = []
        class Response:
            status = 200
            headers = {'Date': 'Wed, 18 Nov 2026 16:01:01 GMT'}
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return raw
        def opener(request, timeout):
            seen.append(request)
            return Response()
        clock = SimpleNamespace(timestamp_ms=lambda limiter=None, refresh=True: '100000')
        limiter = m['RateLimiter'](0, 0, 2)
        wrapper = m['fetch_child']('bj-opaque', limiter, 1, clock=clock, opener=opener)
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0].get_method(), 'GET')
        self.assertTrue(seen[0].full_url.endswith('/console/area/childs/bj-opaque'))
        self.assertEqual(seen[0].headers['X-auth-timestamp'], '100000')
        self.assertEqual(base64.b64decode(wrapper['rawBodyBase64']), raw)
        self.assertEqual(wrapper['responseSha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(limiter.requests_started, 1)

    def test_successful_get_renews_clock_from_valid_response_date(self):
        m = collector()
        server_date = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=6), usegmt=True)
        class Response:
            status = 200
            headers = {'Date': server_date}
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return b'{"code":0,"data":[]}'
        clock = m['CORE']['ServerClock']()
        clock.offset_ms = 6000
        clock.head_offset_ms = 6000
        clock.synced_at_monotonic = time.monotonic() - 120
        prior = clock.synced_at_monotonic
        m['fetch_child']('bj-opaque', m['RateLimiter'](0), 1,
                         clock=clock, opener=lambda *_a, **_kw: Response())
        self.assertGreater(clock.synced_at_monotonic, prior)

    def test_clock_expiring_during_get_wait_repaces_before_sending(self):
        m = collector()
        waits = []
        sent = []
        class Clock:
            calls = 0
            def timestamp_ms(self, *_):
                self.calls += 1
                if self.calls == 2:
                    raise m['FetchError']('server clock expired during request wait; no POST sent')
                return '200000' if self.calls > 2 else '100000'
        class Response:
            status = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return b'{"code":0,"data":[]}'
        def opener(request, timeout):
            sent.append(request.headers['X-auth-timestamp'])
            return Response()
        limiter = m['RateLimiter'](0)
        limiter.wait = lambda: waits.append(True)
        m['fetch_child']('bj-opaque', limiter, 1, clock=Clock(), opener=opener)
        self.assertEqual(len(waits), 2)
        self.assertEqual(sent, ['200000'])

    def test_get_clock_repace_is_bounded_if_second_wait_also_expires(self):
        m = collector()
        waits = []
        sent = []
        class Clock:
            def timestamp_ms(self, limiter=None, refresh=True):
                if not refresh:
                    raise m['FetchError']('server clock expired during request wait; no POST sent')
                return '100000'
        limiter = m['RateLimiter'](0)
        limiter.wait = lambda: waits.append(True)
        with self.assertRaisesRegex(m['FetchError'], 'server clock expired'):
            m['fetch_child']('bj-opaque', limiter, 1, clock=Clock(),
                             opener=lambda *_a, **_kw: sent.append(True))
        self.assertEqual(len(waits), 2)
        self.assertEqual(sent, [])

    def test_clock_recalibration_uses_same_budget_and_stops_before_get(self):
        m = collector()
        sent = []
        class Clock:
            calls = 0
            def timestamp_ms(self, limiter=None, refresh=True):
                self.calls += 1
                if self.calls == 2:
                    raise m['FetchError']('server clock expired during request wait; no POST sent')
                if self.calls == 3:
                    limiter.wait()  # 校时 HEAD 占用同一请求预算。
                return '200000'
        limiter = m['RateLimiter'](0, 0, 2)
        with self.assertRaises(m['BudgetExhausted']):
            m['fetch_child']('bj-opaque', limiter, 1, clock=Clock(),
                             opener=lambda *_a, **_kw: sent.append(True))
        self.assertEqual(limiter.requests_started, 2)
        self.assertEqual(sent, [])

    def test_http_429_opens_shared_circuit_and_never_retries(self):
        m = collector()
        calls = []
        def denied(request, timeout):
            calls.append(request.full_url)
            raise HTTPError(request.full_url, 429, 'Too Many Requests',
                            {'Retry-After': '3600'}, None)
        clock = SimpleNamespace(timestamp_ms=lambda limiter=None, refresh=True: '100000')
        limiter = m['RateLimiter'](0, 0, 3)
        with self.assertRaisesRegex(m['FetchError'], '429'):
            m['fetch_child']('bj-opaque', limiter, 1, clock=clock, opener=denied)
        self.assertEqual(len(calls), 1)
        self.assertTrue(limiter.blocked.is_set())
        with self.assertRaisesRegex(m['FetchError'], 'circuit open'):
            m['fetch_child']('hn-opaque', limiter, 1, clock=clock, opener=denied)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
