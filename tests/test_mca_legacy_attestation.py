"""Offline migration checks for exactly one pre-ownership tree batch."""

import base64
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import hashlib
from io import StringIO
import json
from pathlib import Path
import runpy
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[1]
ONE_SHOT = PROJECT / 'scripts' / 'run-mca-tree-resume.py'
AUTO = PROJECT / 'scripts' / 'run-mca-tree-auto-resume.py'
CLI = PROJECT / 'scripts' / 'attest-mca-tree-auto-001.py'
LEGACY_ID = 'tree-20261119-auto-001'
API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'


class LegacyTreeAttestationTests(unittest.TestCase):
    def setUp(self):
        self.one_shot = runpy.run_path(str(ONE_SHOT))
        self.auto = runpy.run_path(str(AUTO))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.tree = self.root / 'area-tree-20261119'
        self.responses = self.tree / 'responses'
        self.responses.mkdir(parents=True)
        self.runs = self.root / 'batch-runs'
        self.runs.mkdir()
        now = datetime.now(timezone.utc)
        self.started = now - timedelta(minutes=5)
        self.audit = now - timedelta(minutes=2)
        self.ended = now - timedelta(minutes=1)
        self.request_at = now - timedelta(minutes=3)
        self.status = {
            'schemaVersion': 1, 'runId': LEGACY_ID,
            'priorRunId': 'tree-20261119-a', 'phase': 'finished',
            'startedAtUtc': self.started.isoformat(),
            'endedAtUtc': self.ended.isoformat(),
            'collectorExitCode': 0, 'exitCode': 1,
            'treeWalkComplete': False, 'requestBudgetReached': True,
            'requestsThisRun': 1, 'savedResponsesBefore': 1,
            'savedResponses': 2, 'savedResponseDelta': 1,
            'pendingBefore': 1, 'pendingAfter': 1,
            'rateLimited': False, 'lastError': None,
            'error': 'area tree walk incomplete; see private manifest',
            'publishable': False,
        }
        self.manifest = {
            'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-3',
            'maxLevel': 3, 'treeWalkComplete': False,
            'requestBudget': 20,
            'requestBudgetReached': True, 'requestsThisRun': 1,
            'savedResponses': 2, 'discoveredNodes': 2,
            'rootNodes': 1, 'queryableRootNodes': 1,
            'excludedRootNodes': 0, 'pendingParentIds': ['c'],
            'rateLimited': False, 'lastError': None,
            'auditedAtUtc': self.audit.isoformat(),
        }
        self.write_wrapper('-1', [{
            'id': 'p', 'pid': '-1', 'level': 1,
            'name': '北京', 'sbcode': '110000000000',
        }])
        self.write_wrapper('p', [{
            'id': 'c', 'pid': 'p', 'level': 2,
            'name': '东城', 'sbcode': '110101000000',
        }])
        self.save()
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [self.request_at.isoformat()],
        }), encoding='utf-8')

    def write_wrapper(self, parent, children):
        body = {'code': 0, 'data': children}
        raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
        wrapper = {
            'schemaVersion': 1, 'parentId': parent,
            'sourceUrl': API + parent, 'method': 'GET',
            'httpStatus': 200, 'fetchedAtUtc': self.request_at.isoformat(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'responseSha256': hashlib.sha256(raw).hexdigest(),
            'response': body,
        }
        (self.responses / f'{parent}.json').write_text(
            json.dumps(wrapper, ensure_ascii=False), encoding='utf-8')

    def save(self):
        (self.runs / f'{LEGACY_ID}.status.json').write_text(
            json.dumps(self.status), encoding='utf-8')
        (self.tree / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')

    def attest(self):
        return self.one_shot['create_legacy_attestation'](self.root)

    def test_valid_legacy_batch_gets_sidecar_without_rewriting_sources(self):
        status_path = self.runs / f'{LEGACY_ID}.status.json'
        manifest_path = self.tree / 'manifest.json'
        before = (status_path.read_bytes(), manifest_path.read_bytes())
        document = self.attest()
        after = (status_path.read_bytes(), manifest_path.read_bytes())
        self.assertEqual(before, after)
        self.assertEqual(document['runId'], LEGACY_ID)
        self.assertEqual(document['responseCount'], 2)
        self.assertTrue((self.runs / f'{LEGACY_ID}.attestation.json').exists())
        self.assertEqual(self.auto['resume_state'](
            self.root, 'tree-20261119-a', 'tree-20261119-auto', 32),
            (LEGACY_ID, 2, False))
        accepted = self.one_shot['check_preconditions'](
            self.root, LEGACY_ID, 'tree-20261119-auto-002',
            datetime.now(timezone.utc))
        self.assertEqual(accepted['savedResponses'], 2)

    def test_cli_attests_fixed_legacy_batch_offline(self):
        command = runpy.run_path(str(CLI))
        output = StringIO()
        with redirect_stdout(output):
            result = command['main'](['--root', str(self.root)])
        self.assertEqual(result, 0)
        summary = json.loads(output.getvalue())
        self.assertEqual(summary['runId'], LEGACY_ID)
        self.assertEqual(summary['responseCount'], 2)

    def test_attestation_rejects_tampered_response_and_missing_ledger(self):
        path = self.responses / 'p.json'
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        wrapper['responseSha256'] = '0' * 64
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'response'):
            self.attest()
        self.assertFalse((self.runs / f'{LEGACY_ID}.attestation.json').exists())
        self.write_wrapper('p', [{
            'id': 'c', 'pid': 'p', 'level': 2,
            'name': '东城', 'sbcode': '110101000000',
        }])
        (self.root / 'hourly-request-budget.json').unlink()
        with self.assertRaisesRegex(RuntimeError, 'ledger'):
            self.attest()

    def test_sidecar_is_one_time_and_survives_later_batch_changes(self):
        document = self.attest()
        self.assertEqual(document['schemaVersion'], 2)
        self.assertIn('frozenManifestBase64', document)
        self.assertIn('frozenLedgerBase64', document)
        self.assertEqual(len(document['responseFiles']), 2)
        with self.assertRaisesRegex(RuntimeError, 'already exists'):
            self.attest()
        self.manifest['savedResponses'] = 3
        (self.tree / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')
        self.write_wrapper('c', [])
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [datetime.now(timezone.utc).isoformat()],
        }), encoding='utf-8')
        self.assertEqual(self.auto['resume_state'](
            self.root, 'tree-20261119-a', 'tree-20261119-auto', 32),
            (LEGACY_ID, 2, False))
        self.assertEqual(self.one_shot['verify_legacy_attestation'](self.root),
                         document)
        document['responseFiles'][1]['sha256'] = '0' * 64
        (self.runs / f'{LEGACY_ID}.attestation.json').write_text(
            json.dumps(document), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'attestation'):
            self.auto['resume_state'](
                self.root, 'tree-20261119-a', 'tree-20261119-auto', 32)

    def test_restart_after_second_batch_keeps_legacy_evidence_valid(self):
        self.attest()
        second_id = 'tree-20261119-auto-002'
        self.write_wrapper('c', [])
        now = datetime.now(timezone.utc)
        started = now - timedelta(seconds=50)
        ended = now - timedelta(seconds=20)
        self.manifest.update({
            'runId': second_id, 'savedResponses': 3,
            'requestsThisRun': 1, 'pendingParentIds': ['d'],
            'auditedAtUtc': (now - timedelta(seconds=30)).isoformat(),
        })
        raw_manifest = json.dumps(self.manifest).encode('utf-8')
        (self.tree / 'manifest.json').write_bytes(raw_manifest)
        owned = self.tree / 'run-manifests'
        owned.mkdir()
        (owned / f'{second_id}.json').write_bytes(raw_manifest)
        second_status = {
            **self.status, 'runId': second_id, 'priorRunId': LEGACY_ID,
            'startedAtUtc': started.isoformat(),
            'endedAtUtc': ended.isoformat(),
            'requestsThisRun': 1, 'savedResponsesBefore': 2,
            'savedResponses': 3, 'savedResponseDelta': 1,
            'collectorManifestSha256': hashlib.sha256(raw_manifest).hexdigest(),
        }
        (self.runs / f'{second_id}.status.json').write_text(
            json.dumps(second_status), encoding='utf-8')
        self.assertEqual(self.auto['resume_state'](
            self.root, 'tree-20261119-a', 'tree-20261119-auto', 32),
            (second_id, 3, False))
        accepted = self.one_shot['check_preconditions'](
            self.root, second_id, 'tree-20261119-auto-003', now)
        self.assertEqual(accepted['savedResponses'], 3)

    def test_existing_v1_sidecar_uses_frozen_archives_after_ledger_rolls(self):
        document = self.attest()
        sidecar = self.runs / f'{LEGACY_ID}.attestation.json'
        old_document = {key: value for key, value in document.items()
                        if key not in ('frozenManifestBase64',
                                       'frozenLedgerBase64', 'responseFiles')}
        old_document['schemaVersion'] = 1
        sidecar.write_text(json.dumps(old_document), encoding='utf-8')
        (self.runs / f'{LEGACY_ID}.attestation.manifest.json').write_bytes(
            base64.b64decode(document['frozenManifestBase64']))
        inventory = {
            'schemaVersion': 1,
            'sourceAttestationSha256': hashlib.sha256(sidecar.read_bytes()).hexdigest(),
            'responseFiles': document['responseFiles'],
        }
        archive = self.runs / f'{LEGACY_ID}.attestation.responses.json'
        archive.write_text(json.dumps(inventory), encoding='utf-8')
        self.manifest['savedResponses'] = 3
        (self.tree / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')
        self.write_wrapper('c', [])
        (self.root / 'hourly-request-budget.json').write_text(
            '{}', encoding='utf-8')
        self.assertEqual(self.one_shot['verify_legacy_attestation'](self.root),
                         old_document)
        inventory['responseFiles'][1]['sha256'] = '0' * 64
        archive.write_text(json.dumps(inventory), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'frozen response hash'):
            self.one_shot['verify_legacy_attestation'](self.root)


if __name__ == '__main__':
    unittest.main()
