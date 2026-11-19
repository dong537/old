"""Offline behavior tests for the fixed observed-detail batch controller."""

import json
import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-observed-details-auto.py'
PREFIX = 'detail-20261119-auto'
SHA = 'a' * 64


class ObservedDetailsAutoTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / 'national-observed-details-20261119'
        (self.output / 'batch-runs').mkdir(parents=True)

    def status(self, number, completed, *, total=2, exit_code=1, error=None,
               limited=False, source_sha=SHA):
        run_id = f'{PREFIX}-{number:04d}'
        value = {
            'schemaVersion': 1, 'runId': run_id, 'phase': 'finished',
            'endedAtUtc': '2026-11-19T00:00:00+00:00',
            'sourceInventorySha256': source_sha, 'uniqueIdCount': total,
            'completedDetailCount': completed,
            'detailsCompleteForObservedIds': completed == total,
            'newlySavedDetails': 1, 'requestsThisRun': 2,
            'requestBudgetReached': False, 'rateLimited': limited,
            'nationalComplete': False, 'publishable': False,
            'exitCode': exit_code, 'error': error,
        }
        (self.output / 'batch-runs' / f'{run_id}.status.json').write_text(
            json.dumps(value), encoding='utf-8')
        return value

    def test_resume_only_consecutive_clean_chain_with_fixed_queue(self):
        self.status(1, 1)
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 10),
                         (2, False, SHA, 2, 1))
        self.status(2, 2, exit_code=0)
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 10),
                         (3, True, SHA, 2, 2))

    def test_resume_rejects_gap_failure_and_source_expansion(self):
        self.status(2, 1)
        with self.assertRaisesRegex(RuntimeError, 'gap'):
            self.module['resume_state'](self.output, PREFIX, 10)
        (self.output / 'batch-runs' / f'{PREFIX}-0002.status.json').unlink()
        self.status(1, 1, error='HTTP 429', exit_code=2, limited=True)
        with self.assertRaisesRegex(RuntimeError, 'failed'):
            self.module['resume_state'](self.output, PREFIX, 10)
        self.status(1, 1)
        self.status(2, 2, exit_code=0, source_sha='b' * 64)
        with self.assertRaisesRegex(RuntimeError, 'source'):
            self.module['resume_state'](self.output, PREFIX, 10)

    def test_resume_rejects_clean_looking_batch_without_progress_or_budget_pause(self):
        value = self.status(1, 0)
        value['newlySavedDetails'] = 0
        value['requestsThisRun'] = 0
        (self.output / 'batch-runs' / f'{PREFIX}-0001.status.json').write_text(
            json.dumps(value), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'failed'):
            self.module['resume_state'](self.output, PREFIX, 10)

    def test_serial_children_use_fixed_limits_and_stop_at_observed_completion(self):
        calls = []

        def preflight():
            statuses = list((self.output / 'batch-runs').glob('*.status.json'))
            return SHA, 2, len(statuses)

        def fake_run(command, **_kwargs):
            calls.append(command)
            number = len(calls)
            self.status(number, number, exit_code=0 if number == 2 else 1)
            return SimpleNamespace(returncode=0 if number == 2 else 1)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'preflight': preflight,
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3'])
        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 2)
        self.assertIn(f'{PREFIX}-0001', calls[0])
        self.assertIn(f'{PREFIX}-0002', calls[1])
        for command in calls:
            self.assertEqual(command[command.index('--max-ids') + 1], '12')
            self.assertEqual(command[command.index('--max-requests') + 1], '30')
            self.assertEqual(command[command.index('--interval') + 1], '60')
            self.assertEqual(command[command.index('--expected-source-sha256') + 1], SHA)

    def test_429_child_stops_without_next_batch(self):
        calls = []

        def fake_run(command, **_kwargs):
            calls.append(command)
            status = self.status(1, 0, exit_code=2, error='HTTP 429', limited=True)
            status['newlySavedDetails'] = 0
            (self.output / 'batch-runs' / f'{PREFIX}-0001.status.json').write_text(
                json.dumps(status), encoding='utf-8')
            return SimpleNamespace(returncode=2)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'preflight': lambda: (SHA, 2, 0),
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3'])
        self.assertEqual(result, 2)
        self.assertEqual(len(calls), 1)

    def test_twelve_ids_per_batch_fit_large_observed_queue(self):
        first = self.status(1, 12, total=24)
        first.update({'newlySavedDetails': 12, 'requestsThisRun': 24})
        (self.output / 'batch-runs' / f'{PREFIX}-0001.status.json').write_text(
            json.dumps(first), encoding='utf-8')
        second = self.status(2, 24, total=24, exit_code=0)
        second.update({'newlySavedDetails': 12, 'requestsThisRun': 24})
        (self.output / 'batch-runs' / f'{PREFIX}-0002.status.json').write_text(
            json.dumps(second), encoding='utf-8')
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 5000),
                         (3, True, SHA, 24, 24))

    def test_stop_file_prevents_child_launch(self):
        (self.output / 'batch-runs' / f'{PREFIX}.stop').touch()
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'preflight': lambda: (SHA, 2, 0),
        }), patch('subprocess.run', side_effect=AssertionError('no child')):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3'])
        self.assertEqual(result, 3)

    def test_stop_file_after_first_child_prevents_second_batch(self):
        calls = []

        def fake_run(command, **_kwargs):
            calls.append(command)
            self.status(1, 1)
            (self.output / 'batch-runs' / f'{PREFIX}.stop').touch()
            return SimpleNamespace(returncode=1)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'preflight': lambda: (SHA, 2, len(calls)),
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3'])
        self.assertEqual(result, 3)
        self.assertEqual(len(calls), 1)

    def test_preflight_checks_shared_ledger_and_site_cooldown(self):
        globals_ = self.module['preflight'].__globals__
        collector = dict(self.module['COLLECTOR'])
        collector.update({
            'SEED_PATH': self.root / 'seed.json',
            'TREE_DIR': self.root / 'tree',
            'FIRST_DIR': self.root / 'first',
            'FOLLOWUP_DIR': self.root / 'followup',
            'build_queue': lambda *_args, **_kwargs: {
                'sourceInventorySha256': SHA, 'uniqueIdCount': 2, 'items': []},
            'scan_detail_cache': lambda *_args: set(),
        })
        with patch.dict(globals_, {
            'PRIVATE_ROOT': self.root, 'OUTPUT_DIR': self.output,
            'COLLECTOR': collector,
        }):
            with self.assertRaisesRegex(ValueError, 'hourly request budget missing'):
                self.module['preflight']()
            (self.root / 'hourly-request-budget.json').write_text(json.dumps({
                'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
                'requestStartedAtUtc': [],
            }), encoding='utf-8')
            (self.root / 'rate-limit.json').write_text(json.dumps({
                'cooldownUntilUtc': '2099-01-01T00:00:00+00:00',
            }), encoding='utf-8')
            with self.assertRaisesRegex(RuntimeError, 'cooldown active'):
                self.module['preflight']()
            (self.root / 'rate-limit.json').unlink()
            self.assertEqual(self.module['preflight'](), (SHA, 2, 0))


if __name__ == '__main__':
    unittest.main()
