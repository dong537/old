"""Offline end-to-end contracts for private fourth-level list and detail overlay."""

import base64
import hashlib
import json
import runpy
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from tests import test_mca_level4_overlay as overlay_tests


PROJECT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT / 'scripts/collect-mca-level4-observed.py'
NOW = '2026-11-19T00:00:00+00:00'
PARENT_ID = 'PARENT001'
SHARED_ID = 'SHARED001'
NEW_ID = 'NEW00001'


class Level4CollectionTests(unittest.TestCase):
    def setUp(self):
        fixture = overlay_tests.Level4OverlayTests(
            'test_terminal_probe_writes_private_versioned_overlay_without_touching_seed')
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.terminal_probe()
        self.root, self.tree = fixture.root, fixture.tree
        self.overlay_path = fixture.output
        self.base_seed = self.root / 'national-area-tree-seeds-20261119.json'
        base = fixture.module['BUILDER']['build_seeds'](self.tree)
        self.base_seed.write_text(json.dumps(base, ensure_ascii=False), encoding='utf-8')
        self.base_seed_bytes = self.base_seed.read_bytes()
        fixture.module['write_overlay'](self.tree, fixture.probe, self.overlay_path)
        self.module = runpy.run_path(str(SCRIPT))
        self.first = self.module['FIRST']
        self.followup = self.module['FOLLOWUP']
        self.detail = self.module['DETAIL']
        self.base_first = self.root / 'national-area-first-pages-20261119'
        self.overlay_first = self.root / 'national-level4-first-pages-v1'
        (self.root / 'hourly-request-budget.json').write_text(json.dumps({
            'schemaVersion': 1, 'windowSeconds': 3600, 'limit': 60,
            'requestStartedAtUtc': [],
        }), encoding='utf-8')

    def page(self, code, identifiers, *, number=1, total=None):
        body = {'code': 0, 'data': {'current': number, 'size': 10,
                'total': len(identifiers) if total is None else total, 'records': [
                    {'axbe0001': identifier, 'areaCode': code}
                    for identifier in identifiers]}}
        raw = json.dumps(body, separators=(',', ':')).encode('utf-8')
        return {
            'schemaVersion': 1, 'requestedAtUtc': NOW, 'fetchedAtUtc': NOW,
            'request': {'url': self.first['FETCHER']['API_BASE'] +
                        self.first['FETCHER']['LIST_PATH'],
                        'method': 'POST', 'params': {'current': number, 'size': 10,
                                                     'areaCode': code,
                                                     'checkSort': 1}},
            'httpStatus': 200, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': body,
        }

    def write_first_pages(self, seeds, seed_path, output, records, totals=None):
        observations = {}
        totals = totals or {}
        for seed in seeds:
            code = seed['sbcode']
            path = output / f'area-{code}' / 'pages' / '00001.json'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(self.page(
                code, records.get(code, []), total=totals.get(code))),
                            encoding='utf-8')
            observation = self.first['checked_cached_page'](path, code)
            observation['sourceNodeId'] = seed['sourceNodeId']
            observations[code] = observation
        sha = hashlib.sha256(seed_path.read_bytes()).hexdigest()
        manifest = self.first['progress_document'](
            seed_path, sha, seeds, observations)
        (output / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')

    def detail_wrapper(self, endpoint, identifier):
        body = {'code': 0, 'data': {'axbe0001': identifier}}
        raw = json.dumps(body).encode('utf-8')
        return {
            'schemaVersion': 1, 'requestedAtUtc': NOW, 'fetchedAtUtc': NOW,
            'request': {'url': self.detail['FETCHER']['API_BASE'] + endpoint,
                        'method': 'POST', 'params': {'axbe0001': identifier}},
            'httpStatus': 200, 'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': body,
        }

    def finish_base_details(self, queue):
        output = self.root / 'national-observed-details-20261119'
        for item in queue['items']:
            identifier = item['institutionId']
            endpoints = {}
            for endpoint in self.detail['FETCHER']['DETAIL_PATHS']:
                wrapper = self.detail_wrapper(endpoint, identifier)
                path = output / 'detail-checkpoints' / identifier / f'{endpoint}.json'
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(wrapper), encoding='utf-8')
                endpoints[endpoint] = wrapper
            path = output / 'details' / f'{identifier}.json'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({'schemaVersion': 1,
                                        'institutionId': identifier,
                                        'endpoints': endpoints}), encoding='utf-8')
        self.assertEqual(len(self.detail['scan_detail_cache'](output, queue)),
                         queue['uniqueIdCount'])
        manifest = {key: queue[key] for key in (
            'sourceSeedSha256', 'sourceFirstPageManifestSha256',
            'sourceFollowupManifestSha256', 'sourceLargeManifestSha256',
            'sourceInventorySha256', 'uniqueIdCount')}
        if 'sourceDescendantSeedSha256' in queue:
            manifest['sourceDescendantSeedSha256'] = queue[
                'sourceDescendantSeedSha256']
        manifest.update({'schemaVersion': 1, 'completedDetailCount':
                         queue['uniqueIdCount'],
                         'detailsCompleteForObservedIds': True,
                         'nationalComplete': False, 'snapshotVerified': False,
                         'publishable': False})
        (output / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        run_id = 'detail-20261119-auto-0001'
        status = {'schemaVersion': 1, 'runId': run_id, 'phase': 'finished',
                  'endedAtUtc': NOW, 'sourceInventorySha256':
                  queue['sourceInventorySha256'],
                  'sourceDescendantSeedSha256': queue.get(
                      'sourceDescendantSeedSha256'),
                  'uniqueIdCount': queue['uniqueIdCount'],
                  'completedDetailCount': queue['uniqueIdCount'],
                  'newlySavedDetails': queue['uniqueIdCount'],
                  'requestsThisRun': queue['uniqueIdCount'] * 2,
                  'exitCode': 0, 'detailsCompleteForObservedIds': True,
                  'rateLimited': False, 'error': None,
                  'nationalComplete': False, 'publishable': False}
        runs = output / 'batch-runs'
        runs.mkdir()
        (runs / f'{run_id}.status.json').write_text(json.dumps(status),
                                                  encoding='utf-8')

    def prepare_union(self):
        base = json.loads(self.base_seed.read_text(encoding='utf-8'))
        overlay, _sha = self.module['load_overlay_seeds'](
            self.overlay_path, self.tree)
        base_records = {base['seeds'][0]['sbcode']: [PARENT_ID],
                        base['seeds'][-1]['sbcode']: [SHARED_ID]}
        self.write_first_pages(base['seeds'], self.base_seed,
                               self.base_first, base_records)
        self.write_first_pages(overlay['seeds'], self.overlay_path,
                               self.overlay_first,
                               {overlay['seeds'][0]['sbcode']:
                                [SHARED_ID, NEW_ID]})
        queue = self.detail['build_queue'](
            self.base_seed, self.tree, self.base_first,
            self.root / 'national-area-followup-pages-20261119',
            large_dir=self.root / 'national-area-large-pages-20261119',
            descendant_seed_path=self.overlay_path)
        self.finish_base_details(queue)
        return base, overlay

    def finish_overlay_first_status(self):
        seed_sha = hashlib.sha256(self.overlay_path.read_bytes()).hexdigest()
        output = self.overlay_first / 'batch-runs'
        output.mkdir(parents=True)
        run_id = 'l4first-v1-0001'
        status = {'schemaVersion': 1, 'runId': run_id, 'phase': 'finished',
                  'sourceSeedSha256': seed_sha, 'pendingAreas': 0,
                  'exitCode': 0, 'rateLimited': False, 'error': None}
        (output / f'{run_id}.status.json').write_text(json.dumps(status),
                                                   encoding='utf-8')

    def test_loader_rechecks_original_probe_and_rejects_changed_overlay(self):
        document, sha = self.module['load_overlay_seeds'](
            self.overlay_path, self.tree)
        self.assertEqual((document['seedCount'], document['uncodedNodeCount']),
                         (1, 1))
        self.assertEqual(sha, hashlib.sha256(self.overlay_path.read_bytes()).hexdigest())
        modified = json.loads(self.overlay_path.read_text(encoding='utf-8'))
        modified['seeds'][0]['sbcode'] = '999999999999'
        self.overlay_path.write_text(json.dumps(modified), encoding='utf-8')
        with self.assertRaisesRegex((ValueError, RuntimeError), 'overlay|source'):
            self.module['load_overlay_seeds'](self.overlay_path, self.tree)

    def test_changed_overlay_stops_first_page_batch_before_request(self):
        modified = json.loads(self.overlay_path.read_text(encoding='utf-8'))
        modified['sourceResponseInventorySha256'] = '0' * 64
        self.overlay_path.write_text(json.dumps(modified), encoding='utf-8')
        calls = []
        with patch.dict(self.first['FETCHER'], {'fetch_page':
                        lambda *_args, **_kwargs: calls.append(True)}):
            status = self.first['run_batch'](
                self.overlay_path, self.tree, self.overlay_first,
                'l4first-drift', max_areas=1, max_requests=1,
                interval=60, jitter=0, timeout=1,
                seed_loader=self.module['load_overlay_seeds'])
        self.assertEqual(status['exitCode'], 2)
        self.assertEqual(calls, [])

    def test_only_coded_fourth_level_first_page_is_requested(self):
        calls = []
        def fake_fetch(page, code, folder, limiter, timeout, attempts, **kwargs):
            calls.append((page, code, limiter.interval, limiter.hourly_state_path))
            self.first['FETCHER']['save_json'](
                folder / 'pages' / '00001.json', self.page(code, [NEW_ID]))
        with patch.dict(self.first['FETCHER'], {'fetch_page': fake_fetch}):
            status = self.first['run_batch'](
                self.overlay_path, self.tree, self.overlay_first, 'l4first-0001',
                max_areas=5, max_requests=5, interval=60, jitter=0, timeout=1,
                seed_loader=self.module['load_overlay_seeds'])
        self.assertEqual(status['exitCode'], 0)
        self.assertEqual([call[1] for call in calls], ['440101001000'])
        self.assertEqual(calls[0][2:],
                         (60, self.root / 'hourly-request-budget.json'))
        self.assertEqual(self.base_seed.read_bytes(), self.base_seed_bytes)
        self.assertFalse(self.base_first.exists())

    def test_union_retains_parent_and_dual_sources_but_fetches_only_new_id(self):
        base, overlay = self.prepare_union()
        allowed = self.followup['allowed_area_codes'](
            base['seeds'][-1], [*base['seeds'], *overlay['seeds']])
        self.assertIn(overlay['seeds'][0]['sbcode'], allowed)
        queue = self.module['build_incremental_queue'](self.root)
        self.assertEqual([item['institutionId'] for item in queue['items']], [NEW_ID])
        merged = {item['institutionId']: item for item in queue['mergedItems']}
        self.assertEqual(set(merged), {PARENT_ID, SHARED_ID, NEW_ID})
        self.assertEqual(len(merged[SHARED_ID]['sourcePages']), 2)
        self.assertEqual({source['areaCode'] for source in
                          merged[SHARED_ID]['sourcePages']},
                         {base['seeds'][-1]['sbcode'], overlay['seeds'][0]['sbcode']})
        self.assertFalse(queue['publishable'])

    def test_parent_page_accepts_official_fourth_level_area_code(self):
        base = json.loads(self.base_seed.read_text(encoding='utf-8'))
        overlay, overlay_sha = self.module['load_overlay_seeds'](
            self.overlay_path, self.tree)
        county = base['seeds'][-1]['sbcode']
        child = overlay['seeds'][0]['sbcode']
        self.write_first_pages(
            base['seeds'], self.base_seed, self.base_first,
            {county: [f'ID{i:06d}' for i in range(10)]},
            {county: 11})
        calls = []
        def fetch_page(_endpoint, params, _limiter, _timeout, _attempts,
                       *, preserve_raw=False):
            calls.append(params.copy())
            return self.page(params['areaCode'], ['CHILD001'],
                             number=2, total=11) | {
                                 'response': {'code': 0, 'data': {
                                     'current': 2, 'size': 10, 'total': 11,
                                     'records': [{'axbe0001': 'CHILD001',
                                                  'areaCode': child}]}}}
        # The fake must preserve exact raw bytes for the returned child code.
        def audited_fetch(*args, **kwargs):
            wrapper = fetch_page(*args, **kwargs)
            raw = json.dumps(wrapper['response'], separators=(',', ':')).encode()
            wrapper['responseSha256'] = hashlib.sha256(raw).hexdigest()
            wrapper['rawBodyBase64'] = base64.b64encode(raw).decode('ascii')
            return wrapper
        output = self.root / 'national-area-followup-pages-20261119'
        with patch.dict(self.followup['FETCHER'], {'request_json': audited_fetch}):
            status = self.followup['run_batch'](
                self.base_seed, self.tree, self.base_first, output,
                'descendant-0001', max_areas=5, max_requests=5,
                max_expected_pages=3, interval=60, jitter=0, timeout=1,
                descendant_seed_path=self.overlay_path)
        self.assertEqual(status['exitCode'], 0)
        self.assertEqual(status['areasUnverified'], 0)
        self.assertEqual([item['areaCode'] for item in calls], [county])
        manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['sourceDescendantSeedSha256'], overlay_sha)
        self.assertEqual(manifest['areas'][county]['issues'], [])

    def test_overlay_second_page_is_collected_into_its_own_cache(self):
        overlay, _sha = self.module['load_overlay_seeds'](
            self.overlay_path, self.tree)
        code = overlay['seeds'][0]['sbcode']
        ids = [f'L4ID{i:05d}' for i in range(10)]
        self.write_first_pages(overlay['seeds'], self.overlay_path,
                               self.overlay_first, {code: ids}, {code: 11})
        self.finish_overlay_first_status()
        calls = []
        def fake_page(_endpoint, params, _limiter, _timeout, _attempts,
                      *, preserve_raw=False):
            calls.append((params.copy(), preserve_raw))
            return self.page(code, ['L4ID00010'], number=2, total=11)
        with patch.dict(self.followup['FETCHER'], {'request_json': fake_page}):
            status = self.module['run_batch']('small', 1, self.root)
        self.assertEqual(status['exitCode'], 0)
        self.assertEqual(calls[0][0]['areaCode'], code)
        self.assertTrue(calls[0][1])
        self.assertTrue((self.root /
                         f'national-level4-followup-pages-v1/area-{code}/pages/00002.json').is_file())
        self.assertFalse((self.root /
                          f'national-area-followup-pages-20261119/area-{code}').exists())

    def test_incremental_detail_batch_requests_only_overlay_exclusive_id(self):
        self.prepare_union()
        self.finish_overlay_first_status()
        calls = []
        def fake_detail(identifier, output, limiter, timeout, attempts,
                        *, preserve_raw=False):
            calls.append(identifier)
            endpoints = {}
            for endpoint in self.detail['FETCHER']['DETAIL_PATHS']:
                wrapper = self.detail_wrapper(endpoint, identifier)
                self.detail['FETCHER']['save_json'](
                    output / 'detail-checkpoints' / identifier /
                    f'{endpoint}.json', wrapper)
                endpoints[endpoint] = wrapper
            self.detail['FETCHER']['save_json'](
                output / 'details' / f'{identifier}.json',
                {'schemaVersion': 1, 'institutionId': identifier,
                 'endpoints': endpoints})
        with patch.dict(self.detail['FETCHER'], {'collect_detail': fake_detail}):
            status = self.module['run_batch']('details', 1, self.root)
        self.assertEqual(status['exitCode'], 0)
        self.assertEqual(calls, [NEW_ID])
        self.assertTrue((self.root /
                         f'national-level4-observed-details-v1/details/{NEW_ID}.json').is_file())
        queue = json.loads((self.root /
                            'national-level4-observed-details-v1/queue.json').read_text(
                                encoding='utf-8'))
        self.assertEqual(queue['mergedUniqueIdCount'], 3)
        self.assertEqual(queue['uniqueIdCount'], 1)

    def test_detail_state_rejects_manifest_completion_drift(self):
        self.prepare_union()
        self.finish_overlay_first_status()

        def save_detail(identifier, output, *_args, **_kwargs):
            endpoints = {}
            for endpoint in self.detail['FETCHER']['DETAIL_PATHS']:
                wrapper = self.detail_wrapper(endpoint, identifier)
                self.detail['FETCHER']['save_json'](
                    output / 'detail-checkpoints' / identifier /
                    f'{endpoint}.json', wrapper)
                endpoints[endpoint] = wrapper
            self.detail['FETCHER']['save_json'](
                output / 'details' / f'{identifier}.json',
                {'schemaVersion': 1, 'institutionId': identifier,
                 'endpoints': endpoints})

        with patch.dict(self.detail['FETCHER'], {'collect_detail': save_detail}):
            self.assertEqual(self.module['run_batch']('details', 1, self.root)['exitCode'], 0)
        self.assertTrue(self.module['detail_state'](self.root)[0])
        manifest_path = self.root / 'national-level4-observed-details-v1/manifest.json'
        original = json.loads(manifest_path.read_text(encoding='utf-8'))
        for field, invalid in (
            ('uniqueIdCount', 0),
            ('uniqueIdCount', True),
            ('completedDetailCount', 0),
            ('completedDetailCount', True),
            ('detailsCompleteForObservedIds', False),
            ('nationalComplete', True),
            ('snapshotVerified', True),
        ):
            with self.subTest(field=field, invalid=invalid):
                manifest_path.write_text(
                    json.dumps({**original, field: invalid}), encoding='utf-8')
                with self.assertRaisesRegex(RuntimeError, 'manifest'):
                    self.module['detail_state'](self.root)
        manifest_path.unlink()
        with self.assertRaisesRegex(RuntimeError, 'manifest'):
            self.module['detail_state'](self.root)
        manifest_path.write_text(json.dumps(original), encoding='utf-8')
        self.assertTrue(self.module['detail_state'](self.root)[0])

    def test_source_drift_blocks_incremental_queue(self):
        self.prepare_union()
        modified = json.loads(self.overlay_path.read_text(encoding='utf-8'))
        modified['sourceResponseInventorySha256'] = '0' * 64
        self.overlay_path.write_text(json.dumps(modified), encoding='utf-8')
        with self.assertRaisesRegex((ValueError, RuntimeError), 'overlay|source'):
            self.module['build_incremental_queue'](self.root)

    def test_all_overlap_still_persists_merged_sources_without_network(self):
        _base, overlay = self.prepare_union()
        code = overlay['seeds'][0]['sbcode']
        self.write_first_pages(overlay['seeds'], self.overlay_path,
                               self.overlay_first, {code: [SHARED_ID]})
        self.finish_overlay_first_status()
        with patch.dict(self.detail['FETCHER'], {'collect_detail':
                        lambda *_args, **_kwargs: self.fail('no new ID') }):
            status = self.module['run_batch']('details', 1, self.root)
        self.assertEqual(status['exitCode'], 0)
        queue_path = (self.root / 'national-level4-observed-details-v1' /
                      'queue.json')
        queue = json.loads(queue_path.read_text(encoding='utf-8'))
        self.assertEqual(queue['uniqueIdCount'], 0)
        self.assertEqual(len(next(item for item in queue['mergedItems']
                                  if item['institutionId'] == SHARED_ID)
                             ['sourcePages']), 2)
        self.assertTrue(self.module['detail_state'](self.root)[0])

    def test_list_coverage_audits_level_four_partition_with_verified_path(self):
        overlay, _sha = self.module['load_overlay_seeds'](
            self.overlay_path, self.tree)
        code = overlay['seeds'][0]['sbcode']
        self.write_first_pages(overlay['seeds'], self.overlay_path,
                               self.overlay_first, {code: [NEW_ID]})
        coverage = runpy.run_path(str(
            PROJECT / 'scripts/audit-mca-list-coverage.py'))
        report = coverage['audit_cache'](self.root)
        self.assertIn(code, report['partitions'])
        self.assertEqual(report['summary']['cachedAreaCodesNotInObservedTreeCount'], 0)
        self.assertEqual(report['summary']['partitionCountWithCachedPages'], 1)
        self.assertFalse(report['summary']['zeroOmissionProven'])
        self.assertNotIn(NEW_ID, json.dumps(report))


if __name__ == '__main__':
    unittest.main()
