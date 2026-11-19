"""Serially run bounded official-area first-page passes until cached.

This controller never bypasses 429 or starts itself. The child collector owns
the site lock, cooldown, signed requests and shared rolling-hour budget.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
OUTPUT_DIR = PRIVATE_ROOT / 'national-area-first-pages-20261119'
COLLECTOR_PATH = PROJECT / 'scripts' / 'collect-mca-area-first-pages.py'
COLLECTOR = runpy.run_path(str(COLLECTOR_PATH), run_name='mca_first_pages')
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts' / 'run-mca-tree-auto-resume.py'),
                           run_name='mca_tree_auto_helpers')
controller_lock = TREE_AUTO['controller_lock']
wait_for_capacity = TREE_AUTO['wait_for_capacity']
PREFIX = re.compile(r'firstpage-[0-9]{8}-auto\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')


def read_status(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError(f'{path.name}: status missing or unreadable') from error
    if not isinstance(value, dict):
        raise RuntimeError(f'{path.name}: status invalid')
    return value


def clean_partial(status):
    return (type(status.get('exitCode')) is int and status['exitCode'] == 1
            and type(status.get('pendingAreas')) is int
            and status['pendingAreas'] > 0
            and status.get('rateLimited') is False
            and status.get('error') is None)


def clean_complete(status):
    return (type(status.get('exitCode')) is int and status['exitCode'] == 0
            and type(status.get('pendingAreas')) is int
            and status['pendingAreas'] == 0
            and status.get('rateLimited') is False
            and status.get('error') is None)


def resume_state(output_dir, prefix, max_batches):
    """Trust only a consecutive chain of independently audited child runs."""
    paths = list((output_dir / 'batch-runs').glob(f'{prefix}-*.status.json'))
    indexed = {}
    for path in paths:
        match = re.fullmatch(re.escape(prefix) + r'-([0-9]{4})\.status\.json',
                             path.name)
        if match is None:
            raise RuntimeError('unexpected first-page batch status name')
        indexed[int(match.group(1))] = path
    if indexed and sorted(indexed) != list(range(1, max(indexed) + 1)):
        raise RuntimeError('first-page batch sequence has a gap')
    if len(indexed) > max_batches:
        raise RuntimeError('existing first-page batches exceed configured ceiling')
    seed_sha = None
    completed = False
    for number in sorted(indexed):
        run_id = f'{prefix}-{number:04d}'
        status = read_status(indexed[number])
        if status.get('phase') != 'finished':
            raise RuntimeError(f'{run_id}: unfinished child run; manual audit required')
        if status.get('runId') != run_id or not SHA.fullmatch(
                str(status.get('sourceSeedSha256', ''))):
            raise RuntimeError(f'{run_id}: seed provenance differs or is missing')
        if seed_sha is None:
            seed_sha = status['sourceSeedSha256']
        elif seed_sha != status['sourceSeedSha256']:
            raise RuntimeError(f'{run_id}: seed changed across batches')
        if completed:
            raise RuntimeError('batch exists after all first pages cached')
        if clean_complete(status):
            completed = True
        elif not clean_partial(status):
            raise RuntimeError(f'{run_id}: failed child batch; no retry')
    return len(indexed) + 1, completed, seed_sha


def preflight():
    """Reject active tree collection or stale/incomplete official seeds."""
    root = PRIVATE_ROOT
    with COLLECTOR['FETCHER']['exclusive_run_lock'](root):
        COLLECTOR['FETCHER']['enforce_site_cooldown'](root)
        _document, sha = COLLECTOR['load_verified_seeds'](
            COLLECTOR['SEED_PATH'], COLLECTOR['TREE_DIR'])
        COLLECTOR['require_hourly_ledger'](root)
    return sha


def emit(exit_code, reason, **details):
    print(json.dumps({'exitCode': exit_code, 'reason': reason, **details},
                     ensure_ascii=False), flush=True)
    return exit_code


def verify_completed_cache(expected_seed_sha):
    """Reaudit byte evidence and the entire manifest before trusting completion."""
    with COLLECTOR['FETCHER']['exclusive_run_lock'](PRIVATE_ROOT):
        COLLECTOR['FETCHER']['enforce_site_cooldown'](PRIVATE_ROOT)
        document, seed_sha = COLLECTOR['load_verified_seeds'](
            COLLECTOR['SEED_PATH'], COLLECTOR['TREE_DIR'])
        if seed_sha != expected_seed_sha:
            raise RuntimeError('official seed changed during completion audit')
        manifest = COLLECTOR['read_json'](OUTPUT_DIR / 'manifest.json')
        observations = COLLECTOR['scan_cache'](OUTPUT_DIR, document['seeds'], seed_sha)
        expected = COLLECTOR['progress_document'](
            COLLECTOR['SEED_PATH'], seed_sha, document['seeds'], observations)
        if not expected['allFirstPagesCached']:
            raise RuntimeError('completed first-page chain has missing checkpoints')
        # Recomputed time is not a source field; all coverage, hashes, source
        # paths and observations must match the current audited cache exactly.
        expected.pop('auditedAtUtc')
        manifest.pop('auditedAtUtc', None)
        if manifest != expected:
            raise RuntimeError('completed first-page manifest differs from audited cache')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch-prefix', required=True)
    parser.add_argument('--max-batches', type=int, default=200)
    args = parser.parse_args(argv)
    if not PREFIX.fullmatch(args.batch_prefix):
        parser.error('batch prefix must be firstpage-YYYYMMDD-auto')
    if not 1 <= args.max_batches <= 9999:
        parser.error('max-batches must be 1..9999')
    runs = OUTPUT_DIR / 'batch-runs'
    stop_file = runs / f'{args.batch_prefix}.stop'
    try:
        # Shared controller lock keeps the tree controller from running at
        # the same time; child requests additionally take the site lock.
        with controller_lock(PRIVATE_ROOT / 'batch-runs'):
            next_number, complete, previous_sha = resume_state(
                OUTPUT_DIR, args.batch_prefix, args.max_batches)
            if stop_file.exists():
                return emit(3, 'stop file present', stopFile=str(stop_file))
            current_sha = preflight()
            if previous_sha is not None and current_sha != previous_sha:
                raise RuntimeError('official seed changed since prior child batch')
            if complete:
                verify_completed_cache(current_sha)
                return emit(0, 'all first pages already cached',
                            batches=next_number - 1)
            while next_number <= args.max_batches:
                if stop_file.exists():
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                if not wait_for_capacity(PRIVATE_ROOT, stop_file):
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                if current_sha != preflight():
                    raise RuntimeError('official seed changed while waiting')
                run_id = f'{args.batch_prefix}-{next_number:04d}'
                command = [str(sys.executable), str(COLLECTOR_PATH),
                           '--run-id', run_id, '--max-areas', '20',
                           '--max-requests', '20', '--interval', '60',
                           '--jitter', '10']
                child = subprocess.run(command, cwd=PROJECT, check=False,
                                       timeout=3600)
                status = read_status(runs / f'{run_id}.status.json')
                if (status.get('runId') != run_id
                        or status.get('sourceSeedSha256') != current_sha):
                    raise RuntimeError(f'{run_id}: child status provenance differs')
                if child.returncode == 0 and clean_complete(status):
                    return emit(0, 'all official-area first pages cached',
                                lastRunId=run_id, batches=next_number)
                if child.returncode != 1 or not clean_partial(status):
                    raise RuntimeError(f'{run_id}: child failed or uncertain; no retry')
                emit(1, 'bounded batch finished; continuing after capacity check',
                     lastRunId=run_id, batches=next_number,
                     pendingAreas=status['pendingAreas'])
                next_number += 1
            return emit(4, 'configured batch ceiling reached',
                        batches=args.max_batches)
    except KeyboardInterrupt:
        return emit(130, 'interrupted; inspect child status before restart')
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        return emit(2, f'{type(error).__name__}: {error}')


if __name__ == '__main__':
    raise SystemExit(main())
