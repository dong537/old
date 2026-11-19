"""Serially resume bounded small or large MCA area page observations.

This is a private, manually started controller. It never upgrades these
observations to a verified national snapshot. The child owns the shared site
lock, 60-second pacing, rolling-hour budget, and rate-limit stop behavior.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import re
import runpy
import subprocess
import sys


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
OUTPUT_DIR = PRIVATE_ROOT / 'national-area-followup-pages-20261119'
LARGE_OUTPUT_DIR = PRIVATE_ROOT / 'national-area-large-pages-20261119'
COLLECTOR_PATH = PROJECT / 'scripts' / 'collect-mca-area-followup-pages.py'
COLLECTOR = runpy.run_path(str(COLLECTOR_PATH), run_name='mca_followup_batch')
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts' / 'run-mca-tree-auto-resume.py'),
                           run_name='mca_followup_capacity_helpers')
wait_for_capacity = TREE_AUTO['wait_for_capacity']
PREFIX = re.compile(r'followup-[0-9]{8}-auto\Z')
LARGE_PREFIX = re.compile(r'largepage-[0-9]{8}-auto\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')


def read_status(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError(f'{path.name}: status missing or unreadable') from error
    if not isinstance(value, dict):
        raise RuntimeError(f'{path.name}: status invalid')
    return value


def audit_status(status, run_id, previous, page_mode='small'):
    if (status.get('schemaVersion') != 1 or status.get('runId') != run_id
            or status.get('phase') != 'finished'):
        raise RuntimeError(f'{run_id}: unfinished or mismatched child status')
    try:
        ended = datetime.fromisoformat(status['endedAtUtc'])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError(f'{run_id}: end time invalid') from error
    if ended.tzinfo is None:
        raise RuntimeError(f'{run_id}: end time lacks timezone')
    seed_sha = status.get('sourceSeedSha256')
    first_sha = status.get('sourceFirstPageManifestSha256')
    descendant_sha = status.get('sourceDescendantSeedSha256')
    total = status.get('selectedAreaCount')
    completed = status.get('areasObservedComplete' if page_mode == 'small'
                           else 'areasPagesObservedComplete')
    issues = status.get('areasUnverified')
    saved = status.get('newlySavedPages')
    requests = status.get('requestsThisRun')
    if (not isinstance(seed_sha, str) or not SHA.fullmatch(seed_sha)
            or not isinstance(first_sha, str) or not SHA.fullmatch(first_sha)
            or (descendant_sha is not None
                and (not isinstance(descendant_sha, str)
                     or not SHA.fullmatch(descendant_sha)))
            or type(total) is not int or total < 0
            or type(completed) is not int or not 0 <= completed <= total
            or type(issues) is not int or issues < 0
            or type(saved) is not int or not 0 <= saved <= 12
            or type(requests) is not int or not 0 <= requests <= 12
            or saved > requests or status.get('publishable') is not False
            or status.get('pageMode') != page_mode):
        raise RuntimeError(f'{run_id}: source or counts invalid')
    if issues and page_mode == 'small':
        raise RuntimeError(f'{run_id}: unverified area requires manual review')
    if previous is not None:
        old_seed, old_first, old_total, old_completed = previous
        if (seed_sha != old_seed or first_sha != old_first or total != old_total):
            raise RuntimeError(f'{run_id}: source changed across batches')
        if not old_completed <= completed <= old_completed + 5:
            raise RuntimeError(f'{run_id}: completed-area count broke batch chain')
    complete = (type(status.get('exitCode')) is int
                and status['exitCode'] == 0 and completed == total
                and status.get('rateLimited') is False
                and status.get('error') is None)
    partial = (type(status.get('exitCode')) is int
               and status['exitCode'] == 1 and completed < total
               and status.get('rateLimited') is False
               and status.get('error') is None
               and (saved > 0 or status.get('requestBudgetReached') is True))
    if not complete and not partial:
        raise RuntimeError(f'{run_id}: failed child batch; no automatic retry')
    return (seed_sha, first_sha, total, completed), complete


def resume_state(output_dir, prefix, max_batches, page_mode='small'):
    """Trust only consecutive same-source child statuses with no audit issues."""
    paths = list((output_dir / 'batch-runs').glob(f'{prefix}-*.status.json'))
    indexed = {}
    for path in paths:
        match = re.fullmatch(re.escape(prefix) + r'-([0-9]{4})\.status\.json',
                             path.name)
        if match is None:
            raise RuntimeError('unexpected followup batch status name')
        indexed[int(match.group(1))] = path
    if indexed and sorted(indexed) != list(range(1, max(indexed) + 1)):
        raise RuntimeError('followup batch sequence has a gap')
    if len(indexed) > max_batches:
        raise RuntimeError('existing batches exceed configured ceiling')
    previous = None
    complete = False
    for number in sorted(indexed):
        if complete:
            raise RuntimeError('batch exists after small-area followup completion')
        run_id = f'{prefix}-{number:04d}'
        previous, complete = audit_status(read_status(indexed[number]),
                                          run_id, previous, page_mode)
    return (len(indexed) + 1, complete, *(previous or (None,) * 4))


def preflight_mode(page_mode, output_dir, descendant_seed_path=None):
    """Reaudit first-page provenance and every existing followup checkpoint."""
    root = PRIVATE_ROOT
    with COLLECTOR['CONTROLLER_LOCK'](root / 'batch-runs'):
        with COLLECTOR['FETCHER']['exclusive_run_lock'](root):
            COLLECTOR['FETCHER']['enforce_site_cooldown'](root)
            COLLECTOR['FIRST']['require_hourly_ledger'](root)
            seed_doc, seed_sha, observations, first_sha = (
                COLLECTOR['first_page_inputs'](
                    COLLECTOR['SEED_PATH'], COLLECTOR['TREE_DIR'],
                    COLLECTOR['FIRST_DIR']))
            descendant_seeds = ()
            descendant_sha = None
            if descendant_seed_path is not None:
                descendant_doc, descendant_sha = COLLECTOR['verified_descendants'](
                    descendant_seed_path, COLLECTOR['TREE_DIR'])
                descendant_seeds = descendant_doc['seeds']
            eligible = []
            for seed in seed_doc['seeds']:
                observation = observations[seed['sbcode']]
                pages = math.ceil(observation['reportedTotal'] /
                                  observation['serverPageSize'])
                if ((page_mode == 'small' and 2 <= pages <= 3)
                        or (page_mode == 'large' and 4 <= pages <=
                            COLLECTOR['MAX_LARGE_EXPECTED_PAGES'])):
                    eligible.append(seed)
            manifest_path = output_dir / 'manifest.json'
            old = COLLECTOR['read_json'](manifest_path) if manifest_path.exists() else None
            eligible_codes = {seed['sbcode'] for seed in eligible}
            if old is None and any(output_dir.glob('area-*')):
                raise RuntimeError('followup cache lacks manifest; manual audit required')
            for folder in output_dir.glob('area-*'):
                if not folder.is_dir() or folder.name.removeprefix('area-') not in eligible_codes:
                    raise RuntimeError(f'{folder.name}: unexpected followup cache')
            if old is not None:
                areas = old.get('areas')
                if (old.get('pageMode') != page_mode
                        or old.get('sourceSeedSha256') != seed_sha
                        or old.get('sourceFirstPageManifestSha256') != first_sha
                        or old.get('sourceDescendantSeedSha256') != descendant_sha
                        or old.get('selectedAreaCount') != len(eligible)
                        or old.get('nationalComplete') is not False
                        or old.get('snapshotVerified') is not False
                        or old.get('publishable') is not False
                        or not isinstance(areas, dict)
                        or set(areas) != eligible_codes):
                    raise RuntimeError('followup manifest differs from audited first pages')
            observed = 0
            for seed in eligible:
                code = seed['sbcode']
                area = COLLECTOR['audit_area'](
                    COLLECTOR['FIRST_DIR'] / f'area-{code}' / 'pages' / '00001.json',
                    output_dir / f'area-{code}', seed, seed_doc['seeds'],
                    observations[code], descendant_seeds=descendant_seeds)
                if area['issues'] and page_mode == 'small':
                    raise RuntimeError(f'{code}: unverified followup pages')
                if old is not None:
                    prior = old['areas'][code]
                    if (not isinstance(prior, dict)
                            or prior.get('pageFiles') != area['pageFiles']
                            or prior.get('issues') != area['issues']
                            or prior.get('observedPagesComplete')
                            != area['observedPagesComplete']):
                        raise RuntimeError(f'{code}: followup cache differs from manifest')
                observed += (area['observedPagesComplete'] if page_mode == 'small'
                             else area['savedFollowupPages'] == area['expectedPages'] - 1)
            for path in (output_dir / 'batch-runs').glob('*.status.json'):
                status = read_status(path)
                if status.get('sourceDescendantSeedSha256') != descendant_sha:
                    raise RuntimeError('followup descendant source changed across batches')
            if old is not None and (
                    old.get('areasObservedComplete' if page_mode == 'small'
                            else 'areasPagesObservedComplete') != observed
                    or (page_mode == 'small' and old.get('areasUnverified') != 0)):
                raise RuntimeError('followup manifest completion counters differ')
    return seed_sha, first_sha, len(eligible), observed


def preflight():
    return preflight_mode('small', OUTPUT_DIR)


def preflight_large():
    return preflight_mode('large', LARGE_OUTPUT_DIR)


def emit(exit_code, reason, **details):
    print(json.dumps({'exitCode': exit_code, 'reason': reason, **details},
                     ensure_ascii=False), flush=True)
    return exit_code


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch-prefix', required=True)
    parser.add_argument('--max-batches', type=int, default=5000)
    parser.add_argument('--page-mode', choices=('small', 'large'), default='small')
    parser.add_argument('--official-descendants-overlay-v1', action='store_true')
    args = parser.parse_args(argv)
    if not (PREFIX if args.page_mode == 'small' else LARGE_PREFIX).fullmatch(
            args.batch_prefix):
        parser.error('batch prefix does not match selected page mode')
    if not 1 <= args.max_batches <= 9999:
        parser.error('max-batches must be 1..9999')
    output_dir = OUTPUT_DIR if args.page_mode == 'small' else LARGE_OUTPUT_DIR
    descendant_seed_path = (PRIVATE_ROOT /
        'national-area-level4-overlay-seeds.v1.json'
        if args.official_descendants_overlay_v1 else None)
    check = ((lambda: preflight_mode(args.page_mode, output_dir,
                                    descendant_seed_path))
             if descendant_seed_path is not None else
             preflight if args.page_mode == 'small' else preflight_large)
    runs = output_dir / 'batch-runs'
    stop_file = runs / f'{args.batch_prefix}.stop'
    try:
        with COLLECTOR['FETCHER']['exclusive_run_lock'](runs):
            next_number, complete, old_seed, old_first, old_total, old_count = (
                resume_state(output_dir, args.batch_prefix, args.max_batches,
                             args.page_mode))
            if stop_file.exists():
                return emit(3, 'stop file present', stopFile=str(stop_file))
            seed_sha, first_sha, total, count = check()
            if old_seed is not None and (
                    seed_sha, first_sha, total, count) != (
                    old_seed, old_first, old_total, old_count):
                raise RuntimeError('followup source or cache changed since prior batch')
            if complete or count == total:
                return emit(0, 'all selected area pages already cached',
                            pageMode=args.page_mode, selectedAreaCount=total)
            while next_number <= args.max_batches:
                if stop_file.exists() or not wait_for_capacity(PRIVATE_ROOT, stop_file):
                    return emit(3, 'stop file present', stopFile=str(stop_file))
                if (seed_sha, first_sha, total, count) != check():
                    raise RuntimeError('followup source or cache changed while waiting')
                run_id = f'{args.batch_prefix}-{next_number:04d}'
                command = [str(sys.executable), str(COLLECTOR_PATH),
                           '--run-id', run_id, '--max-areas', '5',
                           '--max-requests', '12', '--interval', '60',
                           '--jitter', '10']
                if args.page_mode == 'large':
                    command.extend(['--page-mode', 'large'])
                if descendant_seed_path is not None:
                    command.append('--official-descendants-overlay-v1')
                child = subprocess.run(command, cwd=PROJECT, check=False,
                                       timeout=3600)
                status = read_status(runs / f'{run_id}.status.json')
                state, child_complete = audit_status(
                    status, run_id, (seed_sha, first_sha, total, count),
                    args.page_mode)
                if child.returncode != status['exitCode']:
                    raise RuntimeError(f'{run_id}: process exit and status disagree')
                if child_complete:
                    return emit(0, 'selected area page observations complete',
                                pageMode=args.page_mode, lastRunId=run_id,
                                selectedAreaCount=total)
                count = state[3]
                emit(1, 'bounded page batch finished; continuing',
                     pageMode=args.page_mode,
                     lastRunId=run_id, areasObservedComplete=count,
                     selectedAreaCount=total)
                next_number += 1
            return emit(4, 'configured batch ceiling reached', batches=args.max_batches)
    except KeyboardInterrupt:
        return emit(130, 'interrupted; inspect child status before restart')
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        return emit(2, f'{type(error).__name__}: {error}')


if __name__ == '__main__':
    raise SystemExit(main())
