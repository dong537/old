"""Privately observe official-area list pages 2..N in bounded batches.

Small mode covers 2-3-page areas; large mode covers 4+ pages. Neither mode
proves a frozen or complete national institution snapshot.
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
OUTPUT_DIR = PRIVATE_ROOT / 'national-area-followup-pages-20261119'
LARGE_OUTPUT_DIR = PRIVATE_ROOT / 'national-area-large-pages-20261119'
FETCHER = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-institutions.py'),
                         run_name='mca_followup_fetcher')
FIRST = runpy.run_path(str(PROJECT / 'scripts' / 'collect-mca-area-first-pages.py'),
                       run_name='mca_first_page_audit')
OVERLAY_BUILDER = runpy.run_path(
    str(PROJECT / 'scripts' / 'build-mca-level4-overlay-seeds.py'),
    run_name='mca_followup_official_descendants')
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts' / 'run-mca-tree-auto-resume.py'),
                           run_name='mca_controller_lock')
CONTROLLER_LOCK = TREE_AUTO['controller_lock']
RUN_ID = re.compile(r'[a-zA-Z0-9-]{1,40}\Z')
PAGE_FILE = re.compile(r'([0-9]{5})\.json\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')
MAX_EXPECTED_PAGES = 3
MAX_LARGE_EXPECTED_PAGES = 5000


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    try:
        value = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError(f'{path}: missing or unreadable') from error
    if not isinstance(value, dict):
        raise ValueError(f'{path}: expected JSON object')
    return value


def first_page_inputs(seed_path, tree_dir, first_dir, *, seed_loader=None):
    """Reaudit the complete seed, all first-page caches and their manifest."""
    seed_doc, seed_sha = (seed_loader or FIRST['load_verified_seeds'])(
        seed_path, tree_dir)
    path = Path(first_dir) / 'manifest.json'
    raw = path.read_bytes()
    manifest = read_json(path)
    if (manifest.get('schemaVersion') != 1
            or manifest.get('sourceSeedSha256') != seed_sha
            or manifest.get('allFirstPagesCached') is not True
            or manifest.get('publishable') is not False
            or manifest.get('nationalComplete') is not False
            or manifest.get('completedAreaCount') != seed_doc['seedCount']
            or manifest.get('seedCount') != seed_doc['seedCount']):
        raise ValueError('first-page manifest is incomplete or differs from official seeds')
    observations = FIRST['scan_cache'](first_dir, seed_doc['seeds'], seed_sha)
    if (len(observations) != seed_doc['seedCount']
            or set(manifest.get('completedAreaCodes', [])) != set(observations)):
        raise ValueError('first-page cache and manifest coverage differ')
    return seed_doc, seed_sha, observations, hashlib.sha256(raw).hexdigest()


def allowed_area_codes(seed, all_seeds):
    node_id = seed['sourceNodeId']
    return {item['sbcode'] for item in all_seeds
            if node_id in item['officialPathNodeIds']}


def verified_descendants(seed_path, tree_dir):
    """Only an immutable official overlay may extend ancestry validation."""
    return OVERLAY_BUILDER['load_verified_overlay'](seed_path, tree_dir)


def checked_followup_page(path, page, code):
    wrapper = read_json(path)
    request = wrapper.get('request')
    if (not isinstance(request, dict)
            or request.get('url')
            != FETCHER['API_BASE'] + FETCHER['LIST_PATH']
            or request.get('method') != 'POST'):
        raise ValueError(f'{code} page {page}: source request differs')
    for field in ('requestedAtUtc', 'fetchedAtUtc'):
        try:
            parsed = datetime.fromisoformat(wrapper[field])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f'{code} page {page}: {field} invalid') from error
        if parsed.tzinfo is None:
            raise ValueError(f'{code} page {page}: {field} lacks timezone')
    try:
        raw = base64.b64decode(wrapper['rawBodyBase64'], validate=True)
        if json.loads(raw) != wrapper.get('response'):
            raise ValueError('raw JSON differs')
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f'{code} page {page}: raw response differs') from error
    if hashlib.sha256(raw).hexdigest() != wrapper.get('responseSha256'):
        raise ValueError(f'{code} page {page}: raw response SHA-256 differs')
    data = FETCHER['checked_page'](wrapper, page, code, True)
    if type(data['total']) is not int or data['total'] < 0:
        raise ValueError(f'{code} page {page}: total invalid')
    return data


def audit_area(first_path, followup_folder, seed, all_seeds, first_observation,
               *, descendant_seeds=()):
    """Audit cached page IDs, totals, lengths and official code ancestry."""
    code = seed['sbcode']
    total = first_observation['reportedTotal']
    size = first_observation['serverPageSize']
    expected = math.ceil(total / size)
    allowed = allowed_area_codes(seed, [*all_seeds, *descendant_seeds])
    pages_dir = followup_folder / 'pages'
    saved = {}
    if pages_dir.exists():
        for path in pages_dir.iterdir():
            match = PAGE_FILE.fullmatch(path.name)
            if (not path.is_file() or match is None
                    or not 2 <= int(match.group(1)) <= expected):
                raise ValueError(f'{code}: unexpected followup page file {path.name}')
            page = int(match.group(1))
            saved[page] = checked_followup_page(path, page, code)
    if saved and sorted(saved) != list(range(2, max(saved) + 1)):
        raise ValueError(f'{code}: followup page checkpoint gap')
    first = FIRST['checked_cached_page'](first_path, code)
    if (first['storedFileSha256'] != first_observation['storedFileSha256']
            or first['reportedTotal'] != total
            or first['serverPageSize'] != size):
        raise ValueError(f'{code}: first page changed since manifest audit')
    first_data = read_json(first_path)['response']['data']
    ids = set()
    issues = set()
    page_files = {}
    for page, data in [(1, first_data), *sorted(saved.items())]:
        if data['total'] != total:
            issues.add('totalDrift')
        if data['size'] != size:
            issues.add('sizeDrift')
        expected_length = min(size, max(0, total - (page - 1) * size))
        if len(data['records']) != expected_length:
            issues.add('pageLengthMismatch')
        for record in data['records']:
            identifier = record['axbe0001']
            if identifier in ids:
                issues.add('duplicateIds')
            ids.add(identifier)
            if record.get('areaCode') not in allowed:
                issues.add('areaCodeOutsideOfficialSubtree')
        if page > 1:
            path = pages_dir / f'{page:05d}.json'
            page_files[str(page)] = {
                'path': str(path), 'fileSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'responseSha256': read_json(path)['responseSha256'],
                'requestedAtUtc': read_json(path)['requestedAtUtc'],
            }
    observed_complete = (len(saved) == expected - 1 and not issues
                         and len(ids) == total)
    return {
        'sourceNodeId': seed['sourceNodeId'], 'areaCode': code,
        'directHangReviewRequired': seed.get('directHangReviewRequired', True),
        'uncodedAncestorReviewRequired': seed['uncodedAncestorReviewRequired'],
        'reportedTotal': total, 'serverPageSize': size,
        'expectedPages': expected, 'savedFollowupPages': len(saved),
        'nextPage': max(saved, default=1) + 1,
        'observedRowsUniqueIds': len(ids), 'issues': sorted(issues),
        'pageFiles': page_files, 'observedPagesComplete': observed_complete,
        'snapshotVerified': False, 'institutionListComplete': False,
    }


def progress_document(seed_sha, first_sha, areas, skipped, page_mode='small',
                      descendant_sha=None):
    progress = {
        'schemaVersion': 1,
        'scope': ('official-small-area-followup-pages' if page_mode == 'small'
                  else 'official-large-area-page-observations'),
        'pageMode': page_mode,
        'sourceSeedSha256': seed_sha,
        'sourceFirstPageManifestSha256': first_sha,
        'selectedAreaCount': len(areas), 'skippedLargeAreaCount': skipped,
        'areasPagesObservedComplete': sum(
            item['savedFollowupPages'] == item['expectedPages'] - 1
            for item in areas.values()),
        'areasObservedComplete': sum(item['observedPagesComplete']
                                     for item in areas.values()),
        'areasUnverified': sum(bool(item['issues']) for item in areas.values()),
        'nationalComplete': False, 'snapshotVerified': False,
        'publishable': False, 'auditedAtUtc': now_utc(), 'areas': areas,
    }
    if descendant_sha is not None:
        progress['sourceDescendantSeedSha256'] = descendant_sha
    return progress


def write_status(path, status, *, exclusive=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(status, ensure_ascii=False, indent=2) + '\n'
    if exclusive:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(payload)
    else:
        temp = path.with_suffix(path.suffix + '.tmp')
        temp.write_text(payload, encoding='utf-8')
        os.chmod(temp, 0o600)
        os.replace(temp, path)


def run_batch(seed_path, tree_dir, first_dir, output_dir, run_id, *,
              max_areas=5, max_requests=12, max_expected_pages=3,
              interval=60, jitter=10, timeout=30, page_mode='small',
              seed_loader=None, descendant_seed_path=None):
    if (not RUN_ID.fullmatch(run_id) or not 1 <= max_areas <= 20
            or not 1 <= max_requests <= 60
            or (page_mode == 'small' and max_expected_pages != MAX_EXPECTED_PAGES)
            or (page_mode == 'large' and max_expected_pages != MAX_LARGE_EXPECTED_PAGES)
            or page_mode not in ('small', 'large')
            or not math.isfinite(interval) or interval < 60
            or not math.isfinite(jitter) or jitter < 0
            or not math.isfinite(timeout) or timeout <= 0):
        raise ValueError('invalid bounded followup collection settings')
    seed_path, tree_dir, first_dir, output_dir = map(
        Path, (seed_path, tree_dir, first_dir, output_dir))
    descendant_seed_path = (Path(descendant_seed_path)
                            if descendant_seed_path is not None else None)
    if not all(path.parent.resolve() == tree_dir.parent.resolve()
               for path in (seed_path, first_dir, output_dir,
                            *((descendant_seed_path,)
                              if descendant_seed_path is not None else ()))):
        raise ValueError('all inputs and output must share the private root')
    status_path = output_dir / 'batch-runs' / f'{run_id}.status.json'
    status = {
        'schemaVersion': 1, 'runId': run_id, 'phase': 'running',
        'pageMode': page_mode,
        'startedAtUtc': now_utc(), 'endedAtUtc': None,
        'sourceSeedSha256': None, 'sourceFirstPageManifestSha256': None,
        'sourceDescendantSeedSha256': None,
        'selectedAreaCount': None, 'attemptedAreas': 0,
        'newlySavedPages': 0, 'requestsThisRun': 0,
        'requestBudgetReached': False, 'rateLimited': False,
        'areasObservedComplete': 0, 'areasPagesObservedComplete': 0,
        'areasUnverified': 0,
        'lastAreaCode': None, 'lastPage': None,
        'exitCode': None, 'error': None, 'publishable': False,
    }
    write_status(status_path, status, exclusive=True)
    limiter = None
    failure = None
    budget_stop = False
    progress = None
    try:
        with CONTROLLER_LOCK(tree_dir.parent / 'batch-runs'):
            with FETCHER['exclusive_run_lock'](tree_dir.parent):
                FETCHER['enforce_site_cooldown'](tree_dir.parent)
                FIRST['require_hourly_ledger'](tree_dir.parent)
                seed_doc, seed_sha, observations, first_sha = first_page_inputs(
                    seed_path, tree_dir, first_dir,
                    seed_loader=seed_loader)
                descendant_seeds = ()
                descendant_sha = None
                if descendant_seed_path is not None:
                    descendant_doc, descendant_sha = verified_descendants(
                        descendant_seed_path, tree_dir)
                    descendant_seeds = descendant_doc['seeds']
                status['sourceSeedSha256'] = seed_sha
                status['sourceFirstPageManifestSha256'] = first_sha
                status['sourceDescendantSeedSha256'] = descendant_sha
                eligible = []
                skipped = 0
                for seed in seed_doc['seeds']:
                    obs = observations[seed['sbcode']]
                    expected = math.ceil(obs['reportedTotal'] / obs['serverPageSize'])
                    if ((page_mode == 'small' and 2 <= expected <= 3)
                            or (page_mode == 'large'
                                and 4 <= expected <= max_expected_pages)):
                        eligible.append(seed)
                    elif expected > max_expected_pages:
                        skipped += 1
                status['selectedAreaCount'] = len(eligible)
                old_path = output_dir / 'manifest.json'
                if old_path.exists():
                    old = read_json(old_path)
                    if (old.get('pageMode') != page_mode
                            or old.get('sourceSeedSha256') != seed_sha
                            or old.get('sourceFirstPageManifestSha256') != first_sha
                            or old.get('sourceDescendantSeedSha256')
                            != descendant_sha):
                        raise ValueError('followup manifest belongs to different source snapshot')
                known = {item['sbcode'] for item in eligible}
                for folder in output_dir.glob('area-*'):
                    if not folder.is_dir() or folder.name.removeprefix('area-') not in known:
                        raise ValueError(f'{folder.name}: unknown followup area cache')
                areas = {}
                for seed in eligible:
                    code = seed['sbcode']
                    first_path = first_dir / f'area-{code}' / 'pages' / '00001.json'
                    areas[code] = audit_area(first_path, output_dir / f'area-{code}',
                                             seed, seed_doc['seeds'], observations[code],
                                             descendant_seeds=descendant_seeds)
                if old_path.exists():
                    old_areas = old.get('areas', {})
                    if not isinstance(old_areas, dict) or set(old_areas) != set(areas):
                        raise ValueError('followup area inventory changed since prior audit')
                    for code, old_area in old_areas.items():
                        if (not isinstance(old_area, dict)
                                or not isinstance(old_area.get('pageFiles'), dict)):
                            raise ValueError(f'{code}: prior followup area audit invalid')
                        for page, metadata in old_area.get('pageFiles', {}).items():
                            current = areas[code]['pageFiles'].get(page)
                            if (not isinstance(metadata, dict) or current is None
                                    or metadata.get('fileSha256') != current['fileSha256']):
                                raise ValueError(f'{code} page {page}: cache changed since prior audit')
                progress = progress_document(seed_sha, first_sha, areas, skipped,
                                             page_mode, descendant_sha)
                FETCHER['save_json'](old_path, progress)
                limiter = FETCHER['RateLimiter'](
                    interval, jitter, max_requests,
                    tree_dir.parent / 'hourly-request-budget.json')
                for seed in eligible:
                    code = seed['sbcode']
                    area = areas[code]
                    if (area['savedFollowupPages'] == area['expectedPages'] - 1
                            or (page_mode == 'small' and area['issues'])):
                        continue
                    if status['attemptedAreas'] >= max_areas or limiter.exhausted.is_set():
                        break
                    status['attemptedAreas'] += 1
                    status['lastAreaCode'] = code
                    for page in range(area['nextPage'], area['expectedPages'] + 1):
                        status['lastPage'] = page
                        write_status(status_path, status)
                        try:
                            wrapper = FETCHER['request_json'](
                                FETCHER['LIST_PATH'],
                                FETCHER['page_params'](page, code, True),
                                limiter, timeout, 1, preserve_raw=True)
                        except FETCHER['BudgetExhausted']:
                            budget_stop = True
                            break
                        path = output_dir / f'area-{code}' / 'pages' / f'{page:05d}.json'
                        # Validate source bytes and the page envelope before saving.
                        path.parent.mkdir(parents=True, exist_ok=True)
                        temp = path.with_suffix('.candidate.json')
                        FETCHER['save_json'](temp, wrapper)
                        try:
                            checked_followup_page(temp, page, code)
                        except Exception:
                            temp.unlink(missing_ok=True)
                            raise
                        os.replace(temp, path)
                        status['newlySavedPages'] += 1
                        areas[code] = audit_area(
                            first_dir / f'area-{code}' / 'pages' / '00001.json',
                            output_dir / f'area-{code}', seed, seed_doc['seeds'],
                            observations[code],
                            descendant_seeds=descendant_seeds)
                        progress = progress_document(seed_sha, first_sha, areas, skipped,
                                                     page_mode, descendant_sha)
                        FETCHER['save_json'](old_path, progress)
                        status['requestsThisRun'] = limiter.requests_started
                        status['areasObservedComplete'] = progress['areasObservedComplete']
                        status['areasPagesObservedComplete'] = progress[
                            'areasPagesObservedComplete']
                        status['areasUnverified'] = progress['areasUnverified']
                        write_status(status_path, status)
                        if page_mode == 'small' and areas[code]['issues']:
                            break
                    if budget_stop:
                        break
    except (FETCHER['FetchError'], RuntimeError, ValueError, OSError, TypeError) as error:
        failure = f'{type(error).__name__}: {error}'
    finally:
        if limiter is not None and limiter.blocked.is_set():
            FETCHER['save_json'](tree_dir.parent / 'rate-limit.json', {
                'reason': limiter.block_reason, 'detectedAtUtc': now_utc(),
                'cooldownUntilUtc': limiter.cooldown_until_utc,
            })
        finished_ok = (progress is not None and progress['selectedAreaCount']
                       == (progress['areasObservedComplete'] if page_mode == 'small'
                           else progress['areasPagesObservedComplete'])
                       and (page_mode == 'large'
                            or progress['areasUnverified'] == 0))
        status.update({
            'phase': 'finished', 'endedAtUtc': now_utc(),
            'requestsThisRun': limiter.requests_started if limiter else 0,
            'requestBudgetReached': (limiter.exhausted.is_set() if limiter else False)
                                    or budget_stop,
            'rateLimited': limiter.blocked.is_set() if limiter else False,
            'areasObservedComplete': progress['areasObservedComplete'] if progress else 0,
            'areasPagesObservedComplete': (
                progress['areasPagesObservedComplete'] if progress else 0),
            'areasUnverified': progress['areasUnverified'] if progress else 0,
            'exitCode': 2 if failure else 0 if finished_ok else 1,
            'error': failure,
        })
        write_status(status_path, status)
        print(json.dumps(status, ensure_ascii=False), flush=True)
    return status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--max-areas', type=int, default=5)
    parser.add_argument('--max-requests', type=int, default=12)
    parser.add_argument('--interval', type=float, default=60)
    parser.add_argument('--jitter', type=float, default=10)
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--page-mode', choices=('small', 'large'), default='small')
    parser.add_argument('--official-descendants-overlay-v1', action='store_true')
    args = parser.parse_args(argv)
    output_dir = OUTPUT_DIR if args.page_mode == 'small' else LARGE_OUTPUT_DIR
    max_expected = (MAX_EXPECTED_PAGES if args.page_mode == 'small'
                    else MAX_LARGE_EXPECTED_PAGES)
    status = run_batch(SEED_PATH, TREE_DIR, FIRST_DIR, output_dir, args.run_id,
                       max_areas=args.max_areas, max_requests=args.max_requests,
                       max_expected_pages=max_expected, page_mode=args.page_mode,
                       interval=args.interval, jitter=args.jitter, timeout=args.timeout,
                       descendant_seed_path=(PRIVATE_ROOT /
                           'national-area-level4-overlay-seeds.v1.json'
                           if args.official_descendants_overlay_v1 else None))
    return status['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
