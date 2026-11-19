"""Collect only page 1 for each validated official area-code seed.

The complete private area-tree seed file is mandatory. Every run is serial,
bounded and resumable; output stays private and is not a national snapshot.
"""

from __future__ import annotations

import argparse
import base64
import binascii
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
OUTPUT_DIR = PRIVATE_ROOT / 'national-area-first-pages-20261119'
FETCHER = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-institutions.py'),
                         run_name='mca_list_fetcher')
BUILDER = runpy.run_path(str(PROJECT / 'scripts' / 'build-mca-area-seeds.py'),
                         run_name='mca_area_seed_builder')
CODE = re.compile(r'[0-9]{12}\Z')
RUN_ID = re.compile(r'[a-zA-Z0-9-]{1,40}\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def read_json(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError(f'{path}: missing or unreadable') from error
    if not isinstance(value, dict):
        raise ValueError(f'{path}: expected JSON object')
    return value


def load_verified_seeds(seed_path, tree_dir):
    """Compare the supplied seed document with a fresh offline tree audit."""
    seed_path, tree_dir = Path(seed_path), Path(tree_dir)
    if seed_path.parent.resolve() != tree_dir.parent.resolve():
        raise ValueError('seeds must be beside the private official tree')
    try:
        source = seed_path.read_bytes()
        supplied = json.loads(source)
    except (OSError, ValueError) as error:
        raise ValueError('complete private seed file missing or unreadable') from error
    if (not isinstance(supplied, dict) or supplied.get('treeWalkComplete') is not True
            or supplied.get('kind') != 'mca-official-area-list-query-seeds'
            or supplied.get('publishable') is not False
            or supplied.get('snapshotVerified') is not False):
        raise ValueError('input is not a complete private official area seed')
    expected = BUILDER['build_seeds'](tree_dir)
    if supplied != expected:
        raise ValueError('seed file differs from current complete official tree')
    seeds = supplied['seeds']
    if (not seeds or supplied['seedCount'] != len(seeds)
            or any(not CODE.fullmatch(seed['sbcode']) for seed in seeds)):
        raise ValueError('official seed code inventory invalid')
    return supplied, hashlib.sha256(source).hexdigest()


def checked_cached_page(path, code):
    wrapper = read_json(path)
    request = wrapper.get('request')
    if (not isinstance(request, dict)
            or request.get('url') != FETCHER['API_BASE'] + FETCHER['LIST_PATH']
            or request.get('method') != 'POST'
            or not SHA.fullmatch(str(wrapper.get('responseSha256', '')))):
        raise ValueError(f'{code}: cached page provenance invalid')
    try:
        fetched = datetime.fromisoformat(wrapper['fetchedAtUtc'])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f'{code}: cached fetch time invalid') from error
    if fetched.tzinfo is None:
        raise ValueError(f'{code}: cached fetch time lacks timezone')
    try:
        raw = base64.b64decode(wrapper['rawBodyBase64'], validate=True)
        if (hashlib.sha256(raw).hexdigest() != wrapper['responseSha256']
                or json.loads(raw) != wrapper.get('response')):
            raise ValueError('body differs from cached JSON or hash')
    except (KeyError, TypeError, ValueError, binascii.Error) as error:
        raise ValueError(f'{code}: original HTTP bytes missing or invalid') from error
    data = FETCHER['checked_page'](wrapper, 1, code, True)
    if type(data['total']) is not int or data['total'] < 0:
        raise ValueError(f'{code}: cached total invalid')
    if len(data['records']) != min(data['total'], data['size']):
        raise ValueError(f'{code}: cached first-page row count differs from total')
    return {
        'sourceNodeId': None, 'areaCode': code,
        'pageNumber': 1,
        'pagePath': str(path),
        'storedFileSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'sourceResponseSha256': wrapper['responseSha256'],
        'fetchedAtUtc': fetched.astimezone(timezone.utc).isoformat(),
        'reportedTotal': data['total'], 'serverPageSize': data['size'],
        'firstPageRows': len(data['records']),
    }


def scan_cache(output_dir, seeds, seed_sha):
    """Validate all existing checkpoints before making any new request."""
    output_dir = Path(output_dir)
    prior_path = output_dir / 'manifest.json'
    prior = read_json(prior_path) if prior_path.exists() else None
    if prior is not None and prior.get('sourceSeedSha256') != seed_sha:
        raise ValueError('prior first-page manifest belongs to different seeds')
    by_code = {seed['sbcode']: seed for seed in seeds}
    if len(by_code) != len(seeds):
        raise ValueError('duplicate official area seed code')
    observations = {}
    for folder in output_dir.glob('area-*'):
        code = folder.name.removeprefix('area-')
        if not folder.is_dir() or code not in by_code:
            raise ValueError(f'{folder.name}: unknown cached area')
        pages = folder / 'pages'
        if not pages.is_dir() or {item.name for item in pages.iterdir()} != {'00001.json'}:
            raise ValueError(f'{code}: expected exactly one first-page checkpoint')
        observation = checked_cached_page(pages / '00001.json', code)
        observation['sourceNodeId'] = by_code[code]['sourceNodeId']
        observations[code] = observation
    if prior is not None:
        completed = prior.get('completedAreaCodes')
        previous = prior.get('observations')
        if (not isinstance(completed, list) or not isinstance(previous, dict)
                or len(completed) != len(set(completed))
                or set(completed) != set(previous)
                or not set(completed) <= set(observations)):
            raise ValueError('prior first-page manifest and cache differ')
        for code, record in previous.items():
            if (not isinstance(record, dict)
                    or record.get('storedFileSha256')
                    != observations[code]['storedFileSha256']):
                raise ValueError(f'{code}: cached page changed since prior audit')
    return observations


def progress_document(seed_path, seed_sha, seeds, observations):
    ordered_codes = [seed['sbcode'] for seed in seeds]
    return {
        'schemaVersion': 1, 'scope': 'official-area-first-pages-only',
        'sourceSeedPath': str(seed_path), 'sourceSeedSha256': seed_sha,
        'seedCount': len(seeds), 'completedAreaCount': len(observations),
        'completedAreaCodes': [code for code in ordered_codes if code in observations],
        'pendingAreaCount': len(seeds) - len(observations),
        'allFirstPagesCached': len(observations) == len(seeds),
        'nationalComplete': False, 'snapshotVerified': False,
        'publishable': False, 'auditedAtUtc': now_utc(),
        'observations': {code: observations[code] for code in ordered_codes
                         if code in observations},
    }


def require_hourly_ledger(root):
    """Fail closed if the shared site request ledger is absent or ambiguous."""
    path = Path(root) / 'hourly-request-budget.json'
    if not path.is_file():
        raise ValueError('shared hourly request budget missing')
    state = read_json(path)
    if (state.get('schemaVersion') != 1 or state.get('windowSeconds') != 3600
            or state.get('limit') != 60
            or not isinstance(state.get('requestStartedAtUtc'), list)
            or len(state['requestStartedAtUtc']) > 60):
        raise ValueError('shared hourly request budget invalid')
    now = datetime.now(timezone.utc)
    for value in state['requestStartedAtUtc']:
        try:
            started = datetime.fromisoformat(value)
        except (TypeError, ValueError) as error:
            raise ValueError('shared hourly request timestamp invalid') from error
        if started.tzinfo is None or started.astimezone(timezone.utc) > now:
            raise ValueError('shared hourly request timestamp invalid')


def write_status(path, status, *, exclusive=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(status, ensure_ascii=False, indent=2) + '\n'
    if exclusive:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(payload)
    else:
        temporary = path.with_suffix(path.suffix + '.tmp')
        temporary.write_text(payload, encoding='utf-8')
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)


def run_batch(seed_path, tree_dir, output_dir, run_id, *, max_areas=20,
              max_requests=20, interval=60, jitter=10, timeout=30,
              seed_loader=None):
    if (not RUN_ID.fullmatch(run_id) or not 1 <= max_areas <= 100
            or not 1 <= max_requests <= 60
            or not math.isfinite(interval) or interval < 60
            or not math.isfinite(jitter) or jitter < 0
            or not math.isfinite(timeout) or timeout <= 0):
        raise ValueError('invalid run ID or bounded single-thread request settings')
    seed_path, tree_dir, output_dir = map(Path, (seed_path, tree_dir, output_dir))
    if (seed_path.parent.resolve() != tree_dir.parent.resolve()
            or output_dir.parent.resolve() != tree_dir.parent.resolve()):
        raise ValueError('all source and output paths must share the private root')
    status_path = output_dir / 'batch-runs' / f'{run_id}.status.json'
    status = {
        'schemaVersion': 1, 'runId': run_id, 'phase': 'running',
        'startedAtUtc': now_utc(), 'endedAtUtc': None,
        'sourceSeedPath': str(seed_path), 'sourceSeedSha256': None,
        'seedCount': None, 'reusedCache': 0, 'attemptedAreas': 0,
        'newlySaved': 0, 'pendingAreas': None,
        'requestsThisRun': 0, 'requestBudgetReached': False,
        'rateLimited': False, 'lastAreaCode': None,
        'exitCode': None, 'error': None, 'publishable': False,
    }
    write_status(status_path, status, exclusive=True)
    limiter = None
    failure = None
    clean_budget_stop = False
    observations = {}
    seeds = []
    try:
        with FETCHER['exclusive_run_lock'](tree_dir.parent):
            FETCHER['enforce_site_cooldown'](tree_dir.parent)
            document, seed_sha = (seed_loader or load_verified_seeds)(
                seed_path, tree_dir)
            seeds = document['seeds']
            status['sourceSeedSha256'] = seed_sha
            status['seedCount'] = len(seeds)
            observations = scan_cache(output_dir, seeds, seed_sha)
            status['reusedCache'] = len(observations)
            FETCHER['save_json'](output_dir / 'manifest.json',
                                 progress_document(seed_path, seed_sha, seeds, observations))
            require_hourly_ledger(tree_dir.parent)
            limiter = FETCHER['RateLimiter'](
                interval, jitter, max_requests,
                tree_dir.parent / 'hourly-request-budget.json')
            for seed in seeds:
                code = seed['sbcode']
                if code in observations:
                    continue
                if status['attemptedAreas'] >= max_areas or limiter.exhausted.is_set():
                    break
                status['lastAreaCode'] = code
                status['attemptedAreas'] += 1
                write_status(status_path, status)
                folder = output_dir / f'area-{code}'
                try:
                    FETCHER['fetch_page'](1, code, folder, limiter, timeout, 1,
                                          check_sort=True, preserve_raw=True)
                except FETCHER['BudgetExhausted']:
                    clean_budget_stop = True
                    break
                path = folder / 'pages' / '00001.json'
                observation = checked_cached_page(path, code)
                observation['sourceNodeId'] = seed['sourceNodeId']
                observations[code] = observation
                status['newlySaved'] += 1
                FETCHER['save_json'](output_dir / 'manifest.json',
                                     progress_document(seed_path, seed_sha, seeds, observations))
                status['requestsThisRun'] = limiter.requests_started
                status['pendingAreas'] = len(seeds) - len(observations)
                write_status(status_path, status)
    except (FETCHER['FetchError'], RuntimeError, ValueError, OSError, TypeError) as error:
        failure = f'{type(error).__name__}: {error}'
    finally:
        if limiter is not None and limiter.blocked.is_set():
            FETCHER['save_json'](tree_dir.parent / 'rate-limit.json', {
                'reason': limiter.block_reason, 'detectedAtUtc': now_utc(),
                'cooldownUntilUtc': limiter.cooldown_until_utc,
            })
        status.update({
            'phase': 'finished', 'endedAtUtc': now_utc(),
            'pendingAreas': len(seeds) - len(observations) if seeds else None,
            'requestsThisRun': limiter.requests_started if limiter else 0,
            'requestBudgetReached': (limiter.exhausted.is_set() if limiter else False)
                                    or clean_budget_stop,
            'rateLimited': limiter.blocked.is_set() if limiter else False,
            'exitCode': 2 if failure else 0 if seeds and len(observations) == len(seeds) else 1,
            'error': failure,
        })
        write_status(status_path, status)
        print(json.dumps(status, ensure_ascii=False), flush=True)
    return status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--max-areas', type=int, default=20)
    parser.add_argument('--max-requests', type=int, default=20)
    parser.add_argument('--interval', type=float, default=60)
    parser.add_argument('--jitter', type=float, default=10)
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args(argv)
    status = run_batch(SEED_PATH, TREE_DIR, OUTPUT_DIR, args.run_id,
                       max_areas=args.max_areas, max_requests=args.max_requests,
                       interval=args.interval, jitter=args.jitter,
                       timeout=args.timeout)
    return status['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
