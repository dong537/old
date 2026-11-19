"""Offline regression for one evidenced MCA source-code anomaly."""

import base64
import copy
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPERS = runpy.run_path(str(ROOT / 'tests/test_mca_area_tree.py'))
PARENT = '61c11934c4e04524af2b935e81acb580'
CHILD = {
    'id': '05a899fd428f4716a0aa96623c7527f9', 'pid': PARENT,
    'name': '南太湖新区', 'level': 3, 'sbcode': '33055200000',
    'code': '05a899fd428f4716a0aa96623c7527f9:330524000000',
    'pathName': '民政部(全国):浙江省:湖州市:南太湖新区',
}
RAW_SHA = '0dd6d5d80e1708b13f46c6823903a99affa7af813452ff9a5843223063881559'


class InvalidAreaCodeTests(unittest.TestCase):
    def setUp(self):
        self.area = HELPERS['collector']()

    def test_exact_known_node_preserves_raw_response(self):
        wrapper = HELPERS['live_wrapper'](PARENT, [CHILD])
        original = copy.deepcopy(wrapper)
        self.assertEqual(self.area['checked_response'](wrapper, PARENT, 2), [CHILD])
        self.assertEqual(wrapper, original)

    def test_private_diagnostic_original_bytes_hash_and_relationship(self):
        path = ROOT / 'data/private/mca-institutions-2026-11-18/diagnostics' / (
            f'area-child-{PARENT}-20261119.json')
        if not path.exists():
            self.skipTest('private diagnostic is intentionally not committed')
        wrapper = json.loads(path.read_bytes())
        raw = base64.b64decode(wrapper['rawBodyBase64'], validate=True)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), RAW_SHA)
        self.assertEqual(wrapper['responseSha256'], RAW_SHA)
        self.assertEqual(json.loads(raw), wrapper['response'])
        children = self.area['checked_response'](wrapper, PARENT, 2)
        self.assertEqual(len(children), 10)
        self.assertEqual([c for c in children if c['id'] == CHILD['id']], [CHILD])
        self.assertTrue(all(c['pid'] == PARENT for c in children))

    def test_other_malformed_codes_and_changed_identity_still_block(self):
        for field, value in [('id', 'different'), ('pid', 'different'),
                             ('name', 'different'), ('level', 4),
                             ('sbcode', '3305520000'), ('sbcode', 33055200000),
                             ('code', 'different'), ('pathName', 'different')]:
            with self.subTest(field=field, value=value):
                child = {**CHILD, field: value}
                wrapper = HELPERS['live_wrapper'](PARENT, [child])
                with self.assertRaises(ValueError):
                    self.area['checked_response'](wrapper, PARENT, 2)

    def test_known_identity_does_not_bypass_raw_or_parent_validation(self):
        wrapper = HELPERS['live_wrapper'](PARENT, [CHILD])
        wrapper['responseSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            self.area['checked_response'](wrapper, PARENT, 2)
        with self.assertRaisesRegex(ValueError, 'level'):
            self.area['checked_response'](HELPERS['live_wrapper'](PARENT, [CHILD]), PARENT, 3)
        with self.assertRaisesRegex(ValueError, 'sbcode'):
            self.area['checked_response'](HELPERS['live_wrapper'](PARENT, [CHILD]), PARENT, 1)

    def test_source_corrected_code_uses_normal_path_without_quarantine(self):
        # An arbitrary valid code tests format behavior, not a suggested repair.
        corrected = {**CHILD, 'sbcode': '123456789012'}
        wrapper = HELPERS['live_wrapper'](PARENT, [corrected])
        self.assertEqual(self.area['checked_response'](wrapper, PARENT, 2), [corrected])
        self.assertFalse(self.area['known_invalid_code'](corrected))

    def test_tree_continues_and_seeds_and_probe_preserve_explicit_gap(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed = root / 'seed.json'
            digest = HELPERS['write_seed'](seed)
            output = root / 'tree'
            calls = []
            def fetch(parent, limiter, timeout):
                calls.append(parent)
                limiter.wait()
                children = ([HELPERS['node'](PARENT, 'bj-opaque', 2, '330500000000')]
                            if parent == 'bj-opaque' else [CHILD] if parent == PARENT else [])
                return HELPERS['live_wrapper'](parent, children)
            manifest = self.area['collect_tree'](
                seed, output, self.area['RateLimiter'](0, 0, 10),
                max_level=3, timeout=1, seed_sha256=digest, fetch=fetch)
            self.assertTrue(manifest['treeWalkComplete'])
            self.assertIsNone(manifest['lastError'])
            self.assertEqual(manifest['invalidCodeNodeCount'], 1)
            gap = manifest['invalidCodeNodes'][0]
            self.assertEqual(gap['sourceNodeId'], CHILD['id'])
            self.assertEqual(gap['sbcode'], CHILD['sbcode'])
            self.assertFalse(gap['queryable'])
            self.assertTrue(gap['coverageGap'])
            self.assertIn('gz-opaque', calls)
            cached_bytes = (output / 'responses' / f'{PARENT}.json').read_bytes()
            def no_network(*args):
                self.fail('complete cached tree must resume without fetching')
            resumed = self.area['collect_tree'](
                seed, output, self.area['RateLimiter'](0, 0, 10),
                max_level=3, timeout=1, seed_sha256=digest, fetch=no_network)
            self.assertEqual(resumed['invalidCodeNodes'], manifest['invalidCodeNodes'])
            self.assertEqual(resumed['requestsThisRun'], 0)
            self.assertEqual((output / 'responses' / f'{PARENT}.json').read_bytes(), cached_bytes)
            builder = runpy.run_path(str(ROOT / 'scripts/build-mca-area-seeds.py'))
            document = builder['build_seeds'](output)
            self.assertEqual(document['invalidCodeNodeCount'], 1)
            self.assertEqual(document['nodeCount'], document['seedCount'] + document['uncodedNodeCount'])
            self.assertEqual(document['uncodedNodeCount'], document['missingCodeNodeCount'] + 1)
            self.assertTrue(all(len(row['sbcode']) == 12 for row in document['seeds']))
            rows = [r for r in document['uncodedNodes'] if r['sourceNodeId'] == CHILD['id']]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['rawNode'], CHILD)
            self.assertEqual(rows[0]['sbcode'], CHILD['sbcode'])
            self.assertEqual(rows[0]['reason'], 'invalid_official_sbcode')
            self.assertFalse(rows[0]['queryable'])
            self.assertTrue(rows[0]['coverageReviewRequired'])
            probe = runpy.run_path(str(ROOT / 'scripts/probe-mca-level3-children.py'))
            plan = probe['source_plan'](output)
            self.assertIn(CHILD['id'], {r['id'] for r in plan['parents']})
            self.assertNotIn(CHILD['sbcode'], plan['allSourceCodes'])
            # Removing a recorded gap cannot make a seed artifact appear clean.
            manifest_path = output / 'manifest.json'
            tampered = json.loads(manifest_path.read_bytes())
            tampered['invalidCodeNodeCount'] = 0
            tampered['invalidCodeNodes'] = []
            manifest_path.write_text(json.dumps(tampered), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'coverage gaps'):
                builder['build_seeds'](output)


if __name__ == '__main__':
    unittest.main()
