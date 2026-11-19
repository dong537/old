"""Independently recapture the two official area-tree roots, privately.

Default invocation is read-only. An explicit --execute performs at most two
serial requests after the original tree has completed and passed offline audit.
This is a current reproduction of cached JSON, not proof of the old HTTP bytes
or a complete, current national institution snapshot.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import runpy


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'data/private/mca-institutions-2026-11-18'
TREE = ROOT / 'area-tree-20261119'
OUTPUT = ROOT / 'area-root-http-recapture-20261119'
CORE = runpy.run_path(str(PROJECT / 'scripts/fetch-mca-institutions.py'),
                      run_name='mca_root_recapture_core')
AREA = runpy.run_path(str(PROJECT / 'scripts/fetch-mca-area-tree.py'),
                      run_name='mca_root_recapture_area')
BUILDER = runpy.run_path(str(PROJECT / 'scripts/build-mca-area-seeds.py'),
                         run_name='mca_root_recapture_builder')
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-auto-resume.py'),
                           run_name='mca_root_recapture_controller')
SEED = AREA['SEED_PATH']
SEED_SHA256 = AREA['SEED_SHA256']
PARENTS = 2


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, label: str) -> dict:
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError(f'{label} missing or unreadable') from error
    if not isinstance(value, dict):
        raise RuntimeError(f'{label} must be an object')
    return value


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_plan(tree: Path, seed: Path, seed_sha: str) -> dict:
    """Audit the complete tree and pin the two original cached payloads."""
    locked, meta = AREA['cached_seed_wrappers'](seed, seed_sha)
    document = BUILDER['build_seeds'](tree)
    root_nodes = AREA['checked_response'](locked['-1'], '-1', 0)
    second = meta['seededParentIds'][1]
    matching = [item for item in root_nodes if item['id'] == second]
    if len(matching) != 1:
        raise ValueError('locked Guangdong parent is missing from root')
    parent_levels = {'-1': 0, second: matching[0]['level']}
    old_files = {}
    for parent in meta['seededParentIds']:
        path = tree / 'responses' / f'{parent}.json'
        if read_json(path, 'locked tree response') != locked[parent]:
            raise ValueError(f'{parent}: locked tree seed differs from source')
        old_files[parent] = digest(path)
    fingerprint_source = {
        'seedSha256': meta['sha256'],
        'treeManifestSha256': document['sourceTreeManifestSha256'],
        'oldResponseFileSha256': old_files,
    }
    fingerprint = hashlib.sha256(json.dumps(
        fingerprint_source, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
    return {
        'fingerprint': fingerprint,
        'seedSha256': meta['sha256'],
        'treeManifestSha256': document['sourceTreeManifestSha256'],
        'oldResponseFileSha256': old_files,
        'parentIds': meta['seededParentIds'],
        'parentLevels': parent_levels,
        'locked': locked,
    }


def compare_payload(old: dict, current: dict) -> dict:
    """Keep node-level differences and detect non-node payload changes too."""
    old_body, new_body = old['response'], current['response']
    before, after = old_body['data'], new_body['data']
    old_map = {item['id']: item for item in before}
    new_map = {item['id']: item for item in after}
    common = old_map.keys() & new_map.keys()
    return {
        'payloadMatches': old_body == new_body,
        'addedIds': sorted(new_map.keys() - old_map.keys()),
        'removedIds': sorted(old_map.keys() - new_map.keys()),
        'changedIds': sorted(identifier for identifier in common
                             if old_map[identifier] != new_map[identifier]),
        'orderChanged': [item['id'] for item in before]
                        != [item['id'] for item in after],
        'oldNodeCount': len(before), 'newNodeCount': len(after),
    }


def scan_cache(plan: dict, output: Path) -> dict:
    """Validate saved HTTP bytes and compute an inventory from file bytes."""
    responses = output / 'responses'
    paths = sorted(responses.iterdir()) if responses.exists() else []
    expected = set(plan['parentIds'])
    if any(not path.is_file() or path.suffix != '.json'
           or path.stem not in expected for path in paths):
        raise RuntimeError('recapture response inventory has an unknown file')
    found = set()
    comparisons = {}
    inventory = hashlib.sha256()
    for path in paths:
        parent = path.stem
        if parent in found:
            raise RuntimeError('recapture response inventory duplicates a parent')
        found.add(parent)
        file_hash = digest(path)
        inventory.update(path.name.encode('utf-8') + b'\0' + bytes.fromhex(file_hash))
        wrapper = read_json(path, 'recaptured response')
        provenance = wrapper.get('provenance', {})
        if (not wrapper.get('rawBodyBase64')
                or not isinstance(provenance, dict)
                or (provenance and (provenance.get('kind') != 'live-http'
                                    or provenance.get('originalHttpBodyAvailable') is not True))):
            raise RuntimeError('recapture response lacks original HTTP bytes')
        try:
            AREA['checked_response'](wrapper, parent, plan['parentLevels'][parent])
        except ValueError as error:
            raise RuntimeError(f'recapture response invalid: {error}') from error
        comparisons[parent] = compare_payload(plan['locked'][parent], wrapper)
    pending = [item for item in plan['parentIds'] if item not in found]
    drift = [item for item in plan['parentIds'] if item in found
             and not comparisons[item]['payloadMatches']]
    return {
        'comparisons': comparisons,
        'pendingParentIds': pending,
        'driftParents': drift,
        'savedResponses': len(found),
        'responseInventorySha256': inventory.hexdigest(),
    }


def require_hourly_ledger(root: Path) -> None:
    state = read_json(root / 'hourly-request-budget.json', 'shared hourly ledger')
    if (state.get('schemaVersion') != 1 or state.get('windowSeconds') != 3600
            or state.get('limit') != 60
            or not isinstance(state.get('requestStartedAtUtc'), list)
            or len(state['requestStartedAtUtc']) > 60):
        raise RuntimeError('shared hourly ledger invalid')
    now = datetime.now(timezone.utc)
    for value in state['requestStartedAtUtc']:
        try:
            started = datetime.fromisoformat(value)
            if started.tzinfo is None or started.astimezone(timezone.utc) > now:
                raise ValueError('invalid timestamp')
        except (TypeError, ValueError) as error:
            raise RuntimeError('shared hourly ledger timestamp invalid') from error


def prior_batch(output: Path, plan: dict, cache: dict, number: int) -> None:
    runs = output / 'batch-runs'
    paths = sorted(runs.iterdir()) if runs.exists() else []
    names = [f'batch-{item:04d}.status.json' for item in range(1, len(paths) + 1)]
    if any(not path.is_file() for path in paths) or [p.name for p in paths] != names:
        raise RuntimeError('recapture batch status inventory invalid')
    if not paths:
        if output.exists() and any(output.iterdir()):
            raise RuntimeError('recapture inventory exists without a batch status')
        if number != 1:
            raise RuntimeError('first recapture batch must be 1')
        return
    statuses = [read_json(path, 'prior recapture status') for path in paths]
    for index, status in enumerate(statuses, 1):
        if (status.get('batchNumber') != index
                or status.get('phase') != 'finished'
                or status.get('sourceFingerprint') != plan['fingerprint']
                or status.get('outcome') not in ('partial', 'complete', 'drift', 'blocked')
                or (index < len(statuses) and status.get('outcome') != 'partial')):
            raise RuntimeError('recapture batch chain differs')
    last = statuses[-1]
    manifest = read_json(output / 'manifest.json', 'recapture manifest')
    if (manifest.get('sourceFingerprint') != plan['fingerprint']
            or manifest.get('lastBatchNumber') != len(paths)):
        raise RuntimeError('recapture source or batch chain differs')
    if (last.get('responseInventorySha256') != cache['responseInventorySha256']
            or manifest.get('responseInventorySha256') != cache['responseInventorySha256']
            or last.get('savedResponses') != cache['savedResponses']
            or manifest.get('savedResponses') != cache['savedResponses']
            or any(last.get(key) != cache[key] or manifest.get(key) != cache[key]
                   for key in ('pendingParentIds', 'driftParents', 'comparisons'))):
        raise RuntimeError('recapture response inventory differs from checkpoint')
    if last.get('outcome') in ('complete', 'drift', 'blocked'):
        raise RuntimeError(f'recapture already {last["outcome"]}; no request sent')
    if last.get('outcome') != 'partial' or cache['driftParents']:
        raise RuntimeError('prior recapture batch invalid or drifted')
    if number != len(paths) + 1:
        raise RuntimeError('recapture batch number must advance by one')


def progress(plan: dict, cache: dict, number: int) -> dict:
    return {
        'schemaVersion': 1, 'kind': 'mca-root-http-recapture',
        'sourceFingerprint': plan['fingerprint'],
        'seedSha256': plan['seedSha256'],
        'sourceTreeManifestSha256': plan['treeManifestSha256'],
        'lockedResponseFileSha256': plan['oldResponseFileSha256'],
        'parentIds': plan['parentIds'],
        'lastBatchNumber': number,
        **cache,
        'currentReproductionMatchesLockedPayload': not cache['pendingParentIds']
             and not cache['driftParents'],
        'originalHttpBodyVerified': False,
        'snapshotVerified': False, 'publishable': False,
        'auditedAtUtc': utc_now(),
    }


def offline_preflight(root: Path, tree: Path, output: Path,
                      seed: Path, seed_sha: str) -> dict:
    """Read-only readiness report; never creates a directory or requests URL."""
    report = {'ready': False, 'publishable': False,
              'originalHttpBodyVerified': False,
              'currentReproductionMatchesLockedPayload': False}
    try:
        plan = source_plan(Path(tree), Path(seed), seed_sha)
        require_hourly_ledger(Path(root))
        cache = scan_cache(plan, Path(output))
        report.update(progress(plan, cache, 0))
        runs = Path(output) / 'batch-runs'
        next_number = len(list(runs.iterdir())) + 1 if runs.exists() else 1
        report['nextBatchNumber'] = next_number
        try:
            prior_batch(Path(output), plan, cache, next_number)
        except RuntimeError as error:
            report['reason'] = str(error)
            return report
        if cache['driftParents']:
            report['reason'] = 'current root payload drifted from locked JSON'
        elif cache['pendingParentIds']:
            try:
                CORE['enforce_site_cooldown'](Path(root))
            except CORE['FetchError'] as error:
                report['reason'] = str(error)
            else:
                report['ready'] = True
                report['reason'] = 'complete tree audited; explicit execute required'
        else:
            report['reason'] = 'root payloads reproduced; no additional requests needed'
    except (ValueError, RuntimeError, OSError) as error:
        report['reason'] = f'{type(error).__name__}: {error}'
    return report


def run_batch(root: Path, tree: Path, output: Path, seed: Path,
              seed_sha: str, batch_number: int, limiter, *, fetch=None,
              timeout: float = 30) -> dict:
    """One serial batch using the shared controller, site lock and limiter."""
    root, tree, output, seed = map(Path, (root, tree, output, seed))
    if type(batch_number) is not int or not 1 <= batch_number <= 9999:
        raise ValueError('batch number must be 1..9999')
    if timeout <= 0:
        raise ValueError('timeout must be positive')
    fetch = fetch or AREA['fetch_child']
    with TREE_AUTO['controller_lock'](root / 'batch-runs'):
        with CORE['exclusive_run_lock'](root):
            plan = source_plan(tree, seed, seed_sha)
            require_hourly_ledger(root)
            cache = scan_cache(plan, output)
            prior_batch(output, plan, cache, batch_number)
            CORE['enforce_site_cooldown'](root)
            status_path = output / 'batch-runs' / f'batch-{batch_number:04d}.status.json'
            status = {
                'schemaVersion': 1, 'batchNumber': batch_number,
                'phase': 'running', 'outcome': None,
                'sourceFingerprint': plan['fingerprint'],
                'startedAtUtc': utc_now(), 'endedAtUtc': None,
                'error': None, 'rateLimited': False, 'publishable': False,
            }
            CORE['save_json'](status_path, status)
            error = None
            budget_stop = False
            try:
                for parent in cache['pendingParentIds']:
                    if limiter.exhausted.is_set():
                        budget_stop = True
                        break
                    try:
                        wrapper = fetch(parent, limiter, timeout)
                    except CORE['BudgetExhausted']:
                        budget_stop = True
                        break
                    provenance = wrapper.get('provenance', {}) if isinstance(wrapper, dict) else {}
                    if (not isinstance(provenance, dict)
                            or (provenance and (provenance.get('kind') != 'live-http'
                                                or provenance.get('originalHttpBodyAvailable') is not True))
                            or not wrapper.get('rawBodyBase64')):
                        raise ValueError(f'{parent}: no original HTTP response bytes')
                    AREA['checked_response'](wrapper, parent,
                                             plan['parentLevels'][parent])
                    CORE['save_json'](output / 'responses' / f'{parent}.json', wrapper)
                    cache = scan_cache(plan, output)
                    if cache['driftParents']:
                        break
            except (CORE['FetchError'], ValueError, RuntimeError, OSError) as caught:
                error = f'{type(caught).__name__}: {caught}'
            finally:
                if limiter.blocked.is_set():
                    CORE['save_json'](root / 'rate-limit.json', {
                        'reason': limiter.block_reason,
                        'detectedAtUtc': utc_now(),
                        'cooldownUntilUtc': limiter.cooldown_until_utc,
                    })
                outcome = ('blocked' if error or limiter.blocked.is_set()
                           else 'drift' if cache['driftParents']
                           else 'complete' if not cache['pendingParentIds']
                           else 'partial')
                status.update({
                    'phase': 'finished', 'endedAtUtc': utc_now(),
                    'outcome': outcome, 'error': error,
                    'rateLimited': limiter.blocked.is_set(),
                    'requestBudgetReached': budget_stop or limiter.exhausted.is_set(),
                    'requestsThisRun': limiter.requests_started,
                    **cache,
                })
                CORE['save_json'](output / 'manifest.json',
                                  progress(plan, cache, batch_number))
                CORE['save_json'](status_path, status)
            return status


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true',
                        help='allow one bounded serial batch of live requests')
    parser.add_argument('--batch-number', type=int, default=1)
    parser.add_argument('--max-requests', type=int, default=2)
    parser.add_argument('--interval', type=float, default=60)
    parser.add_argument('--jitter', type=float, default=10)
    parser.add_argument('--timeout', type=float, default=30)
    arguments = parser.parse_args(argv)
    if not arguments.execute:
        print(json.dumps(offline_preflight(ROOT, TREE, OUTPUT, SEED, SEED_SHA256),
                         ensure_ascii=False, indent=2))
        return 0
    if (not 1 <= arguments.max_requests <= PARENTS
            or arguments.interval < 60 or arguments.jitter < 0):
        parser.error('max requests must be 1..2; interval at least 60 seconds')
    limiter = CORE['RateLimiter'](
        interval=arguments.interval, jitter=arguments.jitter,
        max_requests=arguments.max_requests,
        hourly_state_path=ROOT / 'hourly-request-budget.json')
    status = run_batch(ROOT, TREE, OUTPUT, SEED, SEED_SHA256,
                       arguments.batch_number, limiter, timeout=arguments.timeout)
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0 if status['outcome'] == 'complete' else 1


if __name__ == '__main__':
    raise SystemExit(main())
