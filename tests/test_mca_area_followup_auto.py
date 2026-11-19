"""Offline behavior tests for the bounded followup-page controller."""

import json
import runpy
import tempfile
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-area-followup-auto.py'
PREFIX = 'followup-20261119-auto'
SEED_SHA = 'a' * 64
FIRST_SHA = 'b' * 64


class FollowupAutoTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.output = self.root / 'national-area-followup-pages-20261119'
        (self.output / 'batch-runs').mkdir(parents=True)

    def status(self, number, *, complete=False, observed=1, issues=0,
               saved=2, requests=2, limited=False, error=None,
               first_sha=FIRST_SHA):
        run_id = f'{PREFIX}-{number:04d}'
        value = {
            'schemaVersion': 1, 'runId': run_id, 'phase': 'finished',
            'pageMode': 'small',
            'endedAtUtc': '2026-11-19T00:00:00+00:00',
            'sourceSeedSha256': SEED_SHA,
            'sourceFirstPageManifestSha256': first_sha,
            'selectedAreaCount': 3, 'areasObservedComplete': observed,
            'areasUnverified': issues, 'newlySavedPages': saved,
            'requestsThisRun': requests, 'requestBudgetReached': False,
            'rateLimited': limited, 'publishable': False,
            'exitCode': 0 if complete else 1, 'error': error,
        }
        (self.output / 'batch-runs' / f'{run_id}.status.json').write_text(
            json.dumps(value), encoding='utf-8')
        return value

    def test_resume_requires_consecutive_same_source_clean_progress(self):
        self.status(1)
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 20),
                         (2, False, SEED_SHA, FIRST_SHA, 3, 1))
        self.status(2, complete=True, observed=3)
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 20),
                         (3, True, SEED_SHA, FIRST_SHA, 3, 3))

    def test_resume_rejects_gap_drift_and_unverified_area(self):
        self.status(2, observed=2)
        with self.assertRaisesRegex(RuntimeError, 'gap'):
            self.module['resume_state'](self.output, PREFIX, 20)
        (self.output / 'batch-runs' / f'{PREFIX}-0002.status.json').unlink()
        self.status(1)
        self.status(2, observed=2, first_sha='c' * 64)
        with self.assertRaisesRegex(RuntimeError, 'source'):
            self.module['resume_state'](self.output, PREFIX, 20)
        self.status(2, observed=2, issues=1)
        with self.assertRaisesRegex(RuntimeError, 'unverified'):
            self.module['resume_state'](self.output, PREFIX, 20)

    def test_controller_runs_one_bounded_child_and_stops_on_429(self):
        calls = []

        def fake_run(command, **_kwargs):
            calls.append(command)
            value = self.status(1, observed=0, saved=0, requests=1,
                                limited=True, error='HTTP 429')
            value['exitCode'] = 2
            path = self.output / 'batch-runs' / f'{PREFIX}-0001.status.json'
            path.write_text(json.dumps(value), encoding='utf-8')
            return SimpleNamespace(returncode=2)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output,
            'preflight': lambda: (SEED_SHA, FIRST_SHA, 3, 0),
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3'])
        self.assertEqual(result, 2)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][calls[0].index('--max-requests') + 1], '12')
        self.assertEqual(calls[0][calls[0].index('--interval') + 1], '60')

    def test_controller_completes_after_two_serial_batches(self):
        calls = []

        def fake_run(command, **_kwargs):
            calls.append(command)
            number = len(calls)
            self.status(number, complete=number == 2,
                        observed=1 if number == 1 else 3)
            return SimpleNamespace(returncode=1 if number == 1 else 0)

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output,
            'preflight': lambda: (SEED_SHA, FIRST_SHA, 3, len(calls) if calls else 0),
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3'])
        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 2)
        self.assertIn(f'{PREFIX}-0001', calls[0])
        self.assertIn(f'{PREFIX}-0002', calls[1])

    def test_no_progress_or_changed_cache_blocks_restart(self):
        status = self.status(1, observed=0, saved=0, requests=0)
        with self.assertRaisesRegex(RuntimeError, 'failed'):
            self.module['resume_state'](self.output, PREFIX, 3)
        status['requestBudgetReached'] = True
        path = self.output / 'batch-runs' / f'{PREFIX}-0001.status.json'
        path.write_text(json.dumps(status), encoding='utf-8')
        self.assertEqual(self.module['resume_state'](self.output, PREFIX, 3)[0], 2)
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output,
            'preflight': lambda: (SEED_SHA, FIRST_SHA, 3, 1),
        }), patch('subprocess.run', side_effect=AssertionError('no child')):
            self.assertEqual(self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3']), 2)

    def test_large_mode_preserves_unverified_observations_and_resumes(self):
        large_prefix = 'largepage-20261119-auto'
        output = self.root / 'national-area-large-pages-20261119'
        (output / 'batch-runs').mkdir(parents=True)
        calls = []

        def fake_run(command, **_kwargs):
            calls.append(command)
            number = len(calls)
            run_id = f'{large_prefix}-{number:04d}'
            value = {
                'schemaVersion': 1, 'runId': run_id, 'phase': 'finished',
                'pageMode': 'large',
                'endedAtUtc': '2026-11-19T00:00:00+00:00',
                'sourceSeedSha256': SEED_SHA,
                'sourceFirstPageManifestSha256': FIRST_SHA,
                'selectedAreaCount': 2, 'areasObservedComplete': 0,
                'areasPagesObservedComplete': number,
                'areasUnverified': 1, 'newlySavedPages': 2,
                'requestsThisRun': 2, 'requestBudgetReached': False,
                'rateLimited': False, 'publishable': False,
                'exitCode': 0 if number == 2 else 1, 'error': None,
            }
            (output / 'batch-runs' / f'{run_id}.status.json').write_text(
                json.dumps(value), encoding='utf-8')
            return SimpleNamespace(returncode=value['exitCode'])

        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'LARGE_OUTPUT_DIR': output,
            'preflight_large': lambda: (SEED_SHA, FIRST_SHA, 2, len(calls)),
            'wait_for_capacity': lambda *_args: True,
        }), patch('subprocess.run', side_effect=fake_run):
            result = self.module['main']([
                '--page-mode', 'large', '--batch-prefix', large_prefix,
                '--max-batches', '3'])
        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(command[-2:] == ['--page-mode', 'large']
                            for command in calls))

    def test_stop_file_prevents_child_launch(self):
        (self.output / 'batch-runs' / f'{PREFIX}.stop').touch()
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'PROJECT': self.root, 'PRIVATE_ROOT': self.root,
            'OUTPUT_DIR': self.output,
            'preflight': lambda: (SEED_SHA, FIRST_SHA, 3, 0),
        }), patch('subprocess.run', side_effect=AssertionError('no child')):
            self.assertEqual(self.module['main']([
                '--batch-prefix', PREFIX, '--max-batches', '3']), 3)

    def test_preflight_refuses_incomplete_first_pages_and_orphan_cache(self):
        globals_ = self.module['preflight'].__globals__
        seed = {'sbcode': '440113000000'}
        observations = {seed['sbcode']: {
            'reportedTotal': 20, 'serverPageSize': 10}}
        collector = dict(self.module['COLLECTOR'])
        collector.update({
            'CONTROLLER_LOCK': lambda *_args: nullcontext(),
            'FETCHER': {
                'exclusive_run_lock': lambda *_args: nullcontext(),
                'enforce_site_cooldown': lambda *_args: None,
            },
            'FIRST': {'require_hourly_ledger': lambda *_args: None},
            'first_page_inputs': lambda *_args: (_ for _ in ()).throw(
                ValueError('first pages incomplete')),
        })
        with patch.dict(globals_, {
            'PRIVATE_ROOT': self.root, 'OUTPUT_DIR': self.output,
            'COLLECTOR': collector,
        }):
            with self.assertRaisesRegex(ValueError, 'first pages incomplete'):
                self.module['preflight']()
            collector['first_page_inputs'] = lambda *_args: (
                {'seeds': [seed]}, SEED_SHA, observations, FIRST_SHA)
            (self.output / 'area-440113000000').mkdir()
            with self.assertRaisesRegex(RuntimeError, 'lacks manifest'):
                self.module['preflight']()


if __name__ == '__main__':
    unittest.main()
