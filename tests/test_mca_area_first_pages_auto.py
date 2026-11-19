"""Offline tests for the serial first-page controller."""

import json
import contextlib
import io
import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-area-first-pages-auto.py'
PREFIX = 'firstpage-20261119-auto'


class AreaFirstPagesAutoTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / 'national-area-first-pages-20261119'
        (self.output / 'batch-runs').mkdir(parents=True)

    def status(self, number, *, complete=False, error=None, seed='a' * 64):
        run_id = f'{PREFIX}-{number:04d}'
        value = {
            'runId': run_id, 'phase': 'finished',
            'exitCode': 0 if complete else 1,
            'sourceSeedSha256': seed, 'seedCount': 3,
            'pendingAreas': 0 if complete else 1,
            'rateLimited': False, 'error': error,
        }
        (self.output / 'batch-runs' / f'{run_id}.status.json').write_text(
            json.dumps(value), encoding='utf-8')
        return value

    def test_restart_uses_sequential_clean_statuses(self):
        self.status(1)
        self.status(2)
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 200),
                         (3, False, 'a' * 64))
        self.status(3, complete=True)
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 200),
                         (4, True, 'a' * 64))

    def test_rejects_failed_or_interrupted_batch(self):
        failed = self.status(1, error='business code 500')
        with self.assertRaisesRegex(RuntimeError, 'failed'):
            self.module['resume_state'](self.output, PREFIX, 200)
        failed['phase'] = 'running'
        (self.output / 'batch-runs' / f'{PREFIX}-0001.status.json').write_text(
            json.dumps(failed), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unfinished'):
            self.module['resume_state'](self.output, PREFIX, 200)

    def test_one_successful_child_finishes(self):
        calls = []
        def fake_run(command, **_kwargs):
            calls.append(command)
            self.status(1, complete=True)
            return SimpleNamespace(returncode=0)
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'preflight': lambda: 'a' * 64,
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '2'])
        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 1)
        self.assertIn('--run-id', calls[0])
        self.assertIn(f'{PREFIX}-0001', calls[0])

    def test_429_child_stops_without_second_attempt(self):
        calls = []
        def fake_run(command, **_kwargs):
            calls.append(command)
            status = self.status(1, error='FetchError: HTTP 429')
            status.update({'exitCode': 2, 'rateLimited': True})
            (self.output / 'batch-runs' / f'{PREFIX}-0001.status.json').write_text(
                json.dumps(status), encoding='utf-8')
            return SimpleNamespace(returncode=2)
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'preflight': lambda: 'a' * 64,
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '2'])
        self.assertEqual(result, 2)
        self.assertEqual(len(calls), 1)

    def test_stop_file_prevents_launch(self):
        (self.output / 'batch-runs' / f'{PREFIX}.stop').touch()
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'preflight': lambda: 'a' * 64,
        }), patch('subprocess.run', side_effect=AssertionError('no child')):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '2'])
        self.assertEqual(result, 3)

    def test_preflight_blocks_missing_budget_cooldown_and_incomplete_tree(self):
        globals_ = self.module['main'].__globals__
        collector = dict(self.module['COLLECTOR'])
        collector.update({
            'SEED_PATH': self.root / 'seed.json',
            'TREE_DIR': self.root / 'area-tree-20261119',
            'load_verified_seeds': lambda *_args: ({}, 'a' * 64),
        })
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output, 'COLLECTOR': collector,
        }), patch('subprocess.run', side_effect=AssertionError('no child')):
            self.assertEqual(self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '2']), 2)
            (self.root / 'hourly-request-budget.json').write_text(json.dumps({
                'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
                'requestStartedAtUtc': [],
            }), encoding='utf-8')
            (self.root / 'rate-limit.json').write_text(json.dumps({
                'cooldownUntilUtc': '2099-01-01T00:00:00+00:00',
            }), encoding='utf-8')
            self.assertEqual(self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '2']), 2)
            (self.root / 'rate-limit.json').unlink()
            collector['load_verified_seeds'] = lambda *_args: (
                (_ for _ in ()).throw(ValueError('incomplete area tree')))
            self.assertEqual(self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '2']), 2)


class FirstPageCompleteCacheTests(unittest.TestCase):
    def setUp(self):
        fixture = runpy.run_path(str(SCRIPT.parents[1] / 'tests/test_mca_area_first_pages.py'))
        self.fixture = fixture['AreaFirstPageTests']()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        with contextlib.redirect_stdout(io.StringIO()):
            result = self.fixture.run_batch(f'{PREFIX}-0001', max_areas=3)
        self.assertEqual(result['exitCode'], 0)
        self.module = runpy.run_path(str(SCRIPT))

    def run_completed(self):
        f = self.fixture
        collector = dict(self.module['COLLECTOR'])
        collector.update(SEED_PATH=f.seed_path, TREE_DIR=f.tree)
        with patch.dict(self.module['main'].__globals__, {
                'PRIVATE_ROOT': f.root, 'OUTPUT_DIR': f.output, 'COLLECTOR': collector}), \
                patch('subprocess.run', side_effect=AssertionError('must not launch')), \
                contextlib.redirect_stdout(io.StringIO()):
            return self.module['main'](['--batch-prefix', PREFIX, '--max-batches', '2'])

    def test_completed_chain_reaudits_raw_bytes_before_success(self):
        self.assertEqual(self.run_completed(), 0)
        path = self.fixture.output / 'area-440000000000/pages/00001.json'
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        del wrapper['rawBodyBase64']
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        self.assertEqual(self.run_completed(), 2)

    def test_completed_chain_rejects_manifest_observation_drift(self):
        path = self.fixture.output / 'manifest.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        manifest['observations']['440000000000']['reportedTotal'] = 999
        path.write_text(json.dumps(manifest), encoding='utf-8')
        self.assertEqual(self.run_completed(), 2)

    def test_completed_chain_requires_manifest_and_all_seed_pages(self):
        manifest = self.fixture.output / 'manifest.json'
        original = manifest.read_bytes()
        manifest.unlink()
        self.assertEqual(self.run_completed(), 2)
        manifest.write_bytes(original)
        (self.fixture.output / 'area-440000000000/pages/00001.json').unlink()
        self.assertEqual(self.run_completed(), 2)


if __name__ == '__main__':
    unittest.main()
