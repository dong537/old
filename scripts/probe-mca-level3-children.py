"""Privately probe children of each audited level-three official area node.

Default invocation is read-only. --execute starts one bounded, serial batch
only after the original area tree and first-page handoff have finished. This
stage has its own cache and never edits the level-three tree snapshot.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import runpy


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'data/private/mca-institutions-2026-11-18'
TREE = ROOT / 'area-tree-20261119'
PROBE = ROOT / 'area-level3-probe-20261119'
CORE = runpy.run_path(str(PROJECT / 'scripts/fetch-mca-institutions.py'),
                      run_name='mca_level3_core')
AREA = runpy.run_path(str(PROJECT / 'scripts/fetch-mca-area-tree.py'),
                      run_name='mca_level3_area')
BUILDER = runpy.run_path(str(PROJECT / 'scripts/build-mca-area-seeds.py'),
                         run_name='mca_level3_builder')
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-auto-resume.py'),
                           run_name='mca_level3_controller')
STATUS_NAME = re.compile(r'batch-([0-9]{4})[.]status[.]json')


def read_json(path: Path, label: str) -> dict:
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError(f'{label} missing or unreadable') from error
    if not isinstance(value, dict):
        raise RuntimeError(f'{label} is not an object')
    return value


def source_plan(tree: Path) -> dict:
    """Pin a complete level-three tree without treating counties as leaves."""
    document = BUILDER['build_seeds'](tree)
    parents = [item for item in (*document['seeds'], *document['uncodedNodes'])
               if item['level'] == 3]
    parents.sort(key=lambda item: item['sourceNodeId'])
    ids = [item['sourceNodeId'] for item in parents]
    if len(ids) != len(set(ids)):
        raise ValueError('duplicate level-three parent IDs')
    source_bytes = json.dumps(document, ensure_ascii=False, sort_keys=True,
                              separators=(',', ':')).encode('utf-8')
    return {
        'sourceFingerprint': hashlib.sha256(source_bytes).hexdigest(),
        'sourceTreeManifestSha256': document['sourceTreeManifestSha256'],
        'parents': [{'id': item['sourceNodeId'],
                     'pid': item['sourceParentNodeId'],
                     'sbcode': item['sbcode']} for item in parents],
        'allSourceNodeIds': {item['sourceNodeId'] for item in
                             (*document['seeds'], *document['uncodedNodes'])},
        'allSourceCodes': {item['sbcode'] for item in document['seeds']},
    }


def checked_children(wrapper: dict, parent_id: str) -> list[dict]:
    children = AREA['checked_response'](wrapper, parent_id, 3)
    if any(child['level'] != 4 for child in children):
        raise ValueError(f'{parent_id}: child is not level four')
    return children


def scan_cache(plan: dict, probe: Path) -> dict:
    """Revalidate every saved response and derive progress from source bytes."""
    expected = {item['id'] for item in plan['parents']}
    response_dir = probe / 'responses'
    paths = sorted(response_dir.iterdir()) if response_dir.exists() else []
    if any(not path.is_file() or path.suffix != '.json'
           or path.stem not in expected for path in paths):
        raise RuntimeError('probe response inventory has an unknown file')
    seen = set()
    child_ids = set()
    child_codes = set()
    parents_with_children = 0
    uncoded_children = 0
    inventory = hashlib.sha256()
    for path in paths:
        if path.stem in seen:
            raise RuntimeError('probe response inventory duplicates a parent')
        seen.add(path.stem)
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        inventory.update(path.name.encode('utf-8') + b'\0' + bytes.fromhex(digest))
        wrapper = read_json(path, 'probe response')
        try:
            children = checked_children(wrapper, path.stem)
        except ValueError as error:
            raise RuntimeError(f'probe response invalid: {error}') from error
        if children:
            parents_with_children += 1
        for child in children:
            identifier, code = child['id'], child.get('sbcode')
            if identifier in child_ids or identifier in plan['allSourceNodeIds']:
                raise RuntimeError('level-four child ID overlaps another official node')
            child_ids.add(identifier)
            if code is None:
                uncoded_children += 1
            elif code in child_codes or code in plan['allSourceCodes']:
                raise RuntimeError('level-four child code overlaps another official node')
            else:
                child_codes.add(code)
    pending = [item['id'] for item in plan['parents'] if item['id'] not in seen]
    return {
        'savedResponses': len(paths), 'pendingParents': len(pending),
        'pendingIds': pending, 'parentsWithChildren': parents_with_children,
        'level4NodeCount': len(child_ids),
        'uncodedLevel4NodeCount': uncoded_children,
        'responseInventorySha256': inventory.hexdigest(),
        'allLevel3ChildrenEnumerated': not pending,
        'level4TerminalVerified': not pending and not child_ids,
    }


def require_handoff_finished(root: Path) -> None:
    status = read_json(root / 'batch-runs/stage-handoff.status.json',
                       'tree/first-page handoff status')
    if status.get('phase') != 'finished' or status.get('firstPageExitCode') != 0:
        raise RuntimeError('tree/first-page handoff has not finished successfully')


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
            instant = datetime.fromisoformat(value)
            if instant.tzinfo is None or instant.astimezone(timezone.utc) > now:
                raise ValueError('invalid time')
        except (TypeError, ValueError) as error:
            raise RuntimeError('shared hourly ledger timestamp invalid') from error


def prior_batch(probe: Path, plan: dict, cache: dict, batch_number: int) -> None:
    runs = probe / 'batch-runs'
    paths = sorted(runs.iterdir()) if runs.exists() else []
    if any(not path.is_file() or STATUS_NAME.fullmatch(path.name) is None
           for path in paths):
        raise RuntimeError('probe batch status inventory invalid')
    manifest_path = probe / 'manifest.json'
    if not paths:
        if manifest_path.exists() or cache['savedResponses']:
            raise RuntimeError('probe inventory exists without an audited batch')
        if batch_number != 1:
            raise RuntimeError('first probe batch must be number 1')
        return
    if [int(STATUS_NAME.fullmatch(path.name).group(1)) for path in paths] != list(
            range(1, len(paths) + 1)):
        raise RuntimeError('probe batch status sequence has a gap')
    last = None
    for path in paths:
        status = read_json(path, 'probe batch status')
        if status.get('phase') != 'finished':
            raise RuntimeError('prior probe batch unfinished; manual audit required')
        if (status.get('sourceFingerprint') != plan['sourceFingerprint']
                or status.get('outcome') not in ('partial', 'complete')
                or status.get('rateLimited') is not False
                or status.get('error') is not None):
            raise RuntimeError('prior probe batch blocked or source changed')
        last = status
    manifest = read_json(manifest_path, 'probe manifest')
    if (manifest.get('sourceFingerprint') != plan['sourceFingerprint']
            or manifest.get('activeBatch') is not None
            or manifest.get('lastBatchNumber') != len(paths)
            or last.get('batchNumber') != len(paths)
            or any(manifest.get(key) != cache[key] or last.get(key) != cache[key]
                   for key in ('savedResponses', 'pendingParents',
                               'responseInventorySha256'))):
        raise RuntimeError('probe source or response inventory differs from checkpoint')
    if last['outcome'] == 'complete':
        raise RuntimeError('level-three probe already complete')
    if batch_number != len(paths) + 1:
        raise RuntimeError('probe batch number must advance by one')


def progress(plan: dict, cache: dict, batch_number: int, active: bool) -> dict:
    return {
        'schemaVersion': 1, 'kind': 'mca-level3-child-probe',
        'sourceFingerprint': plan['sourceFingerprint'],
        'sourceTreeManifestSha256': plan['sourceTreeManifestSha256'],
        'plannedParentCount': len(plan['parents']),
        **{key: value for key, value in cache.items() if key != 'pendingIds'},
        'lastBatchNumber': batch_number if not active else batch_number - 1,
        'activeBatch': batch_number if active else None,
        'snapshotVerified': False, 'publishable': False,
        'auditedAtUtc': datetime.now(timezone.utc).isoformat(),
    }


def write_new_status(path: Path, status: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
        json.dump(status, output, ensure_ascii=False, indent=2)
        print(file=output)


def run_batch(root: Path, tree: Path, probe: Path, batch_number: int,
              limiter, *, fetch=None, max_parents: int = 20,
              timeout: float = 30) -> dict:
    """One audited serial batch; caller supplies the shared site limiter."""
    root, tree, probe = Path(root), Path(tree), Path(probe)
    if type(batch_number) is not int or not 1 <= batch_number <= 9999:
        raise ValueError('batch number must be 1..9999')
    if not 1 <= max_parents <= 20 or not math.isfinite(timeout) or timeout <= 0:
        raise ValueError('max parents 1..20 and positive timeout required')
    fetch = fetch or AREA['fetch_child']
    with TREE_AUTO['controller_lock'](root / 'batch-runs'):
        with CORE['exclusive_run_lock'](root):
            CORE['enforce_site_cooldown'](root)
            require_handoff_finished(root)
            plan = source_plan(tree)
            require_hourly_ledger(root)
            cache = scan_cache(plan, probe)
            prior_batch(probe, plan, cache, batch_number)
            status_path = probe / 'batch-runs' / f'batch-{batch_number:04d}.status.json'
            status = {
                'schemaVersion': 1, 'batchNumber': batch_number,
                'phase': 'running', 'outcome': None,
                'sourceFingerprint': plan['sourceFingerprint'],
                'plannedParentCount': len(plan['parents']),
                'startedAtUtc': datetime.now(timezone.utc).isoformat(),
                'endedAtUtc': None, 'attemptedParents': 0,
                'requestsThisRun': 0, 'rateLimited': False,
                'error': None, 'publishable': False,
            }
            write_new_status(status_path, status)
            CORE['save_json'](probe / 'manifest.json',
                              progress(plan, cache, batch_number, True))
            error = None
            budget_stop = False
            try:
                for parent_id in cache['pendingIds'][:max_parents]:
                    if limiter.exhausted.is_set():
                        budget_stop = True
                        break
                    status['attemptedParents'] += 1
                    CORE['save_json'](status_path, status)
                    try:
                        wrapper = fetch(parent_id, limiter, timeout)
                    except CORE['BudgetExhausted']:
                        budget_stop = True
                        break
                    checked_children(wrapper, parent_id)
                    CORE['save_json'](probe / 'responses' / f'{parent_id}.json', wrapper)
                    cache = scan_cache(plan, probe)
                    CORE['save_json'](probe / 'manifest.json',
                                      progress(plan, cache, batch_number, True))
            except (CORE['FetchError'], ValueError, RuntimeError, OSError) as caught:
                error = f'{type(caught).__name__}: {caught}'
            finally:
                if limiter.blocked.is_set():
                    CORE['save_json'](root / 'rate-limit.json', {
                        'reason': limiter.block_reason,
                        'detectedAtUtc': datetime.now(timezone.utc).isoformat(),
                        'cooldownUntilUtc': limiter.cooldown_until_utc,
                    })
                status.update({
                    'phase': 'finished', 'endedAtUtc': datetime.now(timezone.utc).isoformat(),
                    'outcome': ('blocked' if error or limiter.blocked.is_set() else
                                'complete' if cache['pendingParents'] == 0 else 'partial'),
                    'error': error, 'rateLimited': limiter.blocked.is_set(),
                    'requestBudgetReached': budget_stop or limiter.exhausted.is_set(),
                    'requestsThisRun': limiter.requests_started,
                    'savedResponses': cache['savedResponses'],
                    'pendingParents': cache['pendingParents'],
                    'responseInventorySha256': cache['responseInventorySha256'],
                })
                CORE['save_json'](probe / 'manifest.json',
                                  progress(plan, cache, batch_number, False))
                CORE['save_json'](status_path, status)
            return status


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true',
                        help='explicitly allow one bounded request batch')
    parser.add_argument('--batch-number', type=int)
    parser.add_argument('--max-parents', type=int, default=20)
    parser.add_argument('--max-requests', type=int, default=20)
    parser.add_argument('--interval', type=float, default=60)
    parser.add_argument('--jitter', type=float, default=10)
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args(argv)
    if (not 1 <= args.max_parents <= 20 or not 1 <= args.max_requests <= 20
            or not math.isfinite(args.interval) or args.interval < 60
            or not math.isfinite(args.jitter) or args.jitter < 0
            or not math.isfinite(args.timeout) or args.timeout <= 0):
        parser.error('limits: parents/requests 1..20, interval >=60, jitter >=0, timeout >0')
    if args.execute and args.batch_number is None:
        parser.error('--execute requires --batch-number')
    if not args.execute and args.batch_number is not None:
        parser.error('--batch-number is only valid with --execute')
    try:
        if not args.execute:
            plan = source_plan(TREE)
            cache = scan_cache(plan, PROBE)
            print(json.dumps({'mode': 'offline-audit',
                              'sourceFingerprint': plan['sourceFingerprint'],
                              'plannedParentCount': len(plan['parents']),
                              **{key: value for key, value in cache.items()
                                 if key != 'pendingIds'}}, ensure_ascii=False))
            return 0
        limiter = CORE['RateLimiter'](
            args.interval, args.jitter, args.max_requests,
            hourly_state_path=ROOT / 'hourly-request-budget.json')
        status = run_batch(ROOT, TREE, PROBE, args.batch_number, limiter,
                           max_parents=args.max_parents, timeout=args.timeout)
        print(json.dumps(status, ensure_ascii=False), flush=True)
        return 0 if status['outcome'] == 'complete' else 1 if status['outcome'] == 'partial' else 2
    except (CORE['FetchError'], OSError, RuntimeError, ValueError) as error:
        print(json.dumps({'mode': 'blocked', 'error': str(error),
                          'requestCount': 'inspect private status and hourly ledger'},
                         ensure_ascii=False), flush=True)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
