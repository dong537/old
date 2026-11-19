"""Offline behavior checks for the private MCA collection adapter."""

import hashlib
import io
import json
import runpy
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError
from uuid import UUID

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'fetch-mca-institutions.py'
fetcher = runpy.run_path(str(SCRIPT))


class McaFetcherTests(unittest.TestCase):
    def setUp(self):
        self.globals_ = fetcher['signed_headers'].__globals__
        self.original_clock = self.globals_.get('SERVER_CLOCK')
        self.globals_['SERVER_CLOCK'] = SimpleNamespace(timestamp_ms=lambda *_: '100000')

    def tearDown(self):
        if self.original_clock is None:
            self.globals_.pop('SERVER_CLOCK', None)
        else:
            self.globals_['SERVER_CLOCK'] = self.original_clock

    def test_detail_accepts_short_alphanumeric_id_from_official_list(self):
        identifier = 'A123456'
        globals_ = fetcher['collect_detail'].__globals__
        original_request = globals_['request_json']
        calls = []
        def response_for(endpoint, params, *_):
            calls.append((endpoint, params))
            return {'request': {'params': params}, 'httpStatus': 200,
                    'response': {'code': 0, 'data': {'axbe0001': identifier}}}
        with tempfile.TemporaryDirectory() as temporary:
            globals_['request_json'] = response_for
            try:
                folder = Path(temporary) / 'area-test'
                self.assertEqual(fetcher['collect_detail'](
                    identifier, folder, object(), 1, 1), identifier)
                self.assertTrue((folder / 'details' / f'{identifier}.json').exists())
                self.assertEqual([call[0] for call in calls],
                                 list(fetcher['DETAIL_PATHS']))
            finally:
                globals_['request_json'] = original_request

    def test_detail_rejects_unsafe_or_unobserved_short_id_before_request(self):
        globals_ = fetcher['collect_detail'].__globals__
        original_request = globals_['request_json']
        globals_['request_json'] = lambda *_: self.fail('invalid ID must not be requested')
        try:
            with tempfile.TemporaryDirectory() as temporary:
                for identifier in ('ABC123', '../bad', 'bad/name'):
                    with self.subTest(identifier=identifier):
                        with self.assertRaisesRegex(fetcher['FetchError'],
                                                    'invalid institution ID'):
                            fetcher['collect_detail'](
                                identifier, Path(temporary), object(), 1, 1)
        finally:
            globals_['request_json'] = original_request

    def test_detail_budget_pause_resumes_only_missing_endpoint(self):
        identifier = 'AD3777D91F431D21E053E897A6C077E1'
        base = {'request': {'params': {'axbe0001': identifier}}, 'httpStatus': 200,
                'response': {'code': 0, 'data': {'axbe0001': identifier, 'axbe0003': '养老院'}}}
        care = {'request': {'params': {'axbe0001': identifier}}, 'httpStatus': 200,
                'response': {'code': 0, 'data': {'ahae2347': 20}}}
        calls = []
        globals_ = fetcher['collect_detail'].__globals__
        original_request = globals_['request_json']
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'area-440113000000-check-sort-1'
            def pause_after_base(endpoint, params, *_):
                calls.append(endpoint)
                if endpoint == 'orgBaseDetail':
                    return base
                raise fetcher['BudgetExhausted']('request budget exhausted')
            globals_['request_json'] = pause_after_base
            try:
                with self.assertRaises(fetcher['BudgetExhausted']):
                    fetcher['collect_detail'](identifier, folder, object(), 1, 1)
                checkpoint = folder / 'detail-checkpoints' / identifier / 'orgBaseDetail.json'
                self.assertTrue(checkpoint.exists())
                self.assertEqual(json.loads(checkpoint.read_text(encoding='utf-8')), base)
                self.assertFalse((folder / 'details' / f'{identifier}.json').exists())
                self.assertEqual(calls, ['orgBaseDetail', 'yangLaoOrgDetail'])

                calls.clear()
                def resume(endpoint, params, *_):
                    calls.append(endpoint)
                    if endpoint != 'yangLaoOrgDetail':
                        self.fail('already saved endpoint must not be requested again')
                    return care
                globals_['request_json'] = resume
                self.assertEqual(fetcher['collect_detail'](identifier, folder, object(), 1, 1), identifier)
                self.assertEqual(calls, ['yangLaoOrgDetail'])
                combined = json.loads((folder / 'details' / f'{identifier}.json').read_text(encoding='utf-8'))
                self.assertEqual(combined['endpoints'], {'orgBaseDetail': base, 'yangLaoOrgDetail': care})
            finally:
                globals_['request_json'] = original_request

    def test_invalid_saved_detail_checkpoint_blocks_final_file_without_request(self):
        identifier = 'AD3777D91F431D21E053E897A6C077E1'
        globals_ = fetcher['collect_detail'].__globals__
        original_request = globals_['request_json']
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'area-440113000000-check-sort-1'
            checkpoint = folder / 'detail-checkpoints' / identifier / 'orgBaseDetail.json'
            checkpoint.parent.mkdir(parents=True)
            checkpoint.write_text(json.dumps({
                'request': {'params': {'axbe0001': 'wrong-id'}}, 'httpStatus': 200,
                'response': {'code': 0, 'data': {'axbe0001': identifier}},
            }), encoding='utf-8')
            globals_['request_json'] = lambda *_: self.fail('invalid cache must not be reused or refetched')
            try:
                with self.assertRaisesRegex(fetcher['FetchError'], 'request ID mismatch'):
                    fetcher['collect_detail'](identifier, folder, object(), 1, 1)
                self.assertFalse((folder / 'details' / f'{identifier}.json').exists())
            finally:
                globals_['request_json'] = original_request

    def test_signature_uses_calibrated_millis_and_site_uuid_format(self):
        nonce = '12345678-1234-4234-8234-123456789abc'
        with patch('uuid.uuid4', return_value=UUID(nonce)):
            headers = fetcher['signed_headers']()
        expected = hashlib.md5((fetcher['PUBLIC_KEY'] + 'ylfwxxpt' + '100000' + nonce).encode()).hexdigest()
        self.assertEqual(headers['X-Auth-Timestamp'], '100000')
        self.assertEqual(headers['X-Auth-Nonce'], nonce)
        self.assertEqual(headers['X-Auth-Signature'], expected)

    def test_server_clock_calibrates_http_date_and_refreshes_when_stale(self):
        server_date = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=6), usegmt=True)
        calls = []
        class Response:
            status = 200
            headers = {'Date': server_date}
            def __enter__(self): return self
            def __exit__(self, *_): return False
        def clock_head(request, timeout):
            calls.append(request.get_method())
            return Response()
        original = self.globals_['urlopen']
        self.globals_['urlopen'] = clock_head
        try:
            clock = fetcher['ServerClock'](ttl_seconds=300)
            timestamp = clock.timestamp_ms()
            self.assertTrue(timestamp.isdigit())
            self.assertGreater(clock.offset_ms, 4000)
            self.assertLess(clock.offset_ms, 7500)
            self.assertEqual(calls, ['HEAD'])
            clock.timestamp_ms()
            self.assertEqual(calls, ['HEAD'])
            clock.synced_at_monotonic -= 301
            clock.timestamp_ms()
            self.assertEqual(calls, ['HEAD', 'HEAD'])
        finally:
            self.globals_['urlopen'] = original

    def test_server_clock_refreshes_before_pacing_would_expire_ttl(self):
        clock = fetcher['ServerClock'](ttl_seconds=300)
        clock.offset_ms = 0
        clock.synced_at_monotonic = 100
        limiter = fetcher['RateLimiter'](60, jitter=10)
        # 校时虽未过期，但下一次串行请求最多还要等 70 秒。
        with patch('time.monotonic', return_value=350), patch.object(clock, '_refresh') as refresh:
            clock.timestamp_ms(limiter)
        refresh.assert_called_once_with(limiter)

    def test_valid_api_date_renews_clock_but_missing_or_outlier_date_does_not(self):
        clock = fetcher['ServerClock'](ttl_seconds=300)
        clock.offset_ms = 6400
        clock.head_offset_ms = 6400
        clock.synced_at_monotonic = 100
        start = datetime(2026, 11, 19, tzinfo=timezone.utc).timestamp()
        normal = format_datetime(datetime.fromtimestamp(start + 6, timezone.utc), usegmt=True)
        outlier = format_datetime(datetime.fromtimestamp(start + 30, timezone.utc), usegmt=True)
        with patch('time.monotonic', return_value=250):
            self.assertFalse(clock.observe_response_date(None, start, start + 0.2))
            self.assertFalse(clock.observe_response_date('invalid', start, start + 0.2))
            self.assertFalse(clock.observe_response_date(outlier, start, start + 0.2))
            self.assertFalse(clock.observe_response_date(normal, start, start + 6))
            self.assertEqual(clock.synced_at_monotonic, 100)
            self.assertTrue(clock.observe_response_date(normal, start, start + 0.2))
            self.assertEqual(clock.synced_at_monotonic, 250)
            self.assertAlmostEqual(clock.offset_ms, 6400, delta=150)

    def test_successful_post_uses_valid_date_and_preserves_it_in_raw_wrapper(self):
        server_date = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=6), usegmt=True)
        class Response:
            status = 200
            headers = {'Date': server_date}
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return b'{"code":0,"data":{}}'
        clock = fetcher['ServerClock']()
        clock.offset_ms = 6000
        clock.head_offset_ms = 6000
        clock.synced_at_monotonic = time.monotonic() - 120
        prior = clock.synced_at_monotonic
        original = self.globals_['urlopen']
        self.globals_['urlopen'] = lambda *_a, **_kw: Response()
        self.globals_['SERVER_CLOCK'] = clock
        try:
            wrapper = fetcher['request_json'](
                'queryOrganizationDataList', {'current': 1, 'size': 10},
                fetcher['RateLimiter'](0), 1, 1, preserve_raw=True)
            self.assertEqual(wrapper['responseDate'], server_date)
            self.assertGreater(clock.synced_at_monotonic, prior)
        finally:
            self.globals_['urlopen'] = original

    def test_clock_date_failure_stops_before_post_without_fallback(self):
        calls = []
        class Response:
            status = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *_): return False
        def missing_date(request, timeout):
            calls.append(request.get_method())
            return Response()
        original = self.globals_['urlopen']
        self.globals_['urlopen'] = missing_date
        self.globals_['SERVER_CLOCK'] = fetcher['ServerClock']()
        try:
            with self.assertRaisesRegex(fetcher['FetchError'], 'clock'):
                fetcher['request_json']('queryOrganizationDataList', {'current': 16, 'size': 10},
                                        fetcher['RateLimiter'](0), 1, 1)
            self.assertEqual(calls, ['HEAD'])
        finally:
            self.globals_['urlopen'] = original

    def test_global_limiter_spreads_requests_with_jitter(self):
        with patch('time.monotonic', return_value=100), patch('random.uniform', return_value=1.5), patch('time.sleep') as sleeper:
            limiter = fetcher['RateLimiter'](5, jitter=3)
            limiter.wait()
        sleeper.assert_called_once_with(6.5)
        self.assertEqual(limiter.next_at, 113)

    def test_request_budget_counts_clock_head_and_stops_before_post(self):
        calls = []
        server_date = format_datetime(datetime.now(timezone.utc), usegmt=True)
        class Response:
            status = 200
            headers = {'Date': server_date}
            def __enter__(self): return self
            def __exit__(self, *_): return False
        def only_clock(request, timeout):
            calls.append(request.get_method())
            return Response()
        old_open, old_clock = self.globals_['urlopen'], self.globals_['SERVER_CLOCK']
        self.globals_['urlopen'] = only_clock
        self.globals_['SERVER_CLOCK'] = fetcher['ServerClock']()
        try:
            limiter = fetcher['RateLimiter'](0, max_requests=1)
            with self.assertRaisesRegex(fetcher['BudgetExhausted'], 'request budget'):
                fetcher['request_json']('queryOrganizationDataList', {'current': 1, 'size': 10},
                                        limiter, 1, 1)
            self.assertEqual(calls, ['HEAD'])
            self.assertEqual(limiter.requests_started, 1)
        finally:
            self.globals_['urlopen'], self.globals_['SERVER_CLOCK'] = old_open, old_clock

    def test_hourly_budget_survives_restart_and_stops_without_sleeping(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state_path = root / 'hourly-request-budget.json'
            with fetcher['exclusive_run_lock'](root):
                first = fetcher['RateLimiter'](0, max_requests=60, hourly_state_path=state_path)
                for _ in range(60):
                    first.wait()
                self.assertEqual(len(json.loads(state_path.read_text(encoding='utf-8'))['requestStartedAtUtc']), 60)
                self.assertTrue(first.exhausted.is_set())
                self.assertIsNotNone(first.hourly_resume_at_utc)
                with self.assertRaisesRegex(fetcher['BudgetExhausted'], 'hourly request budget'):
                    first.wait()
                restarted = fetcher['RateLimiter'](0, max_requests=60, hourly_state_path=state_path)
                with patch('time.sleep') as sleeper, self.assertRaisesRegex(fetcher['BudgetExhausted'], 'hourly request budget'):
                    restarted.wait()
                sleeper.assert_not_called()
                self.assertTrue(restarted.exhausted.is_set())
                resume = datetime.fromisoformat(restarted.hourly_resume_at_utc)
                self.assertGreater(resume, datetime.now(timezone.utc))
                self.assertLess(resume, datetime.now(timezone.utc) + timedelta(hours=1))
                self.assertEqual(restarted.requests_started, 0)
            child_code = (
                "import runpy, sys\n"
                "from pathlib import Path\n"
                "module = runpy.run_path(sys.argv[1])\n"
                "root = Path(sys.argv[2])\n"
                "with module['exclusive_run_lock'](root):\n"
                "    limiter = module['RateLimiter'](0, max_requests=60, hourly_state_path=root / 'hourly-request-budget.json')\n"
                "    try:\n"
                "        limiter.wait()\n"
                "    except module['BudgetExhausted'] as error:\n"
                "        print(error)\n"
                "        sys.exit(0)\n"
                "sys.exit(1)\n"
            )
            child = subprocess.run([sys.executable, '-c', child_code, str(SCRIPT), str(root)],
                                   capture_output=True, text=True, timeout=10)
            self.assertEqual(child.returncode, 0, child.stderr)
            self.assertIn('hourly request budget', child.stdout)

    def test_hourly_budget_prunes_elapsed_requests(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state_path = root / 'hourly-request-budget.json'
            expired = (datetime.now(timezone.utc) - timedelta(hours=1, seconds=2)).isoformat()
            state_path.write_text(json.dumps({
                'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
                'requestStartedAtUtc': [expired] * 60,
            }), encoding='utf-8')
            with fetcher['exclusive_run_lock'](root):
                limiter = fetcher['RateLimiter'](0, max_requests=60, hourly_state_path=state_path)
                limiter.wait()
            saved = json.loads(state_path.read_text(encoding='utf-8'))
            self.assertEqual(len(saved['requestStartedAtUtc']), 1)
            self.assertEqual(limiter.requests_started, 1)

    def test_hourly_budget_records_after_pacing_wait(self):
        clock = [datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)]
        class ControlledDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return clock[0]
        original_datetime = self.globals_['datetime']
        with tempfile.TemporaryDirectory() as temporary:
            state_path = Path(temporary) / 'hourly-request-budget.json'
            self.globals_['datetime'] = ControlledDateTime
            try:
                def paced_sleep(seconds):
                    clock[0] += timedelta(seconds=seconds)
                with (patch('time.monotonic', return_value=100),
                      patch('random.uniform', return_value=0),
                      patch('time.sleep', side_effect=paced_sleep)):
                    limiter = fetcher['RateLimiter'](45, max_requests=1, hourly_state_path=state_path)
                    limiter.wait()
                saved = json.loads(state_path.read_text(encoding='utf-8'))
                self.assertEqual(saved['requestStartedAtUtc'], ['2026-11-19T12:00:45+00:00'])
            finally:
                self.globals_['datetime'] = original_datetime

    def test_blocked_during_pacing_wait_does_not_record_hourly_request(self):
        with tempfile.TemporaryDirectory() as temporary:
            state_path = Path(temporary) / 'hourly-request-budget.json'
            with (patch('time.monotonic', return_value=100),
                  patch('random.uniform', return_value=0),
                  patch('time.sleep') as sleeper):
                limiter = fetcher['RateLimiter'](45, max_requests=1, hourly_state_path=state_path)
                sleeper.side_effect = lambda *_: limiter.blocked.set()
                with self.assertRaisesRegex(fetcher['FetchError'], 'circuit open'):
                    limiter.wait()
            self.assertFalse(state_path.exists())
            self.assertEqual(limiter.requests_started, 0)

    def test_hourly_budget_counts_clock_head_and_failed_post(self):
        server_date = format_datetime(datetime.now(timezone.utc), usegmt=True)
        calls = []
        class Response:
            status = 200
            headers = {'Date': server_date}
            def __enter__(self): return self
            def __exit__(self, *_): return False
        def head_then_429(request, timeout):
            calls.append(request.get_method())
            if request.get_method() == 'HEAD':
                return Response()
            raise HTTPError(request.full_url, 429, 'Too Many Requests', {'Retry-After': '3600'}, None)
        old_open, old_clock = self.globals_['urlopen'], self.globals_['SERVER_CLOCK']
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state_path = root / 'hourly-request-budget.json'
            self.globals_['urlopen'] = head_then_429
            self.globals_['SERVER_CLOCK'] = fetcher['ServerClock']()
            try:
                with fetcher['exclusive_run_lock'](root):
                    limiter = fetcher['RateLimiter'](0, max_requests=60, hourly_state_path=state_path)
                    with self.assertRaisesRegex(fetcher['FetchError'], 'HTTP 429'):
                        fetcher['request_json']('orgBaseDetail', {'axbe0001': 'id-12345678'}, limiter, 1, 1)
                    self.assertEqual(calls, ['HEAD', 'POST'])
                    self.assertEqual(limiter.requests_started, 2)
                    self.assertEqual(len(json.loads(state_path.read_text(encoding='utf-8'))['requestStartedAtUtc']), 2)
                    self.assertTrue(limiter.blocked.is_set())
            finally:
                self.globals_['urlopen'], self.globals_['SERVER_CLOCK'] = old_open, old_clock

    def test_post_signature_uses_time_after_the_rate_limit_wait(self):
        current_ms = [100000]
        observed = []
        class Response:
            status = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return b'{"code":0,"data":{}}'
        def receive(request, timeout):
            observed.append(request.headers['X-auth-timestamp'])
            return Response()
        old_open, old_clock = self.globals_['urlopen'], self.globals_['SERVER_CLOCK']
        self.globals_['urlopen'] = receive
        self.globals_['SERVER_CLOCK'] = SimpleNamespace(timestamp_ms=lambda *_: str(current_ms[0]))
        limiter = fetcher['RateLimiter'](0)
        limiter.wait = lambda: current_ms.__setitem__(0, current_ms[0] + 10000)
        try:
            fetcher['request_json']('queryOrganizationDataList', {'current': 1, 'size': 10},
                                    limiter, 1, 1)
            self.assertEqual(observed, ['110000'])
        finally:
            self.globals_['urlopen'], self.globals_['SERVER_CLOCK'] = old_open, old_clock

    def test_clock_expiring_during_post_wait_repaces_before_sending(self):
        waits = []
        posted = []
        class Clock:
            refresh_checks = 0
            def timestamp_ms(self, *_):
                self.refresh_checks += 1
                if self.refresh_checks == 2:
                    raise fetcher['FetchError']('server clock expired during request wait; no POST sent')
                return '200000' if self.refresh_checks > 2 else '100000'
        class Response:
            status = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return b'{"code":0,"data":{}}'
        def receive(request, timeout):
            posted.append(request.headers['X-auth-timestamp'])
            return Response()
        old_open, old_clock = self.globals_['urlopen'], self.globals_['SERVER_CLOCK']
        self.globals_['urlopen'], self.globals_['SERVER_CLOCK'] = receive, Clock()
        limiter = fetcher['RateLimiter'](0)
        limiter.wait = lambda: waits.append(True)
        try:
            fetcher['request_json']('queryOrganizationDataList', {'current': 1, 'size': 10},
                                    limiter, 1, 1)
            self.assertEqual(len(waits), 2)
            self.assertEqual(posted, ['200000'])
        finally:
            self.globals_['urlopen'], self.globals_['SERVER_CLOCK'] = old_open, old_clock

    def test_retry_after_http_date_extends_cooldown(self):
        limiter = fetcher['RateLimiter'](0)
        retry_at = datetime.now(timezone.utc) + timedelta(hours=3)
        limiter.trip('HTTP 429', format_datetime(retry_at, usegmt=True))
        self.assertGreater(datetime.fromisoformat(limiter.cooldown_until_utc),
                           datetime.now(timezone.utc) + timedelta(hours=2, minutes=50))

    def test_http_429_trips_global_circuit_without_retrying_or_sending_another_request(self):
        calls = []
        def denied(request, timeout):
            calls.append(request.full_url)
            raise HTTPError(request.full_url, 429, 'Too Many Requests', {'Retry-After': '7200'}, None)
        globals_ = fetcher['request_json'].__globals__
        original = globals_['urlopen']
        globals_['urlopen'] = denied
        limiter = fetcher['RateLimiter'](0)
        try:
            with self.assertRaisesRegex(fetcher['FetchError'], 'HTTP 429'):
                fetcher['request_json']('queryOrganizationDataList', {'current': 1, 'size': 10}, limiter, 1, 4)
            self.assertTrue(limiter.blocked.is_set())
            self.assertEqual(len(calls), 1, '429 must not be retried')
            self.assertGreater(datetime.fromisoformat(limiter.cooldown_until_utc), datetime.now(timezone.utc) + timedelta(minutes=90))
            with self.assertRaisesRegex(fetcher['FetchError'], 'circuit open'):
                fetcher['request_json']('queryOrganizationDataList', {'current': 2, 'size': 10}, limiter, 1, 4)
            self.assertEqual(len(calls), 1, 'open circuit must not send a second request')
        finally:
            globals_['urlopen'] = original

    def test_business_error_is_saved_privately_without_retry_or_response_data(self):
        raw = json.dumps({'code': 1, 'msg': 'x' * 220,
                          'data': {'secret': 'raw-person-field'}}).encode()
        calls = []
        class Response:
            status = 200
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self):
                return raw
        def business_error(request, timeout):
            calls.append(request.full_url)
            return Response()
        globals_ = fetcher['request_json'].__globals__
        old_root, old_urlopen = globals_['ROOT'], globals_['urlopen']
        with tempfile.TemporaryDirectory() as temporary:
            globals_['ROOT'] = Path(temporary)
            globals_['urlopen'] = business_error
            try:
                with self.assertRaisesRegex(fetcher['FetchError'], 'business code 1'):
                    fetcher['request_json']('queryOrganizationDataList',
                                            {'current': 16, 'size': 10}, fetcher['RateLimiter'](0), 1, 4)
                self.assertEqual(len(calls), 1, 'business error must not be retried')
                errors = list((Path(temporary) / 'errors').glob('*.json'))
                self.assertEqual(len(errors), 1)
                diagnostic = json.loads(errors[0].read_text(encoding='utf-8'))
                self.assertEqual(diagnostic['endpoint'], 'queryOrganizationDataList')
                self.assertEqual(diagnostic['params'], {'current': 16, 'size': 10})
                self.assertEqual(diagnostic['httpStatus'], 200)
                self.assertEqual(diagnostic['businessCode'], 1)
                self.assertEqual(len(diagnostic['message']), 160)
                self.assertIn('requestedAtUtc', diagnostic)
                self.assertEqual(diagnostic['responseSha256'], hashlib.sha256(raw).hexdigest())
                self.assertNotIn('raw-person-field', errors[0].read_text(encoding='utf-8'))
            finally:
                globals_['ROOT'], globals_['urlopen'] = old_root, old_urlopen

    def test_expired_signature_forces_one_clock_refresh_and_re_signs(self):
        calls = []
        refreshed = []
        clock = SimpleNamespace(
            timestamp_ms=lambda *_: '100000' if not refreshed else '107000',
            force_refresh=lambda *_: refreshed.append(True),
        )
        class Response:
            status = 200
            headers = {'Date': 'Wed, 18 Nov 2026 16:01:01 GMT'}
            def __init__(self, payload): self.payload = payload
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps(self.payload, ensure_ascii=False).encode()
        def expired_once(request, timeout):
            calls.append((request.headers['X-auth-timestamp'], request.headers['X-auth-signature']))
            if len(calls) == 1:
                return Response({'code': 1, 'msg': '请求已过期'})
            return Response({'code': 0, 'data': {'records': []}})
        globals_ = fetcher['request_json'].__globals__
        old_root, old_urlopen, old_clock = globals_['ROOT'], globals_['urlopen'], globals_['SERVER_CLOCK']
        with tempfile.TemporaryDirectory() as temporary:
            globals_['ROOT'], globals_['urlopen'], globals_['SERVER_CLOCK'] = Path(temporary), expired_once, clock
            try:
                wrapper = fetcher['request_json']('queryOrganizationDataList',
                                                  {'current': 16, 'size': 10}, fetcher['RateLimiter'](0), 1, 4)
                self.assertEqual(wrapper['response']['code'], 0)
                self.assertEqual(len(refreshed), 1)
                self.assertEqual(len(calls), 2)
                self.assertEqual([item[0] for item in calls], ['100000', '107000'])
                self.assertNotEqual(calls[0][1], calls[1][1])
                diagnostic = json.loads(next((Path(temporary) / 'errors').glob('*.json')).read_text(encoding='utf-8'))
                self.assertEqual(diagnostic['responseDate'], 'Wed, 18 Nov 2026 16:01:01 GMT')
                self.assertEqual(diagnostic['signedTimestampMs'], '100000')
            finally:
                globals_['ROOT'], globals_['urlopen'], globals_['SERVER_CLOCK'] = old_root, old_urlopen, old_clock

    def test_repeated_expired_signature_stops_after_one_clock_retry(self):
        calls = []
        refreshed = []
        class Response:
            status = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps({'code': 1, 'msg': '请求已过期'}, ensure_ascii=False).encode()
        def always_expired(request, timeout):
            calls.append(request.full_url)
            return Response()
        globals_ = fetcher['request_json'].__globals__
        old_root, old_urlopen, old_clock = globals_['ROOT'], globals_['urlopen'], globals_['SERVER_CLOCK']
        with tempfile.TemporaryDirectory() as temporary:
            globals_['ROOT'], globals_['urlopen'] = Path(temporary), always_expired
            globals_['SERVER_CLOCK'] = SimpleNamespace(timestamp_ms=lambda *_: '100000',
                                                        force_refresh=lambda *_: refreshed.append(True))
            try:
                with self.assertRaisesRegex(fetcher['FetchError'], 'business code 1'):
                    fetcher['request_json']('queryOrganizationDataList',
                                            {'current': 16, 'size': 10}, fetcher['RateLimiter'](0), 1, 4)
                self.assertEqual(len(calls), 2)
                self.assertEqual(len(refreshed), 1)
                self.assertEqual(len(list((Path(temporary) / 'errors').glob('*.json'))), 2)
            finally:
                globals_['ROOT'], globals_['urlopen'], globals_['SERVER_CLOCK'] = old_root, old_urlopen, old_clock

    def test_persisted_cooldown_rejects_run_before_any_network_request(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / 'area-440000000000'
            folder.mkdir()
            until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            (folder / 'rate-limit.json').write_text(json.dumps({'cooldownUntilUtc': until}), encoding='utf-8')
            globals_ = fetcher['main'].__globals__
            old_root, old_urlopen, old_argv = globals_['ROOT'], globals_['urlopen'], sys.argv
            calls = []
            def unexpected_request(request, timeout):
                calls.append(request.full_url)
                raise AssertionError('network must not be used during cooldown')
            globals_['ROOT'] = root
            globals_['urlopen'] = unexpected_request
            sys.argv = [str(SCRIPT), 'list', '--area-code', '440000000000', '--max-pages', '1']
            try:
                with self.assertRaisesRegex(fetcher['FetchError'], 'cooldown active'):
                    fetcher['main']()
                self.assertEqual(calls, [])
            finally:
                globals_['ROOT'], globals_['urlopen'], sys.argv = old_root, old_urlopen, old_argv

    def test_cooldown_from_one_area_blocks_another_area_before_network(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            prior = root / 'area-440000000000'
            prior.mkdir()
            until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            (prior / 'rate-limit.json').write_text(json.dumps({'cooldownUntilUtc': until}), encoding='utf-8')
            globals_ = fetcher['main'].__globals__
            old_root, old_urlopen, old_argv = globals_['ROOT'], globals_['urlopen'], sys.argv
            calls = []
            def unexpected_request(request, timeout):
                calls.append(request.full_url)
                raise AssertionError('site-wide cooldown must stop all area requests')
            globals_['ROOT'] = root
            globals_['urlopen'] = unexpected_request
            sys.argv = [str(SCRIPT), 'list', '--area-code', '110000000000', '--max-pages', '1']
            try:
                with self.assertRaisesRegex(fetcher['FetchError'], 'cooldown active'):
                    fetcher['main']()
                self.assertEqual(calls, [])
            finally:
                globals_['ROOT'], globals_['urlopen'], sys.argv = old_root, old_urlopen, old_argv

    def test_saved_page_with_different_request_params_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'area-440000000000'
            page = folder / 'pages' / '00001.json'
            page.parent.mkdir(parents=True)
            page.write_text(json.dumps({'request': {'params': {'current': 1, 'size': 10, 'areaCode': '110000000000'}}, 'httpStatus': 200, 'response': {'code': 0, 'data': {'current': 1, 'size': 10, 'total': 1, 'records': []}}}), encoding='utf-8')
            args = SimpleNamespace(area_code='440000000000', timeout=1, attempts=1, max_pages=1, workers=1, check_sort=False)
            with self.assertRaisesRegex(fetcher['FetchError'], 'saved query differs'):
                fetcher['collect_list'](args, folder, fetcher['RateLimiter'](0))

    def test_saved_page_rejects_business_failure_even_with_shaped_data(self):
        wrapper = {
            'request': {'params': fetcher['page_params'](1, '440113000000')},
            'httpStatus': 200,
            'response': {'code': 1, 'data': {'current': 1, 'size': 10, 'total': 1,
                                            'records': [{'axbe0001': 'id-1'}]}},
        }
        with self.assertRaisesRegex(fetcher['FetchError'], 'business code'):
            fetcher['checked_page'](wrapper, 1, '440113000000')

    def test_check_sort_changes_only_the_explicit_query_and_rejects_mixed_cache(self):
        normal = fetcher['page_params'](1, '440000000000')
        sorted_params = fetcher['page_params'](1, '440000000000', check_sort=True)
        self.assertEqual(normal, {'current': 1, 'size': 10, 'areaCode': '440000000000'})
        self.assertEqual(sorted_params, {**normal, 'checkSort': 1})
        wrapper = {'request': {'params': normal}, 'httpStatus': 200,
                   'response': {'data': {'current': 1, 'size': 10, 'total': 0, 'records': []}}}
        with self.assertRaisesRegex(fetcher['FetchError'], 'saved query differs'):
            fetcher['checked_page'](wrapper, 1, '440000000000', check_sort=True)
        wrapper['request']['params'] = sorted_params
        with self.assertRaisesRegex(fetcher['FetchError'], 'saved query differs'):
            fetcher['checked_page'](wrapper, 1, '440000000000')

    def test_check_sort_uses_separate_private_folder_without_changing_default(self):
        globals_ = fetcher['main'].__globals__
        old_root, old_collect_list, old_argv = globals_['ROOT'], globals_['collect_list'], sys.argv
        selected = []
        with tempfile.TemporaryDirectory() as temporary:
            globals_['ROOT'] = Path(temporary)
            globals_['collect_list'] = lambda args, folder, limiter: selected.append((args.check_sort, folder))
            try:
                sys.argv = [str(SCRIPT), 'list', '--area-code', '440000000000']
                fetcher['main']()
                sys.argv = [str(SCRIPT), 'list', '--area-code', '440000000000', '--check-sort']
                fetcher['main']()
                self.assertEqual(selected, [
                    (False, Path(temporary) / 'area-440000000000'),
                    (True, Path(temporary) / 'area-440000000000-check-sort-1'),
                ])
            finally:
                globals_['ROOT'], globals_['collect_list'], sys.argv = old_root, old_collect_list, old_argv

    def test_capture_id_creates_independent_round_folder(self):
        globals_ = fetcher['main'].__globals__
        old_root, old_collect_list, old_argv = globals_['ROOT'], globals_['collect_list'], sys.argv
        seen = []
        with tempfile.TemporaryDirectory() as temporary:
            globals_['ROOT'] = Path(temporary)
            globals_['collect_list'] = lambda args, folder, limiter: seen.append((folder, limiter.max_requests))
            sys.argv = [str(SCRIPT), 'list', '--area-code', '110000000000', '--check-sort',
                        '--capture-id', 'round-20261119-a', '--max-requests', '25']
            try:
                fetcher['main']()
                self.assertEqual(seen, [(Path(temporary) / 'area-110000000000-check-sort-1-capture-round-20261119-a', 25)])
            finally:
                globals_['ROOT'], globals_['collect_list'], sys.argv = old_root, old_collect_list, old_argv

    def test_cli_rejects_multiworker_and_too_short_interval(self):
        globals_ = fetcher['main'].__globals__
        old_root, old_collect_list = globals_['ROOT'], globals_['collect_list']
        old_argv = sys.argv
        with tempfile.TemporaryDirectory() as temporary:
            globals_['ROOT'] = Path(temporary)
            globals_['collect_list'] = lambda *_: self.fail('invalid CLI must not start collecting')
            try:
                for extra in (['--workers', '2'], ['--interval', '0.5'],
                              ['--interval', '44'], ['--max-requests', '61'],
                              ['--interval', 'NaN'], ['--jitter', 'Infinity']):
                    sys.argv = [str(SCRIPT), 'list', '--area-code', '110000000000', *extra]
                    with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as exit_:
                        fetcher['main']()
                    self.assertEqual(exit_.exception.code, 2)
            finally:
                globals_['ROOT'], globals_['collect_list'], sys.argv = old_root, old_collect_list, old_argv

    def test_budget_exhaustion_leaves_partial_manifest_without_false_page_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'area-110000000000'
            pages = folder / 'pages'
            pages.mkdir(parents=True)
            first = {'fetchedAtUtc': '2026-11-19T01:00:00+00:00',
                     'request': {'params': fetcher['page_params'](1, '110000000000')},
                     'httpStatus': 200,
                     'response': {'code': 0, 'data': {'current': 1, 'size': 10, 'total': 11,
                                                    'records': [{'axbe0001': f'id-{i:08d}'} for i in range(10)]}}}
            (pages / '00001.json').write_text(json.dumps(first), encoding='utf-8')
            args = SimpleNamespace(area_code='110000000000', timeout=1, attempts=1,
                                   max_pages=0, workers=1, check_sort=False)
            limiter = fetcher['RateLimiter'](0, max_requests=0)
            with redirect_stdout(io.StringIO()):
                fetcher['collect_list'](args, folder, limiter)
            manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['savedPages'], 1)
            self.assertEqual(manifest['failedPages'], {})
            self.assertTrue(manifest['requestBudgetReached'])
            self.assertFalse(manifest['complete'])

    def test_cli_defaults_to_bounded_list_and_detail_probes(self):
        globals_ = fetcher['main'].__globals__
        old_root = globals_['ROOT']
        old_list = globals_['collect_list']
        old_details = globals_['collect_details']
        old_argv = sys.argv
        observed = []
        with tempfile.TemporaryDirectory() as temporary:
            globals_['ROOT'] = Path(temporary)
            globals_['collect_list'] = lambda args, *_: observed.append(('list', args.max_pages, args.workers, args.interval, args.max_requests))
            globals_['collect_details'] = lambda args, *_: observed.append(('details', args.max_details, args.workers, args.interval, args.max_requests))
            try:
                for mode in ('list', 'details'):
                    sys.argv = [str(SCRIPT), mode, '--area-code', '440113000000']
                    fetcher['main']()
                self.assertEqual(observed, [('list', 3, 1, 45.0, 60), ('details', 2, 1, 45.0, 60)])
            finally:
                globals_['ROOT'] = old_root
                globals_['collect_list'] = old_list
                globals_['collect_details'] = old_details
                sys.argv = old_argv

    def test_full_row_count_does_not_hide_malformed_page_lengths(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            pages = folder / 'pages'
            pages.mkdir()
            for page, start, count in [(1, 0, 9), (2, 9, 6)]:
                wrapper = {
                    'request': {'params': fetcher['page_params'](page, '440000000000')},
                    'httpStatus': 200,
                    'response': {'code': 0, 'data': {'current': page, 'size': 10, 'total': 15,
                                          'records': [{'axbe0001': f'id-{at}'} for at in range(start, start + count)]}},
                }
                (pages / f'{page:05d}.json').write_text(json.dumps(wrapper), encoding='utf-8')
            audit = fetcher['audit_pages'](folder, '440000000000', 15, 10, 2, {})
            self.assertEqual(audit['recordRows'], 15)
            self.assertEqual(audit['invalidPageLengths'], [1, 2])
            self.assertFalse(audit['complete'])

    def test_list_probe_rejects_successful_but_empty_first_page(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            pages = folder / 'pages'
            pages.mkdir()
            first = {
                'fetchedAtUtc': '2026-11-19T01:00:00+00:00',
                'request': {'params': fetcher['page_params'](1, '110000000000', True)},
                'httpStatus': 200,
                'response': {'code': 0, 'data': {
                    'current': 1, 'size': 10, 'total': 10, 'records': [],
                }},
            }
            (pages / '00001.json').write_text(json.dumps(first), encoding='utf-8')
            args = SimpleNamespace(area_code='110000000000', timeout=1, attempts=1,
                                   max_pages=1, workers=1, check_sort=True)
            with redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(fetcher['FetchError'], 'invalid page length'):
                    fetcher['collect_list'](args, folder, fetcher['RateLimiter'](0))
            manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['invalidPageLengths'], [1])

    def test_single_offset_pass_is_reconciled_but_not_a_verified_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            pages = folder / 'pages'
            pages.mkdir()
            for page, identifiers in [(1, range(10)), (2, range(10, 11))]:
                wrapper = {
                    'request': {'params': fetcher['page_params'](page, '440113000000', True)},
                    'httpStatus': 200,
                    'response': {'code': 0, 'data': {'current': page, 'size': 10, 'total': 11,
                                          'records': [{'axbe0001': f'id-{identifier}'}
                                                      for identifier in identifiers]}},
                }
                (pages / f'{page:05d}.json').write_text(json.dumps(wrapper), encoding='utf-8')
            audit = fetcher['audit_pages'](folder, '440113000000', 11, 10, 2, {}, True)
            self.assertTrue(audit['pageAuditReconciled'])
            self.assertFalse(audit['complete'])

    def test_independent_passes_report_id_drift_without_claiming_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            folders = [Path(temporary) / name for name in ('first', 'second')]
            for index, folder in enumerate(folders):
                pages = folder / 'pages'
                pages.mkdir(parents=True)
                (folder / 'manifest.json').write_text(
                    json.dumps({'total': 11, 'serverPageSize': 10, 'expectedPages': 2,
                                'firstFetchedAtUtc': f'2026-11-18T17:{index:02d}:00+00:00'}),
                    encoding='utf-8',
                )
                for page, identifiers in [(1, range(10)), (2, range(10, 11))]:
                    wrapper = {
                        'request': {'params': fetcher['page_params'](page, '440113000000', True)},
                        'httpStatus': 200,
                        'response': {'code': 0, 'data': {'current': page, 'size': 10, 'total': 11,
                                              'records': [{'axbe0001': f'id-{identifier}'}
                                                          for identifier in identifiers]}},
                    }
                    (pages / f'{page:05d}.json').write_text(json.dumps(wrapper), encoding='utf-8')
            compare = fetcher['compare_saved_passes']
            stable = compare(*folders, '440113000000', True)
            self.assertTrue(stable['matchingCachedPageIds'])
            self.assertEqual(stable['uniqueIdIntersection'], 11)
            self.assertFalse(stable['snapshotVerified'])
            second_manifest = folders[1] / 'manifest.json'
            copied = json.loads(second_manifest.read_text(encoding='utf-8'))
            copied['firstFetchedAtUtc'] = '2026-11-18T17:00:00+00:00'
            second_manifest.write_text(json.dumps(copied), encoding='utf-8')
            copied_cache = compare(*folders, '440113000000', True)
            self.assertTrue(copied_cache['matchingCachedPageIds'])
            self.assertFalse(copied_cache['snapshotVerified'])
            copied['firstFetchedAtUtc'] = '2026-11-18T17:01:00+00:00'
            second_manifest.write_text(json.dumps(copied), encoding='utf-8')
            last = folders[1] / 'pages' / '00002.json'
            changed = json.loads(last.read_text(encoding='utf-8'))
            changed['response']['data']['records'][0]['axbe0001'] = 'id-new'
            last.write_text(json.dumps(changed), encoding='utf-8')
            drift = compare(*folders, '440113000000', True)
            self.assertFalse(drift['matchingCachedPageIds'])
            self.assertEqual(drift['uniqueIdIntersection'], 10)
            self.assertFalse(drift['snapshotVerified'])

    def test_compare_command_stays_offline_even_during_rate_limit_cooldown(self):
        globals_ = fetcher['main'].__globals__
        old_root = globals_['ROOT']
        old_compare = globals_.get('compare_saved_passes')
        old_argv = sys.argv
        seen = []
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            (root / 'rate-limit.json').write_text(json.dumps({'cooldownUntilUtc': until}), encoding='utf-8')
            repeat = root / 'repeat'
            globals_['ROOT'] = root
            globals_['compare_saved_passes'] = lambda *args: seen.append(args) or {'snapshotVerified': False}
            sys.argv = [str(SCRIPT), 'compare', '--area-code', '440113000000',
                        '--check-sort', '--compare-folder', str(repeat)]
            try:
                with redirect_stdout(io.StringIO()) as output:
                    fetcher['main']()
                self.assertEqual(seen, [(root / 'area-440113000000-check-sort-1', repeat,
                                         '440113000000', True)])
                self.assertFalse(json.loads(output.getvalue())['snapshotVerified'])
            finally:
                globals_['ROOT'] = old_root
                globals_['compare_saved_passes'] = old_compare
                sys.argv = old_argv

    def test_only_one_collector_process_can_hold_site_lock(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with fetcher['exclusive_run_lock'](root):
                with self.assertRaisesRegex(fetcher['FetchError'], 'already running'):
                    with fetcher['exclusive_run_lock'](root):
                        self.fail('a second collection run must not start')
                code = (
                    "import runpy, sys\n"
                    "from pathlib import Path\n"
                    "f = runpy.run_path(sys.argv[1])\n"
                    "try:\n"
                    "    with f['exclusive_run_lock'](Path(sys.argv[2])):\n"
                    "        sys.exit(1)\n"
                    "except f['FetchError']:\n"
                    "    sys.exit(0)\n"
                )
                child = subprocess.run([sys.executable, '-c', code, str(SCRIPT), str(root)],
                                       capture_output=True, text=True, timeout=10)
                self.assertEqual(child.returncode, 0, child.stderr)

if __name__ == '__main__':
    unittest.main()
