"""Offline checks for the one-shot MCA area-tree follow-up."""

import json
import runpy
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-tree-after-roots.py'


class TreeAfterRootsTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))

    def write_root_success(self, root):
        runs = root / 'batch-runs'
        runs.mkdir(parents=True)
        (runs / 'roots-20261119-a.status.json').write_text(json.dumps({
            'captureId': 'roots-20261119-a', 'exitCode': 0,
            'batchExitCode': 0, 'auditExitCode': 0, 'error': None,
            'startedAtUtc': '2026-11-18T20:10:00+00:00',
            'endedAtUtc': '2026-11-18T20:45:00+00:00',
        }), encoding='utf-8')
        (runs / 'roots-20261119-a-20261118T200000Z.json').write_text(json.dumps({
            'captureId': 'roots-20261119-a', 'success': True,
            'areasPlanned': 32, 'areasVisited': 32, 'rateLimited': False,
            'startedAtUtc': '2026-11-18T20:10:01+00:00',
            'endedAtUtc': '2026-11-18T20:44:00+00:00',
        }), encoding='utf-8')

    def test_preflight_selects_successful_resumption_not_earlier_failed_attempt(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.write_root_success(root)
            (root / 'batch-runs' / 'roots-20261119-a-20261118T200002Z.json').write_text(
                json.dumps({
                    'captureId': 'roots-20261119-a', 'success': False,
                    'areasPlanned': 32, 'areasVisited': 3, 'rateLimited': False,
                    'startedAtUtc': '2026-11-18T20:00:02+00:00',
                    'endedAtUtc': '2026-11-18T20:05:42+00:00',
                }), encoding='utf-8')
            self.module['check_preconditions'](
                root, datetime(2026, 11, 18, 21, tzinfo=timezone.utc))

    def test_command_has_one_bounded_serial_tree_pass(self):
        command = self.module['build_command'](Path(sys.executable))
        self.assertEqual(command[0], sys.executable)
        self.assertEqual(Path(command[1]).name, 'fetch-mca-area-tree.py')
        self.assertEqual(command[command.index('--max-level') + 1], '3')
        self.assertEqual(command[command.index('--max-requests') + 1], '20')
        self.assertEqual(command[command.index('--interval') + 1], '60')
        self.assertEqual(command[command.index('--jitter') + 1], '10')

    def test_preflight_requires_five_am_and_completed_root_probe(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            before = datetime(2026, 11, 18, 20, 59, 59, tzinfo=timezone.utc)
            after = datetime(2026, 11, 18, 21, 0, 0, tzinfo=timezone.utc)
            with self.assertRaisesRegex(RuntimeError, '05:00'):
                self.module['check_preconditions'](root, before)
            with self.assertRaisesRegex(RuntimeError, 'root probe status'):
                self.module['check_preconditions'](root, after)
            self.write_root_success(root)
            self.module['check_preconditions'](root, after)
            status_file = root / 'batch-runs' / 'roots-20261119-a.status.json'
            status = json.loads(status_file.read_text(encoding='utf-8'))
            status['batchExitCode'] = 1
            status_file.write_text(json.dumps(status), encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, 'root probe failed'):
                self.module['check_preconditions'](root, after)

    def test_preflight_rejects_incomplete_root_summary(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.write_root_success(root)
            summary_path = next((root / 'batch-runs').glob('roots-20261119-a-*.json'))
            summary = json.loads(summary_path.read_text(encoding='utf-8'))
            summary['areasVisited'] = 31
            summary_path.write_text(json.dumps(summary), encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, '32 areas'):
                self.module['check_preconditions'](
                    root, datetime(2026, 11, 18, 21, tzinfo=timezone.utc))

    def test_preflight_rejects_active_site_wide_cooldown(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.write_root_success(root)
            (root / 'rate-limit.json').write_text(json.dumps({
                'cooldownUntilUtc': '2026-11-18T21:00:01+00:00',
            }), encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, 'cooldown active'):
                self.module['check_preconditions'](
                    root, datetime(2026, 11, 18, 21, tzinfo=timezone.utc))

    def test_partial_tree_is_reported_nonzero_without_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.write_root_success(root)
            calls = []
            def fake_run(command, **_kwargs):
                calls.append(command)
                output = root / 'area-tree-20261119'
                output.mkdir()
                (output / 'manifest.json').write_text(json.dumps({
                    'treeWalkComplete': False, 'rateLimited': False,
                    'requestBudgetReached': True, 'requestsThisRun': 20,
                    'savedResponses': 21, 'lastError': None,
                    'auditedAtUtc': datetime.now(timezone.utc).isoformat(),
                }), encoding='utf-8')
                return SimpleNamespace(returncode=0)
            globals_ = self.module['main'].__globals__
            with patch.dict(globals_, {'PRIVATE_ROOT': root, 'PROJECT': root}), \
                    patch('subprocess.run', side_effect=fake_run):
                self.assertEqual(self.module['main'](datetime(2026, 11, 18, 21, tzinfo=timezone.utc)), 1)
            self.assertEqual(len(calls), 1)
            status = json.loads((root / 'batch-runs' / 'tree-20261119-a.status.json').read_text(encoding='utf-8'))
            self.assertEqual(status['collectorExitCode'], 0)
            self.assertEqual(status['exitCode'], 1)
            self.assertFalse(status['treeWalkComplete'])
            self.assertTrue(status['requestBudgetReached'])

    def test_failed_root_probe_sends_no_tree_request_and_records_skip(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            runs = root / 'batch-runs'
            runs.mkdir()
            (runs / 'roots-20261119-a.status.json').write_text(
                json.dumps({'captureId': 'roots-20261119-a', 'exitCode': 1,
                            'batchExitCode': 1, 'auditExitCode': 0, 'error': None}),
                encoding='utf-8')
            globals_ = self.module['main'].__globals__
            with patch.dict(globals_, {'PRIVATE_ROOT': root, 'PROJECT': root}), \
                    patch('subprocess.run', side_effect=AssertionError('no collector call')):
                self.assertEqual(self.module['main'](datetime(2026, 11, 18, 21, tzinfo=timezone.utc)), 1)
            status = json.loads((runs / 'tree-20261119-a.status.json').read_text(encoding='utf-8'))
            self.assertIn('root probe failed', status['error'])
            self.assertIsNone(status['collectorExitCode'])

    def test_stale_tree_manifest_cannot_be_reported_as_new_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.write_root_success(root)
            output = root / 'area-tree-20261119'
            output.mkdir()
            (output / 'manifest.json').write_text(json.dumps({
                'treeWalkComplete': True, 'rateLimited': False,
                'requestBudgetReached': False, 'requestsThisRun': 1,
                'savedResponses': 999, 'lastError': None,
                'auditedAtUtc': '2020-01-01T00:00:00+00:00',
            }), encoding='utf-8')
            globals_ = self.module['main'].__globals__
            with patch.dict(globals_, {'PRIVATE_ROOT': root, 'PROJECT': root}), \
                    patch('subprocess.run', return_value=SimpleNamespace(returncode=0)):
                self.assertEqual(self.module['main'](datetime(2026, 11, 18, 21, tzinfo=timezone.utc)), 1)
            status = json.loads((root / 'batch-runs' / 'tree-20261119-a.status.json').read_text(encoding='utf-8'))
            self.assertIn('stale', status['error'])


if __name__ == '__main__':
    unittest.main()
