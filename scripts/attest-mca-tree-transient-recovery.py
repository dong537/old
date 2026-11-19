"""Offline attestation only for the reviewed -017 clock-HEAD failure."""
from __future__ import annotations

import argparse
import base64
import binascii
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy

PROJECT = Path(__file__).resolve().parents[1]
RESUME = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-resume.py'),
                        run_name='transient_recovery_helpers')
FAILED_RUN_ID = 'tree-20261119-auto-017'
PRIOR_RUN_ID = 'tree-20261119-auto-016'
FAILURE = 'FetchError: server clock calibration failed: invalid or slow HTTP Date response'
FAILED_STATUS_SHA256 = '3051814ad5e9db89f98d066123a45be8da824418587c3fd0ec8084d77af8b768'
FAILED_MANIFEST_SHA256 = '88b3e67a3feb951fcf2b5c0b668a6d0fc83dbde22885ee2a265f97630863cb23'
FAILED_LOG_SHA256 = 'ee8c56302399018dbeccbddc74f3c93e0b86fdd2411038d8f9ada36259d770b7'
read_json = RESUME['read_json']
timestamp = RESUME['timestamp']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def attestation_path(root):
    return root / 'batch-runs' / f'{FAILED_RUN_ID}.recovery.json'


def checked_ledger(raw, attested):
    try:
        ledger = json.loads(raw)
    except (TypeError, ValueError) as error:
        raise RuntimeError('shared request ledger invalid') from error
    if (not isinstance(ledger, dict) or ledger.get('schemaVersion') != 1
            or ledger.get('windowSeconds') != 3600 or ledger.get('limit') != 60
            or not isinstance(ledger.get('requestStartedAtUtc'), list)
            or len(ledger['requestStartedAtUtc']) > 60):
        raise RuntimeError('shared request ledger invalid')
    if any(timestamp(value, 'ledger entry') > attested
           for value in ledger['requestStartedAtUtc']):
        raise RuntimeError('shared request ledger contains future request')
    return raw


def evidence(root, now, *, expected_files=None, frozen_ledger=None):
    runs = root / 'batch-runs'
    tree = root / RESUME['TREE_DIR']
    status_path = runs / f'{FAILED_RUN_ID}.status.json'
    owned_path = RESUME['owned_manifest_path'](root, FAILED_RUN_ID)
    log_path = runs / f'{FAILED_RUN_ID}.log'
    prior_status_path = runs / f'{PRIOR_RUN_ID}.status.json'
    prior_owned_path = RESUME['owned_manifest_path'](root, PRIOR_RUN_ID)
    if (sha(status_path) != FAILED_STATUS_SHA256
            or sha(owned_path) != FAILED_MANIFEST_SHA256
            or sha(log_path) != FAILED_LOG_SHA256):
        raise RuntimeError('pinned -017 failure evidence differs')
    status = read_json(status_path, 'failed status')
    prior = read_json(prior_status_path, 'prior status')
    required = {
        'schemaVersion': 1, 'runId': FAILED_RUN_ID, 'priorRunId': PRIOR_RUN_ID,
        'phase': 'finished', 'collectorExitCode': 1, 'exitCode': 1,
        'treeWalkComplete': False, 'requestBudgetReached': False,
        'rateLimited': False, 'lastError': FAILURE,
        'error': 'area tree collector exited 1', 'publishable': False,
        'requestsThisRun': 1, 'savedResponseDelta': 0,
        'priorRecoveryAttestationSha256': None,
        'collectorManifestSha256': FAILED_MANIFEST_SHA256,
        'logPath': str(log_path)}
    if any(type(status.get(key)) is not type(value) or status.get(key) != value
           for key, value in required.items()):
        raise RuntimeError('recovery restricted to exact non-rate-limit clock failure')
    started = timestamp(status.get('startedAtUtc'), 'failed start')
    ended = timestamp(status.get('endedAtUtc'), 'failed end')
    prior_started = timestamp(prior.get('startedAtUtc'), 'prior start')
    prior_ended = timestamp(prior.get('endedAtUtc'), 'prior end')
    if (not prior_started <= prior_ended <= started <= ended <= now
            or (ended - started).total_seconds() > 3600
            or prior.get('runId') != PRIOR_RUN_ID or prior.get('phase') != 'finished'
            or prior.get('collectorExitCode') != 0 or prior.get('exitCode') != 1
            or prior.get('treeWalkComplete') is not False
            or prior.get('requestBudgetReached') is not True
            or prior.get('rateLimited') is not False
            or prior.get('lastError') is not None
            or prior.get('error') != RESUME['PARTIAL_ERROR']
            or prior.get('collectorManifestSha256') != sha(prior_owned_path)):
        raise RuntimeError('prior clean budget batch differs')
    prior_manifest = RESUME['read_tree_manifest'](
        root, prior_started, prior_ended, manifest_path=prior_owned_path,
        expected_run_id=PRIOR_RUN_ID)
    failed_manifest = RESUME['read_tree_manifest'](
        root, started, ended, manifest_path=owned_path,
        expected_run_id=FAILED_RUN_ID)
    if (prior_manifest['savedResponses'] != prior.get('savedResponses')
            or prior_manifest['requestsThisRun'] != prior.get('requestsThisRun')
            or prior_manifest['requestBudgetReached'] is not True
            or prior_manifest['rateLimited'] is not False
            or prior_manifest.get('lastError') is not None
            or prior.get('pendingAfter') != len(prior_manifest['pendingParentIds'])
            or not prior_manifest['pendingParentIds']
            or failed_manifest['savedResponses'] != prior_manifest['savedResponses']
            or failed_manifest['savedResponses'] != status.get('savedResponses')
            or status.get('savedResponsesBefore') != prior_manifest['savedResponses']
            or failed_manifest['pendingParentIds'] != prior_manifest['pendingParentIds']
            or status.get('pendingBefore') != len(prior_manifest['pendingParentIds'])
            or status.get('pendingAfter') != len(prior_manifest['pendingParentIds'])
            or failed_manifest['requestsThisRun'] != 1
            or failed_manifest['treeWalkComplete'] is not False
            or failed_manifest['requestBudgetReached'] is not False
            or failed_manifest['rateLimited'] is not False
            or failed_manifest.get('lastError') != FAILURE):
        raise RuntimeError('failed batch changed tree or pending inventory')
    if expected_files is None and (tree / 'manifest.json').read_bytes() != owned_path.read_bytes():
        raise RuntimeError('shared tree manifest moved before recovery')
    count, digest, nodes, files = RESUME['response_inventory'](
        root, status['savedResponses'], ended, expected_files)
    if any(parent not in nodes for parent in failed_manifest['pendingParentIds']):
        raise RuntimeError('failed pending parent unreachable')
    if expected_files is None and any(
            (tree / 'responses' / f'{parent}.json').exists()
            for parent in failed_manifest['pendingParentIds']):
        raise RuntimeError('failed parent already cached')
    if frozen_ledger is None and not (root / 'hourly-request-budget.json').is_file():
        raise RuntimeError('shared request ledger missing')
    ledger = checked_ledger(
        frozen_ledger if frozen_ledger is not None
        else (root / 'hourly-request-budget.json').read_bytes(), now)
    return {'schemaVersion': 1, 'kind': 'mca-reviewed-transient-clock-recovery',
            'failedRunId': FAILED_RUN_ID, 'priorRunId': PRIOR_RUN_ID,
            'statusSha256': sha(status_path), 'manifestSha256': sha(owned_path),
            'logSha256': sha(log_path), 'priorStatusSha256': sha(prior_status_path),
            'priorManifestSha256': sha(prior_owned_path),
            'requestsThisRun': 1, 'savedResponseDelta': 0,
            'responseCount': count, 'responseInventorySha256': digest,
            'responseFiles': files,
            'frozenLedgerSha256': hashlib.sha256(ledger).hexdigest(),
            'frozenLedgerBase64': base64.b64encode(ledger).decode('ascii'),
            'retryPolicy': 'existing collector only; one new batch ID; original cache reused; shared lock, hourly budget, cooldown and strict server clock unchanged'}


def verify_attestation(root, failed_run_id, *, now=None):
    if failed_run_id != FAILED_RUN_ID:
        raise RuntimeError('no reviewed recovery for this run')
    now = now or datetime.now(timezone.utc)
    try:
        saved = read_json(attestation_path(root), 'recovery attestation')
        authorization = saved.get('authorization')
        if not isinstance(authorization, str) or not authorization.strip():
            raise RuntimeError('recovery authorization missing')
        attested = timestamp(saved.get('attestedAtUtc'), 'attestation time')
        if attested > now:
            raise RuntimeError('recovery attestation is in the future')
        ledger = base64.b64decode(saved['frozenLedgerBase64'], validate=True)
        current = evidence(root, attested, expected_files=saved.get('responseFiles'),
                           frozen_ledger=ledger)
        if saved != {**current, 'authorization': authorization,
                     'attestedAtUtc': saved['attestedAtUtc']}:
            raise RuntimeError('recovery evidence drifted')
        return saved
    except (OSError, ValueError, TypeError, KeyError, binascii.Error) as error:
        raise RuntimeError(f'recovery evidence cannot be verified: {error}') from error


def create_attestation(root, *, authorization, now=None):
    root = Path(root)
    now = now or datetime.now(timezone.utc)
    if not isinstance(authorization, str) or not authorization.strip():
        raise RuntimeError('explicit recovery authorization required')
    path = attestation_path(root)
    auto = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-auto-resume.py'),
                          run_name='transient_recovery_controller_lock')
    with auto['controller_lock'](root / 'batch-runs'), RESUME['CORE']['exclusive_run_lock'](root):
        if path.exists():
            raise RuntimeError('recovery attestation already exists; no overwrite')
        RESUME['CORE']['enforce_site_cooldown'](root)
        for candidate in (root / 'batch-runs').glob('tree-*.status.json'):
            other = read_json(candidate, 'tree status')
            if (other.get('phase') == 'running' or not other.get('endedAtUtc')
                    or timestamp(other['endedAtUtc'], 'tree run end') > now):
                raise RuntimeError('unfinished tree run; recovery blocked')
        document = {**evidence(root, now), 'authorization': authorization.strip(),
                    'attestedAtUtc': now.isoformat()}
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(document, output, ensure_ascii=False, indent=2)
            output.write(chr(10))
        return document


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authorize-recovery', required=True)
    args = parser.parse_args(argv)
    try:
        result = create_attestation(
            RESUME['PRIVATE_ROOT'], authorization=args.authorize_recovery)
        print(json.dumps({'failedRunId': result['failedRunId'],
                          'responseCount': result['responseCount'], 'requestsSent': 0}))
        return 0
    except (RuntimeError, OSError, ValueError) as error:
        print(json.dumps({'error': str(error), 'requestsSent': 0}))
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
