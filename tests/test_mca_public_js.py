"""Offline tests for the one-asset official MCA JavaScript capture."""

import hashlib
import json
import runpy
import sys
import tempfile
import threading
import unittest
from contextlib import contextmanager, redirect_stdout
from datetime import datetime, timedelta, timezone
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'fetch-mca-public-js.py'
EXPECTED_URL = 'https://yanglao.mca.gov.cn/js/chunk-3d5896b7.22ca4f71.js'


def collector():
    assert SCRIPT.is_file(), 'MCA public JavaScript capture script is missing'
    return runpy.run_path(str(SCRIPT))


class Response:
    status = 200
    headers = {'Date': 'Wed, 18 Nov 2026 20:00:00 GMT',
               'Content-Type': 'application/javascript'}

    def __init__(self, raw):
        self.raw = raw

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, size=-1):
        return self.raw[:size] if size >= 0 else self.raw

    def geturl(self):
        return EXPECTED_URL


class PublicJsTests(unittest.TestCase):
    def test_fixed_get_preserves_exact_bytes_timing_and_hash_in_private_capture(self):
        m = collector()
        self.assertEqual(m['ASSET_URL'], EXPECTED_URL)
        self.assertEqual(m['SITE_ROOT'], m['CORE']['ROOT'])
        self.assertEqual(m['CAPTURE_DIR'].parent, m['SITE_ROOT'])
        raw = b'/* official asset */\nconst byte = \xff;\n'
        seen = []

        def opener(request, timeout):
            seen.append((request, timeout))
            return Response(raw)

        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'private'
            limiter = m['RateLimiter'](0, 0, 1)
            result = m['capture_asset'](output, limiter, timeout=2, opener=opener)
            self.assertEqual(len(seen), 1)
            self.assertEqual(seen[0][0].full_url, EXPECTED_URL)
            self.assertEqual(seen[0][0].get_method(), 'GET')
            self.assertEqual(seen[0][1], 2)
            self.assertEqual(limiter.requests_started, 1)
            self.assertEqual((output / Path(EXPECTED_URL).name).read_bytes(), raw)
            saved = json.loads((output / (Path(EXPECTED_URL).name + '.json')).read_text(encoding='utf-8'))
            self.assertEqual(result, saved)
            self.assertEqual(saved['sourceUrl'], EXPECTED_URL)
            self.assertEqual(saved['method'], 'GET')
            self.assertEqual(saved['httpStatus'], 200)
            self.assertEqual(saved['responseSha256'], hashlib.sha256(raw).hexdigest())
            self.assertEqual(saved['responseBytes'], len(raw))
            self.assertGreaterEqual(saved['responseTimeMs'], 0)
            self.assertTrue(datetime.fromisoformat(saved['requestedAtUtc']).tzinfo)
            self.assertTrue(datetime.fromisoformat(saved['fetchedAtUtc']).tzinfo)
            self.assertEqual(saved['responseDate'], Response.headers['Date'])
            self.assertEqual(m['capture_asset'](output, limiter, timeout=2, opener=opener), saved)
            self.assertEqual(len(seen), 1, 'verified cache must not request again')

    def test_partial_capture_fails_closed_without_request(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            (output / Path(EXPECTED_URL).name).write_bytes(b'partial')
            calls = []
            with self.assertRaisesRegex(m['FetchError'], 'partial|invalid|mismatch'):
                m['capture_asset'](output, m['RateLimiter'](0, 0, 1), timeout=1,
                                   opener=lambda *_: calls.append(1))
            self.assertEqual(calls, [])

    def test_http_429_trips_circuit_and_never_retries(self):
        m = collector()
        calls = []

        def denied(request, timeout):
            calls.append(request.full_url)
            raise HTTPError(request.full_url, 429, 'Too Many Requests',
                            {'Retry-After': '7200'}, None)

        with tempfile.TemporaryDirectory() as temp:
            limiter = m['RateLimiter'](0, 0, 2)
            with self.assertRaisesRegex(m['FetchError'], '429'):
                m['capture_asset'](Path(temp), limiter, timeout=1, opener=denied)
            self.assertTrue(limiter.blocked.is_set())
            self.assertEqual(calls, [EXPECTED_URL])
            with self.assertRaisesRegex(m['FetchError'], 'circuit open'):
                m['capture_asset'](Path(temp), limiter, timeout=1, opener=denied)
            self.assertEqual(calls, [EXPECTED_URL])
            self.assertFalse((Path(temp) / Path(EXPECTED_URL).name).exists())

    def test_known_and_persisted_cooldowns_block_main_before_fetch(self):
        m = collector()
        with self.assertRaisesRegex(m['FetchError'], 'cooldown'):
            m['check_start_time'](datetime(2026, 11, 18, 19, 45, 16, tzinfo=timezone.utc))
        m['check_start_time'](datetime(2026, 11, 18, 19, 45, 17, tzinfo=timezone.utc))
        with tempfile.TemporaryDirectory() as temp:
            site_root = Path(temp)
            until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            (site_root / 'rate-limit.json').write_text(
                json.dumps({'cooldownUntilUtc': until}), encoding='utf-8')
            with patch.dict(m['main'].__globals__, {
                'SITE_ROOT': site_root, 'CAPTURE_DIR': site_root / 'static-js',
                'check_start_time': lambda *_: None,
                'capture_asset': lambda *_a, **_kw: self.fail('cooldown must block fetch'),
            }), patch.object(sys, 'argv', [str(SCRIPT)]):
                with self.assertRaisesRegex(m['FetchError'], 'cooldown'):
                    m['main']()

    def test_main_reuses_shared_lock_budget_and_minimum_sixty_second_pacing(self):
        m = collector()
        seen = []

        @contextmanager
        def locked(root):
            seen.append(('lock', root))
            yield

        def cooldown(root):
            seen.append(('cooldown', root))

        def limiter(interval, jitter, max_requests, hourly_state_path):
            seen.append(('limiter', interval, jitter, max_requests, hourly_state_path))
            return SimpleNamespace(blocked=threading.Event())

        def capture(output, _limiter, timeout):
            seen.append(('capture', output, timeout))
            return {'responseSha256': 'a' * 64}

        with tempfile.TemporaryDirectory() as temp:
            site_root = Path(temp)
            with patch.dict(m['main'].__globals__, {
                'SITE_ROOT': site_root, 'CAPTURE_DIR': site_root / 'static-js',
                'check_start_time': lambda *_: None, 'RateLimiter': limiter,
                'capture_asset': capture,
            }), patch.dict(m['CORE'], {
                'exclusive_run_lock': locked, 'enforce_site_cooldown': cooldown,
            }), patch.object(sys, 'argv', [str(SCRIPT)]), redirect_stdout(StringIO()):
                m['main']()
            self.assertEqual(seen, [
                ('lock', site_root), ('cooldown', site_root),
                ('limiter', 60, 5, 1, site_root / 'hourly-request-budget.json'),
                ('capture', site_root / 'static-js', 30),
            ])

    def test_hourly_site_budget_exhaustion_sends_no_request(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            budget_path = root / 'hourly-request-budget.json'
            started = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
            m['CORE']['save_json'](budget_path, {
                'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
                'requestStartedAtUtc': [started] * 60,
            })
            limiter = m['RateLimiter'](0, 0, 1, hourly_state_path=budget_path)
            calls = []
            with self.assertRaises(m['CORE']['BudgetExhausted']):
                m['capture_asset'](root / 'static-js', limiter, timeout=1,
                                   opener=lambda *_: calls.append(1))
            self.assertEqual(calls, [])
            self.assertFalse((root / 'static-js').exists())

    def test_main_persists_site_wide_cooldown_after_429(self):
        m = collector()
        with tempfile.TemporaryDirectory() as temp:
            site_root = Path(temp)

            def limiter(_interval, _jitter, max_requests, hourly_state_path):
                return m['RateLimiter'](0, 0, max_requests,
                                        hourly_state_path=hourly_state_path)

            def denied(_output, rate_limiter, _timeout):
                rate_limiter.wait()
                rate_limiter.trip('HTTP 429 during static JS capture', '7200')
                raise m['FetchError']('static JS: HTTP 429; stopped')

            with patch.dict(m['main'].__globals__, {
                'SITE_ROOT': site_root, 'CAPTURE_DIR': site_root / 'static-js',
                'check_start_time': lambda *_: None,
                'RateLimiter': limiter, 'capture_asset': denied,
            }), patch.object(sys, 'argv', [str(SCRIPT)]):
                with self.assertRaisesRegex(m['FetchError'], '429'):
                    m['main']()
            cooldown = json.loads((site_root / 'rate-limit.json').read_text(encoding='utf-8'))
            self.assertIn('429', cooldown['reason'])
            self.assertGreater(datetime.fromisoformat(cooldown['cooldownUntilUtc']),
                               datetime.now(timezone.utc) + timedelta(hours=1))


if __name__ == '__main__':
    unittest.main()
