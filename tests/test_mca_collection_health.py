"""Offline behavior and privacy checks for read-only MCA health snapshots."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/mca-collection-health.py'
HELPERS = runpy.run_path(str(ROOT / 'tests/test_mca_pipeline_progress.py'))
NOW = datetime(2026, 11, 19, 2, tzinfo=timezone.utc)


class CollectionHealthTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), 'read-only health snapshot script is missing')
        self.module = runpy.run_path(str(SCRIPT))
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def save(self, name, value):
        HELPERS['save'](self.root / name, value)

    def health(self):
        return self.module['snapshot'](self.root, now=NOW)

    def tree_response(self, name='-1', at='2026-11-19T01:30:00+00:00'):
        value = HELPERS['wrapper']({'code': 0, 'data': []}, parent=name)
        value['fetchedAtUtc'] = at
        self.save(f'area-tree-20261119/responses/{name}.json', value)
        return value

    def test_empty_is_unknown_not_success(self):
        report = self.health()
        self.assertEqual(report['currentStage'], 'tree')
        self.assertEqual(report['upstreamBlocker'], {'stage': 'tree', 'code': 'not_started'})
        self.assertIsNone(report['lastSuccessfulResponseAtUtc'])
        self.assertIsNone(report['noProgressSeconds'])
        self.assertEqual(report['hourlyBudget']['state'], 'unknown')
        self.assertFalse(report['publishable'])
        self.assertFalse(report['nationalComplete'])

    def test_upstream_error_beats_downstream_waiting_and_never_leaks_text(self):
        self.save('area-tree-20261119/manifest.json',
                  {'treeWalkComplete': False, 'lastError': 'PRIVATE institution street secret',
                   'rateLimited': False, 'savedResponses': 0, 'pendingParentIds': ['PRIVATE-ID']})
        self.save('national-area-first-pages-20261119/batch-runs/a.status.json',
                  {'phase': 'waiting', 'startedAtUtc': '2026-11-19T01:00:00+00:00',
                   'reason': 'PRIVATE institution street secret'})
        report = self.health()
        self.assertEqual(report['upstreamBlocker'], {'stage': 'tree', 'code': 'source_error'})
        self.assertEqual(report['stages']['firstPages']['state'], 'waiting')
        self.assertNotIn('PRIVATE', json.dumps(report))

    def test_waiting_exit_zero_is_not_completion(self):
        self.save('batch-runs/tree-a.status.json',
                  {'phase': 'waiting', 'exitCode': 0, 'checkedAtUtc': NOW.isoformat()})
        report = self.health()
        self.assertEqual(report['stages']['tree']['state'], 'waiting')
        self.assertEqual(report['currentStage'], 'tree')

    def test_success_time_comes_from_verified_response_and_snapshot_is_read_only(self):
        self.tree_response()
        self.save('area-tree-20261119/manifest.json',
                  {'treeWalkComplete': False, 'lastError': None, 'rateLimited': False,
                   'savedResponses': 1, 'pendingParentIds': ['opaque'], 'auditedAtUtc': NOW.isoformat()})
        before = {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in self.root.rglob('*') if p.is_file()}
        report = self.health()
        after = {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual(report['lastSuccessfulResponseAtUtc'], '2026-11-19T01:30:00+00:00')
        self.assertEqual(report['noProgressSeconds'], 1800)

    def test_corrupt_or_future_response_cannot_reset_progress_clock(self):
        self.tree_response()
        bad = self.tree_response('broken', '2026-11-19T01:59:00+00:00')
        bad['responseSha256'] = '0' * 64
        self.save('area-tree-20261119/responses/broken.json', bad)
        self.tree_response('future', '2099-01-01T00:00:00+00:00')
        report = self.health()
        self.assertEqual(report['noProgressSeconds'], 1800)
        self.assertEqual(report['stages']['tree']['invalidResponseCount'], 2)
        self.assertEqual(report['upstreamBlocker']['code'], 'invalid_response')

    def test_cooldown_and_hourly_window_are_reported_without_reserving_budget(self):
        self.save('rate-limit.json', {'detectedAtUtc': '2026-11-19T01:00:00+00:00',
                  'cooldownUntilUtc': '2026-11-19T02:15:00+00:00', 'reason': 'PRIVATE'})
        self.save('hourly-request-budget.json', {'schemaVersion': 1, 'windowSeconds': 3600,
                  'limit': 60, 'requestStartedAtUtc': ['2026-11-19T01:30:00+00:00'] * 60
                  + ['2026-11-19T01:00:00+00:00']})
        report = self.health()
        self.assertEqual(report['cooldown']['remainingSeconds'], 900)
        self.assertEqual(report['hourlyBudget']['used'], 60)
        self.assertEqual(report['hourlyBudget']['remaining'], 0)
        self.assertEqual(report['hourlyBudget']['resumeAtUtc'], '2026-11-19T02:30:00+00:00')
        self.assertEqual(report['upstreamBlocker']['code'], 'cooldown_active')

    def test_invalid_budget_and_status_are_visible_without_raw_errors(self):
        self.save('hourly-request-budget.json', {'limit': 'PRIVATE'})
        self.save('batch-runs/tree-a.status.json', {'phase': 'PRIVATE', 'checkedAtUtc': NOW.isoformat()})
        report = self.health()
        self.assertEqual(report['hourlyBudget']['state'], 'invalid')
        self.assertEqual(report['upstreamBlocker']['code'], 'invalid_status')
        self.assertNotIn('PRIVATE', json.dumps(report))

    def test_complete_tree_advances_current_stage_but_never_certifies_coverage(self):
        self.tree_response()
        self.save('area-tree-20261119/manifest.json',
                  {'treeWalkComplete': True, 'lastError': None, 'rateLimited': False,
                   'savedResponses': 1, 'pendingParentIds': [], 'invalidCodeNodeCount': 1})
        report = self.health()
        self.assertEqual(report['currentStage'], 'firstPages')
        self.assertEqual(report['stages']['tree']['state'], 'reported_complete')
        self.assertEqual(report['stages']['tree']['coverageGapCount'], 1)
        self.assertFalse(report['publishable'])

    def test_all_five_stages_can_report_local_completion_without_national_success(self):
        self.tree_response()
        self.save('area-tree-20261119/manifest.json',
                  {'treeWalkComplete': True, 'savedResponses': 1, 'pendingParentIds': []})
        self.save('national-area-first-pages-20261119/area-110000000000/pages/00001.json',
                  HELPERS['list_page']('110000000000', 1, []))
        self.save('national-area-first-pages-20261119/manifest.json',
                  {'seedCount': 1, 'completedAreaCount': 1, 'pendingAreaCount': 0})
        self.save('area-level3-probe-20261119/responses/opaque.json',
                  HELPERS['wrapper']({'code': 0, 'data': []}, parent='opaque'))
        self.save('area-level3-probe-20261119/manifest.json',
                  {'allLevel3ChildrenEnumerated': True, 'pendingParents': 0, 'savedResponses': 1})
        for folder in self.module['FOLDERS']['pages']:
            self.save(folder + '/manifest.json',
                      {'selectedAreaCount': 0, 'areasPagesObservedComplete': 0, 'areasUnverified': 0})
        for name in ('orgBaseDetail', 'yangLaoOrgDetail'):
            self.save(f'national-observed-details-20261119/detail-checkpoints/ENTITY001/{name}.json',
                      HELPERS['detail_endpoint'](name, 'ENTITY001'))
        self.save('national-observed-details-20261119/manifest.json',
                  {'detailsCompleteForObservedIds': True, 'uniqueIdCount': 1, 'completedDetailCount': 1})
        report = self.health()
        self.assertTrue(all(v['state'] == 'reported_complete' for v in report['stages'].values()))
        self.assertIsNone(report['currentStage'])
        self.assertFalse(report['nationalComplete'])
        self.assertNotIn('ENTITY001', json.dumps(report))

    def test_handoff_waiting_is_visible_even_without_stage_batch(self):
        self.save('batch-runs/observed-stage-handoff.status.json',
                  {'phase': 'waiting', 'stage': 'first-pages', 'checkedAtUtc': NOW.isoformat(),
                   'reason': 'PRIVATE'})
        report = self.health()
        self.assertEqual(report['stages']['firstPages']['state'], 'waiting')
        self.assertEqual(report['currentStage'], 'tree')
        self.assertNotIn('PRIVATE', json.dumps(report))

    def test_later_large_page_status_cannot_hide_small_page_failure(self):
        self.save('national-area-followup-pages-20261119/batch-runs/a.status.json',
                  {'phase': 'blocked', 'checkedAtUtc': '2026-11-19T01:00:00+00:00'})
        self.save('national-area-large-pages-20261119/batch-runs/b.status.json',
                  {'phase': 'finished', 'exitCode': 0, 'checkedAtUtc': NOW.isoformat()})
        report = self.health()
        self.assertEqual(report['stages']['pages']['state'], 'blocked')

    def test_running_status_reports_age_without_claiming_process_liveness(self):
        self.save('batch-runs/tree-a.status.json',
                  {'phase': 'running', 'startedAtUtc': '2026-11-19T00:00:00+00:00'})
        report = self.health()
        self.assertEqual(report['stages']['tree']['state'], 'running')
        self.assertEqual(report['stages']['tree']['statusAgeSeconds'], 7200)
        self.assertIsNone(report['noProgressSeconds'])

    def test_malformed_status_fields_return_codes_instead_of_crashing(self):
        self.save('batch-runs/tree-a.status.json',
                  {'phase': ['PRIVATE'], 'checkedAtUtc': NOW.isoformat()})
        self.save('batch-runs/observed-stage-handoff.status.json',
                  {'phase': ['PRIVATE'], 'stage': ['PRIVATE'], 'checkedAtUtc': NOW.isoformat()})
        report = self.health()
        self.assertEqual(report['upstreamBlocker']['code'], 'invalid_status')
        self.assertNotIn('PRIVATE', json.dumps(report))

    def test_older_legacy_status_does_not_hide_new_running_batch(self):
        self.save('batch-runs/tree-old.status.json', {'startedAtUtc': '2026-11-19T00:00:00+00:00'})
        self.save('batch-runs/tree-new.status.json',
                  {'phase': 'running', 'startedAtUtc': '2026-11-19T01:00:00+00:00'})
        report = self.health()
        self.assertEqual(report['stages']['tree']['state'], 'running')
        self.assertEqual(report['stages']['tree']['historicalInvalidStatusCount'], 1)

    def test_new_running_batch_keeps_prior_manifest_failure_explicit(self):
        self.save('area-tree-20261119/manifest.json',
                  {'lastError': 'PRIVATE', 'auditedAtUtc': '2026-11-19T00:00:00+00:00'})
        self.save('batch-runs/tree-new.status.json',
                  {'phase': 'running', 'startedAtUtc': '2026-11-19T01:00:00+00:00'})
        report = self.health()
        self.assertEqual(report['stages']['tree']['state'], 'running')
        self.assertEqual(report['stages']['tree']['code'], 'running_prior_manifest_error')
        self.assertTrue(report['stages']['tree']['manifestErrorPresent'])
        self.assertFalse(report['publishable'])

    def test_later_handoff_poll_of_old_manifest_cannot_override_recorded_running(self):
        self.save('area-tree-20261119/manifest.json',
                  {'lastError': 'PRIVATE', 'auditedAtUtc': '2026-11-19T00:00:00+00:00'})
        self.save('batch-runs/tree-new.status.json',
                  {'phase': 'running', 'startedAtUtc': '2026-11-19T01:00:00+00:00'})
        self.save('batch-runs/observed-stage-handoff.status.json',
                  {'phase': 'blocked', 'stage': 'area-tree', 'checkedAtUtc': NOW.isoformat(),
                   'reason': 'upstream area tree failed or rate limited', 'childExitCode': None})
        report = self.health()
        stage = report['stages']['tree']
        self.assertEqual(stage['state'], 'running')
        self.assertEqual(stage['code'], 'running_prior_manifest_error')
        self.assertEqual(stage['statusObservedAtUtc'], '2026-11-19T01:00:00+00:00')
        self.assertEqual(stage['historicalHandoffBlockCount'], 1)
        self.assertEqual(stage['lastHistoricalHandoffBlockAtUtc'], NOW.isoformat())
        self.assertFalse(report['processLivenessVerified'])
        self.assertFalse(report['publishable'])
        self.assertIsNone(report['lastSuccessfulResponseAtUtc'])
        # A later real child failure must still block; this is not a general override.
        self.save('batch-runs/observed-stage-handoff.status.json',
                  {'phase': 'blocked', 'stage': 'area-tree', 'checkedAtUtc': NOW.isoformat(),
                   'reason': 'upstream area tree failed or rate limited', 'childExitCode': 2})
        self.assertEqual(self.health()['stages']['tree']['code'], 'handoff_error')

    def test_handoff_without_running_batch_keeps_failure_visible(self):
        self.save('area-tree-20261119/manifest.json',
                  {'lastError': 'PRIVATE', 'auditedAtUtc': '2026-11-19T00:00:00+00:00'})
        self.save('batch-runs/observed-stage-handoff.status.json',
                  {'phase': 'blocked', 'stage': 'area-tree', 'checkedAtUtc': NOW.isoformat(),
                   'reason': 'upstream area tree failed or rate limited', 'childExitCode': None})
        report = self.health()
        self.assertEqual(report['stages']['tree']['state'], 'blocked')
        self.assertFalse(report['publishable'])

    def test_latest_verified_budget_stop_is_partial_and_old_failure_stays_historical(self):
        self.tree_response()
        run_id = 'tree-20261119-auto-009'
        manifest = {'runId': run_id, 'treeWalkComplete': False, 'rateLimited': False,
                    'lastError': None, 'requestBudgetReached': True, 'requestsThisRun': 20,
                    'savedResponses': 1, 'pendingParentIds': ['pending'],
                    'auditedAtUtc': '2026-11-19T01:44:00+00:00'}
        owned = f'area-tree-20261119/run-manifests/{run_id}.json'
        self.save(owned, manifest)
        self.save('area-tree-20261119/manifest.json', manifest)
        status = {'runId': run_id, 'phase': 'finished', 'exitCode': 1, 'collectorExitCode': 0,
                  'treeWalkComplete': False, 'rateLimited': False, 'lastError': None,
                  'requestBudgetReached': True, 'requestsThisRun': 20, 'savedResponses': 1,
                  'pendingAfter': 1, 'error': 'area tree walk incomplete; see private manifest',
                  'startedAtUtc': '2026-11-19T01:00:00+00:00',
                  'endedAtUtc': '2026-11-19T01:45:00+00:00',
                  'collectorManifestSha256': hashlib.sha256((self.root / owned).read_bytes()).hexdigest()}
        self.save(f'batch-runs/{run_id}.status.json', status)
        self.save('batch-runs/tree-20261119-auto-008.status.json',
                  {'phase': 'finished', 'exitCode': 1, 'collectorExitCode': 1,
                   'startedAtUtc': '2026-11-19T00:00:00+00:00', 'error': 'PRIVATE failure'})
        self.save('batch-runs/observed-stage-handoff.status.json',
                  {'phase': 'blocked', 'stage': 'area-tree',
                   'checkedAtUtc': '2026-11-19T01:30:00+00:00',
                   'reason': 'upstream area tree failed or rate limited'})
        report = self.health()
        tree = report['stages']['tree']
        self.assertEqual(tree['state'], 'partial')
        self.assertEqual(tree['code'], 'request_budget_reached')
        self.assertEqual(tree['historicalFailureCount'], 1)
        self.assertEqual(tree['historicalHandoffBlockCount'], 1)
        self.assertTrue(tree['latestBudgetStopVerified'])
        self.assertFalse(report['publishable'])
        self.assertNotIn('PRIVATE', json.dumps(report))
        # A forged status with a merely plausible hash must not be trusted.
        status['collectorManifestSha256'] = '0' * 64
        self.save(f'batch-runs/{run_id}.status.json', status)
        self.assertEqual(self.health()['stages']['tree']['state'], 'blocked')


if __name__ == '__main__':
    unittest.main()
