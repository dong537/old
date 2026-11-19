from pathlib import Path
import runpy, unittest, tempfile, json, hashlib
from datetime import datetime, timezone

PROJECT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT / 'scripts/attest-mca-tree-recovery.py'
RID = 'tree-20261119-auto-008'
PID = '61c11934c4e04524af2b935e81acb580'
BEFORE = '2026-11-19T00:00:00+00:00'
START = '2026-11-19T00:01:00+00:00'
END = '2026-11-19T00:02:00+00:00'
NOW = datetime(2026, 11, 19, 0, 4, tzinfo=timezone.utc)

def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf-8')

def wrapper(parent, level, children, when):
    body = {'code': 0, 'data': [{'id': x, 'pid': parent, 'level': level + 1, 'name': x, 'sbcode': '330500000000'} for x in children]}
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    import base64
    return {'parentId': parent, 'method': 'GET', 'httpStatus': 200, 'sourceUrl': 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/' + parent, 'response': body, 'rawBodyBase64': base64.b64encode(raw).decode(), 'responseSha256': hashlib.sha256(raw).hexdigest(), 'fetchedAtUtc': when}

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.tree = self.root / 'area-tree-20261119'
        self.runs = self.root / 'batch-runs'
        self.diagnostic = self.root / 'diagnostics' / ('area-child-' + PID + '-20261119.json')
        for pid, level, children, when in [('-1', 0, ['province'], BEFORE), ('province', 1, [PID, 'p2', 'p3'], BEFORE), ('p2', 2, [], BEFORE), ('p3', 2, [], START)]:
            put(self.tree / 'responses' / (pid + '.json'), wrapper(pid, level, children, when))
        diag = wrapper(PID, 2, ['child'], '2026-11-19T00:03:00+00:00')
        put(self.diagnostic, diag)
        self.digest = diag['responseSha256']
        self.error = 'ValueError: ' + PID + ': invalid official sbcode'
        self.manifest = {'runId': RID, 'treeWalkComplete': False, 'rateLimited': False, 'requestBudgetReached': False, 'requestsThisRun': 2, 'savedResponses': 4, 'pendingParentIds': [PID], 'lastError': self.error, 'auditedAtUtc': END}
        put(self.tree / 'run-manifests' / (RID + '.json'), self.manifest)
        put(self.tree / 'manifest.json', self.manifest)
        self.status = {'runId': RID, 'priorRunId': 'tree-20261119-auto-007', 'phase': 'finished', 'startedAtUtc': START, 'endedAtUtc': END, 'collectorExitCode': 1, 'exitCode': 1, 'treeWalkComplete': False, 'rateLimited': False, 'requestBudgetReached': False, 'requestsThisRun': 2, 'savedResponsesBefore': 3, 'savedResponses': 4, 'savedResponseDelta': 1, 'pendingAfter': 1, 'lastError': self.error, 'error': 'area tree collector exited 1', 'publishable': False, 'collectorManifestSha256': hashlib.sha256((self.tree / 'manifest.json').read_bytes()).hexdigest()}
        put(self.runs / (RID + '.status.json'), self.status)
        put(self.root / 'hourly-request-budget.json', {'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60, 'requestStartedAtUtc': []})

    def module(self):
        self.assertTrue(SCRIPT.exists(), 'recovery attestation implementation missing')
        module = runpy.run_path(str(SCRIPT))
        module['create_attestation'].__globals__['DIAGNOSTIC_BODY_SHA256'] = self.digest
        return module

    def create(self):
        return self.module()['create_attestation'](self.root, authorization='operator approved bounded retry after reviewed validator fix', now=NOW)

    def test_attestation_preserves_failed_history_and_allows_only_linked_resume(self):
        before = {p: p.read_bytes() for p in self.root.rglob('*.json')}
        record = self.create()
        self.assertEqual(record['failedRunId'], RID)
        self.assertEqual(record['responseCount'], 4)
        self.assertTrue(all(p.read_bytes() == raw for p, raw in before.items()))
        resume = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-resume.py'))
        # Test uses a synthetic diagnostic with its digest explicitly pinned.
        resume['check_preconditions'].__globals__['verify_recovery_attestation'] = self.module()['verify_attestation']
        self.assertEqual(resume['check_preconditions'](self.root, RID, 'tree-20261119-auto-009', NOW)['savedResponses'], 4)

    def test_no_authorization_no_attestation(self):
        with self.assertRaisesRegex(RuntimeError, 'authorization'):
            self.module()['create_attestation'](self.root, authorization='', now=NOW)

    def test_legacy_initial_run_without_phase_does_not_block_recovery(self):
        put(self.runs / 'tree-20261119-a.status.json', {
            'runId': 'tree-20261119-a', 'endedAtUtc': BEFORE,
            'collectorExitCode': 0, 'exitCode': 1,
        })
        self.assertEqual(self.create()['responseCount'], 4)

    def test_diagnostic_drift_and_rate_limit_are_rejected(self):
        module = self.module()
        diag = json.loads(self.diagnostic.read_text()); diag['responseSha256'] = 'f' * 64; put(self.diagnostic, diag)
        with self.assertRaises(RuntimeError):
            module['create_attestation'](self.root, authorization='approved', now=NOW)
        self.status['rateLimited'] = True; put(self.runs / (RID + '.status.json'), self.status)
        with self.assertRaises(RuntimeError):
            module['create_attestation'](self.root, authorization='approved', now=NOW)

    def test_cache_drift_blocks_reuse_but_later_additions_are_allowed(self):
        self.create(); module = self.module()
        put(self.tree / 'responses' / (PID + '.json'), wrapper(PID, 2, ['child'], NOW.isoformat()))
        module['verify_attestation'](self.root, RID, now=NOW)
        path = self.tree / 'responses/p2.json'; path.write_text('{}')
        with self.assertRaises(RuntimeError):
            module['verify_attestation'](self.root, RID, now=NOW)

    def test_status_tampering_and_duplicate_authorization_rejected(self):
        self.create()
        with self.assertRaisesRegex(RuntimeError, 'exists'):
            self.create()
        self.status['requestsThisRun'] = 19; put(self.runs / (RID + '.status.json'), self.status)
        with self.assertRaises(RuntimeError):
            self.module()['verify_attestation'](self.root, RID, now=NOW)

    def test_recovery_requires_original_prior_manifest_and_cache_boundary(self):
        self.status['savedResponsesBefore'] = 2
        self.status['savedResponseDelta'] = 2
        self.status['requestsThisRun'] = 3
        put(self.runs / (RID + '.status.json'), self.status)
        with self.assertRaises(RuntimeError):
            self.create()

    def test_controller_requires_recovery_link_in_following_batch(self):
        self.create()
        auto = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-auto-resume.py'))
        auto['resume_state'].__globals__['ONE_SHOT']['verify_recovery_attestation'] = self.module()['verify_attestation']
        for sequence in range(1, 8):
            put(self.runs / f'tree-20261119-auto-{sequence:03d}.status.json', {
                'runId': f'tree-20261119-auto-{sequence:03d}',
                'priorRunId': 'tree-20261119-a' if sequence == 1 else f'tree-20261119-auto-{sequence-1:03d}',
                'phase': 'finished', 'endedAtUtc': BEFORE, 'exitCode': 1, 'collectorExitCode': 0,
                'treeWalkComplete': False, 'requestBudgetReached': True, 'rateLimited': False, 'lastError': None,
                'collectorManifestSha256': 'a' * 64, 'error': 'area tree walk incomplete; see private manifest'})
        self.assertEqual(auto['resume_state'](self.root, 'tree-20261119-a', 'tree-20261119-auto', 32), (RID, 9, False))
        child = json.loads((self.runs / 'tree-20261119-auto-007.status.json').read_text())
        child.update(runId='tree-20261119-auto-009', priorRunId=RID)
        put(self.runs / 'tree-20261119-auto-009.status.json', child)
        with self.assertRaisesRegex(RuntimeError, 'recovery link'):
            auto['resume_state'](self.root, 'tree-20261119-a', 'tree-20261119-auto', 32)
        child['priorRecoveryAttestationSha256'] = hashlib.sha256((self.runs / (RID + '.recovery.json')).read_bytes()).hexdigest()
        put(self.runs / 'tree-20261119-auto-009.status.json', child)
        self.assertEqual(auto['resume_state'](self.root, 'tree-20261119-a', 'tree-20261119-auto', 32), ('tree-20261119-auto-009', 10, False))

if __name__ == '__main__': unittest.main()

