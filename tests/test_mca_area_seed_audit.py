"""Offline behavior tests for official area-tree shard seeds."""

import base64
import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'build-mca-area-seeds.py'
API = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'


def node(identifier, parent, level, name, sbcode):
    return {'id': identifier, 'pid': parent, 'level': level,
            'name': name, 'sbcode': sbcode}


class AreaSeedAuditTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.tree = Path(self.temporary.name) / 'area-tree-20261119'
        self.responses = self.tree / 'responses'
        self.responses.mkdir(parents=True)
        self.output = Path(self.temporary.name) / 'national-area-tree-seeds.json'
        self.children = {
            '-1': [node('province', '-1', 1, '广东省', '440000000000'),
                   node('excluded', '-1', 1, '香港特别行政区', None)],
            'province': [node('city', 'province', 2, '广州市', '440100000000'),
                         node('special', 'province', 2, '省直辖县', None)],
            'city': [node('county', 'city', 3, '番禺区', '440113000000')],
            'special': [node('direct', 'special', 3, '直辖县', '449900000000')],
        }
        for parent, children in self.children.items():
            self.write_wrapper(parent, children)
        self.manifest = {
            'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-3',
            'maxLevel': 3, 'treeWalkComplete': True,
            'rateLimited': False, 'lastError': None,
            'pendingParentIds': [], 'savedResponses': 4,
            'discoveredNodes': 6, 'rootNodes': 2,
            'queryableRootNodes': 1, 'excludedRootNodes': 1,
            'sameTimeSnapshotVerified': False,
            'auditedAtUtc': '2026-11-19T00:00:00+00:00',
        }
        self.save_manifest()

    def write_wrapper(self, parent, children):
        body = {'code': 0, 'data': children}
        raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
        wrapper = {
            'schemaVersion': 1, 'parentId': parent, 'sourceUrl': API + parent,
            'method': 'GET', 'httpStatus': 200,
            'fetchedAtUtc': '2026-11-18T23:00:00+00:00',
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'responseSha256': hashlib.sha256(raw).hexdigest(),
            'response': body,
        }
        (self.responses / f'{parent}.json').write_text(
            json.dumps(wrapper, ensure_ascii=False), encoding='utf-8')

    def save_manifest(self):
        (self.tree / 'manifest.json').write_text(
            json.dumps(self.manifest), encoding='utf-8')

    def build(self):
        return self.module['build_seeds'](self.tree)

    def test_complete_tree_preserves_raw_ids_codes_and_direct_hang_flags(self):
        document = self.build()
        self.assertEqual(document['seedCount'], 4)
        self.assertEqual(document['nodeCount'], 6)
        self.assertEqual(document['uncodedNodeCount'], 2)
        seeds = {item['sourceNodeId']: item for item in document['seeds']}
        self.assertEqual(seeds['city']['sourceParentNodeId'], 'province')
        self.assertEqual(seeds['city']['sbcode'], '440100000000')
        self.assertEqual(seeds['city']['rawNode']['id'], 'city')
        self.assertEqual(seeds['city']['rawNode']['pid'], 'province')
        self.assertEqual(seeds['city']['rawNode']['sbcode'], '440100000000')
        self.assertEqual(seeds['county']['sourceParentNodeId'], 'city')
        self.assertEqual(seeds['direct']['sourceParentNodeId'], 'special')
        self.assertEqual(seeds['direct']['officialPathNodeIds'],
                         ['province', 'special', 'direct'])
        self.assertTrue(seeds['direct']['uncodedAncestorReviewRequired'])
        self.assertFalse(seeds['county']['uncodedAncestorReviewRequired'])
        self.assertTrue(seeds['province']['directHangReviewRequired'])
        self.assertTrue(seeds['city']['directHangReviewRequired'])
        self.assertEqual(seeds['city']['directHangStatus'], 'pending_review')
        self.assertFalse(seeds['county']['directHangReviewRequired'])
        self.assertEqual(seeds['county']['directHangStatus'],
                         'child_scope_not_enumerated')
        self.assertIn('special', {item['sourceNodeId'] for item in document['uncodedNodes']})
        self.assertFalse(document['publishable'])
        self.assertFalse(document['snapshotVerified'])

    def test_incomplete_tree_cannot_write_formal_seed_file(self):
        self.manifest['treeWalkComplete'] = False
        self.manifest['pendingParentIds'] = ['city']
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'complete'):
            self.module['write_seeds'](self.tree, self.output)
        self.assertFalse(self.output.exists())

    def test_tampered_response_and_missing_parent_are_rejected(self):
        path = self.responses / 'city.json'
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        wrapper['responseSha256'] = '0' * 64
        path.write_text(json.dumps(wrapper), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            self.build()
        self.write_wrapper('city', self.children['city'])
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            self.build()

    def test_duplicate_code_and_manifest_count_mismatch_are_rejected(self):
        duplicate = node('duplicate', 'special', 3, '重复代码', '440113000000')
        self.write_wrapper('special', [duplicate])
        with self.assertRaisesRegex(ValueError, 'duplicate sbcode'):
            self.build()
        self.write_wrapper('special', self.children['special'])
        self.manifest['discoveredNodes'] = 5
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'node count'):
            self.build()

    def test_cross_parent_duplicate_id_and_extra_response_are_rejected(self):
        self.write_wrapper('special', [
            node('county', 'special', 3, '重名节点', '449900000000')])
        with self.assertRaisesRegex(ValueError, 'duplicate official node ID'):
            self.build()
        self.write_wrapper('special', self.children['special'])
        self.write_wrapper('orphan', [])
        with self.assertRaisesRegex(ValueError, 'extra='):
            self.build()


if __name__ == '__main__':
    unittest.main()
