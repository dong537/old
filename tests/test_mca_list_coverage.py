"""Offline coverage audit uses synthetic IDs; reports must remain aggregate-only."""

import base64
import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'audit-mca-list-coverage.py'
PARENT = '110000000000'
CHILD = '110101000000'
UNKNOWN = '110199000000'


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def tree_response(root, parent_id, children):
    body = {'code': 0, 'data': children}
    raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
    save(root / 'area-tree-20261119' / 'responses' / f'{parent_id}.json', {
        'schemaVersion': 1, 'parentId': parent_id,
        'sourceUrl': 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/' + parent_id,
        'method': 'GET', 'httpStatus': 200,
        'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
        'responseSha256': hashlib.sha256(raw).hexdigest(), 'response': body,
    })


def page(path, code, number, total, ids, *, size=2, areas=None, raw=False,
         check_sort=True):
    records = [{'axbe0001': identifier, 'areaCode': area}
               for identifier, area in zip(ids, areas or [code] * len(ids))]
    body = {'code': 0, 'data': {'current': number, 'size': size,
                               'total': total, 'records': records}}
    content = json.dumps(body).encode('utf-8')
    wrapper = {
        'schemaVersion': 1, 'httpStatus': 200,
        'request': {'url': 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/queryOrganizationDataList',
                    'method': 'POST', 'params': {'current': number, 'size': size,
                                                 'areaCode': code,
                                                 **({'checkSort': 1} if check_sort else {})}},
        'response': body, 'responseSha256': hashlib.sha256(content).hexdigest(),
    }
    if raw:
        wrapper['rawBodyBase64'] = base64.b64encode(content).decode('ascii')
    save(path, wrapper)


def legacy_capture(root, name, code, total, pages, *, size=2, check_sort=True):
    folder = root / name
    save(folder / 'manifest.json', {
        'schemaVersion': 1, 'filters': {'areaCode': code, 'ahae0635': None,
                                        'checkSort': 1 if check_sort else None},
        'total': total, 'serverPageSize': size,
        'expectedPages': (total + size - 1) // size,
    })
    for number, (response_total, ids, areas) in pages.items():
        page(folder / 'pages' / f'{number:05d}.json', code, number,
             response_total, ids, size=size, areas=areas, check_sort=check_sort)


def first_manifest(root, *codes):
    first = root / 'national-area-first-pages-20261119'
    save(first / 'manifest.json', {'schemaVersion': 1, 'observations': {
        code: {'storedFileSha256': hashlib.sha256(
            (first / f'area-{code}/pages/00001.json').read_bytes()).hexdigest()}
        for code in codes
    }})


class McaListCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'private'
        tree_response(self.root, '-1', [
            {'id': 'province', 'pid': '-1', 'sbcode': PARENT, 'level': 1, 'name': 'P'},
        ])
        tree_response(self.root, 'province', [
            {'id': 'district', 'pid': 'province', 'sbcode': CHILD,
             'level': 2, 'name': 'C'},
        ])
        tree_response(self.root, 'district', [])
        save(self.root / 'area-tree-20261119' / 'manifest.json', {
            'treeWalkComplete': True, 'pendingParentIds': [],
            'savedResponses': 3, 'discoveredNodes': 2,
            'maxLevel': 3, 'lastError': None, 'rateLimited': False,
        })

    def audit(self):
        self.assertTrue(SCRIPT.is_file(), 'offline auditor script missing')
        return runpy.run_path(str(SCRIPT))['audit_cache'](self.root)

    def test_level_four_cache_without_seed_is_visible_as_unverified(self):
        code = '110101001000'
        first = self.root / 'national-level4-first-pages-v1'
        path = first / f'area-{code}/pages/00001.json'
        page(path, code, 1, 1, ['PRIVATE-L4'], raw=True)
        save(first / 'manifest.json', {'schemaVersion': 1, 'observations': {
            code: {'storedFileSha256': hashlib.sha256(
                path.read_bytes()).hexdigest()}}})
        report = self.audit()
        self.assertIn(code, report['partitions'])
        self.assertEqual(report['summary']['cachedAreaCodesNotInObservedTreeCount'], 1)
        self.assertIn('level4_overlay_source_missing', report['summary']['reasons'])
        self.assertFalse(report['officialLevel4Overlay']['sourceVerified'])
        self.assertNotIn('PRIVATE-L4', json.dumps(report))

    def test_reports_drift_cross_page_duplicate_and_missing_page_without_ids(self):
        legacy_capture(self.root, f'area-{PARENT}-check-sort-1-capture-one', PARENT, 5, {
            1: (5, ['PRIVATE-A', 'PRIVATE-B'], [PARENT, PARENT]),
            2: (4, ['PRIVATE-B', 'PRIVATE-C'], [PARENT, CHILD]),
        })
        report = self.audit()
        item = report['partitions'][PARENT]['captures'][0]
        self.assertEqual(item['totalDrift'], [{'page': 2, 'reportedTotal': 4}])
        self.assertEqual(item['crossPageDuplicateIdCount'], 1)
        self.assertEqual(item['missingPages'], [3])
        self.assertEqual(item['observedUniqueIds'], 3)
        self.assertFalse(item['pageEvidenceComplete'])
        self.assertIsNone(report['summary']['nationalTotal'])
        self.assertFalse(report['summary']['zeroOmissionProven'])
        self.assertNotIn('PRIVATE-A', json.dumps(report))
        self.assertNotIn('PRIVATE-B', json.dumps(report))

    def test_parent_child_residual_is_observed_only_even_with_complete_pages(self):
        legacy_capture(self.root, f'area-{PARENT}-check-sort-1-capture-one', PARENT, 3, {
            1: (3, ['PRIVATE-DIRECT', 'PRIVATE-C1'], [PARENT, CHILD]),
            2: (3, ['PRIVATE-C2'], [CHILD]),
        })
        legacy_capture(self.root, f'area-{CHILD}-check-sort-1-capture-one', CHILD, 2, {
            1: (2, ['PRIVATE-C1', 'PRIVATE-C2'], [CHILD, CHILD]),
        })
        report = self.audit()
        comparison = report['parentChildComparisons'][0]
        self.assertEqual(comparison['observedParentOnlyCount'], 1)
        self.assertEqual(comparison['observedChildOutsideParentCount'], 0)
        self.assertEqual(comparison['observedDirectCount'], 1)
        self.assertEqual(comparison['missingChildCaptureCount'], 0)
        self.assertFalse(report['summary']['zeroOmissionProven'])
        self.assertIn('no_frozen_snapshot_or_unique_id_order',
                      report['summary']['reasons'])
        self.assertEqual(report['auditFingerprintSha256'], self.audit()['auditFingerprintSha256'])

    def test_mixed_query_variants_remain_separate(self):
        legacy_capture(self.root, f'area-{PARENT}-check-sort-1', PARENT, 1, {
            1: (1, ['SORTED-PRIVATE'], [PARENT]),
        })
        legacy_capture(self.root, f'area-{PARENT}-unsorted', PARENT, 2, {
            1: (2, ['UNSORTED-PRIVATE', 'UNSORTED-PRIVATE-2'], [PARENT, PARENT]),
        }, check_sort=False)
        report = self.audit()
        self.assertEqual(report['partitions'][PARENT]['captureCount'], 2)
        self.assertEqual({item['queryVariant']['checkSort']
                          for item in report['partitions'][PARENT]['captures']},
                         {None, 1})
        self.assertFalse(report['partitions'][PARENT]['betweenCaptureTotalDrift'])

    def test_modern_first_small_large_and_wrong_mode_checkpoint(self):
        first = self.root / 'national-area-first-pages-20261119'
        small = self.root / 'national-area-followup-pages-20261119'
        large = self.root / 'national-area-large-pages-20261119'
        page(first / f'area-{PARENT}/pages/00001.json', PARENT, 1, 7,
             ['DIRECT-1', 'CHILD-1'], areas=[PARENT, CHILD], raw=True)
        for number, ids, areas in (
            (2, ['DIRECT-2', 'CHILD-2'], [PARENT, CHILD]),
            (3, ['DIRECT-3', 'CHILD-3'], [PARENT, CHILD]),
            (4, ['DIRECT-4'], [PARENT]),
        ):
            page(large / f'area-{PARENT}/pages/{number:05d}.json',
                 PARENT, number, 7, ids, areas=areas, raw=True)
        page(small / f'area-{PARENT}/pages/00002.json', PARENT, 2, 7,
             ['WRONG-MODE'], raw=True)
        page(first / f'area-{CHILD}/pages/00001.json', CHILD, 1, 3,
             ['CHILD-1', 'CHILD-2'], raw=True)
        page(small / f'area-{CHILD}/pages/00002.json', CHILD, 2, 3,
             ['CHILD-3'], raw=True)
        first_manifest(self.root, PARENT, CHILD)
        report = self.audit()
        parent = report['partitions'][PARENT]['captures'][0]
        child = report['partitions'][CHILD]['captures'][0]
        self.assertEqual(parent['source'], 'first-large')
        self.assertEqual(child['source'], 'first-followup')
        self.assertEqual(parent['validPages'], [1, 2, 3, 4])
        self.assertEqual(child['validPages'], [1, 2])
        self.assertEqual(parent['wrongModeCachedPages'], [2])
        self.assertFalse(parent['pageEvidenceComplete'])
        self.assertTrue(child['pageEvidenceComplete'])
        self.assertNotIn('WRONG-MODE', json.dumps(report))

    def test_extra_checkpoint_changes_audit_fingerprint(self):
        name = f'area-{PARENT}-check-sort-1-capture-one'
        legacy_capture(self.root, name, PARENT, 2, {
            1: (2, ['PRIVATE-1', 'PRIVATE-2'], [PARENT, PARENT]),
        })
        extra = self.root / name / 'pages' / '00002.json'
        page(extra, PARENT, 2, 2, ['SECRET-OLD'], raw=True)
        before = self.audit()
        page(extra, PARENT, 2, 2, ['SECRET-NEW'], raw=True)
        after = self.audit()
        self.assertEqual(after['partitions'][PARENT]['captures'][0]['extraPages'], [2])
        self.assertNotEqual(before['auditFingerprintSha256'],
                            after['auditFingerprintSha256'])
        self.assertNotIn('SECRET-NEW', json.dumps(after))

    def test_orphan_followup_is_visible_without_inventing_first_page_total(self):
        orphan = (self.root / 'national-area-followup-pages-20261119'
                  / f'area-{PARENT}' / 'pages' / '00002.json')
        page(orphan, PARENT, 2, 4, ['PRIVATE-ORPHAN'], raw=True)
        report = self.audit()
        self.assertEqual(report['orphanModernCheckpoints'], [
            {'areaCode': PARENT, 'mode': 'followup', 'cachedPages': [2]},
        ])
        self.assertIn('orphan_followup_without_first_page',
                      report['summary']['reasons'])
        self.assertEqual(report['fingerprintedInputFileCount'], 5)
        self.assertNotIn('PRIVATE-ORPHAN', json.dumps(report))

    def test_page_mutation_during_audit_marks_fingerprint_unstable(self):
        name = f'area-{PARENT}-check-sort-1-capture-one'
        legacy_capture(self.root, name, PARENT, 2, {
            1: (2, ['PRIVATE-1', 'PRIVATE-2'], [PARENT, PARENT]),
        })
        audit = runpy.run_path(str(SCRIPT))['audit_cache']
        globals_ = audit.__globals__
        original = globals_['_read']
        mutated = False

        def changing_read(root, path, inputs):
            nonlocal mutated
            value = original(root, path, inputs)
            if path.name == '00001.json' and not mutated:
                mutated = True
                changed = json.loads(path.read_text(encoding='utf-8'))
                changed['response']['data']['records'][0]['axbe0001'] = 'PRIVATE-NEW'
                save(path, changed)
            return value

        with patch.dict(globals_, {'_read': changing_read}):
            report = audit(self.root)
        self.assertTrue(report['summary']['sourceChangedDuringAudit'])
        self.assertIn('source_changed_during_audit', report['summary']['reasons'])
        self.assertNotIn('PRIVATE-NEW', json.dumps(report))

    def test_new_page_created_during_scan_marks_source_changed(self):
        name = f'area-{PARENT}-check-sort-1-capture-one'
        legacy_capture(self.root, name, PARENT, 2, {
            1: (2, ['PRIVATE-1', 'PRIVATE-2'], [PARENT, PARENT]),
        })
        audit = runpy.run_path(str(SCRIPT))['audit_cache']
        globals_ = audit.__globals__
        original = globals_['_read']
        created = False

        def adding_read(root, path, inputs):
            nonlocal created
            value = original(root, path, inputs)
            if path.name == '00001.json' and not created:
                created = True
                page(self.root / name / 'pages' / '00002.json', PARENT, 2, 2,
                     ['PRIVATE-NEW'], raw=True)
            return value

        with patch.dict(globals_, {'_read': adding_read}):
            report = audit(self.root)
        self.assertTrue(report['summary']['sourceChangedDuringAudit'])
        self.assertIn('source_changed_during_audit', report['summary']['reasons'])

    def test_cached_code_outside_observed_tree_is_not_silently_counted_as_covered(self):
        legacy_capture(self.root, f'area-{UNKNOWN}-check-sort-1', UNKNOWN, 1, {
            1: (1, ['PRIVATE-UNKNOWN'], [UNKNOWN]),
        })
        report = self.audit()
        self.assertEqual(report['summary']['cachedAreaCodesNotInObservedTreeCount'], 1)
        self.assertIn('cached_partition_outside_observed_tree',
                      report['summary']['reasons'])
        self.assertNotIn('PRIVATE-UNKNOWN', json.dumps(report))

    def test_staged_modern_candidate_is_not_a_committed_page(self):
        first = self.root / 'national-area-first-pages-20261119'
        small = self.root / 'national-area-followup-pages-20261119'
        page(first / f'area-{PARENT}/pages/00001.json', PARENT, 1, 3,
             ['PRIVATE-1', 'PRIVATE-2'], raw=True)
        page(small / f'area-{PARENT}/pages/00002.candidate.json',
             PARENT, 2, 3, ['PRIVATE-STAGED'], raw=True)
        report = self.audit()
        item = report['partitions'][PARENT]['captures'][0]
        self.assertEqual(item['missingPages'], [2])
        self.assertEqual(item['validPages'], [1])
        self.assertEqual(report['summary']['unreviewedCachedSourceFileCount'], 0)
        self.assertNotIn('PRIVATE-STAGED', json.dumps(report))

    def test_legacy_without_raw_bytes_cannot_claim_verified_page_evidence(self):
        legacy_capture(self.root, f'area-{PARENT}-check-sort-1', PARENT, 2, {
            1: (2, ['PRIVATE-1', 'PRIVATE-2'], [PARENT, PARENT]),
        })
        item = self.audit()['partitions'][PARENT]['captures'][0]
        self.assertEqual(item['pagesWithoutOriginalHttpBody'], 1)
        self.assertFalse(item['pageEvidenceComplete'])
        self.assertIn('original_http_body_unavailable', item['reasons'])

    def test_modern_first_page_hash_must_match_checkpoint_manifest(self):
        first = self.root / 'national-area-first-pages-20261119'
        page(first / f'area-{PARENT}/pages/00001.json', PARENT, 1, 2,
             ['PRIVATE-1', 'PRIVATE-2'], raw=True)
        first_manifest(self.root, PARENT)
        manifest = first / 'manifest.json'
        changed = json.loads(manifest.read_text(encoding='utf-8'))
        changed['observations'][PARENT]['storedFileSha256'] = '0' * 64
        save(manifest, changed)
        item = self.audit()['partitions'][PARENT]['captures'][0]
        self.assertFalse(item['firstPageManifestHashVerified'])
        self.assertFalse(item['pageEvidenceComplete'])
        self.assertIn('first_page_manifest_hash_mismatch', item['reasons'])

    def test_tree_completion_requires_depth_error_free_state_and_response_closure(self):
        manifest_path = self.root / 'area-tree-20261119' / 'manifest.json'
        baseline = json.loads(manifest_path.read_text(encoding='utf-8'))
        self.assertTrue(self.audit()['sourceTree']['treeWalkComplete'])
        for change in ({'maxLevel': 2}, {'lastError': 'failed'}, {'rateLimited': True}):
            save(manifest_path, {**baseline, **change})
            self.assertFalse(self.audit()['sourceTree']['treeWalkComplete'])
        save(manifest_path, baseline)
        (self.root / 'area-tree-20261119/responses/district.json').unlink()
        tree_response(self.root, 'unrelated', [])
        self.assertFalse(self.audit()['sourceTree']['treeWalkComplete'])

    def test_modern_double_read_retains_first_hash_and_detects_toctou(self):
        first = self.root / 'national-area-first-pages-20261119'
        path = first / f'area-{PARENT}/pages/00001.json'
        page(path, PARENT, 1, 2, ['PRIVATE-OLD-1', 'PRIVATE-OLD-2'], raw=True)
        first_manifest(self.root, PARENT)
        audit = runpy.run_path(str(SCRIPT))['audit_cache']
        globals_ = audit.__globals__
        original = globals_['_read']
        changed = False

        def changing_read(root, target, inputs):
            nonlocal changed
            value = original(root, target, inputs)
            if target == path and not changed:
                changed = True
                page(path, PARENT, 1, 2,
                     ['PRIVATE-NEW-1', 'PRIVATE-NEW-2'], raw=True)
            return value

        with patch.dict(globals_, {'_read': changing_read}):
            report = audit(self.root)
        self.assertTrue(report['summary']['sourceChangedDuringAudit'])
        self.assertIn('source_changed_during_audit', report['summary']['reasons'])

    def test_zero_total_modern_first_page_differs_from_legacy_without_page(self):
        first = self.root / 'national-area-first-pages-20261119'
        page(first / f'area-{PARENT}/pages/00001.json', PARENT, 1, 0,
             [], raw=True)
        first_manifest(self.root, PARENT)
        legacy_capture(self.root, f'area-{CHILD}-check-sort-1', CHILD, 0, {})
        report = self.audit()
        modern = report['partitions'][PARENT]['captures'][0]
        legacy = report['partitions'][CHILD]['captures'][0]
        self.assertEqual(modern['expectedPages'], 0)
        self.assertEqual(modern['validPages'], [1])
        self.assertEqual(modern['extraPages'], [])
        self.assertTrue(modern['pageEvidenceComplete'])
        self.assertEqual(legacy['validPages'], [])
        self.assertFalse(legacy['pageEvidenceComplete'])
        self.assertIn('zero_total_without_first_page', legacy['reasons'])

    def test_legacy_folder_suffix_is_hashed_before_reporting(self):
        name = f'area-{PARENT}-SECRET-PERSON-IDENTIFIER'
        legacy_capture(self.root, name, PARENT, 1, {
            1: (1, ['PRIVATE-1'], [PARENT]),
        })
        report = self.audit()
        self.assertNotIn('SECRET-PERSON-IDENTIFIER', json.dumps(report))
        self.assertTrue(report['partitions'][PARENT]['captures'][0]['captureId'].startswith('legacy-'))

    def test_extra_page_and_within_page_duplicate_have_explicit_reasons(self):
        name = f'area-{PARENT}-check-sort-1'
        legacy_capture(self.root, name, PARENT, 2, {
            1: (2, ['PRIVATE-SAME', 'PRIVATE-SAME'], [PARENT, PARENT]),
            2: (2, ['PRIVATE-EXTRA'], [PARENT]),
        })
        item = self.audit()['partitions'][PARENT]['captures'][0]
        self.assertEqual(item['extraPages'], [2])
        self.assertEqual(item['samePageDuplicateIdCount'], 1)
        self.assertIn('extra_pages', item['reasons'])
        self.assertIn('same_page_duplicates', item['reasons'])

    def test_tree_completion_requires_reachability_from_official_root(self):
        responses = self.root / 'area-tree-20261119/responses'
        tree_response(self.root, '-1', [])
        (responses / 'province.json').unlink()
        (responses / 'district.json').unlink()
        tree_response(self.root, 'orphan', [
            {'id': 'orphan', 'pid': 'orphan', 'sbcode': UNKNOWN,
             'level': 1, 'name': 'Unreachable'},
        ])
        save(self.root / 'area-tree-20261119/manifest.json', {
            'treeWalkComplete': True, 'pendingParentIds': [],
            'savedResponses': 2, 'discoveredNodes': 1,
            'maxLevel': 3, 'lastError': None, 'rateLimited': False,
        })
        source = self.audit()['sourceTree']
        self.assertFalse(source['treeWalkComplete'])
        self.assertFalse(source['responseClosureMatchesDeclaredDepth'])

    def test_tree_response_changed_during_audit_invalidates_tree_summary(self):
        audit = runpy.run_path(str(SCRIPT))['audit_cache']
        globals_ = audit.__globals__
        original = globals_['_source_files']
        inventories = 0

        def changing_inventory(root):
            nonlocal inventories
            inventories += 1
            if inventories == 2:
                tree_response(self.root, 'province', [
                    {'id': 'district', 'pid': 'province', 'sbcode': CHILD,
                     'level': 2, 'name': 'Changed'},
                ])
            return original(root)

        with patch.dict(globals_, {'_source_files': changing_inventory}):
            report = audit(self.root)
        self.assertTrue(report['summary']['sourceChangedDuringAudit'])
        self.assertFalse(report['sourceTree']['treeWalkComplete'])
        self.assertIn('area_tree_changed_during_audit', report['summary']['reasons'])

    def test_unqueried_level_four_child_scope_remains_unverified(self):
        tree_response(self.root, 'district', [
            {'id': 'level3', 'pid': 'district', 'sbcode': '110101001000',
             'level': 3, 'name': 'L3'},
        ])
        tree_response(self.root, 'level3', [
            {'id': 'level4', 'pid': 'level3', 'sbcode': '110101001001',
             'level': 4, 'name': 'L4'},
        ])
        save(self.root / 'area-tree-20261119/manifest.json', {
            'treeWalkComplete': True, 'pendingParentIds': [],
            'savedResponses': 4, 'discoveredNodes': 4,
            'maxLevel': 4, 'lastError': None, 'rateLimited': False,
        })
        report = self.audit()
        self.assertTrue(report['sourceTree']['treeWalkComplete'])
        self.assertTrue(report['sourceTree']['childScopeBeyondTreeUnverified'])
        self.assertIn('deeper_area_child_scope_unverified', report['summary']['reasons'])

    def test_empty_legacy_manifest_is_not_counted_as_cached_pages(self):
        legacy_capture(self.root, f'area-{PARENT}-empty', PARENT, 0, {})
        report = self.audit()
        self.assertEqual(report['summary']['captureCount'], 1)
        self.assertEqual(report['summary']['partitionCountWithCachedPages'], 0)
        self.assertEqual(report['summary']['queryableTreeAreasWithoutCachedPages'], 2)

    def test_private_filter_value_cannot_enter_aggregate_report(self):
        name = f'area-{PARENT}-normal'
        legacy_capture(self.root, name, PARENT, 1, {
            1: (1, ['ROW-ONLY'], [PARENT]),
        })
        manifest_path = self.root / name / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['filters']['ahae0635'] = 'PRIVATE-INSTITUTION-ID'
        save(manifest_path, manifest)
        page_path = self.root / name / 'pages/00001.json'
        wrapper = json.loads(page_path.read_text(encoding='utf-8'))
        wrapper['request']['params']['ahae0635'] = 'PRIVATE-INSTITUTION-ID'
        save(page_path, wrapper)
        with self.assertRaisesRegex(ValueError, 'unsupported list query variant') as caught:
            self.audit()
        self.assertNotIn('PRIVATE-INSTITUTION-ID', str(caught.exception))

    def test_official_subsidy_filter_code_remains_a_distinct_variant(self):
        name = f'area-{PARENT}-subsidy-filter'
        legacy_capture(self.root, name, PARENT, 1, {
            1: (1, ['ROW-ONLY'], [PARENT]),
        })
        manifest_path = self.root / name / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['filters']['ahae0635'] = 1
        save(manifest_path, manifest)
        page_path = self.root / name / 'pages/00001.json'
        wrapper = json.loads(page_path.read_text(encoding='utf-8'))
        wrapper['request']['params']['ahae0635'] = 1
        save(page_path, wrapper)
        report = self.audit()
        self.assertEqual(report['partitions'][PARENT]['captures'][0]['queryVariant'],
                         {'checkSort': 1, 'ahae0635': 1})
        self.assertFalse(report['summary']['zeroOmissionProven'])

    def test_known_invalid_official_code_is_counted_as_coverage_gap(self):
        collector = runpy.run_path(
            str(SCRIPT.with_name('fetch-mca-area-tree.py')),
            run_name='mca_area_tree_for_test')
        anomaly = collector['KNOWN_INVALID_CODE_NODE'].copy()
        parent_id = anomaly['pid']
        responses = self.root / 'area-tree-20261119/responses'
        (responses / 'district.json').unlink()
        tree_response(self.root, '-1', [
            {'id': 'province', 'pid': '-1', 'sbcode': '330000000000',
             'level': 1, 'name': 'Province'},
        ])
        tree_response(self.root, 'province', [
            {'id': parent_id, 'pid': 'province', 'sbcode': '330500000000',
             'level': 2, 'name': 'City'},
        ])
        tree_response(self.root, parent_id, [anomaly])
        wrapper = json.loads((responses / f'{parent_id}.json').read_text(encoding='utf-8'))
        record = collector['invalid_code_record'](anomaly, wrapper)
        manifest_path = self.root / 'area-tree-20261119/manifest.json'
        manifest = {
            'treeWalkComplete': True, 'pendingParentIds': [],
            'savedResponses': 3, 'discoveredNodes': 3,
            'maxLevel': 3, 'lastError': None, 'rateLimited': False,
            'invalidCodeNodeCount': 1, 'invalidCodeNodes': [record],
        }
        save(manifest_path, manifest)
        legacy_capture(self.root, 'area-330500000000-parent', '330500000000', 0, {
            1: (0, [], []),
        })
        report = self.audit()
        self.assertTrue(report['sourceTree']['treeWalkComplete'])
        self.assertEqual(report['sourceTree']['codedNodesObserved'], 2)
        self.assertEqual(report['sourceTree']['invalidCodeNodesObserved'], 1)
        self.assertEqual(report['sourceTree']['uncodedNodesObserved'], 0)
        self.assertEqual(report['summary']['invalidOfficialAreaCodeNodeCount'], 1)
        self.assertIn('invalid_official_area_code_coverage_gap',
                      report['summary']['reasons'])
        comparison = next(item for item in report['parentChildComparisons']
                          if item['parentCode'] == '330500000000')
        self.assertEqual(comparison['invalidCodeChildCount'], 1)
        self.assertEqual(comparison['missingChildCaptureCount'], 0)
        self.assertNotIn(anomaly['id'], json.dumps(report))
        save(manifest_path, {**manifest, 'invalidCodeNodeCount': 0})
        self.assertFalse(self.audit()['sourceTree']['treeWalkComplete'])
        tree_response(self.root, parent_id, [
            {**anomaly, 'sbcode': '33055200001'},
        ])
        with self.assertRaisesRegex(ValueError, 'invalid official area code'):
            self.audit()


if __name__ == '__main__':
    unittest.main()
