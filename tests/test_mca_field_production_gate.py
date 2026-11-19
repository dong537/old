"""Source-level conservative production gate, entirely offline."""
from datetime import datetime, timezone
import json
import hashlib
from pathlib import Path
import runpy
import tempfile
import tracemalloc
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/audit-mca-field-production-gate.py'
HELPERS = runpy.run_path(str(ROOT / 'tests/test_mca_pipeline_progress.py'))
NOW = datetime(2026, 11, 19, 2, tzinfo=timezone.utc)


class FieldProductionGateTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), 'field production gate is missing')
        self.m = runpy.run_path(str(SCRIPT))
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def save(self, name, value):
        HELPERS['save'](self.root / name, value)

    def page(self, rows, folder='area-110000000000', raw=True):
        wrapper = HELPERS['list_page']('110000000000', 1, rows)
        if not raw:
            wrapper.pop('rawBodyBase64')
        self.save(folder + '/pages/00001.json', wrapper)

    def details(self, identifier='ENTITY001', base=None, care=None):
        endpoints = {}
        for endpoint, extra in [('orgBaseDetail', base or {}), ('yangLaoOrgDetail', care or {})]:
            wrapper = HELPERS['detail_endpoint'](endpoint, identifier)
            body = {'code': 0, 'data': {'axbe0001': identifier, **extra}}
            endpoints[endpoint] = HELPERS['wrapper'](body, request=wrapper['request'])
        self.save(f'area-110000000000/details/{identifier}.json',
                  {'institutionId': identifier, 'endpoints': endpoints})

    def audit(self):
        return self.m['audit'](self.root, now=NOW)

    def modern_batch(self, level4=False, base=None, descendants=False):
        name = 'national-level4' if level4 else 'national-area'
        suffix = 'v1' if level4 else '20261119'
        folder = 'national-level4-observed-details-v1' if level4 else 'national-observed-details-20261119'
        identifier = 'ENTITY002' if level4 else 'ENTITY001'
        page_name = f'{name}-first-pages-{suffix}/area-110000000000/pages/00001.json'
        self.page([{'axbe0001': identifier}], folder=f'{name}-first-pages-{suffix}/area-110000000000')
        def digest(path):
            return hashlib.sha256((self.root / path).read_bytes()).hexdigest()
        def canonical(value):
            return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        seed = 'national-area-level4-overlay-seeds.v1.json' if level4 else 'national-area-tree-seeds-20261119.json'
        self.save(seed, {'seedCount': 1, 'seeds': [{'sbcode': '110000000000'}]})
        self.save(f'{name}-first-pages-{suffix}/manifest.json', {
            'schemaVersion': 1, 'sourceSeedSha256': digest(seed),
            'auditedAtUtc': '2026-11-19T00:01:00+00:00'})
        page = json.loads((self.root / page_name).read_bytes())
        item = {'institutionId': identifier, 'sourcePages': [{
            'areaCode': '110000000000', 'pageNumber': 1, 'pagePath': str(self.root / page_name),
            'storedFileSha256': digest(page_name), 'responseSha256': page['responseSha256'],
            'fetchedAtUtc': page['fetchedAtUtc'], 'areaIssues': [], 'listCoverageVerified': True}],
            'listCoverageVerified': True, 'listCoverageIssues': []}
        queue = {'schemaVersion': 1, 'scope': 'details-for-observed-list-ids-only',
                 'sourceSeedSha256': digest(seed),
                 'sourceFirstPageManifestSha256': digest(f'{name}-first-pages-{suffix}/manifest.json'),
                 'sourceFollowupManifestSha256': None, 'sourceLargeManifestSha256': None,
                 'sourceInventorySha256': canonical([item]), 'uniqueIdCount': 1,
                 'sourceObservationCount': 1, 'areaIssues': {}, 'nationalComplete': False,
                 'snapshotVerified': False, 'publishable': False, 'items': [item]}
        if descendants:
            self.save('national-area-level4-overlay-seeds.v1.json',
                      {'seedCount': 1, 'seeds': [{'sbcode': '110000000000'}]})
            queue['sourceDescendantSeedSha256'] = digest('national-area-level4-overlay-seeds.v1.json')
            queue['sourceInventorySha256'] = canonical({'items': [item],
                'sourceDescendantSeedSha256': queue['sourceDescendantSeedSha256']})
        if level4:
            base_sha = digest('national-observed-details-20261119/manifest.json')
            merged = base['items'] + [item]
            queue.update(scope='level4-incremental-details-for-observed-ids-only',
                         sourceBaseDetailManifestSha256=base_sha,
                         sourceBaseInventorySha256=base['sourceInventorySha256'],
                         sourceOverlayInventorySha256=canonical([item]),
                         mergedItems=merged, mergedUniqueIdCount=2, reusedOriginalDetailCount=1,
                         sourceObservationCount=2)
            queue['sourceInventorySha256'] = canonical({
                'mergedItems': merged, 'baseDetailManifestSha256': base_sha,
                'baseSourceInventorySha256': base['sourceInventorySha256'],
                'overlaySourceInventorySha256': canonical([item]), 'overlaySeedSha256': digest(seed)})
        self.save(folder + '/queue.json', queue)
        self.details(identifier)
        old = self.root / f'area-110000000000/details/{identifier}.json'
        combined = json.loads(old.read_bytes())
        old.unlink()
        combined['schemaVersion'] = 1
        for endpoint, part in combined['endpoints'].items():
            part.update(requestedAtUtc='2026-11-19T00:10:00+00:00', fetchedAtUtc='2026-11-19T00:11:00+00:00')
            if level4:
                part.update(requestedAtUtc='2026-11-19T00:25:00+00:00', fetchedAtUtc='2026-11-19T00:26:00+00:00')
            self.save(folder + f'/detail-checkpoints/{identifier}/{endpoint}.json', part)
        self.save(folder + f'/details/{identifier}.json', combined)
        manifest = {key: value for key, value in queue.items() if key.startswith('source') and key.endswith('Sha256')}
        manifest.update(schemaVersion=1, scope=queue['scope'], uniqueIdCount=1, completedDetailCount=1,
                        detailsCompleteForObservedIds=True, nationalComplete=False, snapshotVerified=False,
                        publishable=False, auditedAtUtc='2026-11-19T00:14:00+00:00')
        # The collector does not copy the two overlay-only inventory hashes into manifest.
        manifest.pop('sourceBaseInventorySha256', None)
        manifest.pop('sourceOverlayInventorySha256', None)
        if level4:
            manifest['auditedAtUtc'] = '2026-11-19T00:29:00+00:00'
        self.save(folder + '/manifest.json', manifest)
        prefix = 'l4detail-v1' if level4 else 'detail-20261119-auto'
        status = {'schemaVersion': 1, 'runId': prefix + '-0001', 'phase': 'finished',
                  'startedAtUtc': '2026-11-19T00:05:00+00:00', 'endedAtUtc': '2026-11-19T00:15:00+00:00',
                  'sourceInventorySha256': queue['sourceInventorySha256'], 'sourceDescendantSeedSha256': None,
                  'uniqueIdCount': 1, 'completedDetailCount': 1, 'newlySavedDetails': 1,
                  'requestsThisRun': 2, 'requestBudgetReached': False, 'rateLimited': False,
                  'detailsCompleteForObservedIds': True, 'nationalComplete': False,
                  'snapshotVerified': False, 'publishable': False, 'exitCode': 0, 'error': None}
        status['sourceDescendantSeedSha256'] = queue.get('sourceDescendantSeedSha256')
        if level4:
            status.update(startedAtUtc='2026-11-19T00:20:00+00:00', endedAtUtc='2026-11-19T00:30:00+00:00')
        self.save(folder + '/batch-runs/' + prefix + '-0001.status.json', status)
        return queue

    def test_complete_modern_provenance_can_pass_without_publication(self):
        self.modern_batch()
        report = self.audit()
        self.assertTrue(report['gates']['detail_source_batches_verified'])
        self.assertEqual(report['counts']['sourceVerifiedModernDetailPairFiles'], 1)
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 1)
        self.assertFalse(report['publishable'])

    def test_legacy_page_does_not_contaminate_verified_modern_gate(self):
        self.modern_batch()
        self.page([{'axbe0001': 'LEGACY_ONLY'}], raw=False)
        report = self.audit()
        self.assertTrue(report['gates']['detail_source_batches_verified'])
        self.assertTrue(report['gates']['all_observed_ids_have_detail_pairs'])
        self.assertTrue(report['gates']['all_endpoint_raw_bytes_verified'])
        self.assertEqual(report['counts']['uniqueObservedIds'], 1)
        self.assertEqual(report['historicalLegacy']['counts']['uniqueObservedIds'], 1)
        self.assertEqual(report['historicalLegacy']['counts']['wrappersWithoutRawBytes'], 1)
        self.assertFalse(report['publishable'])

    def test_legacy_detail_cannot_fill_missing_modern_detail(self):
        self.modern_batch()
        (self.root / 'national-observed-details-20261119/details/ENTITY001.json').unlink()
        self.details('ENTITY001')
        report = self.audit()
        self.assertFalse(report['gates']['detail_source_batches_verified'])
        self.assertFalse(report['gates']['all_observed_ids_have_detail_pairs'])
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 0)
        self.assertEqual(report['historicalLegacy']['counts']['validDetailPairFiles'], 1)
        self.assertFalse(report['publishable'])

    def test_clock_head_counts_as_site_request_without_rejecting_saved_details(self):
        self.modern_batch()
        folder = 'national-observed-details-20261119'
        status_path = folder + '/batch-runs/detail-20261119-auto-0001.status.json'
        status = json.loads((self.root / status_path).read_bytes())
        # The shared limiter also counts the clock-calibration HEAD request.
        status['requestsThisRun'] = 3
        self.save(status_path, status)
        report = self.audit()
        self.assertTrue(report['gates']['detail_source_batches_verified'])
        self.assertEqual(
            report['sourceBatchVerification'][folder]['requestsWithoutSavedDetailResponse'], 1)
        self.assertFalse(report['publishable'])

    def test_complete_level4_incremental_chain_can_pass(self):
        base = self.modern_batch(descendants=True)
        self.modern_batch(True, base)
        report = self.audit()
        self.assertTrue(report['gates']['detail_source_batches_verified'])
        self.assertEqual(report['counts']['sourceVerifiedModernDetailPairFiles'], 2)

    def test_level4_cannot_predate_completed_base_batch(self):
        base = self.modern_batch(descendants=True)
        self.modern_batch(True, base)
        path = 'national-level4-observed-details-v1/batch-runs/l4detail-v1-0001.status.json'
        status = json.loads((self.root / path).read_bytes())
        status['startedAtUtc'] = '2026-11-19T00:01:00+00:00'
        self.save(path, status)
        self.assertFalse(self.audit()['gates']['detail_source_batches_verified'])

    def test_endpoint_checkpoint_can_resume_across_two_continuous_batches(self):
        self.modern_batch()
        folder = 'national-observed-details-20261119'
        status_path = folder + '/batch-runs/detail-20261119-auto-0001.status.json'
        status = json.loads((self.root / status_path).read_bytes())
        second = dict(status, runId='detail-20261119-auto-0002',
                      startedAtUtc='2026-11-19T00:12:00+00:00', requestsThisRun=1)
        status.update(endedAtUtc='2026-11-19T00:11:30+00:00', completedDetailCount=0,
                      newlySavedDetails=0, requestsThisRun=1, requestBudgetReached=True,
                      exitCode=1, detailsCompleteForObservedIds=False)
        self.save(status_path, status)
        self.save(folder + '/batch-runs/detail-20261119-auto-0002.status.json', second)
        detail_path = folder + '/details/ENTITY001.json'
        combined = json.loads((self.root / detail_path).read_bytes())
        part = combined['endpoints']['yangLaoOrgDetail']
        part.update(requestedAtUtc='2026-11-19T00:12:30+00:00', fetchedAtUtc='2026-11-19T00:13:00+00:00')
        self.save(detail_path, combined)
        self.save(folder + '/detail-checkpoints/ENTITY001/yangLaoOrgDetail.json', part)
        report = self.audit()
        self.assertTrue(report['gates']['detail_source_batches_verified'])
        self.assertEqual(report['sourceBatchVerification'][folder]['batchCount'], 2)

    def test_queue_parser_streams_large_arrays_and_rejects_duplicate_members(self):
        path = self.root / 'large-queue.json'
        with path.open('w', encoding='utf-8') as stream:
            stream.write('{"items":[')
            for index in range(40000):
                if index:
                    stream.write(',')
                json.dump({'id': index, 'text': '中' * 80}, stream, ensure_ascii=False)
            stream.write('],"uniqueIdCount":40000}')
        tracemalloc.start()
        try:
            count = sum(kind == 'item' for _, _, kind in self.m['queue_members'](path))
            peak = tracemalloc.get_traced_memory()[1]
        finally:
            tracemalloc.stop()
        self.assertEqual(count, 40000)
        self.assertLess(peak, 3 * 1024 * 1024)
        path.write_text('{"items":[],"items":[]}', encoding='utf-8')
        with self.assertRaises(ValueError):
            list(self.m['queue_members'](path))

    def test_modern_provenance_tampering_fails_closed(self):
        self.modern_batch()
        folder = 'national-observed-details-20261119'
        mutations = [
            ('queue.json', lambda d: d.update(sourceInventorySha256='0' * 64)),
            ('manifest.json', lambda d: d.update(completedDetailCount=0)),
            ('manifest.json', lambda d: d.update(auditedAtUtc='2026-11-19T00:06:00+00:00')),
            ('batch-runs/detail-20261119-auto-0001.status.json', lambda d: d.update(newlySavedDetails=0)),
            ('batch-runs/detail-20261119-auto-0001.status.json', lambda d: d.update(requestsThisRun=1)),
            ('batch-runs/detail-20261119-auto-0001.status.json', lambda d: d.update(startedAtUtc='2026-11-19T00:12:00+00:00')),
            ('detail-checkpoints/ENTITY001/orgBaseDetail.json', lambda d: d.update(rawBodyBase64='e30=')),
        ]
        for relative, mutate in mutations:
            with self.subTest(relative=relative, mutate=mutate):
                path = self.root / folder / relative
                original = path.read_bytes()
                data = json.loads(original)
                mutate(data)
                self.save(folder + '/' + relative, data)
                self.assertFalse(self.audit()['gates']['detail_source_batches_verified'])
                path.write_bytes(original)
        status = self.root / folder / 'batch-runs/detail-20261119-auto-0001.status.json'
        status.rename(status.with_name('detail-20261119-auto-0002.status.json'))
        self.assertFalse(self.audit()['gates']['detail_source_batches_verified'])

    def test_missing_each_modern_proof_file_fails_closed(self):
        self.modern_batch()
        folder = 'national-observed-details-20261119'
        for relative in ('queue.json', 'manifest.json', 'details/ENTITY001.json',
                         'detail-checkpoints/ENTITY001/orgBaseDetail.json',
                         'batch-runs/detail-20261119-auto-0001.status.json'):
            path = self.root / folder / relative
            raw = path.read_bytes()
            path.unlink()
            with self.subTest(relative=relative):
                self.assertFalse(self.audit()['gates']['detail_source_batches_verified'])
            path.write_bytes(raw)

    def test_modern_success_is_revoked_on_post_verification_status_change(self):
        self.modern_batch()
        original = self.m['input_paths']
        calls = []
        def changing(root):
            calls.append(True)
            if len(calls) == 2:
                self.save('national-observed-details-20261119/batch-runs/detail-20261119-auto-0001.status.json', {})
            return original(root)
        with patch.dict(self.m['audit'].__globals__, {'input_paths': changing}):
            report = self.audit()
        self.assertFalse(report['gates']['detail_source_batches_verified'])
        self.assertEqual(report['counts']['sourceVerifiedModernDetailPairFiles'], 0)
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 0)

    def test_modern_status_change_during_legacy_audit_revokes_source_promotion(self):
        self.modern_batch()
        original = self.m['audit_cohort']
        folder = 'national-observed-details-20261119'
        def changing(root, now, *, modern):
            if not modern:
                self.save(folder + '/batch-runs/detail-20261119-auto-0001.status.json', {})
            return original(root, now, modern=modern)
        with patch.dict(self.m['audit'].__globals__, {'audit_cohort': changing}):
            report = self.audit()
        self.assertEqual(report['scope'], 'modern_private_institution_endpoints')
        self.assertEqual(report['issues']['input_changed_during_audit'], 1)
        self.assertFalse(report['gates']['source_files_unchanged_during_audit'])
        self.assertFalse(report['gates']['detail_source_batches_verified'])
        self.assertFalse(report['sourceBatchVerification'][folder]['verified'])
        self.assertEqual(report['sourceBatchVerification'][folder]['code'], 'input_changed_during_audit')
        self.assertEqual(report['counts']['sourceVerifiedModernDetailPairFiles'], 0)
        self.assertEqual(report['counts']['validDetailPairFiles'], 0)
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 0)
        self.assertEqual(report['counts']['missingDetailsForObservedIds'], 1)
        self.assertEqual(report['detailValidityMeaning'], 'unverified_modern_source_chain')

    def test_modern_file_added_during_legacy_audit_revokes_source_promotion(self):
        self.modern_batch()
        original = self.m['audit_cohort']
        folder = 'national-observed-details-20261119'
        def changing(root, now, *, modern):
            if not modern:
                self.save(folder + '/batch-runs/detail-20261119-auto-0002.status.json', {})
            return original(root, now, modern=modern)
        with patch.dict(self.m['audit'].__globals__, {'audit_cohort': changing}):
            report = self.audit()
        self.assertFalse(report['gates']['source_files_unchanged_during_audit'])
        self.assertFalse(report['sourceBatchVerification'][folder]['verified'])
        self.assertEqual(report['counts']['sourceVerifiedModernDetailPairFiles'], 0)
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 0)

    def test_broken_level4_sources_cannot_silently_disappear(self):
        self.modern_batch()
        self.save('national-level4-first-pages-v1/area-110000000000/pages/00001.json', {})
        self.assertFalse(self.audit()['gates']['detail_source_batches_verified'])

    def test_level4_shared_id_reuses_base_details_and_preserves_both_sources(self):
        base = self.modern_batch(descendants=True)
        queue = self.modern_batch(True, base)
        page_name = 'national-level4-first-pages-v1/area-110000000000/pages/00001.json'
        page = HELPERS['list_page']('110000000000', 1,
                                    [{'axbe0001': 'ENTITY001'}, {'axbe0001': 'ENTITY002'}])
        self.save(page_name, page)
        source = queue['items'][0]['sourcePages'][0]
        source.update(storedFileSha256=hashlib.sha256((self.root / page_name).read_bytes()).hexdigest(),
                      responseSha256=page['responseSha256'])
        shared = dict(base['items'][0], sourcePages=base['items'][0]['sourcePages'] + [source])
        queue['mergedItems'] = [shared, queue['items'][0]]
        queue['sourceObservationCount'] = 3
        canonical = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        queue['sourceOverlayInventorySha256'] = canonical([dict(shared, sourcePages=[source]), queue['items'][0]])
        queue['sourceInventorySha256'] = canonical({
            'mergedItems': queue['mergedItems'], 'baseDetailManifestSha256': queue['sourceBaseDetailManifestSha256'],
            'baseSourceInventorySha256': queue['sourceBaseInventorySha256'],
            'overlaySourceInventorySha256': queue['sourceOverlayInventorySha256'],
            'overlaySeedSha256': queue['sourceSeedSha256']})
        folder = 'national-level4-observed-details-v1'
        self.save(folder + '/queue.json', queue)
        for relative in ('manifest.json', 'batch-runs/l4detail-v1-0001.status.json'):
            data = json.loads((self.root / folder / relative).read_bytes())
            data['sourceInventorySha256'] = queue['sourceInventorySha256']
            self.save(folder + '/' + relative, data)
        self.assertTrue(self.audit()['gates']['detail_source_batches_verified'])
        queue['items'].append(shared)
        self.save(folder + '/queue.json', queue)
        self.assertFalse(self.audit()['gates']['detail_source_batches_verified'])

    def test_empty_is_blocked_not_a_complete_zero_population(self):
        report = self.audit()
        self.assertFalse(report['gates']['observed_population_present'])
        self.assertFalse(report['productionReady'])
        self.assertFalse(report['publishable'])

    def test_level4_sources_are_not_silently_omitted(self):
        for stage in ('first', 'followup', 'large'):
            self.page([{'axbe0001': 'ENTITY001'}],
                      folder=f'national-level4-{stage}-pages-v1/area-110000000000')
        self.details()
        source = self.root / 'area-110000000000/details/ENTITY001.json'
        self.save('national-level4-observed-details-v1/details/ENTITY001.json',
                  json.loads(source.read_bytes()))
        source.unlink()
        report = self.audit()
        self.assertEqual(report['counts']['pageFiles'], 3)
        self.assertEqual(report['counts']['detailPairFiles'], 1)
        self.assertEqual(report['counts']['shapeValidDetailPairFiles'], 1)
        self.assertEqual(report['counts']['validDetailPairFiles'], 0)
        self.assertFalse(report['gates']['detail_source_batches_verified'])

    def test_modern_shape_does_not_prove_checkpoint_or_batch_provenance(self):
        self.page([{'axbe0001': 'ENTITY001'}],
                  folder='national-area-first-pages-20261119/area-110000000000')
        self.details()
        source = self.root / 'area-110000000000/details/ENTITY001.json'
        combined = json.loads(source.read_bytes())
        source.unlink()
        folder = 'national-observed-details-20261119'
        self.save(folder + '/details/ENTITY001.json', combined)
        report = self.audit()
        self.assertEqual(report['counts']['idsWithShapeValidDetailPairs'], 1)
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 0)
        self.assertEqual(report['issues']['modern_detail_checkpoint_missing_or_mismatched'], 1)
        self.assertEqual(report['issues']['modern_detail_batch_metadata_missing'], 1)
        for name, wrapper in combined['endpoints'].items():
            self.save(folder + f'/detail-checkpoints/ENTITY001/{name}.json', wrapper)
        self.save(folder + '/manifest.json', {'complete': True})
        self.save(folder + '/queue.json', {'items': [{'institutionId': 'ENTITY001'}],
                                         'sourceInventorySha256': '0' * 64})
        report = self.audit()
        self.assertEqual(report['counts']['checkpointMatchedModernDetailPairs'], 1)
        self.assertFalse(report['gates']['detail_source_batches_verified'])
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 0)
        self.assertEqual(report['issues']['modern_detail_source_batch_unverified'], 1)
        self.save(folder + '/detail-checkpoints/ENTITY001/orgBaseDetail.json', {})
        report = self.audit()
        self.assertEqual(report['issues']['modern_detail_checkpoint_missing_or_mismatched'], 1)
        self.assertEqual(report['counts']['checkpointMatchedModernDetailPairs'], 0)

    def test_modern_provenance_change_is_part_of_snapshot_check(self):
        self.page([{'axbe0001': 'ENTITY001'}])
        self.save('national-level4-observed-details-v1/queue.json', {'items': []})
        original = self.m['input_paths']
        calls = []
        def changing(root):
            calls.append(True)
            if len(calls) == 2:
                self.save('national-level4-observed-details-v1/queue.json', {'mergedItems': []})
            return original(root)
        with patch.dict(self.m['audit'].__globals__, {'input_paths': changing}):
            report = self.audit()
        self.assertFalse(report['gates']['source_files_unchanged_during_audit'])
        self.assertEqual(report['issues']['input_changed_during_audit'], 1)

    def test_large_details_are_aggregated_without_retaining_payloads(self):
        for index in range(12):
            self.details(identifier=f'ENTITY{index:04d}', base={'unreviewed': 'x' * 500000})
        tracemalloc.start()
        try:
            report = self.audit()
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        self.assertLess(peak, 10 * 1024 * 1024)
        self.assertEqual(report['counts']['shapeValidDetailPairFiles'], 12)

    def test_unknown_zero_and_literal_tokens_remain_distinct(self):
        self.page([{'axbe0001': 'ENTITY001', 'ahae2347': 0, 'ahae2323': None,
                    'axbe0003': 'N/A', 'axbe0013': '   ', 'axbe0004': '0'}])
        report = self.audit()
        self.assertEqual(report['fields']['list.ahae2347']['states']['numeric_zero'], 1)
        self.assertEqual(report['fields']['list.ahae2323']['states']['null'], 1)
        self.assertEqual(report['fields']['list.axbe0003']['states']['literal_unknown'], 1)
        self.assertEqual(report['fields']['list.axbe0013']['states']['whitespace'], 1)
        self.assertEqual(report['fields']['list.axbe0004']['states']['string_zero'], 1)
        self.assertEqual(report['fields']['list.axbe0004Name']['states']['missing'], 1)

    def test_capture_time_is_never_effective_date_or_fresh_phone_proof(self):
        self.page([{'axbe0001': 'ENTITY001', 'axbe0003': 'PRIVATE NAME',
                    'ahae0012': 'PRIVATE PHONE', 'ahae2347': 10, 'ahae2323': 2}])
        self.details(base={'axbe0003': 'PRIVATE NAME', 'ahae2572': 'PRIVATE PERSON',
                           'orgBaseInfo': {'updateTime': '2026-11-19'}},
                     care={'ahae2347': 10, 'ahae2323': 2})
        report = self.audit()
        self.assertEqual(report['counts']['uniqueObservedIds'], 1)
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 1)
        field = report['fields']['list.ahae2347']
        self.assertIsNone(field['sourceEffectiveAt'])
        self.assertEqual(field['freshness'], 'unknown')
        self.assertEqual(field['capturedLastAtUtc'], '2026-11-19T00:00:00+00:00')
        self.assertFalse(report['gates']['current_operating_status_verified'])
        self.assertFalse(report['gates']['contact_publication_and_recency_verified'])
        self.assertFalse(report['gates']['legal_identity_verified'])
        self.assertNotIn('PRIVATE', json.dumps(report))

    def test_conflict_never_picks_latest_and_type_code_label_is_not_false_conflict(self):
        self.page([{'axbe0001': 'ENTITY001', 'axbe0003': 'A', 'axbe0004': '1',
                    'axbe0004Name': '养老机构', 'ahae2347': 10}])
        self.details(base={'axbe0003': 'B', 'axbe0004': '养老机构'}, care={'ahae2347': 12})
        report = self.audit()
        self.assertEqual(report['conflicts']['facilityName'], 1)
        self.assertEqual(report['conflicts']['listedBeds'], 1)
        self.assertNotIn('facilityType', report['conflicts'])
        self.assertEqual(report['fields']['orgBaseDetail.axbe0004']['semanticStatus'], 'pending-semantics')
        self.assertFalse(report['gates']['equivalent_fields_conflict_free'])

    def test_bed_invariants_and_wrong_detail_identity_block(self):
        self.page([{'axbe0001': 'ENTITY001', 'ahae2347': 1, 'ahae2323': 2},
                   {'axbe0001': 'ENTITY002', 'ahae2347': -1, 'ahae2323': True}])
        self.details(base={'axbe0001': 'DIFFERENT'})
        report = self.audit()
        self.assertEqual(report['issues']['detail_identity_mismatch'], 1)
        self.assertEqual(report['issues']['nursing_beds_exceed_listed_beds'], 1)
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 0)
        self.assertFalse(report['gates']['bed_values_consistent'])

    def test_legacy_raw_missing_and_future_capture_do_not_become_verified(self):
        self.page([{'axbe0001': 'ENTITY001'}], raw=False)
        self.details()
        report = self.audit()
        self.assertEqual(report['counts']['wrappersWithoutRawBytes'], 1)
        self.assertFalse(report['gates']['all_endpoint_raw_bytes_verified'])
        page = HELPERS['list_page']('110000000000', 1, [{'axbe0001': 'ENTITY002'}])
        page['fetchedAtUtc'] = '2099-01-01T00:00:00+00:00'
        self.save('national-area-first-pages-20261119/area-110000000000/pages/00001.json', page)
        report = self.audit()
        self.assertEqual(report['issues']['invalid_capture_time'], 1)
        self.assertFalse(report['gates']['capture_times_valid'])

    def test_audit_never_modifies_files_or_writes_public_projection(self):
        self.page([{'axbe0001': 'ENTITY001'}])
        before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.audit()
        after = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)

    def test_missing_body_id_is_unknown_not_a_false_identity_conflict(self):
        self.page([{'axbe0001': 'ENTITY001'}])
        self.details(care={'axbe0001': None})
        report = self.audit()
        self.assertTrue(report['gates']['endpoint_identity_consistent'])
        self.assertFalse(report['gates']['detail_body_identity_present'])
        self.assertEqual(report['counts']['idsWithValidDetailPairs'], 1)

    def test_mapped_invalid_types_and_unreviewed_values_cannot_pass_field_gate(self):
        self.page([{'axbe0001': 'ENTITY001', 'axbe0003': ['PRIVATE'],
                    'ahae2347': 10 ** 400, 'unreviewed': 'PRIVATE'}])
        report = self.audit()
        self.assertFalse(report['gates']['mapped_value_types_valid'])
        self.assertFalse(report['gates']['dictionary_semantics_reviewed'])
        self.assertNotIn('PRIVATE', json.dumps(report))

    def test_input_inventory_change_is_explicit_blocker(self):
        self.page([{'axbe0001': 'ENTITY001'}])
        original = self.m['cohort_paths']
        calls = []
        def changing(root, modern):
            if not modern:
                calls.append(True)
            if not modern and len(calls) == 2:
                self.save('area-120000000000/pages/00001.json',
                          HELPERS['list_page']('120000000000', 1,
                                               [{'axbe0001': 'ENTITY002'}]))
            return original(root, modern)
        with patch.dict(self.m['audit'].__globals__, {'cohort_paths': changing}):
            report = self.audit()
        self.assertFalse(report['gates']['source_files_unchanged_during_audit'])
        self.assertEqual(report['issues']['input_changed_during_audit'], 1)

    def test_other_mapped_numeric_and_text_fields_are_type_checked(self):
        self.page([{'axbe0001': 'ENTITY001', 'axbe8004': {'PRIVATE': 1},
                    'evaluationCount': True, 'ahae0633': ['PRIVATE']}])
        report = self.audit()
        for path in ('list.axbe8004', 'list.evaluationCount', 'list.ahae0633'):
            self.assertEqual(report['fields'][path]['invalidValueCount'], 1)
        self.assertFalse(report['gates']['mapped_value_types_valid'])
        self.assertNotIn('PRIVATE', json.dumps(report))


if __name__ == '__main__':
    unittest.main()
