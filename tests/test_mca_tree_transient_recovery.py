"""Offline regression tests for the exact -017 clock-calibration stop."""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT / 'scripts/attest-mca-tree-transient-recovery.py'
FAILED = 'tree-20261119-auto-017'
PRIOR = 'tree-20261119-auto-016'
NEXT = 'tree-20261119-auto-018'
BEFORE = '2026-11-19T03:30:00+00:00'
START = '2026-11-19T03:53:59+00:00'
END = '2026-11-19T03:55:13+00:00'
NOW = datetime(2026, 11, 19, 4, tzinfo=timezone.utc)
ERROR = 'FetchError: server clock calibration failed: invalid or slow HTTP Date response'

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf-8')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def response(parent, level, children):
    body = {'code': 0, 'data': [
        {'id': child, 'pid': parent, 'level': level + 1,
         'name': child, 'sbcode': '330500000000'} for child in children]}
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True,
                     separators=(',', ':')).encode()
    return {'parentId': parent, 'method': 'GET', 'httpStatus': 200,
            'sourceUrl': 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/' + parent,
            'response': body, 'rawBodyBase64': base64.b64encode(raw).decode(),
            'responseSha256': hashlib.sha256(raw).hexdigest(), 'fetchedAtUtc': BEFORE}

class TransientTreeRecoveryTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.runs = self.root / 'batch-runs'
        self.tree = self.root / 'area-tree-20261119'
        for parent, level, children in [('-1', 0, ['province']),
                                        ('province', 1, ['p2', 'p3']),
                                        ('p2', 2, [])]:
            save(self.tree / 'responses' / (parent + '.json'),
                 response(parent, level, children))
        previous = {'runId': PRIOR, 'treeWalkComplete': False,
                    'rateLimited': False, 'requestBudgetReached': True,
                    'requestsThisRun': 20, 'savedResponses': 3,
                    'pendingParentIds': ['p3'], 'lastError': None,
                    'auditedAtUtc': '2026-11-19T03:53:58+00:00'}
        save(self.tree / 'run-manifests' / (PRIOR + '.json'), previous)
        save(self.runs / (PRIOR + '.status.json'), {
            'runId': PRIOR, 'priorRunId': 'tree-20261119-auto-015',
            'phase': 'finished', 'startedAtUtc': '2026-11-19T03:32:34+00:00',
            'endedAtUtc': '2026-11-19T03:53:58+00:00',
            'collectorExitCode': 0, 'exitCode': 1,
            'treeWalkComplete': False, 'requestBudgetReached': True,
            'requestsThisRun': 20, 'savedResponses': 3,
            'pendingAfter': 1, 'rateLimited': False, 'lastError': None,
            'error': 'area tree walk incomplete; see private manifest',
            'collectorManifestSha256': digest(self.tree / 'run-manifests' / (PRIOR + '.json'))})
        failed = {**previous, 'runId': FAILED,
                  'requestBudgetReached': False, 'requestsThisRun': 1,
                  'lastError': ERROR, 'auditedAtUtc': END}
        save(self.tree / 'run-manifests' / (FAILED + '.json'), failed)
        save(self.tree / 'manifest.json', failed)
        self.log = self.runs / (FAILED + '.log')
        self.log.parent.mkdir(parents=True, exist_ok=True)
        self.log.write_text('Traceback: ServerClock._refresh\n' + ERROR + '\n', encoding='utf-8')
        self.status = {
            'schemaVersion': 1, 'runId': FAILED, 'priorRunId': PRIOR,
            'phase': 'finished', 'startedAtUtc': START, 'endedAtUtc': END,
            'collectorExitCode': 1, 'exitCode': 1,
            'treeWalkComplete': False, 'requestBudgetReached': False,
            'requestsThisRun': 1, 'savedResponses': 3,
            'savedResponsesBefore': 3, 'savedResponseDelta': 0,
            'pendingBefore': 1, 'pendingAfter': 1,
            'rateLimited': False, 'lastError': ERROR,
            'error': 'area tree collector exited 1', 'logPath': str(self.log),
            'publishable': False,
            'collectorManifestSha256': digest(self.tree / 'run-manifests' / (FAILED + '.json')),
            'priorRecoveryAttestationSha256': None}
        save(self.runs / (FAILED + '.status.json'), self.status)
        save(self.root / 'hourly-request-budget.json', {
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [START]})

    def module(self):
        self.assertTrue(SCRIPT.exists(), 'transient recovery attestation missing')
        module = runpy.run_path(str(SCRIPT))
        namespace = module['create_attestation'].__globals__
        namespace['FAILED_STATUS_SHA256'] = digest(self.runs / (FAILED + '.status.json'))
        namespace['FAILED_MANIFEST_SHA256'] = digest(self.tree / 'run-manifests' / (FAILED + '.json'))
        namespace['FAILED_LOG_SHA256'] = digest(self.log)
        return module

    def create(self):
        return self.module()['create_attestation'](
            self.root, authorization='operator reviewed -017 and requested continuation',
            now=NOW)

    def test_exact_failed_batch_is_attested_without_changing_source(self):
        before = {str(path): path.read_bytes() for path in self.root.rglob('*')
                  if path.is_file()}
        saved = self.create()
        self.assertEqual(saved['failedRunId'], FAILED)
        self.assertEqual(saved['responseCount'], 3)
        self.assertEqual(saved['requestsThisRun'], 1)
        self.assertEqual(saved['savedResponseDelta'], 0)
        self.assertEqual({str(path): path.read_bytes() for path in self.root.rglob('*')
                          if path.is_file() and str(path) in before}, before)
        self.module()['verify_attestation'](self.root, FAILED, now=NOW)

    def test_wrong_failure_or_rate_limit_cannot_be_attested(self):
        self.status['lastError'] = 'FetchError: HTTP 429'
        save(self.runs / (FAILED + '.status.json'), self.status)
        with self.assertRaises(RuntimeError):
            self.create()
        self.status['lastError'] = ERROR
        self.status['rateLimited'] = True
        save(self.runs / (FAILED + '.status.json'), self.status)
        with self.assertRaises(RuntimeError):
            self.create()

    def test_no_auth_or_missing_request_ledger_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'authorization'):
            self.module()['create_attestation'](self.root, authorization='', now=NOW)
        (self.root / 'hourly-request-budget.json').unlink()
        with self.assertRaises(RuntimeError):
            self.create()

    def test_active_tree_controller_blocks_attestation(self):
        auto = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-auto-resume.py'))
        with auto['controller_lock'](self.runs):
            with self.assertRaisesRegex(RuntimeError, 'controller'):
                self.create()
        self.assertFalse((self.runs / (FAILED + '.recovery.json')).exists())

    def test_tampering_after_attestation_invalidates_recovery(self):
        self.create()
        (self.tree / 'responses/p2.json').write_text('{}', encoding='utf-8')
        with self.assertRaises(RuntimeError):
            self.module()['verify_attestation'](self.root, FAILED, now=NOW)

    def test_later_response_addition_preserves_frozen_recovery_evidence(self):
        self.create()
        save(self.tree / 'responses/p3.json', response('p3', 2, []))
        self.module()['verify_attestation'](self.root, FAILED, now=NOW)

    def test_resume_preflight_accepts_only_linked_recovery(self):
        self.create()
        resume = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-resume.py'))
        resume['check_preconditions'].__globals__['verify_recovery_attestation'] = (
            self.module()['verify_attestation'])
        self.assertEqual(resume['check_preconditions'](
            self.root, FAILED, NEXT, NOW)['savedResponses'], 3)

    def test_controller_requires_next_batch_recovery_link(self):
        self.create()
        for sequence in range(1, 16):
            run_id = f'tree-20261119-auto-{sequence:03d}'
            prior = ('tree-20261119-a' if sequence == 1 else
                     f'tree-20261119-auto-{sequence-1:03d}')
            save(self.runs / (run_id + '.status.json'), {
                'runId': run_id, 'priorRunId': prior, 'phase': 'finished',
                'endedAtUtc': BEFORE, 'collectorExitCode': 0, 'exitCode': 1,
                'treeWalkComplete': False, 'requestBudgetReached': True,
                'rateLimited': False, 'lastError': None,
                'collectorManifestSha256': 'a' * 64,
                'error': 'area tree walk incomplete; see private manifest'})
        auto = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-auto-resume.py'))
        auto['resume_state'].__globals__['ONE_SHOT']['verify_recovery_attestation'] = (
            self.module()['verify_attestation'])
        self.assertEqual(auto['resume_state'](
            self.root, 'tree-20261119-a', 'tree-20261119-auto', 32),
                         (FAILED, 18, False))
        child = {'runId': NEXT, 'priorRunId': FAILED, 'phase': 'finished',
                 'endedAtUtc': END, 'collectorExitCode': 0, 'exitCode': 1,
                 'treeWalkComplete': False, 'requestBudgetReached': True,
                 'rateLimited': False, 'lastError': None,
                 'collectorManifestSha256': 'a' * 64,
                 'error': 'area tree walk incomplete; see private manifest'}
        save(self.runs / (NEXT + '.status.json'), child)
        with self.assertRaisesRegex(RuntimeError, 'recovery link'):
            auto['resume_state'](self.root, 'tree-20261119-a',
                                 'tree-20261119-auto', 32)
        child['priorRecoveryAttestationSha256'] = digest(
            self.runs / (FAILED + '.recovery.json'))
        save(self.runs / (NEXT + '.status.json'), child)
        self.assertEqual(auto['resume_state'](
            self.root, 'tree-20261119-a', 'tree-20261119-auto', 32),
                         (NEXT, 19, False))

    def test_frozen_inventory_accepts_mixed_case_ids_in_creation_order(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        for parent, level, children in [('-1', 0, ['7a', '7D']),
                                        ('7a', 1, []), ('7D', 1, [])]:
            save(root / 'area-tree-20261119/responses' / (parent + '.json'),
                 response(parent, level, children))
        inventory = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-resume.py'))[
            'response_inventory']
        count, first_sha, _nodes, files = inventory(root, 3, NOW)
        names = [entry['name'] for entry in files]
        self.assertEqual(names, sorted(names, key=str.casefold))
        repeated, second_sha, _nodes, _files = inventory(root, 3, NOW, files)
        self.assertEqual((repeated, second_sha), (count, first_sha))

    def test_live_preflight_accepts_frozen_mixed_case_cache_names(self):
        cached = self.tree / 'responses'
        (cached / 'p2.json').unlink()
        save(cached / 'province.json', response('province', 1,
                                                ['7a', '7D', 'p3']))
        save(cached / '7a.json', response('7a', 2, []))
        save(cached / '7D.json', response('7D', 2, []))
        for run_id in (PRIOR, FAILED):
            manifest_path = self.tree / 'run-manifests' / (run_id + '.json')
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            manifest['savedResponses'] = 4
            save(manifest_path, manifest)
            if run_id == FAILED:
                save(self.tree / 'manifest.json', manifest)
        prior_path = self.runs / (PRIOR + '.status.json')
        prior = json.loads(prior_path.read_text(encoding='utf-8'))
        prior['savedResponses'] = 4
        prior['collectorManifestSha256'] = digest(
            self.tree / 'run-manifests' / (PRIOR + '.json'))
        save(prior_path, prior)
        self.status['savedResponses'] = 4
        self.status['savedResponsesBefore'] = 4
        self.status['collectorManifestSha256'] = digest(
            self.tree / 'run-manifests' / (FAILED + '.json'))
        save(self.runs / (FAILED + '.status.json'), self.status)
        self.create()
        resume = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-resume.py'))
        resume['check_preconditions'].__globals__['verify_recovery_attestation'] = (
            self.module()['verify_attestation'])
        self.assertEqual(resume['check_preconditions'](
            self.root, FAILED, NEXT, NOW)['savedResponses'], 4)

if __name__ == '__main__':
    unittest.main()
