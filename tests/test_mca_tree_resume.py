"""Offline checks for a strictly gated area-tree resume pass."""

import json
import hashlib
import runpy
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-tree-resume.py'
START = '2026-11-18T22:00:00+00:00'
END = '2026-11-18T22:40:00+00:00'
AUDIT = '2026-11-18T22:39:59+00:00'
NOW = datetime(2026, 11, 18, 23, tzinfo=timezone.utc)


class TreeResumeTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'batch-runs').mkdir()
        (self.root / 'area-tree-20261119').mkdir()
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')
        self.status = {
            'schemaVersion': 1, 'runId': 'tree-20261119-a',
            'startedAtUtc': START, 'endedAtUtc': END,
            'collectorExitCode': 0, 'exitCode': 1,
            'treeWalkComplete': False, 'requestBudgetReached': True,
            'requestsThisRun': 20, 'savedResponses': 15,
            'rateLimited': False,
            'error': 'area tree walk incomplete; see private manifest',
        }
        self.manifest = {
            'schemaVersion': 1, 'treeWalkComplete': False,
            'requestBudgetReached': True, 'requestsThisRun': 20,
            'savedResponses': 15, 'pendingParentIds': ['p1', 'p2'],
            'rateLimited': False, 'lastError': None,
            'auditedAtUtc': AUDIT,
        }
        self.save()

    def save(self):
        (self.root / 'batch-runs' / 'tree-20261119-a.status.json').write_text(
            json.dumps(self.status), encoding='utf-8')
        (self.root / 'area-tree-20261119' / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')

    def save_owned_manifest(self, run_id):
        self.manifest['runId'] = run_id
        folder = self.root / 'area-tree-20261119' / 'run-manifests'
        folder.mkdir(exist_ok=True)
        (folder / f'{run_id}.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')
        (self.root / 'area-tree-20261119' / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')

    def preflight(self):
        return self.module['check_preconditions'](
            self.root, 'tree-20261119-a', 'tree-20261119-b', NOW)

    def test_accepts_only_completed_budget_interruption(self):
        manifest = self.preflight()
        self.assertEqual(manifest['savedResponses'], 15)
        command = self.module['build_command'](Path(sys.executable),
                                                'tree-20261119-b')
        self.assertEqual(Path(command[1]).name, 'fetch-mca-area-tree.py')
        self.assertEqual(command[command.index('--max-requests') + 1], '20')
        self.assertEqual(command[command.index('--interval') + 1], '60')
        self.assertEqual(command[command.index('--jitter') + 1], '10')
        self.assertEqual(command[command.index('--run-id') + 1], 'tree-20261119-b')

    def test_missing_ledger_rejects_resume_before_child(self):
        (self.root / 'hourly-request-budget.json').unlink()
        with self.assertRaisesRegex(RuntimeError, 'ledger missing'):
            self.preflight()

    def test_owned_previous_manifest_must_still_match_shared_manifest(self):
        self.manifest['runId'] = 'tree-20261119-a'
        self.save()
        raw = (self.root / 'area-tree-20261119' / 'manifest.json').read_bytes()
        owned = self.root / 'area-tree-20261119' / 'run-manifests'
        owned.mkdir()
        (owned / 'tree-20261119-a.json').write_bytes(raw)
        self.status['collectorManifestSha256'] = hashlib.sha256(raw).hexdigest()
        self.save()
        other = {**self.manifest, 'runId': 'tree-20261119-other'}
        (self.root / 'area-tree-20261119' / 'manifest.json').write_text(
            json.dumps(other), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'ownership'):
            self.preflight()

    def test_noninitial_previous_run_requires_owned_manifest(self):
        previous_id = 'tree-20261119-b'
        prior = {**self.status, 'runId': previous_id}
        (self.root / 'batch-runs' / f'{previous_id}.status.json').write_text(
            json.dumps(prior), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'ownership'):
            self.module['check_preconditions'](
                self.root, previous_id, 'tree-20261119-c', NOW)

    def test_current_run_reads_its_immutable_manifest_after_shared_race(self):
        run_id = 'tree-20261119-b'
        def fake_run(_command, **_kwargs):
            owned = {**self.manifest,
                     'runId': run_id,
                     'auditedAtUtc': datetime.now(timezone.utc).isoformat(),
                     'requestsThisRun': 20,
                     'savedResponses': 31,
                     'pendingParentIds': ['p3']}
            folder = self.root / 'area-tree-20261119' / 'run-manifests'
            folder.mkdir()
            (folder / f'{run_id}.json').write_text(json.dumps(owned), encoding='utf-8')
            other = {**owned, 'runId': 'tree-20261119-other',
                     'savedResponses': 999}
            (self.root / 'area-tree-20261119' / 'manifest.json').write_text(
                json.dumps(other), encoding='utf-8')
            return SimpleNamespace(returncode=0)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {'PRIVATE_ROOT': self.root, 'PROJECT': self.root}), \
                patch('subprocess.run', side_effect=fake_run):
            result = self.module['main'](
                ['--previous-run-id', 'tree-20261119-a',
                 '--run-id', run_id], now=NOW)
        final = json.loads((self.root / 'batch-runs' / f'{run_id}.status.json')
                           .read_text(encoding='utf-8'))
        self.assertEqual(result, 1)
        self.assertEqual(final['savedResponses'], 31)
        self.assertEqual(final['savedResponseDelta'], 16)
        self.assertRegex(final['collectorManifestSha256'], r'^[0-9a-f]{64}$')

    def test_rejects_rate_limit_or_error(self):
        for change, message in [
            ({'rateLimited': True}, 'budget interruption'),
            ({'collectorExitCode': 1}, 'budget interruption'),
            ({'requestBudgetReached': False}, 'budget interruption'),
        ]:
            with self.subTest(change=change):
                self.status.update(change)
                self.save()
                with self.assertRaisesRegex(RuntimeError, message):
                    self.preflight()
                self.status.update({'rateLimited': False, 'collectorExitCode': 0,
                                    'requestBudgetReached': True})
        self.manifest['lastError'] = 'FetchError: unexpected response'
        self.save()
        with self.assertRaisesRegex(RuntimeError, 'budget interruption'):
            self.preflight()

    def test_rejects_stale_or_mismatched_manifest(self):
        self.manifest['auditedAtUtc'] = '2026-11-18T22:50:00+00:00'
        self.save()
        with self.assertRaisesRegex(RuntimeError, 'outside previous run'):
            self.preflight()
        self.manifest['auditedAtUtc'] = AUDIT
        self.manifest['savedResponses'] = 16
        self.save()
        with self.assertRaisesRegex(RuntimeError, 'differs'):
            self.preflight()

    def test_rejects_active_or_unknown_runs_and_cooldown(self):
        runs = self.root / 'batch-runs'
        (runs / 'tree-20261119-x.status.json').write_text(
            json.dumps({'phase': 'running', 'startedAtUtc': START}), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unfinished run'):
            self.preflight()
        (runs / 'tree-20261119-x.status.json').write_text(
            json.dumps({'endedAtUtc': None}), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unfinished run'):
            self.preflight()
        (runs / 'tree-20261119-x.status.json').unlink()
        (self.root / 'rate-limit.json').write_text(json.dumps({
            'cooldownUntilUtc': '2026-11-19T00:00:00+00:00'}), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'cooldown'):
            self.preflight()
        (self.root / 'rate-limit.json').unlink()
        (runs / 'tree-20261119-b.status.json').write_text('{}', encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'already exists'):
            self.preflight()

    def test_one_pass_writes_separate_audited_status(self):
        def fake_run(_command, **_kwargs):
            self.manifest.update({
                'auditedAtUtc': datetime.now(timezone.utc).isoformat(),
                'requestsThisRun': 20, 'savedResponses': 31,
                'pendingParentIds': ['p3'],
            })
            self.save_owned_manifest('tree-20261119-b')
            return SimpleNamespace(returncode=0)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {'PRIVATE_ROOT': self.root, 'PROJECT': self.root}), \
                patch('subprocess.run', side_effect=fake_run):
            result = self.module['main'](
                ['--previous-run-id', 'tree-20261119-a',
                 '--run-id', 'tree-20261119-b'], now=NOW)
        self.assertEqual(result, 1)
        final = json.loads((self.root / 'batch-runs' / 'tree-20261119-b.status.json')
                           .read_text(encoding='utf-8'))
        self.assertEqual(final['priorRunId'], 'tree-20261119-a')
        self.assertEqual(final['savedResponseDelta'], 16)
        self.assertEqual(final['pendingBefore'], 2)
        self.assertEqual(final['pendingAfter'], 1)
        self.assertEqual(final['requestsThisRun'], 20)
        self.assertEqual(final['collectorExitCode'], 0)
        self.assertEqual(final['phase'], 'finished')
        self.assertTrue((self.root / 'batch-runs' / 'tree-20261119-b.log').exists())
        self.assertEqual(self.status['savedResponses'], 15)

    def test_completed_tree_returns_success_without_publishing(self):
        def fake_run(_command, **_kwargs):
            self.manifest.update({
                'auditedAtUtc': datetime.now(timezone.utc).isoformat(),
                'treeWalkComplete': True, 'requestBudgetReached': False,
                'requestsThisRun': 6, 'savedResponses': 20,
                'pendingParentIds': [],
            })
            self.save_owned_manifest('tree-20261119-b')
            return SimpleNamespace(returncode=0)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {'PRIVATE_ROOT': self.root, 'PROJECT': self.root}), \
                patch('subprocess.run', side_effect=fake_run):
            result = self.module['main'](
                ['--previous-run-id', 'tree-20261119-a',
                 '--run-id', 'tree-20261119-b'], now=NOW)
        self.assertEqual(result, 0)
        final = json.loads((self.root / 'batch-runs' / 'tree-20261119-b.status.json')
                           .read_text(encoding='utf-8'))
        self.assertTrue(final['treeWalkComplete'])
        self.assertEqual(final['pendingAfter'], 0)
        self.assertFalse(final['publishable'])
        self.assertIsNone(final['error'])


if __name__ == '__main__':
    unittest.main()
