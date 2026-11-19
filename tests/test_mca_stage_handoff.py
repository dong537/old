"""Offline checks for the MCA tree-to-first-page handoff."""

import json
import hashlib
import contextlib
import io
from pathlib import Path
import runpy
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[1]
MODULE = runpy.run_path(str(PROJECT / 'scripts' / 'run-mca-stage-handoff.py'))


class StageHandoffTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'area-tree-20261119').mkdir()
        (self.root / 'batch-runs').mkdir()
        self.manifest = {'treeWalkComplete': False, 'rateLimited': False,
                         'lastError': None, 'savedResponses': 2}
        self.save_manifest()

    def save_manifest(self):
        (self.root / 'area-tree-20261119' / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')

    def test_incomplete_tree_waits_without_consulting_batch_chain(self):
        def fail_if_called(*_args):
            self.fail('batch chain should not be checked before completion')
        self.assertEqual(MODULE['readiness'](self.root, fail_if_called),
                         (False, 'area tree still incomplete'))

    def test_rate_limited_tree_blocks_next_stage(self):
        self.manifest['rateLimited'] = True
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, 'rate limited'):
            MODULE['readiness'](self.root, lambda *_args: None)

    def test_complete_tree_requires_matching_final_status(self):
        self.manifest['treeWalkComplete'] = True
        self.save_manifest()
        run_id = 'tree-20261119-auto-001'
        self.manifest.update(runId=run_id, pendingParentIds=[])
        self.save_manifest()
        raw = (self.root / 'area-tree-20261119/manifest.json').read_bytes()
        owned = self.root / 'area-tree-20261119/run-manifests' / f'{run_id}.json'
        owned.parent.mkdir(); owned.write_bytes(raw)
        status_path = self.root / 'batch-runs' / f'{run_id}.status.json'
        status = {'runId': run_id, 'collectorExitCode': 0,
                  'collectorManifestSha256': hashlib.sha256(raw).hexdigest(),
                  'phase': 'finished', 'exitCode': 0,
                  'treeWalkComplete': True, 'rateLimited': False,
                  'savedResponses': 2}
        status_path.write_text(json.dumps(status), encoding='utf-8')
        resume = lambda *_args: (run_id, 2, True)
        self.assertEqual(MODULE['readiness'](self.root, resume), (True, run_id))
        status['savedResponses'] = 1
        status_path.write_text(json.dumps(status), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'differs'):
            MODULE['readiness'](self.root, resume)

    def test_complete_manifest_with_incomplete_batch_chain_blocks(self):
        self.manifest['treeWalkComplete'] = True
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, 'batch chain incomplete'):
            MODULE['readiness'](self.root, lambda *_args: ('x', 2, False))


class RootRecaptureHandoffTests(unittest.TestCase):
    def setUp(self):
        fixture = runpy.run_path(str(PROJECT / 'tests/test_mca_tree_root_recapture.py'))
        self.fixture = fixture['RootRecaptureTests']()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.module = runpy.run_path(str(PROJECT / 'scripts/run-mca-stage-handoff.py'))
        self.run_id = 'tree-20261119-auto-009'
        self.fixture.manifest['runId'] = self.run_id
        self.fixture.save_manifest()
        raw = (self.fixture.tree / 'manifest.json').read_bytes()
        owned = self.fixture.tree / 'run-manifests' / (self.run_id + '.json')
        owned.parent.mkdir(); owned.write_bytes(raw)
        (self.root / 'batch-runs' / (self.run_id + '.status.json')).write_text(json.dumps({
            'runId': self.run_id, 'phase': 'finished', 'collectorExitCode': 0,
            'exitCode': 0, 'treeWalkComplete': True, 'rateLimited': False,
            'lastError': None, 'error': None, 'savedResponses': 3,
            'collectorManifestSha256': hashlib.sha256(raw).hexdigest()}))
        self.children = []
        self.fetches = []
        self.seed_count = 4000
        self.mode = 'complete'

    def run_once(self):
        globals_ = self.module['main'].__globals__
        replacements = {'ROOT': self.root, 'STATUS': self.root / 'batch-runs/stage-handoff.status.json'}
        if 'ROOT_RECAPTURE' in globals_:
            recapture = dict(globals_['ROOT_RECAPTURE'])
            recapture.update(SEED=self.fixture.seed, SEED_SHA256=self.fixture.seed_sha)
            replacements['ROOT_RECAPTURE'] = recapture
        def runner(command, **kwargs):
            script = Path(command[1]).name
            self.children.append(command)
            if script == 'recapture-mca-tree-roots.py':
                self.assertIn('--execute', command)
                self.assertEqual(command[command.index('--max-requests') + 1], '2')
                self.assertEqual(kwargs.get('timeout'), 600)
                number = int(command[command.index('--batch-number') + 1])
                limiter = self.fixture.limiter()
                base = self.fixture.fetcher(self.fetches)
                def fetch(parent, active, timeout):
                    wrapper = base(parent, active, timeout)
                    if self.mode == 'partial': active.exhausted.set()
                    return wrapper
                if self.mode == 'drift':
                    changed = {k: [dict(row) for row in v] for k, v in self.fixture.children.items()}
                    changed['-1'][0]['name'] = 'changed'
                    fetch = self.fixture.fetcher(self.fetches, responses=changed)
                if self.mode == '429':
                    fetch = self.fixture.fetcher(self.fetches, raise_at='-1')
                status = self.fixture.run_batch(number, self.fetches, fetch=fetch, limiter=limiter)
                return SimpleNamespace(returncode=0 if status['outcome'] == 'complete' else 1)
            if script == 'build-mca-area-seeds.py':
                (self.root / 'national-area-tree-seeds-20261119.json').write_text(json.dumps({'seedCount': self.seed_count}))
            return SimpleNamespace(returncode=0)
        with patch.dict(globals_, replacements), contextlib.redirect_stdout(io.StringIO()):
            return self.module['main']([], root=self.root,
                resume_state=lambda *_args: (self.run_id, 10, True), runner=runner)

    def status(self):
        return json.loads((self.root / 'batch-runs/stage-handoff.status.json').read_text())

    def test_complete_tree_recaptures_before_first_pages_and_preserves_old_roots(self):
        old = {p: p.read_bytes() for p in (self.fixture.tree / 'responses').glob('*.json')}
        self.assertEqual(self.run_once(), 0)
        self.assertEqual([Path(c[1]).name for c in self.children],
                         ['recapture-mca-tree-roots.py', 'build-mca-area-seeds.py', 'run-mca-area-first-pages-auto.py'])
        self.assertEqual(self.fetches, ['-1', 'gd'])
        self.assertTrue(all(p.read_bytes() == b for p, b in old.items()))
        self.assertEqual(self.run_once(), 0)
        self.assertEqual(self.fetches, ['-1', 'gd'])

    def test_clean_partial_waits_and_next_tick_fetches_only_remaining_root(self):
        self.mode = 'partial'
        self.assertEqual(self.run_once(), 0)
        self.assertEqual(self.status()['phase'], 'waiting')
        self.assertEqual(len(self.children), 1)
        self.assertEqual(self.fetches, ['-1'])
        self.mode = 'complete'
        self.assertEqual(self.run_once(), 0)
        self.assertEqual(self.fetches, ['-1', 'gd'])

    def test_drift_blocks_first_pages_and_periodic_retry(self):
        self.mode = 'drift'
        self.assertEqual(self.run_once(), 2)
        self.assertEqual(self.status()['phase'], 'blocked')
        self.assertEqual(len(self.children), 1)
        self.assertEqual(self.run_once(), 2)
        self.assertEqual(len(self.children), 1)

    def test_batch_ceiling_tracks_seed_inventory_instead_of_200(self):
        self.assertEqual(self.run_once(), 0)
        command = self.children[-1]
        self.assertEqual(command[command.index('--max-batches') + 1], '8000')

    def test_final_owned_manifest_drift_blocks_before_any_child(self):
        owned = self.fixture.tree / 'run-manifests' / (self.run_id + '.json')
        owned.write_text('{}')
        self.assertEqual(self.run_once(), 2)
        self.assertEqual(self.children, [])

    def test_full_hourly_budget_waits_without_creating_recapture_batch(self):
        from datetime import datetime, timezone
        ledger = self.root / 'hourly-request-budget.json'
        ledger.write_text(json.dumps({'schemaVersion': 1, 'windowSeconds': 3600,
            'limit': 60, 'requestStartedAtUtc': [datetime.now(timezone.utc).isoformat()] * 60}))
        self.assertEqual(self.run_once(), 0)
        self.assertEqual(self.status()['phase'], 'waiting')
        self.assertEqual(self.children, [])
        self.assertFalse(self.fixture.output.exists())

    def test_incomplete_tree_never_enters_recapture_or_site_lock(self):
        self.fixture.manifest['treeWalkComplete'] = False
        self.fixture.save_manifest()
        self.assertEqual(self.run_once(), 0)
        self.assertEqual(self.children, [])
        self.assertFalse((self.root / 'collector.lock').exists())
        self.assertFalse(self.fixture.output.exists())

    def test_recapture_429_blocks_and_preserves_auditable_child(self):
        self.mode = '429'
        self.assertEqual(self.run_once(), 2)
        self.assertEqual(self.status()['phase'], 'blocked')
        child = json.loads((self.fixture.output / 'batch-runs/batch-0001.status.json').read_text())
        self.assertEqual(child['outcome'], 'blocked')
        self.assertTrue(child['rateLimited'])
        self.assertEqual(self.fetches, ['-1'])
        self.assertEqual(self.run_once(), 2)
        self.assertEqual(self.fetches, ['-1'])

    def test_duplicate_scheduler_tick_does_not_overwrite_running_status(self):
        path = self.root / 'batch-runs/stage-handoff.status.json'
        path.write_text(json.dumps({'phase': 'running', 'stage': 'root-http-recapture'}))
        before = path.read_bytes()
        core = self.fixture.module['CORE']
        with core['exclusive_run_lock'](self.root / 'batch-runs/stage-handoff-lock'):
            self.assertEqual(self.run_once(), 0)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(self.children, [])

    def test_partial_with_rate_limit_is_not_automatically_retried(self):
        self.mode = 'partial'
        self.assertEqual(self.run_once(), 0)
        path = self.fixture.output / 'batch-runs/batch-0001.status.json'
        status = json.loads(path.read_text()); status['rateLimited'] = True
        path.write_text(json.dumps(status))
        self.assertEqual(self.run_once(), 2)
        self.assertEqual(len(self.children), 1)

    def test_partial_handoff_rejects_implementation_fingerprint_drift(self):
        self.mode = 'partial'
        self.assertEqual(self.run_once(), 0)
        path = self.root / 'batch-runs/stage-handoff.status.json'
        status = json.loads(path.read_text())
        status['recaptureImplementationSha256'] = {'recapture-mca-tree-roots.py': '0' * 64}
        path.write_text(json.dumps(status))
        self.assertEqual(self.run_once(), 2)
        self.assertEqual(len(self.children), 1)

    def test_stop_file_and_oversized_seed_inventory_never_launch_first_pages(self):
        stop = self.root / 'batch-runs/stage-handoff.stop'
        stop.touch()
        self.assertEqual(self.run_once(), 0)
        self.assertEqual(self.children, [])
        stop.unlink()
        self.seed_count = 10000
        self.assertEqual(self.run_once(), 2)
        self.assertNotIn('run-mca-area-first-pages-auto.py', [Path(c[1]).name for c in self.children])


if __name__ == '__main__':
    unittest.main()
