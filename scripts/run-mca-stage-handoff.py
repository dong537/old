"""Start the next private MCA collection stage only after a complete tree audit.

Designed for a periodic local task. A waiting check sends no network request.
The child first-page controller owns its own site lock, budget and stop file.
"""

from __future__ import annotations

import argparse
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
TREE = ROOT / 'area-tree-20261119' / 'manifest.json'
STATUS = ROOT / 'batch-runs' / 'stage-handoff.status.json'
BUILDER = PROJECT / 'scripts' / 'build-mca-area-seeds.py'
FIRST_AUTO = PROJECT / 'scripts' / 'run-mca-area-first-pages-auto.py'
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts' / 'run-mca-tree-auto-resume.py'),
                           run_name='mca_stage_tree_auto')
RECAPTURE_SCRIPT = PROJECT / 'scripts' / 'recapture-mca-tree-roots.py'
ROOT_RECAPTURE = runpy.run_path(str(RECAPTURE_SCRIPT), run_name='mca_stage_root_recapture')


def read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise RuntimeError(f'{path.name}: expected JSON object')
    return value


def save_status(value: dict) -> None:
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATUS.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n',
                         encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, STATUS)


def readiness(root: Path, resume_state) -> tuple[bool, str]:
    manifest = read_json(root / 'area-tree-20261119' / 'manifest.json')
    if (manifest.get('rateLimited') is True or manifest.get('lastError') is not None):
        raise RuntimeError('area tree failed or rate limited; no next-stage request')
    if manifest.get('treeWalkComplete') is not True:
        return False, 'area tree still incomplete'
    last_id, _next_batch, complete = resume_state(
        root, 'tree-20261119-a', 'tree-20261119-auto', 32)
    if not complete:
        raise RuntimeError('tree manifest complete but batch chain incomplete')
    last = read_json(root / 'batch-runs' / f'{last_id}.status.json')
    if (last.get('phase') != 'finished' or last.get('exitCode') != 0
            or last.get('treeWalkComplete') is not True
            or last.get('rateLimited') is not False
            or last.get('savedResponses') != manifest.get('savedResponses')):
        raise RuntimeError('completed tree status differs from manifest')
    shared = (root / 'area-tree-20261119/manifest.json').read_bytes()
    owned = (root / 'area-tree-20261119/run-manifests' / f'{last_id}.json').read_bytes()
    if (last.get('runId') != last_id or manifest.get('runId') != last_id
            or last.get('collectorExitCode') != 0
            or last.get('lastError') is not None or last.get('error') is not None
            or manifest.get('pendingParentIds') != [] or shared != owned
            or hashlib.sha256(owned).hexdigest() != last.get('collectorManifestSha256')):
        raise RuntimeError('completed tree owned manifest differs from final status')
    return True, last_id


def recapture_state(root):
    """Read the original source and strict recapture chain, never request data."""
    output = root / 'area-root-http-recapture-20261119'
    plan = ROOT_RECAPTURE['source_plan'](
        root / 'area-tree-20261119', ROOT_RECAPTURE['SEED'], ROOT_RECAPTURE['SEED_SHA256'])
    cache = ROOT_RECAPTURE['scan_cache'](plan, output)
    runs = output / 'batch-runs'
    paths = sorted(runs.iterdir()) if runs.exists() else []
    number = len(paths) + 1
    complete = False
    try:
        ROOT_RECAPTURE['prior_batch'](output, plan, cache, number)
    except RuntimeError as error:
        if str(error) != 'recapture already complete; no request sent':
            raise
        complete = True
    for path in paths:
        status = read_json(path)
        if (status.get('error') is not None or status.get('rateLimited') is not False
                or type(status.get('requestsThisRun')) is not int
                or not 0 <= status['requestsThisRun'] <= 2
                or not status.get('endedAtUtc')
                or (status.get('outcome') == 'partial'
                    and status.get('requestBudgetReached') is not True)):
            raise RuntimeError('recapture status is not a clean bounded batch')
    if cache['driftParents']:
        raise RuntimeError('recaptured root payload drifted; manual audit required')
    if complete and (cache['pendingParentIds'] or cache['savedResponses'] != 2):
        raise RuntimeError('terminal root recapture lacks two matching responses')
    if not complete and not cache['pendingParentIds']:
        raise RuntimeError('root cache has no verified terminal batch')
    manifest_path = output / 'manifest.json'
    if complete:
        manifest = read_json(manifest_path)
        expected = ROOT_RECAPTURE['progress'](plan, cache, len(paths))
        manifest.pop('auditedAtUtc', None)
        expected.pop('auditedAtUtc')
        if manifest != expected:
            raise RuntimeError('root recapture manifest differs from offline evidence')
    return {'complete': complete, 'nextBatchNumber': number,
            'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest()
            if manifest_path.exists() else None}


def first_page_batch_ceiling(seed_count):
    if type(seed_count) is not int or not 1 <= seed_count <= 9999:
        raise RuntimeError('seed inventory exceeds supported first-page batch ceiling')
    # HEAD/partial budget stops consume requests without necessarily saving a
    # page. Allow two batches per seed, bounded by the existing controller cap.
    return min(9999, max(200, seed_count * 2))


def recapture_implementation_sha256():
    return {name: hashlib.sha256((PROJECT / 'scripts' / name).read_bytes()).hexdigest()
            for name in ('recapture-mca-tree-roots.py', 'fetch-mca-institutions.py',
                         'fetch-mca-area-tree.py', 'build-mca-area-seeds.py')}


def _advance(argv=None, *, root=ROOT, resume_state=None, runner=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch-prefix', default='firstpage-20261119-auto')
    args = parser.parse_args(argv)
    if args.batch_prefix != 'firstpage-20261119-auto':
        parser.error('only the audited first-page batch prefix is accepted')
    resume_state = resume_state or TREE_AUTO['resume_state']
    runner = runner or subprocess.run
    now = datetime.now(timezone.utc).isoformat()
    try:
        implementation = recapture_implementation_sha256()
        prior = read_json(STATUS) if STATUS.exists() and root == ROOT else None
        if prior is not None and prior.get('phase') == 'blocked':
            print(json.dumps(prior, ensure_ascii=False), flush=True)
            return 2
        if prior is not None and prior.get('phase') == 'running':
            raise RuntimeError('prior stage handoff requires manual review')
        if prior is not None and ('recaptureImplementationSha256' in prior
                or prior.get('stage') == 'root-http-recapture'):
            if prior.get('recaptureImplementationSha256') != implementation:
                raise RuntimeError('root recapture implementation changed; manual audit required')
        ready, reason = readiness(root, resume_state)
        if not ready:
            print(json.dumps({'phase': 'waiting', 'checkedAtUtc': now,
                              'reason': reason}, ensure_ascii=False), flush=True)
            return 0
        # The tree controller can still be exiting after its final child status.
        try:
            with TREE_AUTO['controller_lock'](root / 'batch-runs'):
                with ROOT_RECAPTURE['CORE']['exclusive_run_lock'](root):
                    ready, reason = readiness(root, resume_state)
                    if not ready:
                        raise RuntimeError('completed tree changed during handoff')
                    reproduction = recapture_state(root)
        except RuntimeError as error:
            if str(error) not in ('another tree controller is running',
                                  'another MCA collector is already running'):
                raise
            print(json.dumps({'phase': 'waiting', 'checkedAtUtc': now,
                              'reason': 'tree controller still exiting'},
                             ensure_ascii=False), flush=True)
            return 0
        if root != ROOT:
            raise RuntimeError('test root cannot run production child commands')
        if (root / 'batch-runs/stage-handoff.stop').exists():
            print(json.dumps({'phase': 'waiting', 'reason': 'stop file present'}), flush=True)
            return 0
        if not reproduction['complete']:
            ROOT_RECAPTURE['require_hourly_ledger'](root)
            ROOT_RECAPTURE['CORE']['enforce_site_cooldown'](root)
            current = datetime.now(timezone.utc)
            if TREE_AUTO['next_available_utc'](root, current) > current:
                save_status({'phase': 'waiting', 'stage': 'root-http-recapture',
                             'recaptureImplementationSha256': implementation,
                             'checkedAtUtc': now, 'reason': 'shared hourly budget exhausted',
                             'treeFinalRunId': reason, 'publishable': False})
                return 0
            number = reproduction['nextBatchNumber']
            save_status({'phase': 'running', 'startedAtUtc': now,
                         'recaptureImplementationSha256': implementation,
                         'treeFinalRunId': reason, 'stage': 'root-http-recapture',
                         'recaptureBatchNumber': number, 'publishable': False})
            child = runner([sys.executable, str(RECAPTURE_SCRIPT), '--execute',
                            '--batch-number', str(number), '--max-requests', '2',
                            '--interval', '60', '--jitter', '10', '--timeout', '30'],
                           cwd=PROJECT, check=False, timeout=600)
            reproduction = recapture_state(root)
            if recapture_implementation_sha256() != implementation:
                raise RuntimeError('root recapture implementation changed during child')
            if (reproduction['nextBatchNumber'] != number + 1
                    or child.returncode != (0 if reproduction['complete'] else 1)):
                raise RuntimeError('root recapture exit and verified checkpoint disagree')
            if not reproduction['complete']:
                save_status({'phase': 'waiting', 'stage': 'root-http-recapture',
                             'recaptureImplementationSha256': implementation,
                             'checkedAtUtc': now, 'treeFinalRunId': reason,
                             'recaptureBatchNumber': number,
                             'reason': 'clean partial root recapture; continue next tick',
                             'publishable': False})
                return 0
        save_status({'phase': 'running', 'startedAtUtc': now,
                     'treeFinalRunId': reason, 'stage': 'build-area-seeds',
                     'recaptureImplementationSha256': implementation,
                     'publishable': False})
        build = runner([sys.executable, str(BUILDER)], cwd=PROJECT, check=False)
        if build.returncode != 0:
            raise RuntimeError(f'area seed audit exited {build.returncode}')
        seed_count = read_json(root / 'national-area-tree-seeds-20261119.json').get('seedCount')
        batch_ceiling = first_page_batch_ceiling(seed_count)
        save_status({'phase': 'running', 'startedAtUtc': now,
                     'treeFinalRunId': reason, 'stage': 'first-page-controller',
                     'rootRecaptureManifestSha256': reproduction['manifestSha256'],
                     'recaptureImplementationSha256': implementation,
                     'seedCount': seed_count, 'firstPageBatchCeiling': batch_ceiling,
                     'publishable': False})
        child = runner([sys.executable, str(FIRST_AUTO), '--batch-prefix',
                        args.batch_prefix, '--max-batches', str(batch_ceiling)],
                       cwd=PROJECT, check=False)
        result = {'phase': 'finished' if child.returncode == 0 else 'blocked',
                  'startedAtUtc': now,
                  'endedAtUtc': datetime.now(timezone.utc).isoformat(),
                  'treeFinalRunId': reason, 'firstPageExitCode': child.returncode,
                  'rootRecaptureManifestSha256': reproduction['manifestSha256'],
                  'recaptureImplementationSha256': implementation,
                  'seedCount': seed_count, 'firstPageBatchCeiling': batch_ceiling,
                  'publishable': False}
        save_status(result)
        return child.returncode
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        if root == ROOT:
            save_status({'phase': 'blocked', 'checkedAtUtc': now,
                         'error': f'{type(error).__name__}: {error}',
                         'publishable': False})
        print(json.dumps({'phase': 'blocked', 'error': str(error)},
                         ensure_ascii=False), flush=True)
        return 2


def main(argv=None, *, root=ROOT, resume_state=None, runner=None) -> int:
    # Separate lock spans all child lifetimes. A duplicate Windows task tick
    # must not overwrite the active scheduler's running checkpoint.
    try:
        with ROOT_RECAPTURE['CORE']['exclusive_run_lock'](root / 'batch-runs/stage-handoff-lock'):
            return _advance(argv, root=root, resume_state=resume_state, runner=runner)
    except ROOT_RECAPTURE['CORE']['FetchError'] as error:
        if str(error) != 'another MCA collector is already running':
            raise
        print(json.dumps({'phase': 'waiting', 'reason': 'another stage handoff is active'}), flush=True)
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
