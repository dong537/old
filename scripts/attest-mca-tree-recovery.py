"""Explicit, offline recovery authorization for the audited MCA -008 failure.

Creates a new sidecar only; never edits failed status, manifests or source cache.
A reviewed validator fix must accept the original pinned diagnostic first.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy

PROJECT = Path(__file__).resolve().parents[1]
RESUME = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-resume.py'), run_name='recovery_resume_helpers')
FAILED_RUN_ID = 'tree-20261119-auto-008'
PARENT_ID = '61c11934c4e04524af2b935e81acb580'
FAILURE = f'ValueError: {PARENT_ID}: invalid official sbcode'
DIAGNOSTIC_BODY_SHA256 = '0dd6d5d80e1708b13f46c6823903a99affa7af813452ff9a5843223063881559'
read_json = RESUME['read_json']
timestamp = RESUME['timestamp']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def attestation_path(root):
    return root / 'batch-runs' / f'{FAILED_RUN_ID}.recovery.json'

def evidence(root, now, expected_files=None):
    runs = root / 'batch-runs'
    tree = root / RESUME['TREE_DIR']
    status_path = runs / f'{FAILED_RUN_ID}.status.json'
    status = read_json(status_path, 'failed status')
    required = {'runId': FAILED_RUN_ID, 'priorRunId': 'tree-20261119-auto-007',
                'phase': 'finished', 'collectorExitCode': 1, 'exitCode': 1,
                'treeWalkComplete': False, 'rateLimited': False,
                'requestBudgetReached': False, 'lastError': FAILURE,
                'error': 'area tree collector exited 1', 'publishable': False}
    if any(type(status.get(k)) is not type(v) or status.get(k) != v for k, v in required.items()):
        raise RuntimeError('recovery is restricted to the exact audited non-rate-limit failure')
    started = timestamp(status.get('startedAtUtc'), 'failed start')
    ended = timestamp(status.get('endedAtUtc'), 'failed end')
    if not started <= ended <= now:
        raise RuntimeError('failed run time window invalid')
    owned = RESUME['owned_manifest_path'](root, FAILED_RUN_ID)
    manifest = RESUME['read_tree_manifest'](root, started, ended, manifest_path=owned, expected_run_id=FAILED_RUN_ID)
    if sha(owned) != status.get('collectorManifestSha256'):
        raise RuntimeError('failed manifest ownership hash differs')
    if (manifest['treeWalkComplete'] is not False or manifest['rateLimited'] is not False
            or manifest['requestBudgetReached'] is not False or manifest.get('lastError') != FAILURE
            or not manifest['pendingParentIds'] or manifest['pendingParentIds'][0] != PARENT_ID):
        raise RuntimeError('failed manifest does not describe the audited failure')
    for key in ('requestsThisRun', 'savedResponses', 'savedResponsesBefore', 'savedResponseDelta', 'pendingAfter'):
        if type(status.get(key)) is not int or status[key] < 0:
            raise RuntimeError('failed status counts invalid')
    if (status['requestsThisRun'] != manifest['requestsThisRun']
            or status['savedResponses'] != manifest['savedResponses']
            or status['pendingAfter'] != len(manifest['pendingParentIds'])
            or status['savedResponsesBefore'] + status['savedResponseDelta'] != status['savedResponses']
            or not 1 <= status['requestsThisRun'] <= 20
            or status['savedResponseDelta'] >= status['requestsThisRun']):
        raise RuntimeError('failed status and manifest counts differ')
    count, digest, nodes, files = RESUME['response_inventory'](root, status['savedResponses'], ended, expected_files)
    if any(parent not in nodes for parent in manifest['pendingParentIds']):
        raise RuntimeError('failed pending parents are not reachable')
    before = sum(timestamp(read_json(tree / 'responses' / item['name'], 'cached response')['fetchedAtUtc'], 'cache time') < started for item in files)
    if before != status['savedResponsesBefore']:
        raise RuntimeError('pre-failure cache count differs')
    diag_path = root / 'diagnostics' / f'area-child-{PARENT_ID}-20261119.json'
    diagnostic = read_json(diag_path, 'original diagnostic')
    fetched = timestamp(diagnostic.get('fetchedAtUtc'), 'diagnostic time')
    if not ended <= fetched <= now or diagnostic.get('responseSha256') != DIAGNOSTIC_BODY_SHA256:
        raise RuntimeError('diagnostic time or pinned body hash differs')
    area = runpy.run_path(str(PROJECT / 'scripts/fetch-mca-area-tree.py'), run_name='recovery_validator')
    try:
        area['checked_response'](diagnostic, PARENT_ID, 2)
    except (ValueError, TypeError, KeyError) as error:
        raise RuntimeError(f'reviewed validator does not accept original diagnostic: {error}') from error
    return {'schemaVersion': 1, 'kind': 'mca-reviewed-tree-failure-recovery',
            'failedRunId': FAILED_RUN_ID, 'parentId': PARENT_ID,
            'statusSha256': sha(status_path), 'manifestSha256': sha(owned),
            'diagnosticWrapperSha256': sha(diag_path), 'diagnosticBodySha256': DIAGNOSTIC_BODY_SHA256,
            'responseCount': count, 'responseInventorySha256': digest, 'responseFiles': files,
            'validatorSourceSha256': {name: sha(PROJECT / 'scripts' / name) for name in
                                     ('fetch-mca-area-tree.py', 'build-mca-area-seeds.py')},
            'retryPolicy': 'existing collector; cached parents reused; missing pending parents only; unchanged shared lock/cooldown/hourly budget; no diagnostic import'}

def verify_attestation(root, failed_run_id, *, now=None):
    if failed_run_id != FAILED_RUN_ID:
        raise RuntimeError('no reviewed recovery for this run')
    now = now or datetime.now(timezone.utc)
    try:
        saved = read_json(attestation_path(root), 'recovery attestation')
        authorization = saved.get('authorization')
        if not isinstance(authorization, str) or not authorization.strip():
            raise RuntimeError('recovery authorization missing')
        attested = timestamp(saved.get('attestedAtUtc'), 'recovery attestation')
        if attested > now:
            raise RuntimeError('recovery attestation is in the future')
        current = evidence(root, attested, saved.get('responseFiles'))
        if saved != {**current, 'authorization': authorization, 'attestedAtUtc': saved['attestedAtUtc']}:
            raise RuntimeError('recovery evidence drifted')
        return saved
    except (OSError, ValueError, TypeError, KeyError) as error:
        raise RuntimeError(f'recovery evidence cannot be verified: {error}') from error

def create_attestation(root, *, authorization, now=None):
    root = Path(root); now = now or datetime.now(timezone.utc)
    if not isinstance(authorization, str) or not authorization.strip():
        raise RuntimeError('explicit recovery authorization required')
    path = attestation_path(root)
    with RESUME['CORE']['exclusive_run_lock'](root):
        if path.exists():
            raise RuntimeError('recovery attestation already exists; no overwrite')
        cooldown = root / 'rate-limit.json'
        if cooldown.exists() and timestamp(read_json(cooldown, 'cooldown').get('cooldownUntilUtc'), 'cooldown') > now:
            raise RuntimeError('site cooldown active; recovery blocked')
        for other in (root / 'batch-runs').glob('tree-*.status.json'):
            status = read_json(other, 'tree status')
            legacy_initial = (
                other.name == 'tree-20261119-a.status.json'
                and status.get('runId') == 'tree-20261119-a'
                and status.get('phase') is None
                and status.get('collectorExitCode') == 0
                and status.get('exitCode') == 1)
            if ((status.get('phase') != 'finished' and not legacy_initial)
                    or not status.get('endedAtUtc')
                    or timestamp(status['endedAtUtc'], 'tree run end') > now):
                raise RuntimeError('unfinished tree run; recovery blocked')
        tree = root / RESUME['TREE_DIR']
        if (tree / 'manifest.json').read_bytes() != RESUME['owned_manifest_path'](root, FAILED_RUN_ID).read_bytes():
            raise RuntimeError('shared manifest moved beyond failed run')
        if (tree / 'responses' / f'{PARENT_ID}.json').exists():
            raise RuntimeError('failed parent already cached; manual audit required')
        document = {**evidence(root, now), 'authorization': authorization.strip(), 'attestedAtUtc': now.isoformat()}
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(document, output, ensure_ascii=False, indent=2); output.write('\n')
        return document

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authorize-recovery', required=True, help='Explicit operator authorization and reviewed fix reference')
    args = parser.parse_args(argv)
    try:
        result = create_attestation(RESUME['PRIVATE_ROOT'], authorization=args.authorize_recovery)
        print(json.dumps({'failedRunId': result['failedRunId'], 'responseCount': result['responseCount'], 'requestsSent': 0}))
        return 0
    except (RuntimeError, OSError, ValueError) as error:
        print(json.dumps({'error': str(error), 'requestsSent': 0})); return 2

if __name__ == '__main__': raise SystemExit(main())
