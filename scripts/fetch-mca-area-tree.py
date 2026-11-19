"""Privately collect the MCA area tree using official node IDs.

Usage: python scripts/fetch-mca-area-tree.py --max-level 3 --max-requests 20
The locked 2026-11-18 root and Guangdong responses seed a resumable cache.
This is not a same-time national snapshot.
"""

from __future__ import annotations

import argparse
import base64
from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROJECT = Path(__file__).resolve().parents[1]
CORE = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-institutions.py'), run_name='mca_fetch_core')
SITE_ROOT = CORE['ROOT']
OUTPUT_DIR = SITE_ROOT / 'area-tree-20261119'
SEED_PATH = PROJECT / 'data/private/mca-filter-retry-20261118.json'
SEED_SHA256 = '4bb165aa8ea4d2066540dc01139ff7a1d79c468d0ac729d9662237c48e330f73'
API_BASE = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'
SOURCE_PAGE = 'https://yanglao.mca.gov.cn/?#/index/institutionList'
NODE_ID = re.compile(r'[A-Za-z0-9_-]{1,64}')
CODE = re.compile(r'[0-9]{12}')
# Exact source anomaly, verified against the private diagnostic HTTP bytes.
# Never infer a replacement from `code`, pad sbcode, or mutate the raw node.
KNOWN_INVALID_CODE_NODE = {
    'id': '05a899fd428f4716a0aa96623c7527f9',
    'pid': '61c11934c4e04524af2b935e81acb580',
    'name': '南太湖新区', 'level': 3, 'sbcode': '33055200000',
    'code': '05a899fd428f4716a0aa96623c7527f9:330524000000',
    'pathName': '民政部(全国):浙江省:湖州市:南太湖新区',
}
INVALID_CODE_EVIDENCE_SHA256 = '0dd6d5d80e1708b13f46c6823903a99affa7af813452ff9a5843223063881559'
RUN_ID = re.compile(r'tree-[0-9]{8}-[a-z][a-z0-9-]*')
RateLimiter = CORE['RateLimiter']
FetchError = CORE['FetchError']
BudgetExhausted = CORE['BudgetExhausted']
save_json = CORE['save_json']
load_json = CORE['load_json']
now_utc = CORE['now_utc']


def checked_parent_id(parent_id: str) -> str:
    if parent_id != '-1' and (not isinstance(parent_id, str) or not NODE_ID.fullmatch(parent_id)):
        raise ValueError('invalid official area node ID')
    return parent_id


def canonical_bytes(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def known_invalid_code(child: dict) -> bool:
    return all(child.get(key) == value for key, value in KNOWN_INVALID_CODE_NODE.items())


def invalid_code_record(child: dict, wrapper: dict) -> dict:
    """Derived coverage gap only; call after checked_response validates source."""
    return {
        'sourceNodeId': child['id'], 'sourceParentNodeId': child['pid'],
        'level': child['level'], 'name': child['name'], 'sbcode': child['sbcode'],
        'queryable': False, 'coverageGap': True, 'coverageReviewRequired': True,
        'reason': 'invalid_official_sbcode',
        'sourceResponseSha256': wrapper['responseSha256'],
        'evidenceResponseSha256': INVALID_CODE_EVIDENCE_SHA256,
    }


def checked_response(wrapper: dict, parent_id: str, parent_level: int) -> list[dict]:
    """Validate source, bytes and parent relationships before caching."""
    if (not isinstance(wrapper, dict) or wrapper.get('parentId') != parent_id
            or wrapper.get('sourceUrl') != API_BASE + parent_id
            or wrapper.get('method') != 'GET' or wrapper.get('httpStatus') != 200):
        raise ValueError(f'{parent_id}: response provenance differs')
    body = wrapper.get('response')
    if not isinstance(body, dict) or body.get('code') != 0 or not isinstance(body.get('data'), list):
        raise ValueError(f'{parent_id}: unsuccessful or malformed area response')
    encoded = wrapper.get('rawBodyBase64')
    if encoded is None:
        provenance = wrapper.get('provenance', {})
        if (provenance.get('kind') != 'cached-json-payload'
                or provenance.get('originalHttpBodyAvailable') is not False):
            raise ValueError(f'{parent_id}: missing cached-response provenance')
        raw = canonical_bytes(body)
    else:
        try:
            raw = base64.b64decode(encoded, validate=True)
            if json.loads(raw) != body:
                raise ValueError('body differs')
        except (ValueError, TypeError) as error:
            raise ValueError(f'{parent_id}: raw response differs') from error
    if hashlib.sha256(raw).hexdigest() != wrapper.get('responseSha256'):
        raise ValueError(f'{parent_id}: response SHA-256 differs')
    seen = set()
    for child in body['data']:
        if not isinstance(child, dict):
            raise ValueError(f'{parent_id}: area node is not an object')
        identifier, level = child.get('id'), child.get('level')
        if (not isinstance(identifier, str) or identifier == '-1'
                or not NODE_ID.fullmatch(identifier) or identifier in seen):
            raise ValueError(f'{parent_id}: duplicate or invalid official node ID')
        if child.get('pid') != parent_id:
            raise ValueError(f'{parent_id}: child pid differs')
        if type(level) is not int or level <= parent_level:
            raise ValueError(f'{parent_id}: child level differs')
        sbcode = child.get('sbcode')
        if (sbcode is not None and (not isinstance(sbcode, str) or not CODE.fullmatch(sbcode))
                and not (parent_level == 2 and known_invalid_code(child))):
            raise ValueError(f'{parent_id}: invalid official sbcode')
        if not isinstance(child.get('name'), str) or not child['name'].strip():
            raise ValueError(f'{parent_id}: area name missing')
        seen.add(identifier)
    return body['data']


def cached_seed_wrappers(seed_path: Path, expected_sha256: str) -> tuple[dict, dict]:
    source = seed_path.read_bytes()
    actual_sha = hashlib.sha256(source).hexdigest()
    if actual_sha != expected_sha256:
        raise ValueError('area seed SHA-256 differs from locked snapshot')
    snapshot = json.loads(source.decode('utf-8-sig'))
    captured = datetime.fromisoformat(snapshot['requestedAt'])
    if captured.tzinfo is None:
        raise ValueError('area seed capture time lacks timezone')
    captured_at_utc = captured.astimezone(timezone.utc).isoformat()
    requests = {item.get('path'): item for item in snapshot.get('requests', [])}
    root_item = requests.get('/console/area/childs/-1')
    if root_item is None:
        raise ValueError('area seed has no root response')

    def wrapper(item: dict, parent_id: str) -> dict:
        path = '/console/area/childs/' + parent_id
        if item.get('path') != path:
            raise ValueError('area seed path differs from official parent ID')
        body = item.get('body')
        if not isinstance(body, dict):
            raise ValueError('area seed body missing')
        return {
            'schemaVersion': 1, 'parentId': parent_id,
            'sourcePage': snapshot.get('source'), 'sourceUrl': API_BASE + parent_id,
            'method': 'GET', 'fetchedAtUtc': captured_at_utc,
            'httpStatus': item.get('httpStatus'),
            'responseSha256': hashlib.sha256(canonical_bytes(body)).hexdigest(),
            'rawBodyBase64': None, 'response': body,
            'provenance': {'kind': 'cached-json-payload',
                           'originalHttpBodyAvailable': False,
                           'sourceSnapshotSha256': actual_sha,
                           'sourceSnapshotPath': str(seed_path),
                           'recordedPath': path},
        }

    root = wrapper(root_item, '-1')
    roots = checked_response(root, '-1', 0)
    guangdong = [node for node in roots if node.get('sbcode') == '440000000000']
    if len(guangdong) != 1:
        raise ValueError('area seed has no unique official Guangdong node')
    guangdong_id = guangdong[0]['id']
    gd_item = requests.get('/console/area/childs/' + guangdong_id)
    if gd_item is None:
        raise ValueError('area seed has no Guangdong children response')
    gd_wrapper = wrapper(gd_item, guangdong_id)
    checked_response(gd_wrapper, guangdong_id, guangdong[0]['level'])
    return {'-1': root, guangdong_id: gd_wrapper}, {
        'sha256': actual_sha, 'capturedAtUtc': captured_at_utc,
        'seededParentIds': ['-1', guangdong_id],
    }


def fetch_child(parent_id: str, limiter: RateLimiter, timeout: float,
                *, clock=None, opener=urlopen) -> dict:
    """One signed GET; only an explicit expired timestamp permits one retry."""
    checked_parent_id(parent_id)
    clock = clock or CORE['SERVER_CLOCK']
    url = API_BASE + parent_id
    for attempt in range(2):
        clock.timestamp_ms(limiter)
        limiter.wait()
        try:
            timestamp = clock.timestamp_ms(None, False)
        except FetchError as error:
            if str(error) != 'server clock expired during request wait; no POST sent':
                raise
            # The GET pacing wait may consume the clock TTL. Recalibrate once
            # and reserve a fresh GET slot; the HEAD also uses the site budget.
            clock.timestamp_ms(limiter)
            limiter.wait()
            timestamp = clock.timestamp_ms(None, False)
        headers = CORE['signed_headers'](timestamp)
        request = Request(url, headers=headers, method='GET')
        requested_at = now_utc()
        try:
            request_started_at = time.time()
            with opener(request, timeout=timeout) as response:
                raw = response.read()
                status = response.status
                response_date = response.headers.get('Date') if hasattr(response, 'headers') else None
            response_received_at = time.time()
        except HTTPError as error:
            if error.code == 429:
                retry_after = error.headers.get('Retry-After') if error.headers else None
                limiter.trip('HTTP 429 during area-tree collection', retry_after)
            raise FetchError(f'area {parent_id}: HTTP {error.code}; stopped') from error
        except (URLError, TimeoutError) as error:
            raise FetchError(f'area {parent_id}: {type(error).__name__}; stopped') from error
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeDecodeError) as error:
            raise FetchError(f'area {parent_id}: invalid JSON; stopped') from error
        if status != 200 or not isinstance(body, dict):
            raise FetchError(f'area {parent_id}: invalid response; stopped')
        if body.get('code') == 1 and str(body.get('msg', '')).strip() == '请求已过期' and attempt == 0:
            clock.force_refresh(limiter)
            continue
        if body.get('code') != 0:
            raise FetchError(f'area {parent_id}: business code {body.get("code")}; stopped')
        observe = getattr(clock, 'observe_response_date', None)
        if observe is not None:
            observe(response_date, request_started_at, response_received_at)
        return {
            'schemaVersion': 1, 'parentId': parent_id,
            'sourcePage': SOURCE_PAGE, 'sourceUrl': url, 'method': 'GET',
            'requestedAtUtc': requested_at, 'fetchedAtUtc': now_utc(),
            'httpStatus': status, 'responseDate': response_date,
            'signedTimestampMs': timestamp,
            'responseSha256': hashlib.sha256(raw).hexdigest(),
            'rawBodyBase64': base64.b64encode(raw).decode('ascii'),
            'response': body,
            'provenance': {'kind': 'live-http', 'originalHttpBodyAvailable': True},
        }
    raise FetchError(f'area {parent_id}: timestamp expired twice; stopped')


def collect_tree(seed_path: Path, output_dir: Path, limiter: RateLimiter,
                 *, max_level: int, timeout: float, seed_sha256: str = SEED_SHA256,
                 fetch=None, run_id=None) -> dict:
    """Walk official IDs only; a budget stop leaves a resumable frontier."""
    fetch = fetch or fetch_child
    owned_path = None
    if run_id is not None:
        if not isinstance(run_id, str) or RUN_ID.fullmatch(run_id) is None:
            raise ValueError('invalid area-tree run ID')
        owned_path = output_dir / 'run-manifests' / f'{run_id}.json'
        if owned_path.exists():
            raise ValueError('area-tree run manifest already exists; no request sent')
    seed_wrappers, seed_meta = cached_seed_wrappers(seed_path, seed_sha256)
    responses = output_dir / 'responses'
    responses.mkdir(parents=True, exist_ok=True)
    for parent_id, wrapper in seed_wrappers.items():
        path = responses / (parent_id + '.json')
        if path.exists():
            if load_json(path) != wrapper:
                raise ValueError(f'{parent_id}: saved seed differs from locked snapshot')
        else:
            save_json(path, wrapper)
    root_nodes = checked_response(seed_wrappers['-1'], '-1', 0)
    queryable_roots = sum(node.get('sbcode') is not None for node in root_nodes)
    excluded_roots = len(root_nodes) - queryable_roots
    frontier = deque([('-1', 0)])
    processed_parents = set()
    seen_nodes = {}
    invalid_code_nodes = []
    caught_error = None
    while frontier:
        parent_id, parent_level = frontier.popleft()
        if parent_id in processed_parents:
            continue
        path = responses / (parent_id + '.json')
        try:
            wrapper = load_json(path) if path.exists() else fetch(parent_id, limiter, timeout)
            children = checked_response(wrapper, parent_id, parent_level)
            if not path.exists():
                save_json(path, wrapper)
        except BudgetExhausted:
            frontier.appendleft((parent_id, parent_level))
            break
        except (FetchError, ValueError) as error:
            frontier.appendleft((parent_id, parent_level))
            caught_error = error
            break
        processed_parents.add(parent_id)
        for child in children:
            identifier = child['id']
            if identifier in seen_nodes and seen_nodes[identifier] != parent_id:
                caught_error = ValueError(f'{identifier}: official node belongs to multiple parents')
                break
            seen_nodes[identifier] = parent_id
            if known_invalid_code(child):
                invalid_code_nodes.append(invalid_code_record(child, wrapper))
            if parent_id == '-1' and child.get('sbcode') is None:
                continue
            if child['level'] < max_level:
                frontier.append((identifier, child['level']))
        if caught_error:
            break
    manifest = {
        'schemaVersion': 1, 'scope': 'coded-mainland-roots-through-level-' + str(max_level),
        'sourcePage': SOURCE_PAGE, 'apiBase': API_BASE,
        'seedSnapshotSha256': seed_meta['sha256'],
        'seedCapturedAtUtc': seed_meta['capturedAtUtc'],
        'seededParentIds': seed_meta['seededParentIds'],
        'maxLevel': max_level, 'rootNodes': len(root_nodes),
        'queryableRootNodes': queryable_roots, 'excludedRootNodes': excluded_roots,
        'savedResponses': len(list(responses.glob('*.json'))),
        'discoveredNodes': len(seen_nodes),
        'invalidCodeNodeCount': len(invalid_code_nodes),
        'invalidCodeNodes': invalid_code_nodes,
        'pendingParentIds': [parent_id for parent_id, _ in frontier],
        'treeWalkComplete': not frontier and caught_error is None,
        'sameTimeSnapshotVerified': False,
        'requestBudget': limiter.max_requests, 'requestsThisRun': limiter.requests_started,
        'requestBudgetReached': limiter.exhausted.is_set(),
        'rateLimited': limiter.blocked.is_set(),
        'rateLimitCooldownUntilUtc': limiter.cooldown_until_utc,
        'lastError': (f'{type(caught_error).__name__}: {caught_error}' if caught_error else None),
        'auditedAtUtc': now_utc(),
    }
    if run_id is not None:
        manifest['runId'] = run_id
    save_json(output_dir / 'manifest.json', manifest)
    if owned_path is not None:
        owned_path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(owned_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(manifest, output, ensure_ascii=False, indent=2)
            print(file=output)
    if caught_error:
        raise caught_error
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-level', type=int, default=3, help='stop below this official level (default: 3)')
    parser.add_argument('--max-requests', type=int, default=20, help='hard site-request budget including clock HEAD')
    parser.add_argument('--interval', type=float, default=45.0, help='minimum seconds between site requests')
    parser.add_argument('--jitter', type=float, default=5.0, help='additional random seconds')
    parser.add_argument('--timeout', type=float, default=30.0)
    parser.add_argument('--run-id', help='bind this collector manifest to one audited resume batch')
    args = parser.parse_args()
    if not 1 <= args.max_level <= 5 or not 1 <= args.max_requests <= 60 or args.interval < 45 or args.jitter < 0 or args.timeout <= 0:
        parser.error('max-level 1..5, request budget 1..60, interval >= 45, jitter >= 0, timeout > 0 required')
    if args.run_id is not None and RUN_ID.fullmatch(args.run_id) is None:
        parser.error('invalid area-tree run ID')
    with CORE['exclusive_run_lock'](SITE_ROOT):
        CORE['enforce_site_cooldown'](SITE_ROOT)
        limiter = RateLimiter(args.interval, args.jitter, args.max_requests,
                              hourly_state_path=SITE_ROOT / 'hourly-request-budget.json')
        try:
            options = {'max_level': args.max_level, 'timeout': args.timeout}
            if args.run_id is not None:
                options['run_id'] = args.run_id
            result = collect_tree(SEED_PATH, OUTPUT_DIR, limiter, **options)
            print(json.dumps({key: result[key] for key in (
                'scope', 'rootNodes', 'queryableRootNodes', 'savedResponses',
                'discoveredNodes', 'treeWalkComplete', 'requestsThisRun',
                'requestBudgetReached')}, ensure_ascii=False))
        finally:
            if limiter.blocked.is_set():
                save_json(SITE_ROOT / 'rate-limit.json', {
                    'reason': limiter.block_reason, 'detectedAtUtc': now_utc(),
                    'cooldownUntilUtc': limiter.cooldown_until_utc,
                })


if __name__ == '__main__':
    main()
