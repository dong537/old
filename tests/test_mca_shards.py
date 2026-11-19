"""Offline checks for the bounded MCA province-shard runner."""

import json
import io
import runpy
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from types import SimpleNamespace


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'collect-mca-shards.py'


class McaShardRunnerTests(unittest.TestCase):
    def setUp(self):
        self.runner = runpy.run_path(str(SCRIPT))

    def test_load_shards_rejects_duplicate_codes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'seeds.json'
            path.write_text(json.dumps({'seedCount': 2, 'seeds': [
                {'sbcode': '110000000000', 'sourceNodeId': 'a', 'name': '北京'},
                {'sbcode': '110000000000', 'sourceNodeId': 'b', 'name': '重复'},
            ]}), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'duplicate'):
                self.runner['load_shards'](path)

    def test_batch_uses_one_limiter_and_stops_when_budget_reached(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            codes = ['110000000000', '120000000000', '130000000000']
            seeds = root / 'seeds.json'
            seeds.write_text(json.dumps({'seedCount': 3, 'seeds': [
                {'sbcode': code, 'sourceNodeId': str(index), 'name': str(index)}
                for index, code in enumerate(codes)
            ]}), encoding='utf-8')
            calls = []
            limiter = SimpleNamespace(exhausted=SimpleNamespace(is_set=lambda: len(calls) >= 2),
                                      blocked=SimpleNamespace(is_set=lambda: False),
                                      requests_started=2, max_requests=2,
                                      block_reason=None, cooldown_until_utc=None)
            fake = {'ROOT': root, 'enforce_site_cooldown': lambda *_: None,
                    'exclusive_run_lock': lambda *_: __import__('contextlib').nullcontext(),
                    'RateLimiter': lambda *args: limiter,
                    'collect_list': lambda args, folder, shared: calls.append((args.area_code, folder, shared))}
            globals_ = self.runner['run_batch'].__globals__
            old = globals_['FETCHER']
            globals_['FETCHER'] = fake
            try:
                result = self.runner['run_batch'](seeds, 'round-a', 1, 3, 45, 0, 1, 2)
            finally:
                globals_['FETCHER'] = old
            self.assertEqual([call[0] for call in calls], codes[:2])
            self.assertIs(calls[0][2], calls[1][2])
            self.assertEqual(calls[0][1], root / 'area-110000000000-check-sort-1-capture-round-a')
            self.assertEqual(result['areasVisited'], 2)
            self.assertTrue(result['requestBudgetReached'])
            self.assertFalse(result['success'])
            self.assertIn('budget', result['error'])

    def test_cli_exits_nonzero_when_batch_is_incomplete(self):
        globals_ = self.runner['main'].__globals__
        old_run_batch, old_argv = globals_['run_batch'], sys.argv
        globals_['run_batch'] = lambda *_: {'success': False}
        sys.argv = [str(SCRIPT), '--capture-id', 'round-a']
        try:
            with self.assertRaises(SystemExit) as exit_:
                self.runner['main']()
            self.assertEqual(exit_.exception.code, 1)
        finally:
            globals_['run_batch'], sys.argv = old_run_batch, old_argv

    def test_cli_rejects_fast_interval_and_excessive_request_ceiling(self):
        globals_ = self.runner['main'].__globals__
        old_run_batch, old_argv = globals_['run_batch'], sys.argv
        globals_['run_batch'] = lambda *_: self.fail('unsafe settings must stop before collecting')
        try:
            for extra in (['--interval', '10'], ['--max-requests', '100']):
                sys.argv = [str(SCRIPT), '--capture-id', 'round-a', *extra]
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as exit_:
                    self.runner['main']()
                self.assertEqual(exit_.exception.code, 2)
        finally:
            globals_['run_batch'], sys.argv = old_run_batch, old_argv

    def test_direct_batch_call_rejects_unsafe_rate_arguments(self):
        for interval, budget in ((10, 20), (45, 100), (float('nan'), 20)):
            with self.assertRaisesRegex(ValueError, 'interval|budget'):
                self.runner['run_batch'](Path('unused.json'), 'round-a', 1, 1,
                                         interval, 0, 1, budget)

    def test_batch_records_corrupt_cache_error_before_reraising(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seeds = root / 'seeds.json'
            seeds.write_text(json.dumps({'seedCount': 1, 'seeds': [
                {'sbcode': '110000000000', 'sourceNodeId': 'node', 'name': '北京'}
            ]}), encoding='utf-8')
            limiter = SimpleNamespace(exhausted=SimpleNamespace(is_set=lambda: False),
                                      blocked=SimpleNamespace(is_set=lambda: False),
                                      requests_started=0, max_requests=2,
                                      block_reason=None, cooldown_until_utc=None)
            def corrupt(*_):
                raise json.JSONDecodeError('corrupt page', '{', 0)
            fake = {'ROOT': root, 'enforce_site_cooldown': lambda *_: None,
                    'exclusive_run_lock': lambda *_: __import__('contextlib').nullcontext(),
                    'RateLimiter': lambda *args: limiter,
                    'BudgetExhausted': RuntimeError, 'FetchError': RuntimeError,
                    'collect_list': corrupt}
            globals_ = self.runner['run_batch'].__globals__
            old = globals_['FETCHER']
            globals_['FETCHER'] = fake
            try:
                with self.assertRaises(json.JSONDecodeError):
                    self.runner['run_batch'](seeds, 'round-a', 1, 1, 45, 0, 1, 2)
                summary = json.loads(next((root / 'batch-runs').glob('*.json')).read_text(encoding='utf-8'))
                self.assertIn('JSONDecodeError', summary['error'])
                self.assertEqual(summary['areasVisited'], 0)
            finally:
                globals_['FETCHER'] = old


if __name__ == '__main__':
    unittest.main()
