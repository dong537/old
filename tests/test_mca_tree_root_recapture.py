"""Offline behavior tests for independent MCA root HTTP recapture."""

import base64
import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


PROJECT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT / 'scripts' / 'recapture-mca-tree-roots.py'
API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'


def node(identifier, parent, level, name, code):
    return {'id': identifier, 'pid': parent, 'level': level,
            'name': name, 'sbcode': code}


def raw_wrapper(parent, children):
    body = {'code': 0, 'data': children}
    raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
    return {'schemaVersion': 1, 'parentId': parent,
            'sourceUrl': API + parent, 'method': 'GET',
            'httpStatus': 200, 'fetchedAtUtc': '2026-11-18T22:00:00+00:00',
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'responseSha256': hashlib.sha256(raw).hexdigest(),
            'response': body}


class RootRecaptureTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.tree = self.root / 'area-tree-20261119'
        self.output = self.root / 'area-root-http-recapture-20261119'
        self.seed = self.root / 'locked-seed.json'
        self.children = {
            '-1': [node('gd', '-1', 1, '广东省', '440000000000')],
            'gd': [node('gz', 'gd', 2, '广州市', '440100000000')],
            'gz': [node('py', 'gz', 3, '番禺区', '440113000000')],
        }
        seed = {'requestedAt': '2026-11-18T20:10:21+08:00',
                'source': 'https://yanglao.mca.gov.cn/?#/index/institutionList',
                'requests': [
                    {'path': '/console/area/childs/' + parent, 'httpStatus': 200,
                     'body': {'code': 0, 'data': self.children[parent]}}
                    for parent in ('-1', 'gd')]}
        self.seed.write_text(json.dumps(seed, ensure_ascii=False), encoding='utf-8')
        self.seed_sha = hashlib.sha256(self.seed.read_bytes()).hexdigest()
        area = runpy.run_path(str(PROJECT / 'scripts/fetch-mca-area-tree.py'))
        locked, _ = area['cached_seed_wrappers'](self.seed, self.seed_sha)
        response_dir = self.tree / 'responses'
        response_dir.mkdir(parents=True)
        for parent in ('-1', 'gd'):
            (response_dir / f'{parent}.json').write_text(
                json.dumps(locked[parent], ensure_ascii=False), encoding='utf-8')
        (response_dir / 'gz.json').write_text(
            json.dumps(raw_wrapper('gz', self.children['gz']), ensure_ascii=False),
            encoding='utf-8')
        self.manifest = {
            'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-3',
            'maxLevel': 3, 'treeWalkComplete': True, 'rateLimited': False,
            'lastError': None, 'pendingParentIds': [],
            'savedResponses': 3, 'discoveredNodes': 3, 'rootNodes': 1,
            'queryableRootNodes': 1, 'excludedRootNodes': 0,
            'auditedAtUtc': '2026-11-18T22:00:00+00:00'}
        self.save_manifest()
        (self.root / 'batch-runs').mkdir()
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
            def __init__(self):
                self.value = False
            def is_set(self):
                return self.value
            def set(self):
                self.value = True
        return SimpleNamespace(requests_started=0, exhausted=Flag(),
                               blocked=Flag(), block_reason=None,
                               cooldown_until_utc=None)

    def fetcher(self, calls, *, responses=None, raise_at=None, limiter=None):
        responses = responses or self.children
        def fetch(parent, _limiter, _timeout):
            calls.append(parent)
            _limiter.requests_started += 1
            if parent == raise_at:
                _limiter.blocked.set()
                _limiter.block_reason = 'HTTP 429'
                _limiter.cooldown_until_utc = '2099-01-01T00:00:00+00:00'
                raise self.module['CORE']['FetchError']('HTTP 429')
            return raw_wrapper(parent, responses[parent])
        return fetch

    def run_batch(self, number, calls, *, fetch=None, limiter=None):
        limiter = limiter or self.limiter()
        return self.module['run_batch'](
            self.root, self.tree, self.output, self.seed, self.seed_sha,
            number, limiter, fetch=fetch or self.fetcher(calls), timeout=1)

    def test_default_preflight_is_read_only_and_incomplete_tree_blocks(self):
        self.manifest['treeWalkComplete'] = False
        self.manifest['pendingParentIds'] = ['gz']
        self.save_manifest()
        report = self.module['offline_preflight'](
            self.root, self.tree, self.output, self.seed, self.seed_sha)
        self.assertFalse(report['ready'])
        self.assertFalse(self.output.exists())
        calls = []
        with self.assertRaisesRegex(ValueError, 'complete'):
            self.run_batch(1, calls)
        self.assertEqual(calls, [])
        self.assertFalse(self.output.exists())

    def test_two_reproduced_payloads_are_saved_without_overwriting_seeds(self):
        original = {parent: (self.tree / 'responses' / f'{parent}.json').read_bytes()
                    for parent in ('-1', 'gd')}
        calls = []
        status = self.run_batch(1, calls)
        self.assertEqual(status['outcome'], 'complete')
        self.assertEqual(calls, ['-1', 'gd'])
        report = self.module['offline_preflight'](
            self.root, self.tree, self.output, self.seed, self.seed_sha)
        self.assertTrue(report['currentReproductionMatchesLockedPayload'])
        self.assertFalse(report['originalHttpBodyVerified'])
        self.assertFalse(report['publishable'])
        for parent in ('-1', 'gd'):
            self.assertEqual((self.tree / 'responses' / f'{parent}.json').read_bytes(),
                             original[parent])
            new = json.loads((self.output / 'responses' / f'{parent}.json')
                             .read_text(encoding='utf-8'))
            self.assertTrue(new['rawBodyBase64'])
        with self.assertRaisesRegex(RuntimeError, 'complete'):
            self.run_batch(2, calls)
        self.assertEqual(calls, ['-1', 'gd'])

    def test_clean_budget_stop_resumes_at_remaining_root(self):
        calls = []
        limiter = self.limiter()
        base_fetch = self.fetcher(calls)

        def one_then_stop(parent, active_limiter, timeout):
            wrapper = base_fetch(parent, active_limiter, timeout)
            active_limiter.exhausted.set()
            return wrapper

        first = self.run_batch(1, calls, limiter=limiter, fetch=one_then_stop)
        self.assertEqual(first['outcome'], 'partial')
        self.assertEqual(first['pendingParentIds'], ['gd'])
        second = self.run_batch(2, calls)
        self.assertEqual(second['outcome'], 'complete')
        self.assertEqual(calls, ['-1', 'gd'])

    def test_root_node_drift_is_preserved_and_blocks_second_request(self):
        calls = []
        changed = dict(self.children)
        changed['-1'] = [*self.children['-1'],
                         node('new', '-1', 1, '新增省', '999900000000')]
        status = self.run_batch(1, calls, fetch=self.fetcher(calls, responses=changed))
        self.assertEqual(status['outcome'], 'drift')
        self.assertEqual(calls, ['-1'])
        self.assertEqual(status['driftParents'], ['-1'])
        self.assertEqual(status['comparisons']['-1']['addedIds'], ['new'])
        self.assertTrue((self.output / 'responses/-1.json').exists())
        self.assertFalse((self.output / 'responses/gd.json').exists())
        with self.assertRaisesRegex(RuntimeError, 'drift'):
            self.run_batch(2, calls)

    def test_429_stops_and_persists_site_cooldown(self):
        calls = []
        limiter = self.limiter()
        status = self.run_batch(1, calls, limiter=limiter,
                                fetch=self.fetcher(calls, raise_at='-1'))
        self.assertEqual(status['outcome'], 'blocked')
        self.assertTrue(status['rateLimited'])
        self.assertEqual(calls, ['-1'])
        self.assertEqual(list((self.output / 'responses').glob('*.json')), [])
        cooldown = json.loads((self.root / 'rate-limit.json').read_text(encoding='utf-8'))
        self.assertIn('429', cooldown['reason'])
        report = self.module['offline_preflight'](
            self.root, self.tree, self.output, self.seed, self.seed_sha)
        self.assertFalse(report['ready'])
        self.assertIn('blocked', report['reason'])
        with self.assertRaisesRegex(RuntimeError, 'blocked'):
            self.run_batch(2, calls)

    def test_invalid_seed_and_tampered_prior_cache_block_before_request(self):
        calls = []
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            self.module['run_batch'](
                self.root, self.tree, self.output, self.seed, '0' * 64,
                1, self.limiter(), fetch=self.fetcher(calls), timeout=1)
        self.assertEqual(calls, [])
        self.run_batch(1, calls)
        path = self.output / 'responses/-1.json'
        path.write_bytes(path.read_bytes() + b' ')
        with self.assertRaisesRegex(RuntimeError, 'inventory'):
            self.run_batch(2, calls)
        self.assertEqual(calls, ['-1', 'gd'])

    def test_shared_locks_block_interleaving(self):
        calls = []
        with self.module['TREE_AUTO']['controller_lock'](self.root / 'batch-runs'):
            with self.assertRaisesRegex(RuntimeError, 'controller'):
                self.run_batch(1, calls)
        with self.module['CORE']['exclusive_run_lock'](self.root):
            with self.assertRaisesRegex(self.module['CORE']['FetchError'], 'collector'):
                self.run_batch(1, calls)
        self.assertEqual(calls, [])
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
