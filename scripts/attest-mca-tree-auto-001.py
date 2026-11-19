"""Offline, one-time audit of the pre-ownership tree auto-001 batch.

Run only after the old controller and collector have finished. This command
never contacts the site or changes the historical status, manifest or cache.
It writes one immutable sidecar that the new resume code can verify.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import runpy
import sys


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
ONE_SHOT = runpy.run_path(str(PROJECT / 'scripts' / 'run-mca-tree-resume.py'),
                          run_name='mca_tree_legacy_attestation')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=PRIVATE_ROOT,
                        help='private MCA cache root (default: project cache)')
    args = parser.parse_args(argv)
    try:
        result = ONE_SHOT['create_legacy_attestation'](args.root)
    except (RuntimeError, OSError, ValueError) as error:
        print(json.dumps({'exitCode': 2, 'error': str(error)},
                         ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps({
        'exitCode': 0, 'runId': result['runId'],
        'responseCount': result['responseCount'],
        'requestsThisRun': result['requestsThisRun'],
        'attestedAtUtc': result['attestedAtUtc'],
    }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
