"""Offline checks for the bounded serial MCA tree controller."""

import json
import runpy
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-tree-auto-resume.py'
NOW = datetime(2026, 11, 18, 23, tzinfo=timezone.utc)
PREFIX = 'tree-20261119-auto'


class TreeAutoResumeTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'batch-runs').mkdir()
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')

    def status(self, sequence, *, prior='tree-20261119-a', complete=False,
               error=None):
        run_id = f'{PREFIX}-{sequence:03d}'
        value = {
            'runId': run_id, 'priorRunId': prior, 'phase': 'finished',
            'endedAtUtc': NOW.isoformat(),
            'exitCode': 0 if complete else 1, 'collectorExitCode': 0,
            'treeWalkComplete': complete, 'requestBudgetReached': not complete,
            'rateLimited': False, 'lastError': None,
            'collectorManifestSha256': 'a' * 64,
            'error': error if error is not None else (
                None if complete else 'area tree walk incomplete; see private manifest'),
        }
        (self.root / 'batch-runs' / f'{run_id}.status.json').write_text(
            json.dumps(value), encoding='utf-8')
        return value

    def test_reads_shared_hourly_budget_and_waits_for_real_slot(self):
        starts = [(NOW - timedelta(seconds=10)).isoformat()] * 60
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': starts,
        }), encoding='utf-8')
        next_slot = self.module['next_available_utc'](self.root, NOW)
        self.assertGreaterEqual(next_slot, NOW + timedelta(seconds=3590))
        self.assertLess(next_slot, NOW + timedelta(seconds=3600))
        starts[0] = '2030-01-01T00:00:00+00:00'
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': starts,
        }), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'hourly budget'):
            self.module['next_available_utc'](self.root, NOW)

    def test_missing_ledger_refuses_unattended_resume(self):
        (self.root / 'hourly-request-budget.json').unlink()
        with self.assertRaisesRegex(RuntimeError, 'ledger missing'):
            self.module['next_available_utc'](self.root, NOW)

    def test_restarts_from_latest_sequential_clean_batch(self):
        first = self.status(1)
        self.status(2, prior=first['runId'])
        self.assertEqual(self.module['resume_state'](
            self.root, 'tree-20261119-a', PREFIX, 32),
            (f'{PREFIX}-002', 3, False))
        third = self.status(3, prior=f'{PREFIX}-002', complete=True)
        self.assertEqual(self.module['resume_state'](
            self.root, 'tree-20261119-a', PREFIX, 32),
            (third['runId'], 4, True))

    def test_rejects_gap_or_failed_batch(self):
        self.status(2)
        with self.assertRaisesRegex(RuntimeError, 'sequence'):
            self.module['resume_state'](self.root, 'tree-20261119-a', PREFIX, 32)
        (self.root / 'batch-runs' / f'{PREFIX}-002.status.json').unlink()
        failed = self.status(1, error='area tree rate limited; no retry')
        with self.assertRaisesRegex(RuntimeError, 'not a clean budget'):
            self.module['resume_state'](self.root, 'tree-20261119-a', PREFIX, 32)
        failed['phase'] = 'running'
        (self.root / 'batch-runs' / f'{PREFIX}-001.status.json').write_text(
            json.dumps(failed), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unfinished'):
            self.module['resume_state'](self.root, 'tree-20261119-a', PREFIX, 32)

    def test_rejects_auto_batch_without_owned_manifest_hash(self):
        status = self.status(1)
        status.pop('collectorManifestSha256')
        path = self.root / 'batch-runs' / f'{PREFIX}-001.status.json'
        path.write_text(json.dumps(status), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'legacy attestation'):
            self.module['resume_state'](
                self.root, 'tree-20261119-a', PREFIX, 32)

    def test_runs_one_child_then_stops_on_completed_tree(self):
        calls = []
        def fake_run(command, **kwargs):
            self.assertNotIn('timeout', kwargs)
            calls.append(command)
            self.status(1, complete=True)
            return SimpleNamespace(returncode=0)
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PRIVATE_ROOT': self.root, 'PROJECT': self.root,
            'preflight': lambda *_args: None,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--previous-run-id', 'tree-20261119-a',
                '--batch-prefix', PREFIX, '--max-batches', '2'])
        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 1)
        self.assertIn('--previous-run-id', calls[0])
        self.assertIn(f'{PREFIX}-001', calls[0])

    def test_stop_file_prevents_any_child_process(self):
        (self.root / 'batch-runs' / f'{PREFIX}.stop').touch()
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PRIVATE_ROOT': self.root, 'PROJECT': self.root,
            'preflight': lambda *_args: None,
        }), patch('subprocess.run', side_effect=AssertionError('no child')):
            result = self.module['main']([
                '--previous-run-id', 'tree-20261119-a',
                '--batch-prefix', PREFIX, '--max-batches', '2'])
        self.assertEqual(result, 3)

    def test_rate_limited_child_stops_without_another_batch(self):
        calls = []
        def fake_run(command, **_kwargs):
            calls.append(command)
            status = self.status(1, error='area tree rate limited; no retry')
            status['rateLimited'] = True
            (self.root / 'batch-runs' / f'{PREFIX}-001.status.json').write_text(
                json.dumps(status), encoding='utf-8')
            return SimpleNamespace(returncode=1)
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PRIVATE_ROOT': self.root, 'PROJECT': self.root,
            'preflight': lambda *_args: None,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--previous-run-id', 'tree-20261119-a',
                '--batch-prefix', PREFIX, '--max-batches', '2'])
        self.assertEqual(result, 2)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
