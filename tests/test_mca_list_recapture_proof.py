"""Offline coverage gate tests for two independently recaptured tree roots."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


PROJECT = Path(__file__).resolve().parents[1]
AUDIT = PROJECT / 'scripts/audit-mca-list-coverage.py'
RECAPTURE_FIXTURE = PROJECT / 'tests/test_mca_tree_root_recapture.py'
OLD_RAW_REASON = 'area_tree_original_http_body_missing'


class RootRecaptureCoverageTests(unittest.TestCase):
    def setUp(self):
        fixture_class = runpy.run_path(str(RECAPTURE_FIXTURE))['RootRecaptureTests']
        self.source = fixture_class(
            'test_two_reproduced_payloads_are_saved_without_overwriting_seeds')
        self.source.setUp()
        self.addCleanup(self.source.doCleanups)
        self.module = runpy.run_path(str(AUDIT))
        state = self.module['ROOT_RECAPTURE_STATE']
        replacement = patch.dict(state.__globals__['ROOT_RECAPTURE'], {
            'SEED': self.source.seed, 'SEED_SHA256': self.source.seed_sha,
        })
        replacement.start()
        self.addCleanup(replacement.stop)

    def audit(self):
        return self.module['audit_cache'](self.source.root)

    def test_only_verified_raw_root_reproduction_compensates_historical_gap(self):
        before = self.audit()
        self.assertEqual(before['sourceTree']['responsesWithoutOriginalHttpBody'], 2)
        self.assertFalse(before['sourceTree']['rootRecapture']['verified'])
        self.assertIn(OLD_RAW_REASON, before['summary']['reasons'])

        self.source.run_batch(1, [])  # Fixture injects a local fake fetcher.
        after = self.audit()
        self.assertEqual(after['sourceTree']['responsesWithoutOriginalHttpBody'], 2)
        self.assertEqual(after['sourceTree']['rootRecapture'], {
            'verified': True, 'code': 'verified', 'compensatedLegacyRootCount': 2,
        })
        self.assertNotIn(OLD_RAW_REASON, after['summary']['reasons'])
        self.assertGreater(after['fingerprintedInputFileCount'],
                           before['fingerprintedInputFileCount'])
        self.assertFalse(after['summary']['zeroOmissionProven'])
        self.assertFalse(after['publishable'])
        self.assertIn('no_frozen_snapshot_or_unique_id_order', after['summary']['reasons'])

    def test_tampered_manifest_raw_bytes_or_parent_identity_cannot_pass(self):
        self.source.run_batch(1, [])
        targets = (
            ('manifest.json', lambda value: value.update(
                sourceTreeManifestSha256='0' * 64)),
            ('responses/-1.json', lambda value: value.update(rawBodyBase64='e30=')),
            ('responses/gd.json', lambda value: value.update(parentId='other')),
        )
        for relative, mutate in targets:
            with self.subTest(relative=relative):
                path = self.source.output / relative
                original = path.read_bytes()
                changed = json.loads(original)
                mutate(changed)
                path.write_text(json.dumps(changed), encoding='utf-8')
                report = self.audit()
                self.assertFalse(report['sourceTree']['rootRecapture']['verified'])
                self.assertIn(OLD_RAW_REASON, report['summary']['reasons'])
                path.write_bytes(original)

    def test_partial_recapture_does_not_compensate_missing_bytes(self):
        limiter = self.source.limiter()
        fetch = self.source.fetcher([])

        def one_then_stop(parent, active_limiter, timeout):
            wrapper = fetch(parent, active_limiter, timeout)
            active_limiter.exhausted.set()
            return wrapper

        self.source.run_batch(1, [], limiter=limiter, fetch=one_then_stop)
        report = self.audit()
        self.assertFalse(report['sourceTree']['rootRecapture']['verified'])
        self.assertIn(OLD_RAW_REASON, report['summary']['reasons'])

    def test_valid_http_bytes_with_changed_root_payload_still_block(self):
        changed = dict(self.source.children)
        changed['-1'] = [{**self.source.children['-1'][0], 'name': 'changed'}]
        calls = []
        status = self.source.run_batch(
            1, calls, fetch=self.source.fetcher(calls, responses=changed))
        self.assertEqual(status['outcome'], 'drift')
        report = self.audit()
        self.assertFalse(report['sourceTree']['rootRecapture']['verified'])
        self.assertIn(OLD_RAW_REASON, report['summary']['reasons'])

    def test_third_missing_raw_area_cannot_be_compensated_by_two_roots(self):
        self.source.run_batch(1, [])
        path = self.source.tree / 'responses/gz.json'
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        wrapper.pop('rawBodyBase64')
        wrapper['provenance'] = {
            'kind': 'cached-json-payload', 'originalHttpBodyAvailable': False,
        }
        derived = json.dumps(
            wrapper['response'], ensure_ascii=False, sort_keys=True,
            separators=(',', ':'), allow_nan=False,
        ).encode('utf-8')
        wrapper['responseSha256'] = hashlib.sha256(derived).hexdigest()
        path.write_text(json.dumps(wrapper, ensure_ascii=False), encoding='utf-8')

        report = self.audit()
        self.assertEqual(report['sourceTree']['responsesWithoutOriginalHttpBody'], 3)
        self.assertFalse(report['sourceTree']['rootRecapture']['verified'])
        self.assertIn(OLD_RAW_REASON, report['summary']['reasons'])


if __name__ == '__main__':
    unittest.main()
