"""Run bounded, serial MCA province probes from the cached official root tree.

Example: python scripts/collect-mca-shards.py --capture-id first-20261119 --max-pages-per-area 1
All output is private. This does not prove a complete, frozen nationwide snapshot.
"""

import argparse
import json
import math
import os
import re
import runpy
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace


PROJECT = Path(__file__).resolve().parents[1]
FETCHER = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-institutions.py'))
DEFAULT_SEEDS = (PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
                 / 'national-shard-seeds-20261119.json')


def load_shards(path):
    """Accept only explicit official sbcodes, never derive regions from names."""
    document = json.loads(Path(path).read_text(encoding='utf-8'))
    seeds = document.get('seeds')
    if not isinstance(seeds, list) or document.get('seedCount') != len(seeds):
        raise ValueError('invalid seed count')
    seen = set()
    for seed in seeds:
        if not isinstance(seed, dict) or not re.fullmatch(r'[0-9]{12}', str(seed.get('sbcode', ''))):
            raise ValueError('invalid official sbcode')
        if not isinstance(seed.get('sourceNodeId'), str) or not seed['sourceNodeId']:
            raise ValueError('missing official sourceNodeId')
        if not isinstance(seed.get('name'), str) or not seed['name']:
            raise ValueError('missing official region name')
        if seed['sbcode'] in seen:
            raise ValueError('duplicate official sbcode')
        seen.add(seed['sbcode'])
    return seeds


def save_summary(path, summary):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + chr(10), encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def run_batch(seed_file, capture_id, max_pages_per_area, max_areas,
              interval, jitter, attempts, max_requests, timeout=30):
    if not re.fullmatch(r'[a-zA-Z0-9-]{1,40}', capture_id):
        raise ValueError('capture ID must be 1-40 ASCII letters, digits or hyphens')
    if (max_pages_per_area < 0 or max_areas < 0 or not 1 <= max_requests <= 60
            or not math.isfinite(interval) or interval < 45
            or not math.isfinite(jitter) or jitter < 0 or attempts < 1 or timeout <= 0):
        raise ValueError('interval >= 45, request budget 1-60 and valid nonnegative limits required')
    shards = load_shards(seed_file)
    target_shards = shards[:max_areas or len(shards)]
    root = FETCHER['ROOT']
    limiter = FETCHER['RateLimiter'](
        interval, jitter, max_requests, root / 'hourly-request-budget.json')
    started = datetime.now(timezone.utc).isoformat()
    visited = []
    failure = None
    summary_path = root / 'batch-runs' / f'{capture_id}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json'
    with FETCHER['exclusive_run_lock'](root):
        FETCHER['enforce_site_cooldown'](root)
        try:
            for seed in target_shards:
                if limiter.blocked.is_set() or limiter.exhausted.is_set():
                    break
                code = seed['sbcode']
                folder = root / f'area-{code}-check-sort-1-capture-{capture_id}'
                folder.mkdir(parents=True, exist_ok=True)
                args = SimpleNamespace(area_code=code, max_pages=max_pages_per_area,
                                       workers=1, check_sort=True, timeout=timeout,
                                       attempts=attempts)
                try:
                    FETCHER['collect_list'](args, folder, limiter)
                except FETCHER['BudgetExhausted']:
                    failure = 'request budget exhausted before all planned areas were visited'
                    break
                visited.append(code)
        except Exception as error:
            failure = f'{type(error).__name__}: {error}'
            raise
        finally:
            if failure is None and len(visited) < len(target_shards):
                failure = ('request budget exhausted before all planned areas were visited'
                           if limiter.exhausted.is_set() else
                           'batch stopped before all planned areas were visited')
            if limiter.blocked.is_set():
                save_summary(root / 'rate-limit.json', {
                    'reason': limiter.block_reason,
                    'detectedAtUtc': datetime.now(timezone.utc).isoformat(),
                    'cooldownUntilUtc': limiter.cooldown_until_utc,
                })
            summary = {
                'schemaVersion': 1, 'publishable': False,
                'success': failure is None and len(visited) == len(target_shards),
                'snapshotVerified': False, 'seedFile': str(seed_file),
                'captureId': capture_id, 'startedAtUtc': started,
                'endedAtUtc': datetime.now(timezone.utc).isoformat(),
                'areasPlanned': len(target_shards),
                'areasVisited': len(visited), 'visitedAreaCodes': visited,
                'maxPagesPerArea': max_pages_per_area,
                'requestsThisRun': limiter.requests_started,
                'requestBudget': max_requests,
                'requestBudgetReached': limiter.exhausted.is_set(),
                'hourlyResumeAtUtc': getattr(limiter, 'hourly_resume_at_utc', None),
                'rateLimited': limiter.blocked.is_set(), 'error': failure,
            }
            save_summary(summary_path, summary)
            print(json.dumps(summary, ensure_ascii=False), flush=True)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed-file', type=Path, default=DEFAULT_SEEDS)
    parser.add_argument('--capture-id', required=True)
    parser.add_argument('--max-pages-per-area', type=int, default=1)
    parser.add_argument('--max-areas', type=int, default=32)
    parser.add_argument('--max-requests', type=int, default=60)
    parser.add_argument('--interval', type=float, default=45)
    parser.add_argument('--jitter', type=float, default=5)
    parser.add_argument('--attempts', type=int, default=1)
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args()
    if (args.max_pages_per_area < 0 or args.max_areas < 0 or not 1 <= args.max_requests <= 60
            or not math.isfinite(args.interval) or args.interval < 45
            or not math.isfinite(args.jitter) or args.jitter < 0
            or args.attempts < 1 or args.timeout <= 0):
        parser.error('nonnegative page/area limits, request budget 1-60, interval >= 45 and one or more attempts required')
    summary = run_batch(args.seed_file, args.capture_id, args.max_pages_per_area, args.max_areas,
                        args.interval, args.jitter, args.attempts, args.max_requests, args.timeout)
    if not summary['success']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
