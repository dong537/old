"""Private fourth-level list observations and incremental detail collection.

This entrypoint runs one bounded collector batch. It never declares national
coverage or publishes source data; source and checkpoint audits are offline.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import runpy


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'data/private/mca-institutions-2026-11-18'
TREE = ROOT / 'area-tree-20261119'
OVERLAY_PATH = ROOT / 'national-area-level4-overlay-seeds.v1.json'
BASE_SEED = ROOT / 'national-area-tree-seeds-20261119.json'
BASE_FIRST = ROOT / 'national-area-first-pages-20261119'
BASE_FOLLOWUP = ROOT / 'national-area-followup-pages-20261119'
BASE_LARGE = ROOT / 'national-area-large-pages-20261119'
BASE_DETAILS = ROOT / 'national-observed-details-20261119'
FIRST_DIR = ROOT / 'national-level4-first-pages-v1'
FOLLOWUP_DIR = ROOT / 'national-level4-followup-pages-v1'
LARGE_DIR = ROOT / 'national-level4-large-pages-v1'
DETAIL_DIR = ROOT / 'national-level4-observed-details-v1'
BUILDER = runpy.run_path(str(PROJECT / 'scripts/build-mca-level4-overlay-seeds.py'),
                         run_name='mca_level4_observed_builder')
FIRST = runpy.run_path(str(PROJECT / 'scripts/collect-mca-area-first-pages.py'),
                       run_name='mca_level4_observed_first')
FOLLOWUP = runpy.run_path(str(PROJECT / 'scripts/collect-mca-area-followup-pages.py'),
                          run_name='mca_level4_observed_followup')
DETAIL = runpy.run_path(str(PROJECT / 'scripts/collect-mca-observed-details.py'),
                        run_name='mca_level4_observed_detail')
FIRST_AUTO = runpy.run_path(str(PROJECT / 'scripts/run-mca-area-first-pages-auto.py'),
                            run_name='mca_level4_first_chain')
FOLLOWUP_AUTO = runpy.run_path(str(PROJECT / 'scripts/run-mca-area-followup-auto.py'),
                               run_name='mca_level4_page_chain')
DETAIL_AUTO = runpy.run_path(str(PROJECT / 'scripts/run-mca-observed-details-auto.py'),
                             run_name='mca_level4_detail_chain')
PREFIX = {'first': 'l4first-v1', 'small': 'l4small-v1',
          'large': 'l4large-v1', 'details': 'l4detail-v1'}


def paths(root):
    root = Path(root)
    return {
        'tree': root / TREE.name,
        'seed': root / OVERLAY_PATH.name,
        'baseSeed': root / BASE_SEED.name,
        'baseFirst': root / BASE_FIRST.name,
        'baseFollowup': root / BASE_FOLLOWUP.name,
        'baseLarge': root / BASE_LARGE.name,
        'baseDetails': root / BASE_DETAILS.name,
        'first': root / FIRST_DIR.name,
        'small': root / FOLLOWUP_DIR.name,
        'large': root / LARGE_DIR.name,
        'details': root / DETAIL_DIR.name,
    }


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_overlay_seeds(seed_path, tree_dir):
    """Rebuild the immutable seed from terminal raw tree/probe evidence."""
    return BUILDER['load_verified_overlay'](seed_path, tree_dir)


def _source_manifest_matches(manifest, queue):
    return (all(manifest.get(key) == queue[key] for key in (
        'sourceSeedSha256', 'sourceFirstPageManifestSha256',
        'sourceFollowupManifestSha256', 'sourceLargeManifestSha256',
        'sourceInventorySha256', 'uniqueIdCount'))
        and manifest.get('sourceDescendantSeedSha256') ==
        queue.get('sourceDescendantSeedSha256'))


def build_incremental_queue(root=ROOT):
    """Merge observed IDs with all source pages, query only missing details."""
    location = paths(root)
    overlay, overlay_sha = load_overlay_seeds(location['seed'], location['tree'])
    if not overlay['seedCount']:
        raise ValueError('no coded fourth-level seeds require detail collection')
    base_queue = DETAIL['build_queue'](
        location['baseSeed'], location['tree'], location['baseFirst'],
        location['baseFollowup'], large_dir=location['baseLarge'],
        descendant_seed_path=location['seed'])
    overlay_queue = DETAIL['build_queue'](
        location['seed'], location['tree'], location['first'],
        location['small'], large_dir=location['large'],
        seed_loader=load_overlay_seeds)
    base_manifest_path = location['baseDetails'] / 'manifest.json'
    base_manifest = DETAIL['read_json'](base_manifest_path)
    if (not _source_manifest_matches(base_manifest, base_queue)
            or base_manifest.get('detailsCompleteForObservedIds') is not True
            or base_manifest.get('completedDetailCount') != base_queue['uniqueIdCount']
            or base_manifest.get('publishable') is not False):
        raise ValueError('original observed-detail manifest is incomplete or changed')
    number, complete, source_sha, total, count = DETAIL_AUTO['resume_state'](
        location['baseDetails'], 'detail-20261119-auto', 5000)
    if (not complete or source_sha != base_queue['sourceInventorySha256']
            or total != count or count != base_queue['uniqueIdCount']):
        raise RuntimeError('original observed-detail batch chain incomplete')
    completed = DETAIL['scan_detail_cache'](location['baseDetails'], base_queue)
    if len(completed) != base_queue['uniqueIdCount']:
        raise RuntimeError('original detail checkpoints incomplete')
    merged = {}
    for source_queue in (base_queue, overlay_queue):
        for item in source_queue['items']:
            identifier = item['institutionId']
            if identifier not in merged:
                merged[identifier] = {
                    'institutionId': identifier, 'sourcePages': [],
                    'listCoverageVerified': True, 'listCoverageIssues': [],
                }
            target = merged[identifier]
            target['sourcePages'].extend(item['sourcePages'])
            target['listCoverageVerified'] &= item['listCoverageVerified']
            target['listCoverageIssues'] = sorted(set(target['listCoverageIssues'])
                                                  | set(item['listCoverageIssues']))
    merged_items = [merged[identifier] for identifier in sorted(merged)]
    new_items = [item for item in merged_items
                 if item['institutionId'] not in completed]
    base_manifest_sha = sha256_file(base_manifest_path)
    inventory = json.dumps({
        'mergedItems': merged_items,
        'baseDetailManifestSha256': base_manifest_sha,
        'baseSourceInventorySha256': base_queue['sourceInventorySha256'],
        'overlaySourceInventorySha256': overlay_queue['sourceInventorySha256'],
        'overlaySeedSha256': overlay_sha,
    }, ensure_ascii=False, sort_keys=True,
        separators=(',', ':')).encode('utf-8')
    return {
        'schemaVersion': 1,
        'scope': 'level4-incremental-details-for-observed-ids-only',
        'sourceSeedSha256': overlay_queue['sourceSeedSha256'],
        'sourceFirstPageManifestSha256':
            overlay_queue['sourceFirstPageManifestSha256'],
        'sourceFollowupManifestSha256':
            overlay_queue['sourceFollowupManifestSha256'],
        'sourceLargeManifestSha256': overlay_queue['sourceLargeManifestSha256'],
        'sourceBaseDetailManifestSha256': base_manifest_sha,
        'sourceBaseInventorySha256': base_queue['sourceInventorySha256'],
        'sourceOverlayInventorySha256': overlay_queue['sourceInventorySha256'],
        'sourceInventorySha256': hashlib.sha256(inventory).hexdigest(),
        'mergedUniqueIdCount': len(merged_items),
        'reusedOriginalDetailCount': len(completed),
        'uniqueIdCount': len(new_items),
        'sourceObservationCount': base_queue['sourceObservationCount']
                                  + overlay_queue['sourceObservationCount'],
        'nationalComplete': False, 'snapshotVerified': False,
        'publishable': False,
        'mergedItems': merged_items, 'items': new_items,
    }


def _same_manifest(observed, expected):
    observed, expected = dict(observed), dict(expected)
    observed.pop('auditedAtUtc', None)
    expected.pop('auditedAtUtc', None)
    return observed == expected


def first_state(root=ROOT):
    """Return completion, next batch and coded seed count after full audit."""
    location = paths(root)
    with FOLLOWUP['CONTROLLER_LOCK'](Path(root) / 'batch-runs'):
        with FIRST['FETCHER']['exclusive_run_lock'](root):
            FIRST['FETCHER']['enforce_site_cooldown'](root)
            FIRST['require_hourly_ledger'](root)
            document, seed_sha = load_overlay_seeds(
                location['seed'], location['tree'])
            seeds = document['seeds']
            observations = FIRST['scan_cache'](location['first'], seeds, seed_sha)
            manifest_path = location['first'] / 'manifest.json'
            if manifest_path.exists():
                manifest = FIRST['read_json'](manifest_path)
                expected = FIRST['progress_document'](
                    location['seed'], seed_sha, seeds, observations)
                if not _same_manifest(manifest, expected):
                    raise RuntimeError('level-four first-page manifest differs from cache')
            elif observations:
                raise RuntimeError('level-four first-page cache lacks manifest')
            next_number, complete, old_sha = FIRST_AUTO['resume_state'](
                location['first'], PREFIX['first'], 5000)
            if old_sha is not None and old_sha != seed_sha:
                raise RuntimeError('level-four first-page source changed across batches')
            count, total = len(observations), len(seeds)
            if (count and old_sha is None
                    or complete and count != total
                    or count == total and total > 0 and not complete):
                raise RuntimeError('level-four first-page batch chain and cache differ')
            return count == total, next_number, total


def page_state(mode, root=ROOT):
    """Reaudit overlay page manifests, source pages and batch status chain."""
    if mode not in ('small', 'large'):
        raise ValueError('invalid level-four page mode')
    if not first_state(root)[0]:
        raise RuntimeError('level-four first pages are not complete')
    location = paths(root)
    output = location[mode]
    with FOLLOWUP['CONTROLLER_LOCK'](Path(root) / 'batch-runs'):
        with FOLLOWUP['FETCHER']['exclusive_run_lock'](root):
            FOLLOWUP['FETCHER']['enforce_site_cooldown'](root)
            FIRST['require_hourly_ledger'](root)
            document, seed_sha, observations, first_sha = (
                FOLLOWUP['first_page_inputs'](
                    location['seed'], location['tree'], location['first'],
                    seed_loader=load_overlay_seeds))
            eligible, skipped = [], 0
            for seed in document['seeds']:
                obs = observations[seed['sbcode']]
                pages = math.ceil(obs['reportedTotal'] / obs['serverPageSize'])
                if ((mode == 'small' and 2 <= pages <= 3)
                        or (mode == 'large' and 4 <= pages <=
                            FOLLOWUP['MAX_LARGE_EXPECTED_PAGES'])):
                    eligible.append(seed)
                elif pages > (FOLLOWUP['MAX_EXPECTED_PAGES'] if mode == 'small'
                              else FOLLOWUP['MAX_LARGE_EXPECTED_PAGES']):
                    skipped += 1
            areas = {}
            for seed in eligible:
                code = seed['sbcode']
                areas[code] = FOLLOWUP['audit_area'](
                    location['first'] / f'area-{code}' / 'pages' / '00001.json',
                    output / f'area-{code}', seed, document['seeds'],
                    observations[code])
            manifest_path = output / 'manifest.json'
            if manifest_path.exists():
                manifest = FOLLOWUP['read_json'](manifest_path)
                expected = FOLLOWUP['progress_document'](
                    seed_sha, first_sha, areas, skipped, mode)
                if not _same_manifest(manifest, expected):
                    raise RuntimeError(f'level-four {mode} manifest differs from cache')
            elif any(output.glob('area-*')):
                raise RuntimeError(f'level-four {mode} cache lacks manifest')
            count = sum(area['observedPagesComplete' if mode == 'small'
                             else 'savedFollowupPages'] ==
                        (True if mode == 'small' else area['expectedPages'] - 1)
                        for area in areas.values())
            if mode == 'small' and any(area['issues'] for area in areas.values()):
                raise RuntimeError('level-four small-page area needs manual review')
            next_number, complete, old_seed, old_first, old_total, old_count = (
                FOLLOWUP_AUTO['resume_state'](output, PREFIX[mode], 5000, mode))
            total = len(eligible)
            if (old_seed is not None and (seed_sha, first_sha, total, count)
                    != (old_seed, old_first, old_total, old_count)):
                raise RuntimeError(f'level-four {mode} page batch source differs')
            if (count and old_seed is None
                    or complete and count != total
                    or count == total and total > 0 and not complete):
                raise RuntimeError(f'level-four {mode} page chain and cache differ')
            return count == total, next_number, total


def detail_state(root=ROOT):
    """Require completed source chains and one fixed incremental queue."""
    if not page_state('small', root)[0] or not page_state('large', root)[0]:
        raise RuntimeError('level-four observed pages are not complete')
    location = paths(root)
    with FOLLOWUP['CONTROLLER_LOCK'](Path(root) / 'batch-runs'):
        with DETAIL['FETCHER']['exclusive_run_lock'](root):
            DETAIL['FETCHER']['enforce_site_cooldown'](root)
            FIRST['require_hourly_ledger'](root)
            queue = build_incremental_queue(root)
            manifest_path = location['details'] / 'manifest.json'
            queue_path = location['details'] / 'queue.json'
            if queue_path.exists() and DETAIL['read_json'](queue_path) != queue:
                raise RuntimeError('level-four merged queue changed since prior batch')
            manifest = None
            if manifest_path.exists():
                manifest = DETAIL['read_json'](manifest_path)
                if (not _source_manifest_matches(manifest, queue)
                        or manifest.get('sourceBaseDetailManifestSha256') !=
                        queue['sourceBaseDetailManifestSha256']
                        or manifest.get('publishable') is not False):
                    raise RuntimeError('level-four detail manifest source differs')
            completed = DETAIL['scan_detail_cache'](location['details'], queue)
            total, count = queue['uniqueIdCount'], len(completed)
            if count and manifest is None:
                raise RuntimeError('level-four detail cache lacks manifest')
            if manifest is not None and (
                    type(manifest.get('uniqueIdCount')) is not int
                    or manifest['uniqueIdCount'] != total
                    or type(manifest.get('completedDetailCount')) is not int
                    or manifest['completedDetailCount'] != count
                    or manifest.get('detailsCompleteForObservedIds') is not (count == total)
                    or manifest.get('nationalComplete') is not False
                    or manifest.get('snapshotVerified') is not False):
                raise RuntimeError('level-four detail manifest differs from cache')
            next_number, complete, old_sha, old_total, old_count = (
                DETAIL_AUTO['resume_state'](
                    location['details'], PREFIX['details'], 5000))
            if (old_sha is not None and (old_sha, old_total, old_count)
                    != (queue['sourceInventorySha256'], total, count)):
                raise RuntimeError('level-four detail batch source differs')
            if (count and old_sha is None
                    or complete and count != total
                    or count == total and total > 0 and not complete):
                raise RuntimeError('level-four detail chain and cache differ')
            if total == 0 and not (queue_path.is_file()
                                   and manifest_path.is_file() and complete):
                return False, next_number, total
            return count == total, next_number, total


def stage_state(stage, root=ROOT):
    if stage == 'first':
        return first_state(root)
    if stage in ('small', 'large'):
        return page_state(stage, root)
    if stage == 'details':
        return detail_state(root)
    raise ValueError('invalid level-four collection stage')


def run_batch(stage, number, root=ROOT):
    if stage not in PREFIX or not 1 <= number <= 5000:
        raise ValueError('invalid level-four stage or batch number')
    complete, next_number, total = stage_state(stage, root)
    if complete:
        return {'exitCode': 0, 'reason': 'stage already complete',
                'selectedCount': total}
    if next_number != number:
        raise RuntimeError('level-four batch number differs from audited chain')
    location = paths(root)
    run_id = f'{PREFIX[stage]}-{number:04d}'
    if stage == 'first':
        return FIRST['run_batch'](
            location['seed'], location['tree'], location['first'], run_id,
            max_areas=20, max_requests=20, interval=60, jitter=10,
            seed_loader=load_overlay_seeds)
    if stage in ('small', 'large'):
        return FOLLOWUP['run_batch'](
            location['seed'], location['tree'], location['first'],
            location[stage], run_id, max_areas=5, max_requests=12,
            max_expected_pages=(FOLLOWUP['MAX_EXPECTED_PAGES']
                                if stage == 'small' else
                                FOLLOWUP['MAX_LARGE_EXPECTED_PAGES']),
            interval=60, jitter=10, page_mode=stage,
            seed_loader=load_overlay_seeds)
    return DETAIL['run_batch'](
        location['seed'], location['tree'], location['first'],
        location['small'], location['details'], run_id,
        max_ids=12, max_requests=30, interval=60, jitter=10,
        large_dir=location['large'],
        queue_builder=lambda *_args, **_kwargs: build_incremental_queue(root))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True, choices=tuple(PREFIX))
    parser.add_argument('--batch-number', required=True, type=int)
    args = parser.parse_args(argv)
    try:
        result = run_batch(args.stage, args.batch_number)
        return result['exitCode']
    except (RuntimeError, OSError, ValueError) as error:
        print(json.dumps({'exitCode': 2,
                          'reason': f'{type(error).__name__}: {error}',
                          'publishable': False}, ensure_ascii=False), flush=True)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
