"""Serially resume bounded detail batches for a fixed observed-ID queue.

This controller does not start itself. Each child reaudits sources and owns the
shared tree-controller/site locks, cooldown, pacing and hourly request budget.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
OUTPUT_DIR = PRIVATE_ROOT / 'national-observed-details-20261119'
COLLECTOR_PATH = PROJECT / 'scripts' / 'collect-mca-observed-details.py'
COLLECTOR = runpy.run_path(str(COLLECTOR_PATH), run_name='mca_detail_batch')
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts' / 'run-mca-tree-auto-resume.py'),
                           run_name='mca_detail_capacity_helpers')
wait_for_capacity = TREE_AUTO['wait_for_capacity']
PREFIX = re.compile(r'detail-[0-9]{8}-auto\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')
MAX_IDS = '12'
MAX_REQUESTS = '30'
INTERVAL = '60'
JITTER = '10'


def read_status(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError(f'{path.name}: status missing or unreadable') from error
    if not isinstance(value, dict):
        raise RuntimeError(f'{path.name}: status invalid')
    return value


def audit_status(status, run_id, previous_sha, previous_total, previous_count):
    if (status.get('schemaVersion') != 1 or status.get('runId') != run_id
            or status.get('phase') != 'finished'):
        raise RuntimeError(f'{run_id}: unfinished or mismatched child status')
    try:
        ended = datetime.fromisoformat(status['endedAtUtc'])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError(f'{run_id}: end time invalid') from error
    if ended.tzinfo is None:
        raise RuntimeError(f'{run_id}: end time lacks timezone')
    source_sha = status.get('sourceInventorySha256')
    total = status.get('uniqueIdCount')
    count = status.get('completedDetailCount')
    newly_saved = status.get('newlySavedDetails')
    requests = status.get('requestsThisRun')
    if (not isinstance(source_sha, str) or not SHA.fullmatch(source_sha)
            or type(total) is not int or total < 0
            or type(count) is not int or not 0 <= count <= total
            or type(newly_saved) is not int or not 0 <= newly_saved <= 12
            or type(requests) is not int or not 0 <= requests <= 30
            or status.get('nationalComplete') is not False
            or status.get('publishable') is not False):
        raise RuntimeError(f'{run_id}: queue or completion status invalid')
    if previous_sha is not None and (source_sha != previous_sha or total != previous_total):
        raise RuntimeError(f'{run_id}: source inventory changed across batches')
    if previous_count is not None and not previous_count <= count <= previous_count + 12:
        raise RuntimeError(f'{run_id}: completed detail count broke batch chain')
    if previous_count is not None and count - previous_count != newly_saved:
        raise RuntimeError(f'{run_id}: saved detail count differs from batch progress')
    complete = (type(status.get('exitCode')) is int and status['exitCode'] == 0
                and count == total
                and status.get('detailsCompleteForObservedIds') is True
                and status.get('rateLimited') is False
                and status.get('error') is None)
    partial = (type(status.get('exitCode')) is int and status['exitCode'] == 1
               and count < total
               and status.get('detailsCompleteForObservedIds') is False
               and status.get('rateLimited') is False
               and status.get('error') is None
               and (newly_saved > 0
                    or (status.get('requestBudgetReached') is True
                        and requests > 0)))
    if not complete and not partial:
        raise RuntimeError(f'{run_id}: failed child batch; no automatic retry')
    return source_sha, total, count, complete


def resume_state(output_dir, prefix, max_batches):
    """Accept only a consecutive, same-source chain of clean child statuses."""
    paths = list((output_dir / 'batch-runs').glob(f'{prefix}-*.status.json'))
    indexed = {}
    for path in paths:
        match = re.fullmatch(re.escape(prefix) + r'-([0-9]{4})\.status\.json',
                             path.name)
        if match is None:
            raise RuntimeError('unexpected detail batch status name')
        indexed[int(match.group(1))] = path
    if indexed and sorted(indexed) != list(range(1, max(indexed) + 1)):
        raise RuntimeError('detail batch sequence has a gap')
    if len(indexed) > max_batches:
        raise RuntimeError('existing detail batches exceed configured ceiling')
    source_sha = total = completed_count = None
    complete = False
    for number in sorted(indexed):
        if complete:
            raise RuntimeError('detail batch exists after queue completion')
        run_id = f'{prefix}-{number:04d}'
        source_sha, total, completed_count, complete = audit_status(
            read_status(indexed[number]), run_id, source_sha, total, completed_count)
    return len(indexed) + 1, complete, source_sha, total, completed_count


def preflight(descendant_seed_path=None):
    """Recheck fixed source queue, detail checkpoints, cooldown and budget."""
    root = PRIVATE_ROOT
    with COLLECTOR['CONTROLLER_LOCK'](root / 'batch-runs'):
        with COLLECTOR['FETCHER']['exclusive_run_lock'](root):
            COLLECTOR['FETCHER']['enforce_site_cooldown'](root)
            COLLECTOR['FOLLOWUP']['FIRST']['require_hourly_ledger'](root)
            queue = COLLECTOR['build_queue'](
                COLLECTOR['SEED_PATH'], COLLECTOR['TREE_DIR'],
                COLLECTOR['FIRST_DIR'], COLLECTOR['FOLLOWUP_DIR'],
                large_dir=COLLECTOR['LARGE_DIR'],
                descendant_seed_path=descendant_seed_path)
            manifest_path = OUTPUT_DIR / 'manifest.json'
            if manifest_path.exists():
                prior = COLLECTOR['read_json'](manifest_path)
                if (prior.get('sourceInventorySha256') != queue['sourceInventorySha256']
                        or prior.get('sourceSeedSha256') != queue['sourceSeedSha256']
                        or prior.get('sourceFirstPageManifestSha256')
                        != queue['sourceFirstPageManifestSha256']
                        or prior.get('sourceFollowupManifestSha256')
                        != queue['sourceFollowupManifestSha256']
                        or prior.get('sourceLargeManifestSha256')
                        != queue['sourceLargeManifestSha256']
                        or prior.get('sourceDescendantSeedSha256')
                        != queue.get('sourceDescendantSeedSha256')):
                    raise RuntimeError('saved detail manifest belongs to another observed queue')
            completed = COLLECTOR['scan_detail_cache'](OUTPUT_DIR, queue)
            for path in (OUTPUT_DIR / 'batch-runs').glob('*.status.json'):
                status = read_status(path)
                if status.get('sourceDescendantSeedSha256') != queue.get(
                        'sourceDescendantSeedSha256'):
                    raise RuntimeError('detail descendant source changed across batches')
    return queue['sourceInventorySha256'], queue['uniqueIdCount'], len(completed)


def emit(exit_code, reason, **details):
    print(json.dumps({'exitCode': exit_code, 'reason': reason, **details},
                     ensure_ascii=False), flush=True)
    return exit_code


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch-prefix', required=True)
    parser.add_argument('--max-batches', type=int, default=5000)
    parser.add_argument('--official-descendants-overlay-v1', action='store_true')
    args = parser.parse_args(argv)
    if not PREFIX.fullmatch(args.batch_prefix):
        parser.error('batch prefix must be detail-YYYYMMDD-auto')
    if not 1 <= args.max_batches <= 9999:
        parser.error('max-batches must be 1..9999')
    runs = OUTPUT_DIR / 'batch-runs'
    stop_file = runs / f'{args.batch_prefix}.stop'
    descendant_seed_path = (PRIVATE_ROOT /
        'national-area-level4-overlay-seeds.v1.json'
        if args.official_descendants_overlay_v1 else None)
    check = (preflight if descendant_seed_path is None else
             lambda: preflight(descendant_seed_path))
    try:
        # Separate controller-instance lock; child retains the shared tree lock.
        with COLLECTOR['FETCHER']['exclusive_run_lock'](runs):
            next_number, complete, previous_sha, previous_total, previous_count = (
                resume_state(OUTPUT_DIR, args.batch_prefix, args.max_batches))
            if stop_file.exists():
                return emit(3, 'stop file present', stopFile=str(stop_file))
            current_sha, total, count = check()
            if previous_sha is not None and (current_sha != previous_sha
                                             or total != previous_total
                                             or count != previous_count):
                raise RuntimeError('observed detail queue or completed count changed since prior batch')
            if complete or count == total:
                return emit(0, 'all observed IDs already have audited details',
                            batches=next_number - 1, observedIdCount=total)
            while next_number <= args.max_batches:
                if stop_file.exists():
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                if not wait_for_capacity(PRIVATE_ROOT, stop_file):
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                if stop_file.exists():
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                checked_sha, checked_total, checked_count = check()
                if (checked_sha != current_sha or checked_total != total
                        or checked_count != count):
                    raise RuntimeError('observed detail queue or cache changed while waiting')
                run_id = f'{args.batch_prefix}-{next_number:04d}'
                command = [str(sys.executable), str(COLLECTOR_PATH),
                           '--run-id', run_id, '--max-ids', MAX_IDS,
                           '--max-requests', MAX_REQUESTS, '--interval', INTERVAL,
                           '--jitter', JITTER,
                           '--expected-source-sha256', current_sha]
                if descendant_seed_path is not None:
                    command.append('--official-descendants-overlay-v1')
                child = subprocess.run(command, cwd=PROJECT, check=False, timeout=3600)
                status = read_status(runs / f'{run_id}.status.json')
                source_sha, saved_total, saved_count, child_complete = audit_status(
                    status, run_id, current_sha, total, count)
                if child.returncode != status['exitCode']:
                    raise RuntimeError(f'{run_id}: process exit and status disagree')
                if child_complete:
                    return emit(0, 'observed detail queue complete',
                                lastRunId=run_id, batches=next_number,
                                observedIdCount=saved_total)
                count = saved_count
                emit(1, 'bounded detail batch finished; continuing after capacity check',
                     lastRunId=run_id, batches=next_number,
                     completedDetailCount=count, observedIdCount=total)
                next_number += 1
            return emit(4, 'configured batch ceiling reached',
                        batches=args.max_batches, completedDetailCount=count,
                        observedIdCount=total)
    except KeyboardInterrupt:
        return emit(130, 'interrupted; inspect child status before restart')
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        return emit(2, f'{type(error).__name__}: {error}')


if __name__ == '__main__':
    raise SystemExit(main())
