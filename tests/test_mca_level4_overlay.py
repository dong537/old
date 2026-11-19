"""Offline behavior tests for immutable MCA fourth-level area seed overlays."""

import base64
from contextlib import redirect_stdout
from io import StringIO
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch


PROJECT = Path(__file__).resolve().parents[1]
PROBE = runpy.run_path(str(PROJECT / 'scripts/probe-mca-level3-children.py'))
OVERLAY = PROJECT / 'scripts/build-mca-level4-overlay-seeds.py'
API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'


def node(identifier, parent, level, name, code):
    return {'id': identifier, 'pid': parent, 'level': level,
            'name': name, 'sbcode': code}


def wrapper(parent, children):
    body = {'code': 0, 'data': children}
    raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
    return {'schemaVersion': 1, 'parentId': parent,
            'sourceUrl': API + parent, 'method': 'GET', 'httpStatus': 200,
            'fetchedAtUtc': '2026-11-19T00:00:00+00:00',
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'responseSha256': hashlib.sha256(raw).hexdigest(), 'response': body}


class Level4OverlayTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(OVERLAY.exists(), 'overlay builder script missing')
        self.module = runpy.run_path(str(OVERLAY))
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'data/private/mca-institutions-2026-11-18'
        self.module['write_overlay'].__globals__['ROOT'] = self.root
        self.tree = self.root / 'area-tree-20261119'
        self.probe = self.root / 'area-level3-probe-20261119'
        self.output = self.root / 'national-area-level4-overlay-seeds.v1.json'
        responses = self.tree / 'responses'
        responses.mkdir(parents=True)
        for parent, children in {
            '-1': [node('province', '-1', 1, '广东省', '440000000000')],
            'province': [node('city', 'province', 2, '广州市', '440100000000')],
            'city': [node('county-a', 'city', 3, '甲区', '440101000000'),
                     node('county-b', 'city', 3, '乙区', None)],
        }.items():
            (responses / f'{parent}.json').write_text(
                json.dumps(wrapper(parent, children), ensure_ascii=False), encoding='utf-8')
        self.tree_manifest = {
            'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-3',
            'maxLevel': 3, 'treeWalkComplete': True, 'rateLimited': False,
            'lastError': None, 'pendingParentIds': [], 'savedResponses': 3,
            'discoveredNodes': 4, 'rootNodes': 1,
            'queryableRootNodes': 1, 'excludedRootNodes': 0,
            'auditedAtUtc': '2026-11-19T00:00:00+00:00',
        }
        self.save_tree_manifest()

    def save_tree_manifest(self):
        (self.tree / 'manifest.json').write_text(
            json.dumps(self.tree_manifest), encoding='utf-8')

    def terminal_probe(self, first=None, second=None):
        if first is None:
            first = [node('town-a', 'county-a', 4, '甲镇', '440101001000'),
                     node('town-gap', 'county-a', 4, '无码镇', None)]
        if second is None:
            second = []
        responses = self.probe / 'responses'
        responses.mkdir(parents=True)
        for parent, children in [('county-a', first), ('county-b', second)]:
            (responses / f'{parent}.json').write_text(
                json.dumps(wrapper(parent, children), ensure_ascii=False), encoding='utf-8')
        plan = PROBE['source_plan'](self.tree)
        cache = PROBE['scan_cache'](plan, self.probe)
        manifest = PROBE['progress'](plan, cache, 1, False)
        (self.probe / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        runs = self.probe / 'batch-runs'
        runs.mkdir()
        status = {
            'schemaVersion': 1, 'batchNumber': 1, 'phase': 'finished',
            'outcome': 'complete', 'sourceFingerprint': plan['sourceFingerprint'],
            'plannedParentCount': len(plan['parents']), 'rateLimited': False,
            'error': None, 'savedResponses': cache['savedResponses'],
            'pendingParents': cache['pendingParents'],
            'responseInventorySha256': cache['responseInventorySha256'],
        }
        (runs / 'batch-0001.status.json').write_text(json.dumps(status), encoding='utf-8')
        return plan, cache

    def test_incomplete_tree_or_missing_probe_is_pending_without_zero_count(self):
        self.tree_manifest['treeWalkComplete'] = False
        self.tree_manifest['pendingParentIds'] = ['city']
        self.save_tree_manifest()
        result = self.module['preflight'](self.tree, self.probe)
        self.assertEqual(result['status'], 'pending')
        self.assertNotIn('level4NodeCount', result)
        self.tree_manifest['treeWalkComplete'] = True
        self.tree_manifest['pendingParentIds'] = []
        self.save_tree_manifest()
        result = self.module['preflight'](self.tree, self.probe)
        self.assertEqual(result['status'], 'pending')
        self.assertNotIn('level4NodeCount', result)
        with redirect_stdout(StringIO()) as output:
            self.assertEqual(self.module['main']([
                '--tree-dir', str(self.tree), '--probe-dir', str(self.probe),
                '--output', str(self.output)]), 0)
        self.assertEqual(json.loads(output.getvalue())['status'], 'pending')
        self.assertFalse(self.output.exists())

    def test_terminal_probe_writes_private_versioned_overlay_without_touching_seed(self):
        plan, cache = self.terminal_probe()
        original = (self.tree / 'responses/city.json').read_bytes()
        old_seed = self.root / 'national-area-tree-seeds-20261119.json'
        old_seed.write_bytes(b'bound original seed')
        document = self.module['write_overlay'](self.tree, self.probe, self.output)
        self.assertEqual((document['seedCount'], document['uncodedNodeCount']), (1, 1))
        self.assertEqual(document['sourceFingerprint'], plan['sourceFingerprint'])
        self.assertEqual(document['sourceResponseInventorySha256'],
                         cache['responseInventorySha256'])
        self.assertFalse(document['publishable'])
        coded = document['seeds'][0]
        self.assertEqual(coded['sbcode'], '440101001000')
        self.assertEqual(coded['officialPathNodeIds'],
                         ['province', 'city', 'county-a', 'town-a'])
        self.assertEqual([part['name'] for part in coded['officialPath']],
                         ['广东省', '广州市', '甲区', '甲镇'])
        self.assertEqual(coded['sourceResponsePath'],
                         'area-level3-probe-20261119/responses/county-a.json')
        self.assertEqual(document['uncodedNodes'][0]['sbcode'], None)
        self.assertTrue(document['uncodedNodes'][0]['coverageReviewRequired'])
        self.assertEqual(old_seed.read_bytes(), b'bound original seed')
        self.assertEqual((self.tree / 'responses/city.json').read_bytes(), original)
        self.assertEqual(json.loads(self.output.read_text(encoding='utf-8')), document)
        with self.assertRaises(FileExistsError):
            self.module['write_overlay'](self.tree, self.probe, self.output)

    def test_tampered_raw_bytes_stop_output(self):
        self.terminal_probe()
        path = self.probe / 'responses/county-a.json'
        damaged = json.loads(path.read_text(encoding='utf-8'))
        damaged['rawBodyBase64'] = base64.b64encode(b'{"code":0,"data":[]}').decode()
        path.write_text(json.dumps(damaged), encoding='utf-8')
        with self.assertRaisesRegex((RuntimeError, ValueError), 'raw response differs|SHA-256'):
            self.module['write_overlay'](self.tree, self.probe, self.output)
        self.assertFalse(self.output.exists())

    def test_duplicate_code_bad_parent_and_wrong_level_stop_output(self):
        self.terminal_probe()
        path = self.probe / 'responses/county-b.json'
        original = path.read_bytes()
        cases = [
            (node('other', 'county-b', 4, '重复代码', '440101001000'), 'overlaps'),
            (node('other', 'wrong-parent', 4, '错父级', '440102001000'), 'pid'),
            (node('other', 'county-b', 5, '越级', '440102001000'), 'level four'),
        ]
        for child, error in cases:
            with self.subTest(child=child):
                path.write_text(json.dumps(wrapper('county-b', [child])), encoding='utf-8')
                with self.assertRaisesRegex((RuntimeError, ValueError), error):
                    self.module['write_overlay'](self.tree, self.probe, self.output)
                self.assertFalse(self.output.exists())
        path.write_bytes(original)

    def test_batch_chain_and_source_fingerprint_drift_stop_output(self):
        self.terminal_probe()
        path = self.probe / 'batch-runs/batch-0001.status.json'
        status = json.loads(path.read_text(encoding='utf-8'))
        status['outcome'] = 'partial'
        path.write_text(json.dumps(status), encoding='utf-8')
        with self.assertRaisesRegex((RuntimeError, ValueError), 'complete|batch'):
            self.module['write_overlay'](self.tree, self.probe, self.output)
        status['outcome'] = 'complete'
        path.write_text(json.dumps(status), encoding='utf-8')
        path = self.probe / 'manifest.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        manifest['sourceFingerprint'] = '0' * 64
        path.write_text(json.dumps(manifest), encoding='utf-8')
        with self.assertRaisesRegex((RuntimeError, ValueError), 'source|fingerprint'):
            self.module['write_overlay'](self.tree, self.probe, self.output)
        self.assertFalse(self.output.exists())

    def test_existing_version_rejects_changed_probe_manifest_hash(self):
        self.terminal_probe()
        self.module['write_overlay'](self.tree, self.probe, self.output)
        original = self.output.read_bytes()
        path = self.probe / 'manifest.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        manifest['auditedAtUtc'] = '2026-11-19T01:00:00+00:00'
        path.write_text(json.dumps(manifest), encoding='utf-8')
        with self.assertRaisesRegex((RuntimeError, FileExistsError), 'source hashes differ'):
            self.module['write_overlay'](self.tree, self.probe, self.output)
        self.assertEqual(self.output.read_bytes(), original)

    def test_zero_level4_requires_terminal_probe_and_nonprivate_output_rejected(self):
        self.terminal_probe(first=[], second=[])
        self.assertEqual(self.module['preflight'](self.tree, self.probe)['level4NodeCount'], 0)
        outside = self.root.parents[2] / 'public/level4.json'
        with self.assertRaisesRegex(ValueError, 'private|beside'):
            self.module['write_overlay'](self.tree, self.probe, outside)
        self.assertFalse(outside.exists())

    def test_public_data_private_alias_is_not_a_trusted_root(self):
        alias = self.root.parents[2] / 'public/data/private/mca-institutions-2026-11-18'
        with self.assertRaisesRegex((ValueError, RuntimeError), 'trusted private root'):
            self.module['write_overlay'](
                alias / self.tree.name, alias / self.probe.name,
                alias / self.output.name)
        self.assertFalse((alias / self.output.name).exists())

    def test_response_change_after_audit_cannot_become_overlay_output(self):
        self.terminal_probe()
        namespace = self.module['write_overlay'].__globals__
        probe_module = namespace['PROBE']
        original_scan = probe_module['scan_cache']
        calls = 0

        def mutate_after_scan(plan, probe):
            nonlocal calls
            cache = original_scan(plan, probe)
            calls += 1
            if calls == 3:
                with (probe / 'responses/county-a.json').open('ab') as response:
                    response.write(b' ')
            return cache

        with patch.dict(probe_module, {'scan_cache': mutate_after_scan}):
            with self.assertRaisesRegex(RuntimeError, 'response inventory changed'):
                self.module['write_overlay'](self.tree, self.probe, self.output)
        self.assertEqual(calls, 3)
        self.assertFalse(self.output.exists())

    def test_tree_change_between_source_and_plan_reads_blocks_preflight(self):
        self.terminal_probe()
        path = self.tree / 'responses/city.json'
        original = path.read_bytes()
        namespace = self.module['preflight'].__globals__
        builder = namespace['BUILDER']
        original_build = builder['build_seeds']
        calls = 0

        def briefly_renamed_source(tree):
            nonlocal calls
            calls += 1
            if calls != 1:
                return original_build(tree)
            changed = json.loads(original)
            changed['response']['data'][0]['name'] = '短暂漂移的甲区'
            raw_body = json.dumps(changed['response'], ensure_ascii=False).encode('utf-8')
            changed['rawBodyBase64'] = base64.b64encode(raw_body).decode('ascii')
            changed['responseSha256'] = hashlib.sha256(raw_body).hexdigest()
            path.write_text(json.dumps(changed, ensure_ascii=False), encoding='utf-8')
            try:
                return original_build(tree)
            finally:
                path.write_bytes(original)

        with patch.dict(builder, {'build_seeds': briefly_renamed_source}):
            with self.assertRaisesRegex(RuntimeError, 'tree source fingerprint differs'):
                self.module['preflight'](self.tree, self.probe)
        self.assertEqual(path.read_bytes(), original)
        self.assertFalse(self.output.exists())

    def test_interrupted_serialization_leaves_no_final_or_temp_file(self):
        self.terminal_probe()

        def interrupt(_document, destination, **_options):
            destination.write('{"partial":')
            raise OSError('interrupted write')

        namespace = self.module['write_overlay'].__globals__
        with patch.object(namespace['json'], 'dump', side_effect=interrupt):
            with self.assertRaisesRegex(OSError, 'interrupted write'):
                self.module['write_overlay'](self.tree, self.probe, self.output)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.root.glob('*.tmp')), [])

    def test_intermediate_batch_inventory_must_match_current_prefix_bytes(self):
        plan, _ = self.terminal_probe()
        status_path = self.probe / 'batch-runs/batch-0001.status.json'
        last = json.loads(status_path.read_text(encoding='utf-8'))
        first_id = plan['parents'][0]['id']
        response_path = self.probe / 'responses' / f'{first_id}.json'
        response_sha = hashlib.sha256(response_path.read_bytes()).digest()
        first_inventory = hashlib.sha256(
            response_path.name.encode('utf-8') + b'\0' + response_sha).hexdigest()
        partial = {**last, 'outcome': 'partial', 'savedResponses': 1,
                   'pendingParents': 1,
                   'responseInventorySha256': first_inventory}
        status_path.write_text(json.dumps(partial), encoding='utf-8')
        final = {**last, 'batchNumber': 2}
        (status_path.parent / 'batch-0002.status.json').write_text(
            json.dumps(final), encoding='utf-8')
        manifest_path = self.probe / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['lastBatchNumber'] = 2
        manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
        self.assertEqual(self.module['preflight'](self.tree, self.probe)['status'], 'ready')
        partial['responseInventorySha256'] = '0' * 64
        status_path.write_text(json.dumps(partial), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'batch response inventory differs'):
            self.module['preflight'](self.tree, self.probe)
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
