"""Offline tests for one-batch-per-invocation MCA stage handoff."""

import json
import runpy
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-observed-stage-handoff.py'
NORMALIZATION_FIXTURE = (Path(__file__).resolve().parents[1] / 'tests' /
                         'test_mca_observed_private_normalization.py')


class ObservedStageHandoffTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.calls = []
        self.runner_options = []
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')

    def run_once(self, first, pages, details, *, probe=(True, 1, 0, 0),
                 child_code=4, overlay_seed=None, overlay_pages=None,
                  overlay_details=(True, 1, 0), on_run=None):
        def runner(command, **_kwargs):
            self.calls.append(command)
            self.runner_options.append(_kwargs)
            if on_run is not None:
                on_run(command)
            return SimpleNamespace(returncode=child_code)
        globals_ = self.module['main'].__globals__
        overlay_seed = overlay_seed or (True, 1 if probe[3] else 0)
        overlay_pages = overlay_pages or {
            'first': (True, 1, 0), 'small': (True, 1, 0),
            'large': (True, 1, 0),
        }
        with patch.dict(globals_, {
            'first_ready': lambda: first,
            'probe_stage': lambda: probe,
            'page_stage': lambda mode: pages[mode],
            'detail_stage': lambda: details,
            'overlay_seed_stage': lambda _count: overlay_seed,
            'overlay_page_stage': lambda mode: overlay_pages[mode],
            'overlay_detail_stage': lambda: overlay_details,
        }):
            return self.module['main']([], root=self.root, runner=runner)

    def status(self):
        return json.loads((self.root / 'batch-runs' /
                           'observed-stage-handoff.status.json').read_text(
                               encoding='utf-8'))

    def verified_source(self):
        fixture = runpy.run_path(str(NORMALIZATION_FIXTURE))[
            'ModernPrivateNormalizationTests'](
                'test_verified_base_chain_preserves_values_states_and_each_source')
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.source.modern_batch()
        self.root = fixture.root
        (self.root / 'batch-runs').mkdir(exist_ok=True)
        return fixture

    def test_waits_for_first_pages_without_launch(self):
        result = self.run_once((False, 'first pages incomplete'),
                               {}, (False, 1, 0))
        self.assertEqual(result, 0)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.status()['phase'], 'waiting')

    def test_full_hourly_budget_waits_for_next_tick_without_starting_controller(self):
        started = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [started] * 60,
        }), encoding='utf-8')
        original = (self.root / 'hourly-request-budget.json').read_bytes()
        result = self.run_once((True, 'ready'), {'small': (False, 1, 7)},
                               (False, 1, 100))
        self.assertEqual(result, 0)
        self.assertEqual(self.calls, [], 'quota wait must not occupy a timed child controller')
        self.assertEqual(self.status()['phase'], 'waiting')
        self.assertIn('hourly', self.status()['reason'])
        self.assertEqual((self.root / 'hourly-request-budget.json').read_bytes(), original)
        self.assertEqual(self.run_once((True, 'ready'), {}, (False, 1, 100),
                                       probe=(False, 1, 300, 0)), 0)
        self.assertEqual(self.calls, [])

    def test_controller_wait_race_cannot_trigger_outer_parent_only_kill(self):
        # The controller may consume almost one hour awaiting capacity after
        # the precheck, then run its independently timed collector. An outer
        # one-hour timeout kills only this parent, orphaning that collector.
        self.run_once((True, 'ready'), {'small': (False, 1, 7)}, (False, 1, 100))
        self.assertIsNone(self.runner_options[0].get('timeout'),
                          'controller lifetime must not inherit collector timeout')

    def test_direct_probe_retains_bounded_timeout(self):
        self.run_once((True, 'ready'), {}, (False, 1, 100),
                      probe=(False, 1, 300, 0), child_code=1)
        self.assertEqual(self.runner_options[0]['timeout'], 3600)

    def test_missing_hourly_ledger_blocks_without_launch(self):
        (self.root / 'hourly-request-budget.json').unlink()
        self.assertEqual(self.run_once((True, 'ready'),
                                       {'small': (False, 1, 7)}, (False, 1, 100)), 2)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.status()['phase'], 'blocked')

    def test_upstream_tree_failure_is_visible_and_recovers_after_clean_state(self):
        tree = self.root / 'area-tree-20261119'
        tree.mkdir()
        manifest = tree / 'manifest.json'
        manifest.write_text(json.dumps({
            'treeWalkComplete': False, 'rateLimited': False,
            'lastError': 'ValueError: invalid official sbcode',
        }), encoding='utf-8')
        self.assertEqual(self.run_once((False, 'first pages incomplete'),
                                       {}, (False, 1, 0)), 2)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.status()['phase'], 'blocked')
        self.assertEqual(self.status()['stage'], 'area-tree')
        manifest.write_text(json.dumps({
            'treeWalkComplete': False, 'rateLimited': False,
            'lastError': None,
        }), encoding='utf-8')
        self.assertEqual(self.run_once((False, 'first pages incomplete'),
                                       {}, (False, 1, 0)), 0)
        self.assertEqual(self.status()['phase'], 'waiting')

    def test_first_stage_waits_for_finished_handoff_status(self):
        globals_ = self.module['first_ready'].__globals__
        first_auto = {'resume_state': lambda *_args: (2, True, 'a' * 64)}
        collector = dict(self.module['FOLLOWUP_AUTO']['COLLECTOR'])
        collector.update({
            'CONTROLLER_LOCK': lambda *_args: nullcontext(),
            'first_page_inputs': lambda *_args: (
                {'seedCount': 1}, 'a' * 64, {'440000000000': {}}, 'b' * 64),
        })
        followup = dict(self.module['FOLLOWUP_AUTO'])
        followup['COLLECTOR'] = collector
        with patch.dict(globals_, {
            'ROOT': self.root, 'RUNS': self.root / 'batch-runs',
            'FIRST_DIR': self.root / 'first',
            'FIRST_AUTO': first_auto, 'FOLLOWUP_AUTO': followup,
        }):
            self.assertFalse(self.module['first_ready']()[0])
            runs = self.root / 'batch-runs'
            runs.mkdir()
            path = runs / 'stage-handoff.status.json'
            path.write_text(json.dumps({'phase': 'running'}), encoding='utf-8')
            self.assertFalse(self.module['first_ready']()[0])
            path.write_text(json.dumps({'phase': 'finished',
                                        'firstPageExitCode': 0, 'seedCount': 1,
                                        'firstPageBatchCeiling': 200}), encoding='utf-8')
            self.assertTrue(self.module['first_ready']()[0])

    def test_first_stage_uses_audited_seed_based_ceiling_above_200(self):
        checked_ceilings = []
        def resume_state(_output, _prefix, ceiling):
            checked_ceilings.append(ceiling)
            if ceiling < 201:
                raise RuntimeError('existing first-page batches exceed configured ceiling')
            return 202, True, 'a' * 64
        collector = dict(self.module['FOLLOWUP_AUTO']['COLLECTOR'])
        collector.update({
            'CONTROLLER_LOCK': lambda *_args: nullcontext(),
            'first_page_inputs': lambda *_args: (
                {'seedCount': 120}, 'a' * 64, {'440000000000': {}}, 'b' * 64),
        })
        followup = dict(self.module['FOLLOWUP_AUTO'])
        followup['COLLECTOR'] = collector
        runs = self.root / 'batch-runs'
        runs.mkdir()
        (runs / 'stage-handoff.status.json').write_text(json.dumps({
            'phase': 'finished', 'firstPageExitCode': 0, 'seedCount': 120,
            'firstPageBatchCeiling': 240,
        }), encoding='utf-8')
        with patch.dict(self.module['first_ready'].__globals__, {
            'ROOT': self.root, 'RUNS': runs, 'FIRST_DIR': self.root / 'first',
            'FIRST_AUTO': {'resume_state': resume_state},
            'FOLLOWUP_AUTO': followup,
        }):
            self.assertEqual(self.module['first_ready'](),
                             (True, 'official-area first pages audited'))
        self.assertEqual(checked_ceilings, [240])

    def test_launches_exactly_one_small_area_batch(self):
        result = self.run_once((True, 'ready'),
                               {'small': (False, 1, 7),
                                'large': (False, 1, 9)},
                               (False, 1, 100))
        self.assertEqual(result, 0)
        self.assertEqual(len(self.calls), 1)
        command = self.calls[0]
        self.assertIn('followup-20261119-auto', command)
        self.assertEqual(command[command.index('--max-batches') + 1], '1')
        self.assertNotIn('--page-mode', command)
        self.assertEqual(self.status()['stage'], 'small-pages')

    def test_level_three_probe_runs_before_page_batches(self):
        result = self.run_once((True, 'ready'),
                               {'small': (False, 1, 7)},
                               (False, 1, 100),
                               probe=(False, 2, 300, 0), child_code=1)
        self.assertEqual(result, 0)
        self.assertEqual(len(self.calls), 1)
        command = self.calls[0]
        self.assertIn('probe-mca-level3-children.py', command[1])
        self.assertEqual(command[command.index('--batch-number') + 1], '2')
        self.assertEqual(self.status()['stage'], 'level3-probe')

    def test_level_four_gap_is_recorded_without_blocking_observed_pages(self):
        result = self.run_once((True, 'ready'),
                               {'small': (False, 1, 7)},
                               (False, 1, 100),
                               probe=(True, 2, 300, 2))
        self.assertEqual(result, 0)
        self.assertEqual(self.status()['stage'], 'small-pages')
        self.assertEqual(self.status()['knownLevel4NodeCount'], 2)
        self.assertEqual(self.status()['coverageGaps'], [
            {'kind': 'level-four-child-scope-not-enumerated', 'count': 2}])
        self.assertFalse(self.status()['nationalComplete'])

    def test_terminal_probe_builds_overlay_before_any_new_list_request(self):
        result = self.run_once((True, 'ready'), {'small': (False, 1, 7)},
                               (False, 1, 100), probe=(True, 2, 300, 2),
                               overlay_seed=(False, 1), child_code=0)
        self.assertEqual(result, 0)
        self.assertEqual(len(self.calls), 1)
        self.assertIn('build-mca-level4-overlay-seeds.py', self.calls[0][1])
        self.assertIn('--write', self.calls[0])
        self.assertEqual(self.status()['stage'], 'level4-seeds')

    def test_level_four_first_and_pages_precede_original_detail(self):
        self.assertEqual(self.run_once(
            (True, 'ready'), {'small': (False, 1, 7)}, (False, 1, 100),
            probe=(True, 2, 300, 2),
            overlay_pages={'first': (False, 1, 1), 'small': (True, 1, 0),
                           'large': (True, 1, 0)}, child_code=1), 0)
        self.assertEqual(self.status()['stage'], 'level4-first')
        self.assertIn('collect-mca-level4-observed.py', self.calls[0][1])
        self.assertEqual(self.calls[0][self.calls[0].index('--batch-number') + 1],
                         '1')
        self.assertEqual(self.runner_options[0]['timeout'], 3600)

    def test_level_four_incremental_details_follow_original_details(self):
        self.assertEqual(self.run_once(
            (True, 'ready'), {'small': (True, 2, 1),
                              'large': (True, 2, 1)}, (True, 2, 50),
            probe=(True, 2, 300, 2), overlay_details=(False, 1, 1),
            child_code=1), 0)
        self.assertEqual(self.status()['stage'], 'level4-details')
        self.assertEqual(self.calls[0][self.calls[0].index('--stage') + 1],
                         'details')

    def test_original_page_and_detail_controllers_bind_verified_overlay_source(self):
        overlay_path = self.root / 'national-area-level4-overlay-seeds.v1.json'
        overlay_path.write_text('{}', encoding='utf-8')
        source = dict(self.module['OVERLAY'])
        source['OVERLAY_PATH'] = overlay_path
        with patch.dict(self.module['command_for'].__globals__,
                        {'OVERLAY': source}):
            for stage in ('small-pages', 'large-pages', 'observed-details'):
                command = self.module['command_for'](stage, 1)
                self.assertIn('--official-descendants-overlay-v1', command)

    def test_completed_probe_exposes_level_four_count(self):
        probe_dir = self.root / 'probe'
        runs = probe_dir / 'batch-runs'
        runs.mkdir(parents=True)
        (runs / 'batch-0001.status.json').write_text('{}', encoding='utf-8')
        module = {
            'TREE': self.root / 'tree', 'PROBE': probe_dir,
            'TREE_AUTO': {'controller_lock': lambda *_args: nullcontext()},
            'source_plan': lambda *_args: {'parents': [{'id': 'county'}]},
            'scan_cache': lambda *_args: {
                'pendingParents': 0, 'level4NodeCount': 2,
                'allLevel3ChildrenEnumerated': True},
            'prior_batch': lambda *_args: (_ for _ in ()).throw(
                RuntimeError('level-three probe already complete')),
        }
        with patch.dict(self.module['probe_stage'].__globals__,
                        {'PROBE': module}):
            self.assertEqual(self.module['probe_stage'](), (True, 2, 1, 2))

    def test_large_then_detail_stage_each_launch_only_one_batch(self):
        self.assertEqual(self.run_once(
            (True, 'ready'), {'small': (True, 4, 7),
                              'large': (False, 2, 9)},
            (False, 1, 100)), 0)
        self.assertEqual(self.calls[0][-2:], ['--page-mode', 'large'])
        self.assertEqual(self.calls[0][self.calls[0].index('--max-batches') + 1], '2')
        self.assertEqual(self.status()['stage'], 'large-pages')
        self.assertIsNone(self.runner_options[-1].get('timeout'))
        self.calls.clear()
        self.assertEqual(self.run_once(
            (True, 'ready'), {'small': (True, 4, 7),
                              'large': (True, 12, 9)},
            (False, 1, 100)), 0)
        self.assertEqual(len(self.calls), 1)
        self.assertIn('detail-20261119-auto', self.calls[0])
        self.assertEqual(self.status()['stage'], 'observed-details')
        self.assertIsNone(self.runner_options[-1].get('timeout'))

    def test_child_failure_blocks_retry_and_never_marks_published(self):
        result = self.run_once((True, 'ready'),
                               {'small': (False, 1, 7)},
                               (False, 1, 100), child_code=2)
        self.assertEqual(result, 2)
        self.assertEqual(self.status()['phase'], 'blocked')
        self.assertFalse(self.status()['publishable'])
        self.calls.clear()
        result = self.run_once((True, 'ready'),
                               {'small': (False, 1, 7)},
                               (False, 1, 100))
        self.assertEqual(result, 2)
        self.assertEqual(self.calls, [])

    def test_second_scheduler_does_not_overwrite_running_status(self):
        runs = self.root / 'batch-runs'
        runs.mkdir(parents=True)
        status_path = runs / 'observed-stage-handoff.status.json'
        status_path.write_text(json.dumps({'phase': 'running',
                                           'stage': 'observed-details'}),
                               encoding='utf-8')
        original = status_path.read_bytes()

        def busy(_root):
            raise self.module['FETCHER']['FetchError'](
                'another MCA collector is already running')

        with patch.dict(self.module['FETCHER'], {'exclusive_run_lock': busy}):
            self.assertEqual(self.module['main']([], root=self.root), 0)
        self.assertEqual(status_path.read_bytes(), original)

    def test_active_other_collector_waits_without_launch(self):
        globals_ = self.module['main'].__globals__
        with patch.dict(globals_, {
            'first_ready': lambda: (True, 'ready'),
            'probe_stage': lambda: (_ for _ in ()).throw(
                RuntimeError('another tree controller is running')),
        }):
            result = self.module['main']([], root=self.root,
                                         runner=lambda *_args, **_kwargs:
                                         self.fail('no child'))
        self.assertEqual(result, 0)
        self.assertEqual(self.status()['phase'], 'waiting')

    def test_complete_details_without_verified_source_cannot_finish(self):
        result = self.run_once((True, 'ready'),
                               {'small': (True, 2, 1),
                                'large': (True, 2, 1)},
                               (True, 2, 50))
        self.assertEqual(result, 2)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.status()['phase'], 'blocked')
        self.assertFalse(self.status()['publishable'])

    def test_verified_details_launch_fixed_private_normalizer(self):
        self.verified_source()
        result = self.run_once((True, 'ready'),
                               {'small': (True, 2, 1), 'large': (True, 2, 1)},
                               (True, 2, 1), child_code=0)
        self.assertEqual(result, 0)
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(self.calls[0][1].endswith('normalize-mca-observed-private.py'))
        self.assertEqual(self.calls[0][2:], [])
        self.assertEqual(self.status()['phase'], 'waiting')
        self.assertEqual(self.status()['stage'], 'private-normalization')

    def test_normalized_output_finishes_on_next_tick_and_is_idempotent(self):
        fixture = self.verified_source()
        pages = {'small': (True, 2, 1), 'large': (True, 2, 1)}
        details = (True, 2, 1)
        self.assertEqual(self.run_once((True, 'ready'), pages, details,
                                       child_code=0,
                                       on_run=lambda _command: fixture.build()), 0)
        self.assertEqual(self.status()['phase'], 'waiting')
        self.calls.clear()
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 0)
        self.assertEqual(self.status()['phase'], 'finished')
        self.assertEqual(self.calls, [])
        self.assertFalse(self.status()['publishable'])
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 0)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.status()['phase'], 'finished')

    def test_failed_normalizer_blocks(self):
        self.verified_source()
        pages = {'small': (True, 2, 1), 'large': (True, 2, 1)}
        details = (True, 2, 1)
        self.assertEqual(self.run_once((True, 'ready'), pages, details,
                                       child_code=2), 2)
        self.assertEqual(self.status()['phase'], 'blocked')

    def test_zero_exit_without_output_cannot_finish(self):
        self.verified_source()
        pages = {'small': (True, 2, 1), 'large': (True, 2, 1)}
        details = (True, 2, 1)
        # A clean exit alone is not evidence that the artifact was written.
        self.assertEqual(self.run_once((True, 'ready'), pages, details,
                                       child_code=0), 0)
        self.assertEqual(self.status()['phase'], 'waiting')
        self.calls.clear()
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 2)
        self.assertEqual(self.status()['phase'], 'blocked')
        self.assertEqual(self.calls, [])

    def test_source_drift_after_finished_revokes_finished_without_relaunch(self):
        fixture = self.verified_source()
        pages = {'small': (True, 2, 1), 'large': (True, 2, 1)}
        details = (True, 2, 1)
        self.assertEqual(self.run_once((True, 'ready'), pages, details,
                                       child_code=0,
                                       on_run=lambda _command: fixture.build()), 0)
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 0)
        page = (self.root / 'national-area-first-pages-20261119' /
                'area-110000000000/pages/00001.json')
        wrapper = json.loads(page.read_text(encoding='utf-8'))
        wrapper['responseSha256'] = '0' * 64
        page.write_text(json.dumps(wrapper), encoding='utf-8')
        self.calls.clear()
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 2)
        self.assertEqual(self.status()['phase'], 'blocked')
        self.assertEqual(self.calls, [])

    def test_stop_file_does_not_erase_verified_private_completion(self):
        fixture = self.verified_source()
        pages = {'small': (True, 2, 1), 'large': (True, 2, 1)}
        details = (True, 2, 1)
        self.assertEqual(self.run_once((True, 'ready'), pages, details,
                                       child_code=0,
                                       on_run=lambda _command: fixture.build()), 0)
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 0)
        finished = self.status()
        (self.root / 'batch-runs' / 'observed-stage-handoff.stop').write_text('stop')
        self.calls.clear()
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 0)
        self.assertEqual(self.status(), finished)
        self.assertEqual(self.calls, [])

    def test_wrong_private_record_id_cannot_pass_same_count_and_source_headers(self):
        fixture = self.verified_source()
        pages = {'small': (True, 2, 1), 'large': (True, 2, 1)}
        details = (True, 2, 1)
        self.assertEqual(self.run_once((True, 'ready'), pages, details,
                                       child_code=0,
                                       on_run=lambda _command: fixture.build()), 0)
        output = self.root / 'national-observed-normalized-private.v1.json'
        value = json.loads(output.read_text(encoding='utf-8'))
        value['records'][0]['mcaId'] = 'ENTITY999'
        output.write_text(json.dumps(value), encoding='utf-8')
        self.calls.clear()
        self.assertEqual(self.run_once((True, 'ready'), pages, details), 2)
        self.assertEqual(self.status()['phase'], 'blocked')
        self.assertEqual(self.calls, [])

    def test_source_changed_while_output_is_checked_cannot_finish(self):
        fixture = self.verified_source()
        pages = {'small': (True, 2, 1), 'large': (True, 2, 1)}
        details = (True, 2, 1)
        self.assertEqual(self.run_once((True, 'ready'), pages, details,
                                       child_code=0,
                                       on_run=lambda _command: fixture.build()), 0)
        page = (self.root / 'national-area-first-pages-20261119' /
                'area-110000000000/pages/00001.json')
        original = self.module['normalized_output_digest']

        def drift(root, source, trusted_digest=None):
            digest = original(root, source, trusted_digest)
            wrapper = json.loads(page.read_text(encoding='utf-8'))
            wrapper['responseSha256'] = '0' * 64
            page.write_text(json.dumps(wrapper), encoding='utf-8')
            return digest

        with patch.dict(self.module['main'].__globals__,
                        {'normalized_output_digest': drift}):
            self.assertEqual(self.run_once((True, 'ready'), pages, details), 2)
        self.assertEqual(self.status()['phase'], 'blocked')


if __name__ == '__main__':
    unittest.main()
