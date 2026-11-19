"""Offline behavior tests for a separate, bounded level-three child probe."""

import base64
import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


PROJECT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT / 'scripts' / 'probe-mca-level3-children.py'
API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'


def node(identifier, parent, level, name, code):
    return {'id': identifier, 'pid': parent, 'level': level,
            'name': name, 'sbcode': code}


def wrapper(parent, children, level=None):
    body = {'code': 0, 'data': children}
    raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
    return {'schemaVersion': 1, 'parentId': parent,
            'sourceUrl': API + parent, 'method': 'GET',
            'httpStatus': 200, 'fetchedAtUtc': '2026-11-19T00:00:00+00:00',
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'responseSha256': hashlib.sha256(raw).hexdigest(),
            'response': body}


class Level3ProbeTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.tree = self.root / 'area-tree-20261119'
        self.probe = self.root / 'area-level3-probe-20261119'
        responses = self.tree / 'responses'
        responses.mkdir(parents=True)
        children = {
            '-1': [node('province', '-1', 1, '广东省', '440000000000')],
            'province': [node('city', 'province', 2, '广州市', '440100000000')],
            'city': [node('county-a', 'city', 3, '甲区', '440101000000'),
                     node('county-b', 'city', 3, '乙区', '440102000000')],
        }
        for parent, rows in children.items():
            (responses / f'{parent}.json').write_text(
                json.dumps(wrapper(parent, rows), ensure_ascii=False), encoding='utf-8')
        self.manifest = {'schemaVersion': 1,
                         'scope': 'coded-mainland-roots-through-level-3',
                         'maxLevel': 3, 'treeWalkComplete': True,
                         'rateLimited': False, 'lastError': None,
                         'pendingParentIds': [], 'savedResponses': 3,
                         'discoveredNodes': 4, 'rootNodes': 1,
                         'queryableRootNodes': 1, 'excludedRootNodes': 0,
                         'auditedAtUtc': '2026-11-19T00:00:00+00:00'}
        self.save_manifest()
        runs = self.root / 'batch-runs'
        runs.mkdir()
        (runs / 'stage-handoff.status.json').write_text(
            json.dumps({'phase': 'finished', 'firstPageExitCode': 0}), encoding='utf-8')
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')

    def save_manifest(self):
        (self.tree / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')

    @staticmethod
    def limiter():
        class Flag:
            @staticmethod
            def is_set():
                return False
        return SimpleNamespace(requests_started=0, exhausted=Flag(), blocked=Flag(),
                               block_reason=None, cooldown_until_utc=None)

    def fetcher(self, calls):
        def fetch(parent, limiter, timeout):
            calls.append(parent)
            limiter.requests_started += 1
            children = ([node('town', 'county-a', 4, '甲镇', '440101001000')]
                        if parent == 'county-a' else [])
            return wrapper(parent, children)
        return fetch

    def run_batch(self, number, calls, *, max_parents=20, fetch=None):
        return self.module['run_batch'](
            self.root, self.tree, self.probe, number, self.limiter(),
            fetch=fetch or self.fetcher(calls), max_parents=max_parents,
            timeout=1)

    def test_incomplete_source_tree_rejects_without_creating_probe(self):
        self.manifest['treeWalkComplete'] = False
        self.manifest['pendingParentIds'] = ['city']
        self.save_manifest()
        calls = []
        with self.assertRaisesRegex(ValueError, 'complete'):
            self.run_batch(1, calls)
        self.assertEqual(calls, [])
        self.assertFalse(self.probe.exists())

    def test_level3_children_are_checkpointed_in_separate_resumable_batches(self):
        original = (self.tree / 'responses' / 'city.json').read_bytes()
        calls = []
        first = self.run_batch(1, calls, max_parents=1)
        self.assertEqual(first['outcome'], 'partial')
        self.assertEqual(first['pendingParents'], 1)
        self.assertEqual(calls, ['county-a'])
        second = self.run_batch(2, calls, max_parents=1)
        self.assertEqual(second['outcome'], 'complete')
        self.assertEqual(second['pendingParents'], 0)
        self.assertEqual(calls, ['county-a', 'county-b'])
        summary = json.loads((self.probe / 'manifest.json').read_text(encoding='utf-8'))
        self.assertTrue(summary['allLevel3ChildrenEnumerated'])
        self.assertEqual(summary['level4NodeCount'], 1)
        self.assertEqual(summary['parentsWithChildren'], 1)
        self.assertFalse(summary['level4TerminalVerified'])
        self.assertFalse(summary['publishable'])
        self.assertEqual((self.tree / 'responses' / 'city.json').read_bytes(), original)
        self.assertEqual(len(list((self.probe / 'responses').glob('*.json'))), 2)

    def test_deeper_than_level4_response_blocks_and_does_not_cache(self):
        calls = []
        def bad_fetch(parent, limiter, timeout):
            calls.append(parent)
            return wrapper(parent, [node('too-deep', parent, 5, '越级', '440101001001')])
        status = self.run_batch(1, calls, fetch=bad_fetch)
        self.assertEqual(status['outcome'], 'blocked')
        self.assertEqual(calls, ['county-a'])
        self.assertEqual(list((self.probe / 'responses').glob('*.json')), [])
        with self.assertRaisesRegex(RuntimeError, 'blocked'):
            self.run_batch(2, calls)
        self.assertEqual(calls, ['county-a'])

    def test_level4_code_cannot_duplicate_a_source_tree_code(self):
        calls = []
        def duplicate_code(parent, limiter, timeout):
            calls.append(parent)
            return wrapper(parent, [node('town', parent, 4, '重复区码',
                                         '440101000000')])
        status = self.run_batch(1, calls, fetch=duplicate_code, max_parents=1)
        self.assertEqual(status['outcome'], 'blocked')
        self.assertIn('code', status['error'])
        self.assertEqual(calls, ['county-a'])

    def test_source_drift_and_tampered_cache_block_resume(self):
        calls = []
        self.run_batch(1, calls, max_parents=1)
        path = self.probe / 'responses' / 'county-a.json'
        original = path.read_bytes()
        path.write_bytes(original + b' ')
        with self.assertRaisesRegex(RuntimeError, 'inventory'):
            self.run_batch(2, calls)
        path.write_bytes(original)
        changed = json.loads((self.tree / 'responses' / 'city.json').read_text(encoding='utf-8'))
        changed['fetchedAtUtc'] = '2026-11-19T01:00:00+00:00'
        (self.tree / 'responses' / 'city.json').write_text(
            json.dumps(changed, ensure_ascii=False), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'source'):
            self.run_batch(2, calls)
        self.assertEqual(calls, ['county-a'])

    def test_running_handoff_and_running_prior_batch_block_requests(self):
        calls = []
        handoff = self.root / 'batch-runs' / 'stage-handoff.status.json'
        handoff.write_text(json.dumps({'phase': 'running'}), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'handoff'):
            self.run_batch(1, calls)
        handoff.write_text(json.dumps({'phase': 'finished', 'firstPageExitCode': 0}),
                           encoding='utf-8')
        self.run_batch(1, calls, max_parents=1)
        status = self.probe / 'batch-runs' / 'batch-0001.status.json'
        value = json.loads(status.read_text(encoding='utf-8'))
        value['phase'] = 'running'
        status.write_text(json.dumps(value), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unfinished'):
            self.run_batch(2, calls)
        self.assertEqual(calls, ['county-a'])

    def test_tree_and_first_page_controller_locks_prevent_interleaving(self):
        calls = []
        with self.module['TREE_AUTO']['controller_lock'](self.root / 'batch-runs'):
            with self.assertRaisesRegex(RuntimeError, 'controller'):
                self.run_batch(1, calls)
        with self.module['CORE']['exclusive_run_lock'](self.root):
            with self.assertRaisesRegex(self.module['CORE']['FetchError'], 'collector'):
                self.run_batch(1, calls)
        self.assertEqual(calls, [])
        self.assertFalse(self.probe.exists())


if __name__ == '__main__':
    unittest.main()
