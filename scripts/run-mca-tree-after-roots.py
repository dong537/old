"""One-shot MCA area-tree pass, gated on the successful province-root probe.

Schedule no earlier than 2026-11-19 05:00 Asia/Shanghai. A partial tree is
saved but exits nonzero; no network retry or automatic rescheduling occurs.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
RUN_ID = 'tree-20261119-a'
ROOT_RUN_ID = 'roots-20261119-a'
EARLIEST_START_UTC = datetime(2026, 11, 18, 21, tzinfo=timezone.utc)


def build_command(python_executable):
    return [
        str(python_executable), str(PROJECT / 'scripts' / 'fetch-mca-area-tree.py'),
        '--max-level', '3', '--max-requests', '20',
        '--interval', '60', '--jitter', '10',
    ]


def check_preconditions(root, now):
    """Fail closed when the prior run, clock, or cooldown is uncertain."""
    if now.tzinfo is None or now.astimezone(timezone.utc) < EARLIEST_START_UTC:
        raise RuntimeError('wait until 2026-11-19 05:00 Asia/Shanghai; no request sent')
    runs = root / 'batch-runs'
    status_path = runs / f'{ROOT_RUN_ID}.status.json'
    if not status_path.is_file():
        raise RuntimeError('root probe status missing; no request sent')
    try:
        status = json.loads(status_path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError('root probe status unreadable; no request sent') from error
    if (not isinstance(status, dict) or status.get('captureId') != ROOT_RUN_ID
            or status.get('exitCode') != 0 or status.get('batchExitCode') != 0
            or status.get('auditExitCode') != 0 or status.get('error') is not None):
        raise RuntimeError('root probe failed; no request sent')
    summaries = list(runs.glob(f'{ROOT_RUN_ID}-*.json'))
    try:
        status_started = datetime.fromisoformat(status['startedAtUtc'])
        status_ended = datetime.fromisoformat(status['endedAtUtc'])
        if (status_started.tzinfo is None or status_ended.tzinfo is None
                or status_ended < status_started):
            raise ValueError('invalid root probe times')
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError('root probe status timestamps invalid; no request sent') from error
    matching = []
    try:
        for path in summaries:
            candidate = json.loads(path.read_text(encoding='utf-8'))
            started = datetime.fromisoformat(candidate['startedAtUtc'])
            ended = datetime.fromisoformat(candidate['endedAtUtc'])
            if started.tzinfo is None or ended.tzinfo is None or ended < started:
                raise ValueError('invalid root probe summary times')
            if status_started <= started <= ended <= status_ended:
                matching.append(candidate)
    except (OSError, KeyError, TypeError, ValueError) as error:
        raise RuntimeError('root probe summary unreadable; no request sent') from error
    if len(matching) != 1:
        raise RuntimeError('root probe summary missing or ambiguous; no request sent')
    summary = matching[0]
    if (not isinstance(summary, dict) or summary.get('captureId') != ROOT_RUN_ID
            or summary.get('success') is not True or summary.get('areasPlanned') != 32
            or summary.get('areasVisited') != 32 or summary.get('rateLimited') is not False):
        raise RuntimeError('root probe did not cover 32 areas; no request sent')
    cooldown_path = root / 'rate-limit.json'
    if cooldown_path.exists():
        try:
            cooldown = json.loads(cooldown_path.read_text(encoding='utf-8'))
            until = datetime.fromisoformat(cooldown['cooldownUntilUtc'])
            if until.tzinfo is None:
                raise ValueError('naive cooldown time')
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise RuntimeError('site cooldown unreadable; no request sent') from error
        if now.astimezone(timezone.utc) < until.astimezone(timezone.utc):
            raise RuntimeError('site cooldown active; no request sent')


def write_status(path, status):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def read_tree_manifest(root, started_at):
    path = root / 'area-tree-20261119' / 'manifest.json'
    if not path.is_file():
        raise RuntimeError('area tree manifest missing')
    try:
        manifest = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise RuntimeError('area tree manifest unreadable') from error
    if (not isinstance(manifest, dict)
            or type(manifest.get('treeWalkComplete')) is not bool
            or type(manifest.get('rateLimited')) is not bool
            or type(manifest.get('requestBudgetReached')) is not bool
            or type(manifest.get('requestsThisRun')) is not int
            or type(manifest.get('savedResponses')) is not int):
        raise RuntimeError('area tree manifest invalid')
    audited_at = manifest.get('auditedAtUtc')
    try:
        audited_at = datetime.fromisoformat(audited_at)
        started = datetime.fromisoformat(started_at)
        if audited_at.tzinfo is None or audited_at.astimezone(timezone.utc) < started:
            raise ValueError('stale audit time')
    except (TypeError, ValueError) as error:
        raise RuntimeError('area tree manifest stale or lacks valid audit time') from error
    return manifest


def main(now=None):
    now = now or datetime.now(timezone.utc)
    runs = PRIVATE_ROOT / 'batch-runs'
    runs.mkdir(parents=True, exist_ok=True)
    log_path = runs / f'{RUN_ID}.log'
    status_path = runs / f'{RUN_ID}.status.json'
    started = datetime.now(timezone.utc).isoformat()
    collector_exit = None
    manifest = None
    failure = None
    try:
        check_preconditions(PRIVATE_ROOT, now)
        with log_path.open('a', encoding='utf-8') as output:
            completed = subprocess.run(build_command(Path(sys.executable)), cwd=PROJECT,
                                       stdout=output, stderr=subprocess.STDOUT, check=False)
        collector_exit = completed.returncode
        manifest = read_tree_manifest(PRIVATE_ROOT, started)
        if collector_exit != 0:
            failure = f'area tree collector exited {collector_exit}'
        elif manifest['rateLimited']:
            failure = 'area tree rate limited; no retry'
        elif manifest.get('lastError'):
            failure = 'area tree reported an error; see private manifest'
        elif not manifest['treeWalkComplete']:
            failure = 'area tree walk incomplete; see private manifest'
    except (RuntimeError, OSError, ValueError) as error:
        failure = f'{type(error).__name__}: {error}'
    status = {
        'schemaVersion': 1, 'runId': RUN_ID,
        'startedAtUtc': started, 'endedAtUtc': datetime.now(timezone.utc).isoformat(),
        'collectorExitCode': collector_exit, 'exitCode': 1 if failure else 0,
        'treeWalkComplete': manifest['treeWalkComplete'] if manifest else None,
        'requestBudgetReached': manifest['requestBudgetReached'] if manifest else None,
        'requestsThisRun': manifest['requestsThisRun'] if manifest else None,
        'savedResponses': manifest['savedResponses'] if manifest else None,
        'rateLimited': manifest['rateLimited'] if manifest else None,
        'error': failure, 'logPath': str(log_path), 'publishable': False,
    }
    write_status(status_path, status)
    print(json.dumps(status, ensure_ascii=False), flush=True)
    return status['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
