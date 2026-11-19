"""Run one audited, bounded MCA area-tree resume pass.

Usage: python scripts/run-mca-tree-resume.py \
    --previous-run-id tree-20261119-a --run-id tree-20261119-b

No run is scheduled automatically. The previous completed run must have stopped
solely because its request budget was reached. All source data stays private.
"""

from __future__ import annotations

import argparse
import base64
import binascii
from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import sys


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
TREE_DIR = 'area-tree-20261119'
RUN_MANIFEST_DIR = 'run-manifests'
LEGACY_INITIAL_RUN_ID = 'tree-20261119-a'
LEGACY_AUTO_RUN_ID = 'tree-20261119-auto-001'
RUN_ID_PATTERN = re.compile(r'tree-[0-9]{8}-[a-z][a-z0-9-]*\Z')
CORE = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-institutions.py'),
                      run_name='mca_fetch_core')
PARTIAL_ERROR = 'area tree walk incomplete; see private manifest'


def timestamp(value, label):
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError('timezone missing')
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError) as error:
        raise RuntimeError(f'{label} timestamp invalid') from error


def read_json(path, label):
    try:
        result = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError(f'{label} missing or unreadable') from error
    if not isinstance(result, dict):
        raise RuntimeError(f'{label} invalid')
    return result


def owned_manifest_path(root, run_id):
    return root / TREE_DIR / RUN_MANIFEST_DIR / f'{run_id}.json'


def read_tree_manifest(root, earliest, latest=None, *, window_label='previous run',
                       manifest_path=None, expected_run_id=None, manifest_bytes=None):
    if manifest_bytes is None:
        manifest = read_json(manifest_path or root / TREE_DIR / 'manifest.json',
                             'tree manifest')
    else:
        try:
            manifest = json.loads(manifest_bytes)
        except (TypeError, ValueError) as error:
            raise RuntimeError('frozen tree manifest invalid') from error
        if not isinstance(manifest, dict):
            raise RuntimeError('frozen tree manifest invalid')
    expected = {'treeWalkComplete': bool, 'rateLimited': bool,
                'requestBudgetReached': bool, 'requestsThisRun': int,
                'savedResponses': int, 'pendingParentIds': list}
    for key, expected_type in expected.items():
        if type(manifest.get(key)) is not expected_type:
            raise RuntimeError(f'tree manifest {key} invalid')
    if (manifest['requestsThisRun'] < 0 or manifest['savedResponses'] < 0
            or any(not isinstance(item, str) or not item for item in manifest['pendingParentIds'])):
        raise RuntimeError('tree manifest counts or pending IDs invalid')
    audited = timestamp(manifest.get('auditedAtUtc'), 'tree manifest audit')
    if audited < earliest or (latest is not None and audited > latest):
        raise RuntimeError(f'tree manifest audit outside {window_label}')
    if expected_run_id is not None and manifest.get('runId') != expected_run_id:
        raise RuntimeError('tree manifest ownership differs from collector run')
    return manifest


def legacy_attestation_path(root):
    return root / 'batch-runs' / f'{LEGACY_AUTO_RUN_ID}.attestation.json'


def legacy_frozen_manifest_path(root):
    return root / 'batch-runs' / f'{LEGACY_AUTO_RUN_ID}.attestation.manifest.json'


def legacy_frozen_responses_path(root):
    return root / 'batch-runs' / f'{LEGACY_AUTO_RUN_ID}.attestation.responses.json'


def response_inventory(root, expected_count, latest, expected_files=None):
    """Revalidate cached source bytes and official parent links offline."""
    response_dir = root / TREE_DIR / 'responses'
    if expected_files is None:
        # WindowsPath compares names case-insensitively. Freeze that explicit
        # order so sidecars validate identically on every host.
        paths = sorted(response_dir.glob('*.json'),
                       key=lambda path: path.name.casefold())
        if len({path.name.casefold() for path in paths}) != len(paths):
            raise RuntimeError('cached response filenames collide ignoring case')
    else:
        if (not isinstance(expected_files, list)
                or len(expected_files) != expected_count):
            raise RuntimeError('frozen response inventory count invalid')
        names = [item.get('name') if isinstance(item, dict) else None
                 for item in expected_files]
        folded = [name.casefold() for name in names if isinstance(name, str)]
        if (any(not isinstance(name, str) or not name.endswith('.json')
                or Path(name).name != name or name in ('.json', '..json')
                for name in names) or folded != sorted(set(folded))):
            raise RuntimeError('frozen response filenames invalid')
        paths = [response_dir / name for name in names]
    if len(paths) != expected_count:
        raise RuntimeError('cached response count differs from legacy manifest')
    wrappers = {}
    inventory = hashlib.sha256()
    files = []
    for index, path in enumerate(paths):
        if path.stem in wrappers:
            raise RuntimeError('duplicate cached response parent')
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if expected_files is not None and expected_files[index].get('sha256') != digest:
            raise RuntimeError('frozen response hash differs')
        files.append({'name': path.name, 'sha256': digest})
        inventory.update(path.name.encode('utf-8'))
        inventory.update(bytes.fromhex(digest))
        wrapper = read_json(path, 'cached response')
        if timestamp(wrapper.get('fetchedAtUtc'), 'cached response fetch') > latest:
            raise RuntimeError('cached response is newer than legacy batch')
        wrappers[path.stem] = wrapper
    if '-1' not in wrappers:
        raise RuntimeError('cached response root missing')
    area = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-area-tree.py'),
                          run_name='mca_area_legacy_audit')
    queue = deque([('-1', 0)])
    checked = set()
    seen_nodes = {}
    while queue:
        parent_id, parent_level = queue.popleft()
        if parent_id in checked:
            continue
        try:
            children = area['checked_response'](
                wrappers[parent_id], parent_id, parent_level)
        except (KeyError, ValueError) as error:
            raise RuntimeError(f'cached response integrity failed: {error}') from error
        checked.add(parent_id)
        for child in children:
            identifier = child['id']
            if child['level'] > 3:
                raise RuntimeError('cached response child exceeds tree scope')
            if identifier in seen_nodes and seen_nodes[identifier] != parent_id:
                raise RuntimeError('cached response child has multiple parents')
            seen_nodes[identifier] = parent_id
            if identifier in wrappers and child['level'] < 3:
                queue.append((identifier, child['level']))
    if checked != set(wrappers):
        raise RuntimeError('cached response inventory has unreachable parents')
    return len(paths), inventory.hexdigest(), seen_nodes, files


def validate_legacy_status(status):
    started = timestamp(status.get('startedAtUtc'), 'legacy batch start')
    ended = timestamp(status.get('endedAtUtc'), 'legacy batch end')
    if (started > ended or ended > datetime.now(timezone.utc)
            or (ended - started).total_seconds() > 3600):
        raise RuntimeError('legacy batch time window invalid')
    expected = {
        'runId': LEGACY_AUTO_RUN_ID,
        'priorRunId': LEGACY_INITIAL_RUN_ID,
        'phase': 'finished', 'collectorExitCode': 0, 'exitCode': 1,
        'treeWalkComplete': False, 'requestBudgetReached': True,
        'rateLimited': False, 'lastError': None,
        'error': PARTIAL_ERROR, 'publishable': False,
    }
    if any(status.get(key) != value for key, value in expected.items()):
        raise RuntimeError('legacy batch is not a clean budget interruption')
    counts = ('requestsThisRun', 'savedResponsesBefore', 'savedResponses',
              'savedResponseDelta', 'pendingAfter')
    if any(type(status.get(key)) is not int or status[key] < 0 for key in counts):
        raise RuntimeError('legacy batch count invalid')
    if (not 1 <= status['requestsThisRun'] <= 20
            or status['savedResponsesBefore'] + status['savedResponseDelta']
               != status['savedResponses']):
        raise RuntimeError('legacy batch response delta invalid')
    return started, ended


def validate_legacy_manifest(manifest, status):
    if (manifest.get('runId') is not None
            or manifest.get('scope') != 'coded-mainland-roots-through-level-3'
            or manifest.get('maxLevel') != 3
            or manifest.get('requestBudget') != 20
            or manifest.get('lastError') is not None
            or manifest['treeWalkComplete'] is not False
            or manifest['rateLimited'] is not False
            or manifest['requestBudgetReached'] is not True
            or manifest['requestsThisRun'] != status['requestsThisRun']
            or manifest['savedResponses'] != status['savedResponses']
            or len(manifest['pendingParentIds']) != status['pendingAfter']
            or not manifest['pendingParentIds']):
        raise RuntimeError('legacy manifest differs from completed batch')


def validate_legacy_ledger(ledger, started, ended, requests_this_run):
    if (ledger.get('schemaVersion') != 1 or ledger.get('windowSeconds') != 3600
            or ledger.get('limit') != 60
            or not isinstance(ledger.get('requestStartedAtUtc'), list)):
        raise RuntimeError('shared request ledger invalid')
    starts = [timestamp(value, 'shared request ledger entry')
              for value in ledger['requestStartedAtUtc']]
    if (len(starts) > 60 or any(value > datetime.now(timezone.utc)
                                for value in starts)
            or sum(started <= value <= ended for value in starts)
               != requests_this_run):
        raise RuntimeError('shared request ledger differs from legacy batch')


def legacy_evidence(root):
    """Validate the live batch once, then freeze the exact audited bytes."""
    status_path = root / 'batch-runs' / f'{LEGACY_AUTO_RUN_ID}.status.json'
    manifest_path = root / TREE_DIR / 'manifest.json'
    ledger_path = root / 'hourly-request-budget.json'
    status = read_json(status_path, 'legacy batch status')
    started, ended = validate_legacy_status(status)
    manifest_bytes = manifest_path.read_bytes()
    manifest = read_tree_manifest(root, started, ended,
                                  window_label='legacy batch',
                                  manifest_bytes=manifest_bytes)
    validate_legacy_manifest(manifest, status)
    response_count, response_digest, nodes, response_files = response_inventory(
        root, status['savedResponses'], ended)
    if any(parent not in nodes for parent in manifest['pendingParentIds']):
        raise RuntimeError('legacy manifest has unknown pending parent')
    if not ledger_path.is_file():
        raise RuntimeError('shared request ledger missing')
    ledger_bytes = ledger_path.read_bytes()
    try:
        ledger = json.loads(ledger_bytes)
    except ValueError as error:
        raise RuntimeError('shared request ledger invalid') from error
    if not isinstance(ledger, dict):
        raise RuntimeError('shared request ledger invalid')
    validate_legacy_ledger(ledger, started, ended, status['requestsThisRun'])
    return {
        'schemaVersion': 2, 'kind': 'mca-legacy-tree-batch-attestation',
        'runId': LEGACY_AUTO_RUN_ID, 'priorRunId': LEGACY_INITIAL_RUN_ID,
        'statusSha256': hashlib.sha256(status_path.read_bytes()).hexdigest(),
        'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
        'ledgerSha256': hashlib.sha256(ledger_bytes).hexdigest(),
        'responseInventorySha256': response_digest,
        'responseCount': response_count,
        'requestsThisRun': status['requestsThisRun'],
        'frozenManifestBase64': base64.b64encode(manifest_bytes).decode('ascii'),
        'frozenLedgerBase64': base64.b64encode(ledger_bytes).decode('ascii'),
        'responseFiles': response_files,
    }


def verify_legacy_attestation(root):
    path = legacy_attestation_path(root)
    try:
        saved = read_json(path, 'legacy attestation')
        if (saved.get('schemaVersion') not in (1, 2)
                or saved.get('kind') != 'mca-legacy-tree-batch-attestation'
                or saved.get('runId') != LEGACY_AUTO_RUN_ID
                or saved.get('priorRunId') != LEGACY_INITIAL_RUN_ID):
            raise RuntimeError('legacy attestation identity invalid')
        attested = timestamp(saved.get('attestedAtUtc'), 'legacy attestation time')
        if attested > datetime.now(timezone.utc):
            raise RuntimeError('legacy attestation time is in the future')
        for key in ('statusSha256', 'manifestSha256', 'ledgerSha256',
                    'responseInventorySha256'):
            if (not isinstance(saved.get(key), str)
                    or re.fullmatch(r'[0-9a-f]{64}', saved[key]) is None):
                raise RuntimeError(f'legacy attestation {key} invalid')
        status_path = root / 'batch-runs' / f'{LEGACY_AUTO_RUN_ID}.status.json'
        status_bytes = status_path.read_bytes()
        if hashlib.sha256(status_bytes).hexdigest() != saved['statusSha256']:
            raise RuntimeError('legacy attestation status differs')
        status = read_json(status_path, 'legacy batch status')
        started, ended = validate_legacy_status(status)
        if (attested < ended or saved.get('responseCount') != status['savedResponses']
                or saved.get('requestsThisRun') != status['requestsThisRun']):
            raise RuntimeError('legacy attestation counts or time differ')
        if saved['schemaVersion'] == 2:
            manifest_bytes = base64.b64decode(
                saved['frozenManifestBase64'], validate=True)
            ledger_bytes = base64.b64decode(
                saved['frozenLedgerBase64'], validate=True)
            response_files = saved.get('responseFiles')
        else:
            # V1 was already issued before the batch moved on. Its original
            # ledger bytes have rolled out of the shared hourly file; retain
            # the original digest, never substitute today's ledger.
            manifest_bytes = legacy_frozen_manifest_path(root).read_bytes()
            archive = read_json(legacy_frozen_responses_path(root),
                                'legacy frozen response list')
            if (archive.get('schemaVersion') != 1
                    or archive.get('sourceAttestationSha256') !=
                    hashlib.sha256(path.read_bytes()).hexdigest()):
                raise RuntimeError('legacy frozen response list ownership differs')
            response_files = archive.get('responseFiles')
            ledger_bytes = None
        if hashlib.sha256(manifest_bytes).hexdigest() != saved['manifestSha256']:
            raise RuntimeError('legacy frozen manifest hash differs')
        manifest = read_tree_manifest(root, started, ended,
                                      window_label='legacy batch',
                                      manifest_bytes=manifest_bytes)
        validate_legacy_manifest(manifest, status)
        if ledger_bytes is not None:
            if hashlib.sha256(ledger_bytes).hexdigest() != saved['ledgerSha256']:
                raise RuntimeError('legacy frozen ledger hash differs')
            ledger = json.loads(ledger_bytes)
            if not isinstance(ledger, dict):
                raise RuntimeError('legacy frozen ledger invalid')
            validate_legacy_ledger(ledger, started, ended,
                                   status['requestsThisRun'])
        count, digest, nodes, _ = response_inventory(
            root, saved['responseCount'], ended, response_files)
        if (count != saved['responseCount']
                or digest != saved['responseInventorySha256']
                or any(parent not in nodes
                       for parent in manifest['pendingParentIds'])):
            raise RuntimeError('legacy frozen response inventory differs')
        return saved
    except (RuntimeError, OSError, ValueError, TypeError, KeyError,
            binascii.Error) as error:
        raise RuntimeError(f'legacy attestation cannot be verified: {error}') from error


def create_legacy_attestation(root):
    root = Path(root)
    path = legacy_attestation_path(root)
    with CORE['exclusive_run_lock'](root):
        if path.exists():
            raise RuntimeError('legacy attestation already exists; no overwrite')
        CORE['enforce_site_cooldown'](root)
        document = {**legacy_evidence(root),
                    'attestedAtUtc': datetime.now(timezone.utc).isoformat()}
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(document, output, ensure_ascii=False, indent=2)
            print(file=output)
    return document


def build_command(python_executable, run_id):
    return [
        str(python_executable), str(PROJECT / 'scripts' / 'fetch-mca-area-tree.py'),
        '--max-level', '3', '--max-requests', '20',
        '--interval', '60', '--jitter', '10',
        '--run-id', run_id,
    ]


def verify_recovery_attestation(root, previous_run_id, *, now=None):
    if previous_run_id == 'tree-20261119-auto-008':
        script = 'attest-mca-tree-recovery.py'
    elif previous_run_id == 'tree-20261119-auto-017':
        script = 'attest-mca-tree-transient-recovery.py'
    else:
        raise RuntimeError('no reviewed recovery for this run')
    recovery = runpy.run_path(str(PROJECT / 'scripts' / script),
                             run_name='mca_tree_recovery')
    return recovery['verify_attestation'](root, previous_run_id, now=now)


def check_preconditions(root, previous_run_id, run_id, now):
    """Reject uncertain state before invoking the collector."""
    if (not RUN_ID_PATTERN.fullmatch(previous_run_id)
            or not RUN_ID_PATTERN.fullmatch(run_id) or previous_run_id == run_id):
        raise RuntimeError('run IDs invalid or identical; no request sent')
    current = timestamp(now.isoformat(), 'current time')
    runs = root / 'batch-runs'
    if ((runs / f'{run_id}.status.json').exists()
            or (runs / f'{run_id}.log').exists()
            or owned_manifest_path(root, run_id).exists()):
        raise RuntimeError('new run ID already exists; no request sent')
    if not (root / 'hourly-request-budget.json').is_file():
        raise RuntimeError('site hourly request ledger missing; no request sent')
    prior = read_json(runs / f'{previous_run_id}.status.json', 'previous run status')
    started = timestamp(prior.get('startedAtUtc'), 'previous run start')
    ended = timestamp(prior.get('endedAtUtc'), 'previous run end')
    if started > ended or ended > current:
        raise RuntimeError('previous run time window invalid; no request sent')
    recovery = None
    if previous_run_id in ('tree-20261119-auto-008',
                           'tree-20261119-auto-017') and prior.get('lastError') is not None:
        recovery = verify_recovery_attestation(root, previous_run_id, now=current)
    if recovery is None and (prior.get('runId') != previous_run_id
            or type(prior.get('collectorExitCode')) is not int
            or prior['collectorExitCode'] != 0
            or type(prior.get('exitCode')) is not int
            or prior['exitCode'] != 1
            or prior.get('treeWalkComplete') is not False
            or prior.get('requestBudgetReached') is not True
            or prior.get('rateLimited') is not False
            or prior.get('error') != PARTIAL_ERROR):
        raise RuntimeError('previous run was not a clean budget interruption; no request sent')
    for path in runs.glob('tree-*.status.json'):
        status = read_json(path, 'other tree run status')
        if status.get('phase') == 'running' or status.get('endedAtUtc') is None:
            raise RuntimeError('another unfinished run exists; no request sent')
        timestamp(status['endedAtUtc'], 'other tree run end')
    manifest = read_tree_manifest(root, started, ended)
    previous_hash = prior.get('collectorManifestSha256')
    if previous_hash is None:
        if previous_run_id == LEGACY_AUTO_RUN_ID:
            verify_legacy_attestation(root)
        elif previous_run_id != LEGACY_INITIAL_RUN_ID:
            raise RuntimeError('previous run manifest ownership missing')
    if previous_hash is not None:
        if (not isinstance(previous_hash, str)
                or re.fullmatch(r'[0-9a-f]{64}', previous_hash) is None):
            raise RuntimeError('previous run manifest ownership hash invalid')
        try:
            shared = (root / TREE_DIR / 'manifest.json').read_bytes()
            owned = owned_manifest_path(root, previous_run_id).read_bytes()
        except OSError as error:
            raise RuntimeError('previous run manifest ownership missing') from error
        if (manifest.get('runId') != previous_run_id or shared != owned
                or hashlib.sha256(owned).hexdigest() != previous_hash):
            raise RuntimeError('previous run manifest ownership differs')
    if recovery is None and (manifest['treeWalkComplete'] is not False
            or manifest['rateLimited'] is not False
            or manifest['requestBudgetReached'] is not True
            or manifest.get('lastError') is not None
            or not manifest['pendingParentIds']):
        raise RuntimeError('tree manifest is not a clean budget interruption; no request sent')
    for key in ('requestsThisRun', 'savedResponses'):
        if type(prior.get(key)) is not int or prior[key] != manifest[key]:
            raise RuntimeError(f'previous status {key} differs from manifest; no request sent')
    if recovery is not None:
        current_files = sorted(
            (path.name for path in (root / TREE_DIR / 'responses').glob('*.json')),
            key=str.casefold)
        if current_files != [item['name'] for item in recovery['responseFiles']]:
            raise RuntimeError('recovery cache changed before retry; no request sent')
    cooldown_path = root / 'rate-limit.json'
    if cooldown_path.exists():
        cooldown = read_json(cooldown_path, 'site cooldown')
        until = timestamp(cooldown.get('cooldownUntilUtc'), 'site cooldown')
        if current < until:
            raise RuntimeError('site cooldown active; no request sent')
    try:
        # Existing collectors use this same nonblocking site-wide lock.
        with CORE['exclusive_run_lock'](root):
            pass
    except CORE['FetchError'] as error:
        raise RuntimeError('another MCA collector is running; no request sent') from error
    return manifest


def write_status(path, status, *, exclusive=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(status, ensure_ascii=False, indent=2) + '\n'
    if exclusive:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(payload)
        return
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(payload, encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def main(argv=None, *, now=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previous-run-id', required=True)
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args(argv)
    now = now or datetime.now(timezone.utc)
    try:
        previous = check_preconditions(PRIVATE_ROOT, args.previous_run_id,
                                       args.run_id, now)
    except RuntimeError as error:
        print(json.dumps({'exitCode': 2, 'error': str(error),
                          'requestsThisRun': 0}, ensure_ascii=False), flush=True)
        return 2

    runs = PRIVATE_ROOT / 'batch-runs'
    status_path = runs / f'{args.run_id}.status.json'
    log_path = runs / f'{args.run_id}.log'
    started = datetime.now(timezone.utc)
    status = {
        'schemaVersion': 1, 'runId': args.run_id,
        'priorRunId': args.previous_run_id, 'phase': 'running',
        'startedAtUtc': started.isoformat(), 'endedAtUtc': None,
        'collectorExitCode': None, 'exitCode': None,
        'treeWalkComplete': None, 'requestBudgetReached': None,
        'requestsThisRun': None, 'savedResponses': None,
        'savedResponsesBefore': previous['savedResponses'],
        'savedResponseDelta': None,
        'pendingBefore': len(previous['pendingParentIds']),
        'pendingAfter': None, 'rateLimited': None, 'lastError': None,
        'error': None, 'logPath': str(log_path), 'publishable': False,
        'collectorManifestSha256': None,
        'priorRecoveryAttestationSha256': (hashlib.sha256(
            (runs / f'{args.previous_run_id}.recovery.json').read_bytes()).hexdigest()
            if previous.get('lastError') is not None else None),
    }
    try:
        write_status(status_path, status, exclusive=True)
    except FileExistsError:
        print(json.dumps({'exitCode': 2, 'error': 'new run ID already exists',
                          'requestsThisRun': 0}, ensure_ascii=False), flush=True)
        return 2

    manifest = None
    failure = None
    try:
        with log_path.open('x', encoding='utf-8') as output:
            completed = subprocess.run(build_command(Path(sys.executable), args.run_id),
                                       cwd=PROJECT, stdout=output,
                                       stderr=subprocess.STDOUT, check=False)
        status['collectorExitCode'] = completed.returncode
        collector_manifest = owned_manifest_path(PRIVATE_ROOT, args.run_id)
        manifest = read_tree_manifest(PRIVATE_ROOT, started,
                                      window_label='current run',
                                      manifest_path=collector_manifest,
                                      expected_run_id=args.run_id)
        status['collectorManifestSha256'] = hashlib.sha256(
            collector_manifest.read_bytes()).hexdigest()
        if manifest['savedResponses'] < previous['savedResponses']:
            raise RuntimeError('saved response count decreased')
        if completed.returncode != 0:
            failure = f'area tree collector exited {completed.returncode}'
        elif manifest['rateLimited']:
            failure = 'area tree rate limited; no retry'
        elif manifest.get('lastError'):
            failure = 'area tree reported an error; no retry'
        elif not manifest['treeWalkComplete']:
            failure = (PARTIAL_ERROR if manifest['requestBudgetReached']
                       else 'area tree incomplete without budget stop; no retry')
    except (RuntimeError, OSError, ValueError) as error:
        failure = f'{type(error).__name__}: {error}'
    status.update({
        'phase': 'finished', 'endedAtUtc': datetime.now(timezone.utc).isoformat(),
        'exitCode': 1 if failure else 0,
        'treeWalkComplete': manifest['treeWalkComplete'] if manifest else None,
        'requestBudgetReached': manifest['requestBudgetReached'] if manifest else None,
        'requestsThisRun': manifest['requestsThisRun'] if manifest else None,
        'savedResponses': manifest['savedResponses'] if manifest else None,
        'savedResponseDelta': (manifest['savedResponses'] - previous['savedResponses']
                               if manifest else None),
        'pendingAfter': len(manifest['pendingParentIds']) if manifest else None,
        'rateLimited': manifest['rateLimited'] if manifest else None,
        'lastError': manifest.get('lastError') if manifest else None,
        'error': failure,
    })
    write_status(status_path, status)
    print(json.dumps(status, ensure_ascii=False), flush=True)
    return status['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
