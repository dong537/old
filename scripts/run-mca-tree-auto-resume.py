"""Serially resume the official MCA area tree in bounded, auditable batches.

Usage: python scripts/run-mca-tree-auto-resume.py \
    --previous-run-id tree-20261119-a --batch-prefix tree-20261119-auto

This does not start itself or bypass a site challenge. It calls the separately
audited one-shot wrapper and stops on any uncertainty, lock conflict or error.
The stop file is honored at batch boundaries; an active bounded batch finishes.
"""

from __future__ import annotations

import argparse
import hashlib
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import sys
import time


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
ONE_SHOT_PATH = PROJECT / 'scripts' / 'run-mca-tree-resume.py'
ONE_SHOT = runpy.run_path(str(ONE_SHOT_PATH), run_name='mca_tree_one_shot')
preflight = ONE_SHOT['check_preconditions']
verify_legacy_attestation = ONE_SHOT['verify_legacy_attestation']
PARTIAL_ERROR = ONE_SHOT['PARTIAL_ERROR']
LEGACY_AUTO_RUN_ID = ONE_SHOT['LEGACY_AUTO_RUN_ID']
PREFIX_PATTERN = re.compile(r'tree-[0-9]{8}-auto\Z')


def utc_time(value, label):
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError('timezone missing')
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError) as error:
        raise RuntimeError(f'{label} invalid') from error


def read_json(path, label):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError(f'{label} missing or unreadable') from error
    if not isinstance(value, dict):
        raise RuntimeError(f'{label} invalid')
    return value


def clean_partial(status, *, require_owned=True):
    return (type(status.get('exitCode')) is int and status['exitCode'] == 1
            and type(status.get('collectorExitCode')) is int
            and status['collectorExitCode'] == 0
            and status.get('treeWalkComplete') is False
            and status.get('requestBudgetReached') is True
            and status.get('rateLimited') is False
            and status.get('lastError') is None
            and (not require_owned or (
                isinstance(status.get('collectorManifestSha256'), str)
                and re.fullmatch(r'[0-9a-f]{64}',
                                 status['collectorManifestSha256']) is not None))
            and status.get('error') == PARTIAL_ERROR)


def clean_complete(status):
    return (type(status.get('exitCode')) is int and status['exitCode'] == 0
            and type(status.get('collectorExitCode')) is int
            and status['collectorExitCode'] == 0
            and status.get('treeWalkComplete') is True
            and status.get('rateLimited') is False
            and status.get('lastError') is None
            and isinstance(status.get('collectorManifestSha256'), str)
            and re.fullmatch(r'[0-9a-f]{64}', status['collectorManifestSha256']) is not None
            and status.get('error') is None)


def resume_state(root, initial_run_id, prefix, max_batches):
    """Rebuild progress only from consecutive, immutable child statuses."""
    runs = root / 'batch-runs'
    paths = list(runs.glob(f'{prefix}-*.status.json'))
    indexed = {}
    for path in paths:
        match = re.fullmatch(re.escape(prefix) + r'-([0-9]{3})\.status\.json',
                             path.name)
        if match is None:
            raise RuntimeError('unexpected controller batch status name')
        indexed[int(match.group(1))] = path
    if indexed and sorted(indexed) != list(range(1, max(indexed) + 1)):
        raise RuntimeError('controller batch sequence has a gap')
    previous = initial_run_id
    completed = False
    recovery_link = None
    for sequence in sorted(indexed):
        run_id = f'{prefix}-{sequence:03d}'
        status = read_json(indexed[sequence], 'controller batch status')
        if status.get('phase') != 'finished' or status.get('endedAtUtc') is None:
            raise RuntimeError(f'{run_id}: unfinished batch; manual audit required')
        utc_time(status['endedAtUtc'], 'batch end time')
        if status.get('runId') != run_id or status.get('priorRunId') != previous:
            raise RuntimeError(f'{run_id}: batch chain differs')
        if recovery_link is not None and status.get('priorRecoveryAttestationSha256') != recovery_link:
            raise RuntimeError(f'{run_id}: recovery link missing or differs')
        recovery_link = None
        if completed:
            raise RuntimeError('batch exists after completed tree')
        if clean_complete(status):
            completed = True
        elif (run_id == LEGACY_AUTO_RUN_ID
              and status.get('collectorManifestSha256') is None
              and clean_partial(status, require_owned=False)):
            verify_legacy_attestation(root)
        elif not clean_partial(status):
            if run_id not in ('tree-20261119-auto-008',
                              'tree-20261119-auto-017'):
                raise RuntimeError(f'{run_id}: not a clean budget interruption')
            ONE_SHOT['verify_recovery_attestation'](root, run_id)
            recovery_link = hashlib.sha256((runs / f'{run_id}.recovery.json').read_bytes()).hexdigest()
        previous = run_id
    if len(indexed) > max_batches:
        raise RuntimeError('existing batches exceed configured ceiling')
    return previous, len(indexed) + 1, completed


def next_available_utc(root, now):
    """Read the collector's shared rolling-hour ledger; never reset it."""
    now = now.astimezone(timezone.utc)
    path = root / 'hourly-request-budget.json'
    if not path.is_file():
        raise RuntimeError('site hourly request ledger missing; no batch started')
    state = read_json(path, 'hourly budget')
    if (state.get('schemaVersion') != 1 or state.get('windowSeconds') != 3600
            or state.get('limit') != 60
            or not isinstance(state.get('requestStartedAtUtc'), list)):
        raise RuntimeError('hourly budget schema invalid')
    starts = []
    for value in state['requestStartedAtUtc']:
        started = utc_time(value, 'hourly budget timestamp')
        if started > now:
            raise RuntimeError('hourly budget contains a future request')
        if started > now - timedelta(seconds=3600):
            starts.append(started)
    if len(starts) > 60:
        raise RuntimeError('hourly budget exceeds hard limit')
    if len(starts) < 60:
        return now
    return min(starts) + timedelta(seconds=3602)


@contextmanager
def controller_lock(runs):
    """Prevent two unattended controllers from interleaving batch IDs."""
    runs.mkdir(parents=True, exist_ok=True)
    stream = (runs / 'tree-auto-controller.lock').open('a+b')
    try:
        if os.name == 'nt':
            import msvcrt
            if stream.seek(0, os.SEEK_END) == 0:
                stream.write(b'0')
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        stream.close()
        raise RuntimeError('another tree controller is running') from error
    try:
        yield
    finally:
        if os.name == 'nt':
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        stream.close()


def wait_for_capacity(root, stop_file):
    while True:
        if stop_file.exists():
            return False
        now = datetime.now(timezone.utc)
        next_slot = next_available_utc(root, now)
        remaining = (next_slot - now).total_seconds()
        if remaining <= 0:
            return True
        time.sleep(min(remaining, 15))


def emit(exit_code, reason, **details):
    print(json.dumps({'exitCode': exit_code, 'reason': reason, **details},
                     ensure_ascii=False), flush=True)
    return exit_code


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previous-run-id', required=True)
    parser.add_argument('--batch-prefix', required=True)
    parser.add_argument('--max-batches', type=int, default=32)
    args = parser.parse_args(argv)
    if not PREFIX_PATTERN.fullmatch(args.batch_prefix):
        parser.error('batch prefix must be tree-YYYYMMDD-auto')
    if not 1 <= args.max_batches <= 100:
        parser.error('max-batches must be 1..100')
    runs = PRIVATE_ROOT / 'batch-runs'
    stop_file = runs / f'{args.batch_prefix}.stop'
    try:
        with controller_lock(runs):
            previous, sequence, complete = resume_state(
                PRIVATE_ROOT, args.previous_run_id, args.batch_prefix,
                args.max_batches)
            if complete:
                return emit(0, 'tree already complete', lastRunId=previous)
            while sequence <= args.max_batches:
                if stop_file.exists():
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                run_id = f'{args.batch_prefix}-{sequence:03d}'
                # Reject a running collector, stale manifest or site cooldown
                # before waiting. The child repeats this check after waiting.
                preflight(PRIVATE_ROOT, previous, run_id, datetime.now(timezone.utc))
                if not wait_for_capacity(PRIVATE_ROOT, stop_file):
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                if stop_file.exists():
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                command = [str(sys.executable), str(ONE_SHOT_PATH),
                           '--previous-run-id', previous, '--run-id', run_id]
                # Avoid orphaning the collector grandchild on Windows. Its
                # request count and network timeout already bound each batch.
                child = subprocess.run(command, cwd=PROJECT, check=False)
                status = read_json(runs / f'{run_id}.status.json', 'child batch status')
                if status.get('runId') != run_id or status.get('priorRunId') != previous:
                    raise RuntimeError('child batch status chain differs')
                if child.returncode == 0 and clean_complete(status):
                    return emit(0, 'area tree complete', lastRunId=run_id,
                                batches=sequence)
                if child.returncode != 1 or not clean_partial(status):
                    raise RuntimeError(f'{run_id}: child failed or uncertain; no retry')
                emit(1, 'request budget reached; continuing after capacity check',
                     lastRunId=run_id, batches=sequence,
                     savedResponses=status.get('savedResponses'),
                     pendingParentIds=status.get('pendingAfter'))
                previous = run_id
                sequence += 1
            return emit(4, 'configured batch ceiling reached',
                        lastRunId=previous, maxBatches=args.max_batches)
    except KeyboardInterrupt:
        return emit(130, 'interrupted; inspect child status before restart')
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        return emit(2, f'{type(error).__name__}: {error}',
                    lastRunId=locals().get('previous'))


if __name__ == '__main__':
    raise SystemExit(main())
