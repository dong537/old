"""One-shot, bounded local scheduler target for the MCA root-region probe.

Only the Windows Task Scheduler should launch this after the recorded 429 cooldown.
It never retries automatically; inspect its private status and the batch manifest.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
RUN_ID = 'roots-20261119-a'
COOLDOWN_END_UTC = datetime(2026, 11, 18, 19, 45, 17, tzinfo=timezone.utc)


def check_start_time(now):
    if now.tzinfo is None or now.astimezone(timezone.utc) < COOLDOWN_END_UTC:
        raise RuntimeError('recorded 429 cooldown has not ended; no site request sent')


def build_command(python_executable):
    return [
        str(python_executable), str(PROJECT / 'scripts' / 'collect-mca-shards.py'),
        '--capture-id', RUN_ID, '--max-pages-per-area', '1', '--max-areas', '32',
        '--max-requests', '48', '--interval', '60', '--jitter', '10',
        '--attempts', '2',
    ]


def build_audit_command(python_executable):
    return [
        str(python_executable), str(PROJECT / 'scripts' / 'audit-mca-shards.py'),
        '--output', str(PRIVATE_ROOT / 'cross-shard-audit.json'),
    ]


def write_status(path, status):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(status, ensure_ascii=False, indent=2) + chr(10), encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def main():
    check_start_time(datetime.now(timezone.utc))
    logs = PRIVATE_ROOT / 'batch-runs'
    logs.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc).isoformat()
    log_path = logs / f'{RUN_ID}.log'
    status_path = logs / f'{RUN_ID}.status.json'
    exit_code = None
    batch_exit_code = None
    audit_exit_code = None
    failure = None
    try:
        with log_path.open('a', encoding='utf-8') as output:
            batch = subprocess.run(build_command(Path(sys.executable)), cwd=PROJECT,
                                   stdout=output, stderr=subprocess.STDOUT, check=False)
            batch_exit_code = batch.returncode
            audit = subprocess.run(build_audit_command(Path(sys.executable)), cwd=PROJECT,
                                   stdout=output, stderr=subprocess.STDOUT, check=False)
            audit_exit_code = audit.returncode
        exit_code = batch_exit_code or audit_exit_code
    except Exception as error:
        failure = f'{type(error).__name__}: {error}'
        raise
    finally:
        write_status(status_path, {
            'schemaVersion': 1, 'captureId': RUN_ID,
            'startedAtUtc': started, 'endedAtUtc': datetime.now(timezone.utc).isoformat(),
            'exitCode': exit_code, 'batchExitCode': batch_exit_code,
            'auditExitCode': audit_exit_code,
            'error': failure, 'logPath': str(log_path),
            'publishable': False,
        })
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
