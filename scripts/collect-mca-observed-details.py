"""Privately collect details for IDs actually observed in audited MCA list pages.

The queue is not a complete or frozen national register. Each invocation is
serial, bounded, resumable, and shares the site lock and hourly request ledger.
"""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import runpy


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
TREE_DIR = PRIVATE_ROOT / 'area-tree-20261119'
SEED_PATH = PRIVATE_ROOT / 'national-area-tree-seeds-20261119.json'
FIRST_DIR = PRIVATE_ROOT / 'national-area-first-pages-20261119'
FOLLOWUP_DIR = PRIVATE_ROOT / 'national-area-followup-pages-20261119'
LARGE_DIR = PRIVATE_ROOT / 'national-area-large-pages-20261119'
OUTPUT_DIR = PRIVATE_ROOT / 'national-observed-details-20261119'
FETCHER = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-institutions.py'),
                         run_name='mca_observed_detail_fetcher')
FOLLOWUP = runpy.run_path(str(PROJECT / 'scripts' / 'collect-mca-area-followup-pages.py'),
                          run_name='mca_observed_detail_sources')
CONTROLLER_LOCK = FOLLOWUP['CONTROLLER_LOCK']
RUN_ID = re.compile(r'[a-zA-Z0-9-]{1,40}\Z')
# Saved official list pages include seven-character platform IDs.
IDENTIFIER = re.compile(r'[A-Za-z0-9_-]{7,64}\Z')
PAGE_FILE = re.compile(r'([0-9]{5})\.json\Z')


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    try:
        value = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError(f'{path}: missing or unreadable JSON') from error
    if not isinstance(value, dict):
        raise ValueError(f'{path}: expected JSON object')
    return value


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build_queue(seed_path, tree_dir, first_dir, followup_dir, *, large_dir=None,
                seed_loader=None, descendant_seed_path=None):
    """Reaudit sources and retain every observed page for each unique ID."""
    seed_doc, seed_sha, observations, first_sha = FOLLOWUP['first_page_inputs'](
        seed_path, tree_dir, first_dir, seed_loader=seed_loader)
    seeds = seed_doc['seeds']
    descendant_seeds = ()
    descendant_sha = None
    if descendant_seed_path is not None:
        descendant_doc, descendant_sha = FOLLOWUP['verified_descendants'](
            descendant_seed_path, tree_dir)
        descendant_seeds = descendant_doc['seeds']
    by_code = {seed['sbcode']: seed for seed in seeds}
    followup_dir = Path(followup_dir)
    large_dir = Path(large_dir) if large_dir is not None else None
    source_pages = {}
    source_folders = {}
    area_audits = {}
    followup_manifest_path = followup_dir / 'manifest.json'
    prior_followup = read_json(followup_manifest_path) if followup_manifest_path.exists() else None
    if prior_followup is not None:
        if (prior_followup.get('schemaVersion') != 1
                or prior_followup.get('sourceSeedSha256') != seed_sha
                or prior_followup.get('sourceFirstPageManifestSha256') != first_sha
                or prior_followup.get('sourceDescendantSeedSha256') != descendant_sha
                or prior_followup.get('nationalComplete') is not False
                or prior_followup.get('publishable') is not False):
            raise ValueError('followup manifest differs from audited list sources')
    if followup_dir.exists():
        for folder in followup_dir.glob('area-*'):
            code = folder.name.removeprefix('area-')
            if not folder.is_dir() or code not in by_code:
                raise ValueError(f'{folder.name}: unknown followup area')
            pages_dir = folder / 'pages'
            if not pages_dir.is_dir():
                raise ValueError(f'{code}: followup pages directory missing')
            pages = {}
            for path in pages_dir.iterdir():
                match = PAGE_FILE.fullmatch(path.name)
                if not path.is_file() or match is None or int(match.group(1)) < 2:
                    raise ValueError(f'{code}: unexpected followup page file {path.name}')
                page = int(match.group(1))
                pages[page] = FOLLOWUP['checked_followup_page'](path, page, code)
            if sorted(pages) != list(range(2, max(pages, default=1) + 1)):
                raise ValueError(f'{code}: followup page checkpoint gap')
            audited = FOLLOWUP['audit_area'](
                Path(first_dir) / f'area-{code}' / 'pages' / '00001.json',
                folder, by_code[code], seeds, observations[code],
                descendant_seeds=descendant_seeds)
            area_audits[code] = audited
            if prior_followup is not None:
                old = prior_followup.get('areas', {}).get(code)
                if (not isinstance(old, dict)
                        or old.get('pageFiles') != audited['pageFiles']
                        or old.get('issues') != audited['issues']):
                    raise ValueError(f'{code}: followup manifest and cached pages differ')
            source_pages[code] = pages
            source_folders[code] = followup_dir
    if prior_followup is not None:
        areas = prior_followup.get('areas')
        if not isinstance(areas, dict) or not set(source_pages) <= set(areas):
            raise ValueError('followup manifest area inventory invalid')
        for code, area in areas.items():
            if code not in by_code or not isinstance(area, dict):
                raise ValueError('followup manifest includes unknown area')
            if area.get('pageFiles') and code not in source_pages:
                raise ValueError(f'{code}: followup manifest names missing page cache')
    large_manifest_path = large_dir / 'manifest.json' if large_dir is not None else None
    prior_large = (read_json(large_manifest_path)
                   if large_manifest_path is not None and large_manifest_path.exists()
                   else None)
    if large_dir is not None:
        expected_large = {
            code for code, observation in observations.items()
            if 4 <= math.ceil(observation['reportedTotal'] /
                              observation['serverPageSize'])
            <= FOLLOWUP['MAX_LARGE_EXPECTED_PAGES']
        }
        if prior_large is not None:
            areas = prior_large.get('areas')
            if (prior_large.get('schemaVersion') != 1
                    or prior_large.get('pageMode') != 'large'
                    or prior_large.get('sourceSeedSha256') != seed_sha
                    or prior_large.get('sourceFirstPageManifestSha256') != first_sha
                    or prior_large.get('sourceDescendantSeedSha256') != descendant_sha
                    or prior_large.get('nationalComplete') is not False
                    or prior_large.get('snapshotVerified') is not False
                    or prior_large.get('publishable') is not False
                    or not isinstance(areas, dict)
                    or set(areas) != expected_large):
                raise ValueError('large-page manifest differs from audited list sources')
        for folder in large_dir.glob('area-*'):
            code = folder.name.removeprefix('area-')
            if (not folder.is_dir() or code not in expected_large
                    or code in source_pages or prior_large is None):
                raise ValueError(f'{folder.name}: unexpected large-page cache')
            pages_dir = folder / 'pages'
            if not pages_dir.is_dir():
                raise ValueError(f'{code}: large pages directory missing')
            pages = {}
            for path in pages_dir.iterdir():
                match = PAGE_FILE.fullmatch(path.name)
                if not path.is_file() or match is None or int(match.group(1)) < 2:
                    raise ValueError(f'{code}: unexpected large page {path.name}')
                page = int(match.group(1))
                pages[page] = FOLLOWUP['checked_followup_page'](path, page, code)
            if sorted(pages) != list(range(2, max(pages, default=1) + 1)):
                raise ValueError(f'{code}: large-page checkpoint gap')
            source_pages[code] = pages
            source_folders[code] = large_dir
        if prior_large is not None:
            for code in expected_large:
                audited = FOLLOWUP['audit_area'](
                    Path(first_dir) / f'area-{code}' / 'pages' / '00001.json',
                    large_dir / f'area-{code}', by_code[code], seeds,
                    observations[code], descendant_seeds=descendant_seeds)
                prior = prior_large['areas'][code]
                if (not isinstance(prior, dict)
                        or prior.get('pageFiles') != audited['pageFiles']
                        or prior.get('issues') != audited['issues']):
                    raise ValueError(f'{code}: large-page manifest and cache differ')
                area_audits[code] = audited
    for seed in seeds:
        code = seed['sbcode']
        if code not in area_audits:
            area_audits[code] = FOLLOWUP['audit_area'](
                Path(first_dir) / f'area-{code}' / 'pages' / '00001.json',
                followup_dir / f'area-{code}', seed, seeds,
                observations[code], descendant_seeds=descendant_seeds)

    items = {}
    observations_count = 0
    for seed in seeds:
        code = seed['sbcode']
        area = area_audits[code]
        coverage_issues = list(area['issues'])
        if area['savedFollowupPages'] != area['expectedPages'] - 1:
            coverage_issues.append('incompletePageCoverage')
        coverage_issues.sort()
        coverage_verified = area['observedPagesComplete']
        first_path = Path(first_dir) / f'area-{code}' / 'pages' / '00001.json'
        first = read_json(first_path)
        pages = [(1, first_path, first['response']['data']['records'])]
        for page, data in sorted(source_pages.get(code, {}).items()):
            pages.append((page, source_folders[code] / f'area-{code}' / 'pages' / f'{page:05d}.json',
                          data['records']))
        for page, path, records in pages:
            wrapper = read_json(path)
            source = {
                'areaCode': code, 'pageNumber': page,
                'pagePath': str(path), 'storedFileSha256': sha256_file(path),
                'responseSha256': wrapper['responseSha256'],
                'fetchedAtUtc': wrapper['fetchedAtUtc'],
                'areaIssues': area['issues'],
                'listCoverageVerified': coverage_verified,
            }
            for record in records:
                identifier = record['axbe0001']
                if not IDENTIFIER.fullmatch(identifier):
                    raise ValueError(f'{code} page {page}: invalid institution ID')
                observations_count += 1
                item = items.setdefault(identifier, {
                    'institutionId': identifier, 'sourcePages': [],
                    'listCoverageVerified': True, 'listCoverageIssues': [],
                })
                item['sourcePages'].append(source)
                item['listCoverageVerified'] &= coverage_verified
                item['listCoverageIssues'] = sorted(set(item['listCoverageIssues'])
                                                    | set(coverage_issues))
    ordered = [items[identifier] for identifier in sorted(items)]
    inventory_source = ({'items': ordered, 'sourceDescendantSeedSha256':
                         descendant_sha} if descendant_sha is not None else ordered)
    inventory = json.dumps(inventory_source, ensure_ascii=False, sort_keys=True,
                           separators=(',', ':')).encode('utf-8')
    queue = {
        'schemaVersion': 1, 'scope': 'details-for-observed-list-ids-only',
        'sourceSeedSha256': seed_sha, 'sourceFirstPageManifestSha256': first_sha,
        'sourceFollowupManifestSha256': (sha256_file(followup_manifest_path)
                                         if prior_followup is not None else None),
        'sourceLargeManifestSha256': (sha256_file(large_manifest_path)
                                      if prior_large is not None else None),
        'sourceInventorySha256': hashlib.sha256(inventory).hexdigest(),
        'uniqueIdCount': len(ordered), 'sourceObservationCount': observations_count,
        'areaIssues': {code: area['issues'] for code, area in area_audits.items()
                       if area['issues']},
        'nationalComplete': False, 'snapshotVerified': False, 'publishable': False,
        'items': ordered,
    }
    if descendant_sha is not None:
        queue['sourceDescendantSeedSha256'] = descendant_sha
    return queue


def checked_detail_wrapper(name, identifier, wrapper):
    if (not isinstance(wrapper, dict)
            or wrapper.get('request', {}).get('url') != FETCHER['API_BASE'] + name
            or wrapper.get('request', {}).get('method') != 'POST'):
        raise ValueError(f'{identifier}/{name}: detail request provenance invalid')
    FETCHER['checked_detail_endpoint'](name, identifier, wrapper)
    try:
        raw = base64.b64decode(wrapper['rawBodyBase64'], validate=True)
        decoded = json.loads(raw)
        requested = datetime.fromisoformat(wrapper['requestedAtUtc'])
        fetched = datetime.fromisoformat(wrapper['fetchedAtUtc'])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f'{identifier}/{name}: raw detail checkpoint invalid') from error
    if (requested.tzinfo is None or fetched.tzinfo is None
            or hashlib.sha256(raw).hexdigest() != wrapper.get('responseSha256')
            or decoded != wrapper['response']):
        raise ValueError(f'{identifier}/{name}: detail checkpoint hash or response differs')


def scan_detail_cache(output_dir, queue):
    """Check *all* old checkpoints before any new HTTP request is permitted."""
    output_dir = Path(output_dir)
    known = {item['institutionId'] for item in queue['items']}
    checkpoint_root = output_dir / 'detail-checkpoints'
    details_root = output_dir / 'details'
    if checkpoint_root.exists():
        for folder in checkpoint_root.iterdir():
            if not folder.is_dir() or folder.name not in known:
                raise ValueError(f'{folder.name}: unknown detail checkpoint ID')
            for path in folder.iterdir():
                if not path.is_file() or path.name not in {f'{name}.json' for name in FETCHER['DETAIL_PATHS']}:
                    raise ValueError(f'{folder.name}: unexpected detail checkpoint file')
                checked_detail_wrapper(path.stem, folder.name, read_json(path))
    completed = set()
    if details_root.exists():
        for path in details_root.iterdir():
            if not path.is_file() or path.suffix != '.json' or path.stem not in known:
                raise ValueError(f'{path.name}: unknown saved detail')
            identifier = path.stem
            combined = read_json(path)
            endpoints = combined.get('endpoints')
            if (combined.get('schemaVersion') != 1
                    or combined.get('institutionId') != identifier
                    or not isinstance(endpoints, dict)
                    or set(endpoints) != set(FETCHER['DETAIL_PATHS'])):
                raise ValueError(f'{identifier}: saved detail envelope invalid')
            for name in FETCHER['DETAIL_PATHS']:
                checked_detail_wrapper(name, identifier, endpoints[name])
                checkpoint = checkpoint_root / identifier / f'{name}.json'
                if not checkpoint.is_file() or read_json(checkpoint) != endpoints[name]:
                    raise ValueError(f'{identifier}/{name}: detail and checkpoint differ')
            completed.add(identifier)
    return completed


def write_status(path, value, *, exclusive=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if exclusive:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(payload)
    else:
        temporary = path.with_suffix(path.suffix + '.tmp')
        temporary.write_text(payload, encoding='utf-8')
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)


def run_batch(seed_path, tree_dir, first_dir, followup_dir, output_dir, run_id, *,
              max_ids=1, max_requests=6, interval=60, jitter=10, timeout=30,
              expected_source_sha=None, large_dir=None, queue_builder=None,
              descendant_seed_path=None):
    if (not RUN_ID.fullmatch(run_id) or not 1 <= max_ids <= 20
            or not 1 <= max_requests <= 60
            or not math.isfinite(interval) or interval < 60
            or not math.isfinite(jitter) or jitter < 0
            or not math.isfinite(timeout) or timeout <= 0
            or (expected_source_sha is not None
                and (not isinstance(expected_source_sha, str)
                     or not re.fullmatch(r'[0-9a-f]{64}', expected_source_sha)))):
        raise ValueError('invalid bounded detail collection settings')
    seed_path, tree_dir, first_dir, followup_dir, output_dir = map(
        Path, (seed_path, tree_dir, first_dir, followup_dir, output_dir))
    large_dir = Path(large_dir) if large_dir is not None else None
    descendant_seed_path = (Path(descendant_seed_path)
                            if descendant_seed_path is not None else None)
    if not all(path.parent.resolve() == tree_dir.parent.resolve()
               for path in (seed_path, first_dir, followup_dir, output_dir,
                            *((large_dir,) if large_dir is not None else ()),
                            *((descendant_seed_path,)
                              if descendant_seed_path is not None else ()))):
        raise ValueError('detail inputs and output must share the private root')
    status_path = output_dir / 'batch-runs' / f'{run_id}.status.json'
    status = {
        'schemaVersion': 1, 'runId': run_id, 'phase': 'running',
        'startedAtUtc': now_utc(), 'endedAtUtc': None,
        'sourceInventorySha256': None,
        'sourceDescendantSeedSha256': None,
        'uniqueIdCount': None, 'completedDetailCount': 0,
        'newlySavedDetails': 0, 'requestsThisRun': 0,
        'requestBudgetReached': False, 'rateLimited': False,
        'detailsCompleteForObservedIds': False, 'nationalComplete': False,
        'snapshotVerified': False, 'publishable': False,
        'exitCode': None, 'error': None,
    }
    write_status(status_path, status, exclusive=True)
    limiter = None
    queue = None
    completed = set()
    failure = None
    budget_stop = False
    try:
        with CONTROLLER_LOCK(tree_dir.parent / 'batch-runs'):
            with FETCHER['exclusive_run_lock'](tree_dir.parent):
                FETCHER['enforce_site_cooldown'](tree_dir.parent)
                FOLLOWUP['FIRST']['require_hourly_ledger'](tree_dir.parent)
                queue = (queue_builder or build_queue)(
                    seed_path, tree_dir, first_dir, followup_dir,
                    large_dir=large_dir,
                    **({'descendant_seed_path': descendant_seed_path}
                       if queue_builder is None else {}))
                status['sourceInventorySha256'] = queue['sourceInventorySha256']
                status['sourceDescendantSeedSha256'] = queue.get(
                    'sourceDescendantSeedSha256')
                status['uniqueIdCount'] = queue['uniqueIdCount']
                if (expected_source_sha is not None
                        and expected_source_sha != queue['sourceInventorySha256']):
                    raise ValueError('observed detail queue changed since controller preflight')
                manifest_path = output_dir / 'manifest.json'
                if manifest_path.exists():
                    old = read_json(manifest_path)
                    if (old.get('sourceInventorySha256') != queue['sourceInventorySha256']
                            or old.get('sourceSeedSha256') != queue['sourceSeedSha256']
                            or old.get('sourceFirstPageManifestSha256')
                            != queue['sourceFirstPageManifestSha256']
                            or old.get('sourceFollowupManifestSha256')
                            != queue['sourceFollowupManifestSha256']
                            or old.get('sourceLargeManifestSha256')
                            != queue['sourceLargeManifestSha256']
                            or old.get('sourceDescendantSeedSha256')
                            != queue.get('sourceDescendantSeedSha256')
                            or old.get('sourceBaseDetailManifestSha256')
                            != queue.get('sourceBaseDetailManifestSha256')):
                        raise ValueError('detail queue changed since earlier collection')
                completed = scan_detail_cache(output_dir, queue)
                status['completedDetailCount'] = len(completed)
                FETCHER['save_json'](output_dir / 'queue.json', queue)
                limiter = FETCHER['RateLimiter'](
                    interval, jitter, max_requests,
                    tree_dir.parent / 'hourly-request-budget.json')
                for item in queue['items']:
                    identifier = item['institutionId']
                    if identifier in completed:
                        continue
                    if status['newlySavedDetails'] >= max_ids or limiter.exhausted.is_set():
                        break
                    write_status(status_path, status)
                    try:
                        FETCHER['collect_detail'](
                            identifier, output_dir, limiter, timeout, 1,
                            preserve_raw=True)
                    except FETCHER['BudgetExhausted']:
                        budget_stop = True
                        break
                    # Newly written data receives the same offline audit as reused data.
                    completed = scan_detail_cache(output_dir, queue)
                    status['completedDetailCount'] = len(completed)
                    status['newlySavedDetails'] += 1
                    status['requestsThisRun'] = limiter.requests_started
                    write_status(status_path, status)
                manifest = {
                    'schemaVersion': 1, 'scope': queue['scope'],
                    'sourceSeedSha256': queue['sourceSeedSha256'],
                    'sourceFirstPageManifestSha256': queue[
                        'sourceFirstPageManifestSha256'],
                    'sourceFollowupManifestSha256': queue[
                        'sourceFollowupManifestSha256'],
                    'sourceLargeManifestSha256': queue[
                        'sourceLargeManifestSha256'],
                    'sourceInventorySha256': queue['sourceInventorySha256'],
                    'uniqueIdCount': queue['uniqueIdCount'],
                    'completedDetailCount': len(completed),
                    'detailsCompleteForObservedIds': len(completed) == queue['uniqueIdCount'],
                    'nationalComplete': False, 'snapshotVerified': False,
                    'publishable': False, 'auditedAtUtc': now_utc(),
                }
                if 'sourceBaseDetailManifestSha256' in queue:
                    manifest['sourceBaseDetailManifestSha256'] = queue[
                        'sourceBaseDetailManifestSha256']
                if 'sourceDescendantSeedSha256' in queue:
                    manifest['sourceDescendantSeedSha256'] = queue[
                        'sourceDescendantSeedSha256']
                FETCHER['save_json'](manifest_path, manifest)
    except (FETCHER['FetchError'], RuntimeError, ValueError, OSError, TypeError) as error:
        failure = f'{type(error).__name__}: {error}'
    finally:
        if limiter is not None and limiter.blocked.is_set():
            FETCHER['save_json'](tree_dir.parent / 'rate-limit.json', {
                'reason': limiter.block_reason, 'detectedAtUtc': now_utc(),
                'cooldownUntilUtc': limiter.cooldown_until_utc,
            })
        complete = queue is not None and len(completed) == queue['uniqueIdCount']
        status.update({
            'phase': 'finished', 'endedAtUtc': now_utc(),
            'requestsThisRun': limiter.requests_started if limiter else 0,
            'requestBudgetReached': (limiter.exhausted.is_set() if limiter else False)
                                    or budget_stop,
            'rateLimited': limiter.blocked.is_set() if limiter else False,
            'completedDetailCount': len(completed),
            'detailsCompleteForObservedIds': complete,
            'exitCode': 2 if failure else 0 if complete else 1,
            'error': failure,
        })
        write_status(status_path, status)
    return status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--max-ids', type=int, default=1)
    parser.add_argument('--max-requests', type=int, default=6)
    parser.add_argument('--interval', type=float, default=60)
    parser.add_argument('--jitter', type=float, default=10)
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--expected-source-sha256')
    parser.add_argument('--official-descendants-overlay-v1', action='store_true')
    args = parser.parse_args(argv)
    status = run_batch(SEED_PATH, TREE_DIR, FIRST_DIR, FOLLOWUP_DIR, OUTPUT_DIR,
                       args.run_id, max_ids=args.max_ids,
                       max_requests=args.max_requests,
                       interval=args.interval, jitter=args.jitter, timeout=args.timeout,
                       expected_source_sha=args.expected_source_sha256,
                       large_dir=LARGE_DIR,
                       descendant_seed_path=(PRIVATE_ROOT /
                           'national-area-level4-overlay-seeds.v1.json'
                           if args.official_descendants_overlay_v1 else None))
    print(json.dumps(status, ensure_ascii=False), flush=True)
    return status['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
