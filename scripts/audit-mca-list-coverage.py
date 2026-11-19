"""Read-only, aggregate audit of cached MCA list pagination and area ancestry.

Usage: python scripts/audit-mca-list-coverage.py [--root PRIVATE_CACHE_ROOT]
The report contains counts and codes only, never institution rows or IDs. Page
coverage is an observation; this endpoint has no frozen snapshot or unique-ID
ordering contract, so even clean pagination cannot establish zero omissions.
"""

from __future__ import annotations

import argparse
import base64
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import runpy


ROOT = Path(__file__).resolve().parents[1] / 'data/private/mca-institutions-2026-11-18'
TREE_URL = 'https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/'
LIST_URL = 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/queryOrganizationDataList'
CODE = re.compile(r'[0-9]{12}$')
PAGE = re.compile(r'[0-9]{5}[.]json$')
LEGACY = re.compile(r'area-([0-9]{12})(?:-|$)')
SHA = re.compile(r'[0-9a-f]{64}$')
OVERLAY_SEED = 'national-area-level4-overlay-seeds.v1.json'
AREA_COLLECTOR = runpy.run_path(
    str(Path(__file__).resolve().with_name('fetch-mca-area-tree.py')),
    run_name='mca_area_tree_for_list_audit')
ROOT_RECAPTURE_STATE = runpy.run_path(
    str(Path(__file__).resolve().with_name('run-mca-stage-handoff.py')),
    run_name='mca_root_proof_for_list_audit')['recapture_state']
NODE_ID = AREA_COLLECTOR['NODE_ID']
KNOWN_INVALID_CODE = AREA_COLLECTOR['known_invalid_code']
INVALID_CODE_RECORD = AREA_COLLECTOR['invalid_code_record']


class _InputHashes(dict):
    """Retain the first bytes read and record any later conflicting read."""

    def __init__(self):
        super().__init__()
        self.changed: set[str] = set()

    def remember(self, relative: str, digest: str) -> None:
        previous = self.setdefault(relative, digest)
        if previous != digest:
            self.changed.add(relative)


def _read(root: Path, path: Path, inputs: _InputHashes) -> dict:
    raw = path.read_bytes()
    inputs.remember(path.relative_to(root).as_posix(),
                    hashlib.sha256(raw).hexdigest())
    value = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(value, dict):
        raise ValueError('cached document must be a JSON object')
    return value


def _fingerprint_file(root: Path, path: Path, inputs: _InputHashes) -> None:
    inputs.remember(path.relative_to(root).as_posix(),
                    hashlib.sha256(path.read_bytes()).hexdigest())


def _source_files(root: Path) -> set[str]:
    """Inventory only source artifacts consumed by this audit, not private details."""
    paths = set()
    tree = root / 'area-tree-20261119'
    paths.update(tree.glob('responses/*.json'))
    if (tree / 'manifest.json').is_file():
        paths.add(tree / 'manifest.json')
    recapture = root / 'area-root-http-recapture-20261119'
    if recapture.is_dir():
        paths.update(path for path in recapture.rglob('*') if path.is_file())
    seed = root / 'national-area-tree-seeds-20261119.json'
    if seed.is_file():
        paths.add(seed)
    overlay = root / OVERLAY_SEED
    if overlay.is_file():
        paths.add(overlay)
        probe = root / 'area-level3-probe-20261119'
        paths.update(probe.glob('responses/*.json'))
        paths.update((probe / 'batch-runs').glob('*.status.json'))
        if (probe / 'manifest.json').is_file():
            paths.add(probe / 'manifest.json')
    for folder in root.glob('area-*'):
        if folder.is_dir() and LEGACY.match(folder.name):
            paths.update((folder / 'pages').glob('*.json'))
            if (folder / 'manifest.json').is_file():
                paths.add(folder / 'manifest.json')
    for name in ('national-area-first-pages-20261119',
                 'national-area-followup-pages-20261119',
                 'national-area-large-pages-20261119',
                 'national-level4-first-pages-v1',
                 'national-level4-followup-pages-v1',
                 'national-level4-large-pages-v1'):
        folder = root / name
        paths.update(path for path in folder.glob('area-*/pages/*.json')
                     if not path.name.endswith('.candidate.json'))
        if (folder / 'manifest.json').is_file():
            paths.add(folder / 'manifest.json')
    return {path.relative_to(root).as_posix() for path in paths}


def _raw_response(wrapper: dict, body: dict, *, tree: bool) -> bool:
    """Verify original bytes when present; identify legacy derived bytes."""
    encoded = wrapper.get('rawBodyBase64')
    if encoded is None:
        if tree:
            provenance = wrapper.get('provenance')
            if (not isinstance(provenance, dict)
                    or provenance.get('kind') != 'cached-json-payload'
                    or provenance.get('originalHttpBodyAvailable') is not False):
                raise ValueError('area response lacks source-byte provenance')
            derived = json.dumps(body, ensure_ascii=False, sort_keys=True,
                                 separators=(',', ':'), allow_nan=False).encode('utf-8')
            if hashlib.sha256(derived).hexdigest() != wrapper.get('responseSha256'):
                raise ValueError('derived area response hash mismatch')
        elif not SHA.fullmatch(str(wrapper.get('responseSha256', ''))):
            raise ValueError('list response hash missing')
        return False
    try:
        raw = base64.b64decode(encoded, validate=True)
        if json.loads(raw) != body:
            raise ValueError('original response differs from cached JSON')
    except (TypeError, ValueError) as error:
        raise ValueError('invalid original response bytes') from error
    if hashlib.sha256(raw).hexdigest() != wrapper.get('responseSha256'):
        raise ValueError('original response hash mismatch')
    return True


def _tree(root: Path, inputs: dict[str, str]) -> tuple[dict, dict, dict, set[str]]:
    folder = root / 'area-tree-20261119'
    manifest_path = folder / 'manifest.json'
    manifest = _read(root, manifest_path, inputs) if manifest_path.is_file() else {}
    by_id: dict[str, dict] = {}
    by_code: dict[str, dict] = {}
    children: dict[str, list[dict]] = {}
    missing_raw = 0
    missing_raw_parents = set()
    invalid_code_records = []
    for path in sorted((folder / 'responses').glob('*.json')):
        wrapper = _read(root, path, inputs)
        parent_id = path.stem
        if (wrapper.get('parentId') != parent_id or wrapper.get('method') != 'GET'
                or wrapper.get('sourceUrl') != TREE_URL + parent_id
                or wrapper.get('httpStatus') != 200):
            raise ValueError('invalid cached area request provenance')
        body = wrapper.get('response')
        if (not isinstance(body, dict) or body.get('code') != 0
                or not isinstance(body.get('data'), list)):
            raise ValueError('invalid cached area response')
        if not _raw_response(wrapper, body, tree=True):
            missing_raw += 1
            missing_raw_parents.add(parent_id)
        seen = set()
        for node in body['data']:
            if not isinstance(node, dict):
                raise ValueError('invalid official area node')
            identifier, code = node.get('id'), node.get('sbcode')
            if (not isinstance(identifier, str) or identifier == '-1'
                    or not NODE_ID.fullmatch(identifier)
                    or identifier in seen or node.get('pid') != parent_id
                    or type(node.get('level')) is not int
                    or not isinstance(node.get('name'), str)
                    or not node['name'].strip()):
                raise ValueError('invalid official area parent relationship')
            valid_code = isinstance(code, str) and CODE.fullmatch(code) is not None
            if code is not None and not valid_code and not KNOWN_INVALID_CODE(node):
                raise ValueError('invalid official area code')
            if KNOWN_INVALID_CODE(node):
                invalid_code_records.append(INVALID_CODE_RECORD(node, wrapper))
            if identifier in by_id and by_id[identifier] != node:
                raise ValueError('conflicting official area node')
            if valid_code and code in by_code and by_code[code] != node:
                raise ValueError('conflicting official area code')
            seen.add(identifier)
            by_id[identifier] = node
            if valid_code:
                by_code[code] = node
        children[parent_id] = body['data']
    response_count = len(children)
    max_level = manifest.get('maxLevel')
    expected_parents = {'-1'}
    reachable_ids = set()
    walked_parents = set()
    frontier = [('-1', 0)]
    while frontier:
        parent_id, parent_level = frontier.pop()
        if parent_id in walked_parents:
            continue
        walked_parents.add(parent_id)
        for node in children.get(parent_id, []):
            if node['level'] <= parent_level:
                raise ValueError('invalid official area parent relationship')
            reachable_ids.add(node['id'])
            if (type(max_level) is int and node['level'] < max_level
                    and (parent_id != '-1' or node.get('sbcode') is not None)):
                expected_parents.add(node['id'])
                frontier.append((node['id'], node['level']))
    for record in invalid_code_records:
        parent = by_id.get(record['sourceParentNodeId'])
        if parent is None or parent['level'] != 2:
            raise ValueError('invalid official area code')
    manifest_invalid = manifest.get('invalidCodeNodes', [])
    invalid_manifest_matches = bool(
        type(manifest.get('invalidCodeNodeCount', 0)) is int
        and manifest.get('invalidCodeNodeCount', 0) == len(invalid_code_records)
        and isinstance(manifest_invalid, list)
        and Counter(json.dumps(record, ensure_ascii=False, sort_keys=True)
                    for record in manifest_invalid)
            == Counter(json.dumps(record, ensure_ascii=False, sort_keys=True)
                       for record in invalid_code_records))
    closure_matches = (set(children) == expected_parents
                       and reachable_ids == set(by_id))
    complete = bool(manifest.get('treeWalkComplete') is True
                    and manifest.get('pendingParentIds') == []
                    and type(max_level) is int and max_level >= 3
                    and manifest.get('lastError') in (None, '')
                    and manifest.get('rateLimited') is False
                    and manifest.get('savedResponses') == response_count
                    and manifest.get('discoveredNodes') == len(by_id)
                    and closure_matches and invalid_manifest_matches
                    and all(node['level'] <= max_level for node in by_id.values()))
    info = {
        'cachedResponses': response_count, 'codedNodesObserved': len(by_code),
        'uncodedNodesObserved': sum(node.get('sbcode') is None
                                    for node in by_id.values()),
        'invalidCodeNodesObserved': len(invalid_code_records),
        'invalidCodeManifestMatchesObserved': invalid_manifest_matches,
        'rootResponseCached': '-1' in children,
        'treeWalkComplete': complete, 'responsesWithoutOriginalHttpBody': missing_raw,
        'childScopeBeyondTreeUnverified': (not complete or any(
            node['level'] >= max_level and node['id'] not in children
            for node in by_id.values())),
        'expectedResponsesForDeclaredDepth': len(expected_parents),
        'responseClosureMatchesDeclaredDepth': closure_matches,
    }
    return info, by_code, children, missing_raw_parents


def _root_recapture(root: Path, tree: dict, missing_parents: set[str],
                    inputs: _InputHashes) -> dict:
    """Recognize only the separate, fully checked HTTP proof for legacy roots."""
    result = {'verified': False, 'code': 'not_captured',
              'compensatedLegacyRootCount': 0}
    if not missing_parents:
        result['code'] = 'not_needed'
        return result
    folder = root / 'area-root-http-recapture-20261119'
    proof_files = sorted(path for path in folder.rglob('*') if path.is_file())
    for path in proof_files:
        _fingerprint_file(root, path, inputs)
    if not tree['treeWalkComplete']:
        result['code'] = 'tree_incomplete'
        return result
    if not (folder / 'manifest.json').is_file():
        return result
    try:
        state = ROOT_RECAPTURE_STATE(root)
        if state.get('complete') is not True:
            result['code'] = 'recapture_incomplete'
            return result
        manifest_path = folder / 'manifest.json'
        manifest = _read(root, manifest_path, inputs)
        if (len(missing_parents) != 2
                or set(manifest.get('parentIds', [])) != missing_parents
                or manifest.get('currentReproductionMatchesLockedPayload') is not True
                or state.get('manifestSha256') != inputs[
                    manifest_path.relative_to(root).as_posix()]):
            result['code'] = 'root_scope_or_payload_mismatch'
            return result
        for path in proof_files:
            _fingerprint_file(root, path, inputs)
        if inputs.changed:
            result['code'] = 'source_changed_during_audit'
            return result
    except (OSError, ValueError, RuntimeError, TypeError, KeyError):
        result['code'] = 'recapture_proof_invalid'
        return result
    return {'verified': True, 'code': 'verified',
            'compensatedLegacyRootCount': 2}


def _variant(params: dict) -> dict:
    check_sort, subsidy = params.get('checkSort'), params.get('ahae0635')
    if (check_sort not in (None, 0, 1, '0', '1')
            or subsidy not in (None, 0, 1, '0', '1')
            or type(check_sort) is bool or type(subsidy) is bool):
        raise ValueError('unsupported list query variant')
    return {'checkSort': check_sort, 'ahae0635': subsidy}


def _page(root: Path, path: Path, inputs: dict[str, str], code: str,
          number: int, variant: dict) -> dict:
    wrapper = _read(root, path, inputs)
    request = wrapper.get('request')
    params = request.get('params') if isinstance(request, dict) else None
    if (not isinstance(params, dict) or request.get('url') != LIST_URL
            or request.get('method') != 'POST' or wrapper.get('httpStatus') != 200
            or params.get('areaCode') != code or type(params.get('current')) is not int
            or params['current'] != number or type(params.get('size')) is not int
            or params['size'] < 1 or _variant(params) != variant
            or set(params) - {'current', 'size', 'areaCode', 'checkSort', 'ahae0635'}):
        raise ValueError('cached list query differs from partition')
    body = wrapper.get('response')
    data = body.get('data') if isinstance(body, dict) else None
    if (not isinstance(body, dict) or body.get('code') != 0
            or not isinstance(data, dict) or type(data.get('current')) is not int
            or data['current'] != number or type(data.get('total')) is not int
            or data['total'] < 0 or type(data.get('size')) is not int
            or data['size'] < 1 or not isinstance(data.get('records'), list)
            or len(data['records']) > data['size']):
        raise ValueError('cached list page is malformed')
    original = _raw_response(wrapper, body, tree=False)
    ids, direct = [], set()
    for row in data['records']:
        identifier = row.get('axbe0001') if isinstance(row, dict) else None
        if not isinstance(identifier, str) or not identifier:
            raise ValueError('cached list row lacks institution ID')
        ids.append(identifier)
        if row.get('areaCode') == code:
            direct.add(identifier)
    return {'total': data['total'], 'size': data['size'], 'ids': ids,
            'direct': direct, 'original': original,
            'requestedSize': params['size']}


def _capture(root: Path, inputs: dict[str, str], *, code: str,
             capture_id: str, source: str, variant: dict,
             baseline_total: int, baseline_size: int, files: dict[int, Path],
             expected_pages: int | None = None,
             wrong_mode_pages: tuple[int, ...] = (),
             first_manifest_verified: bool | None = None,
             first_manifest_reason: str | None = None) -> tuple[dict, set[str], set[str]]:
    if (not CODE.fullmatch(code) or type(baseline_total) is not int
            or baseline_total < 0 or type(baseline_size) is not int
            or baseline_size < 1):
        raise ValueError('invalid partition pagination baseline')
    expected = math.ceil(baseline_total / baseline_size)
    if expected_pages is not None and expected_pages != expected:
        raise ValueError('manifest page count differs from total and size')
    expected_observation_pages = set(range(1, max(1, expected) + 1))
    valid = {}
    invalid, extra = [], []
    for number, path in sorted(files.items()):
        if number not in expected_observation_pages:
            extra.append(number)
            _fingerprint_file(root, path, inputs)
            continue
        try:
            valid[number] = _page(root, path, inputs, code, number, variant)
        except (OSError, ValueError, TypeError, KeyError):
            invalid.append(number)
    missing = sorted(expected_observation_pages - set(valid))
    total_drift = [{'page': n, 'reportedTotal': page['total']}
                   for n, page in valid.items() if page['total'] != baseline_total]
    size_drift = [{'page': n, 'serverPageSize': page['size']}
                  for n, page in valid.items() if page['size'] != baseline_size]
    wrong_length = [n for n, page in valid.items()
                    if len(page['ids']) != min(baseline_size,
                                               max(0, baseline_total - (n - 1) * baseline_size))]
    pages_per_id = defaultdict(set)
    flat = []
    direct = set()
    for number, page in valid.items():
        flat.extend(page['ids'])
        direct.update(page['direct'])
        for identifier in page['ids']:
            pages_per_id[identifier].add(number)
    ids = set(flat)
    repeated = sum(len(pages) > 1 for pages in pages_per_id.values())
    same_page = sum(sum(count > 1 for count in Counter(page['ids']).values())
                    for page in valid.values())
    missing_raw = sum(not page['original'] for page in valid.values())
    zero_without_first = baseline_total == 0 and 1 not in valid
    page_complete = bool(valid) and not (missing or invalid or extra or wrong_mode_pages
                         or total_drift or size_drift
                         or wrong_length or repeated or same_page or missing_raw
                         or first_manifest_verified is False
                         or len(flat) != baseline_total
                         or len(ids) != baseline_total)
    summary = {
        'areaCode': code, 'captureId': capture_id, 'source': source,
        'queryVariant': variant,
        'firstPageTotal': baseline_total, 'serverPageSize': baseline_size,
        'expectedPages': expected, 'validPages': sorted(valid),
        'missingPages': missing, 'invalidPages': invalid, 'extraPages': extra,
        'wrongModeCachedPages': list(wrong_mode_pages),
        'totalDrift': total_drift, 'sizeDrift': size_drift,
        'pageLengthMismatchPages': wrong_length,
        'crossPageDuplicateIdCount': repeated,
        'samePageDuplicateIdCount': same_page,
        'duplicateRowCount': len(flat) - len(ids),
        'observedRows': len(flat), 'observedUniqueIds': len(ids),
        'observedDirectIds': len(direct),
        'pagesWithoutOriginalHttpBody': missing_raw,
        'firstPageManifestHashVerified': first_manifest_verified,
        'serverPageSizeCapped': any(page['requestedSize'] != page['size']
                                    for page in valid.values()),
        'pageEvidenceComplete': page_complete,
        'zeroOmissionProven': False,
        'reasons': ([reason for condition, reason in (
            (bool(missing), 'missing_pages'), (bool(invalid), 'invalid_pages'),
            (bool(extra), 'extra_pages'),
            (bool(wrong_mode_pages), 'wrong_followup_mode_cache'),
            (bool(total_drift), 'total_drift'), (bool(size_drift), 'size_drift'),
            (bool(repeated), 'cross_page_duplicates'),
            (bool(same_page), 'same_page_duplicates'),
            (bool(missing_raw), 'original_http_body_unavailable'),
            (zero_without_first, 'zero_total_without_first_page'),
            (bool(first_manifest_reason), first_manifest_reason),
            (bool(wrong_length), 'page_length_mismatch'),
        ) if condition] + ['no_frozen_snapshot_or_unique_id_order']),
    }
    return summary, ids, direct


def _legacy(root: Path, inputs: dict[str, str]) -> list[tuple[dict, set, set]]:
    captures = []
    for folder in sorted(root.glob('area-*')):
        match = LEGACY.match(folder.name)
        if match is None:
            continue
        manifest_path = folder / 'manifest.json'
        if not folder.is_dir() or not manifest_path.is_file():
            continue
        manifest = _read(root, manifest_path, inputs)
        filters = manifest.get('filters')
        code = filters.get('areaCode') if isinstance(filters, dict) else None
        if match is None or match.group(1) != code:
            raise ValueError('legacy capture code differs from manifest')
        variant = _variant(filters)
        files = {}
        for path in sorted((folder / 'pages').glob('*.json')):
            if not PAGE.fullmatch(path.name):
                raise ValueError('unexpected legacy page filename')
            files[int(path.stem)] = path
        captures.append(_capture(
            root, inputs, code=code,
            capture_id='legacy-' + hashlib.sha256(folder.name.encode('utf-8')).hexdigest(),
            source='legacy-capture', variant=variant,
            baseline_total=manifest.get('total'),
            baseline_size=manifest.get('serverPageSize'),
            expected_pages=manifest.get('expectedPages'), files=files))
    return captures


def _modern(root: Path, inputs: dict[str, str], *, level4=False) -> tuple[list[tuple[dict, set, set]], list[dict]]:
    first = root / ('national-level4-first-pages-v1' if level4 else
                    'national-area-first-pages-20261119')
    small = root / ('national-level4-followup-pages-v1' if level4 else
                    'national-area-followup-pages-20261119')
    large = root / ('national-level4-large-pages-v1' if level4 else
                    'national-area-large-pages-20261119')
    first_manifest = None
    for folder in (first, small, large):
        manifest = folder / 'manifest.json'
        if manifest.is_file():
            document = _read(root, manifest, inputs)
            if folder == first:
                first_manifest = document
    seed = root / (OVERLAY_SEED if level4 else
                   'national-area-tree-seeds-20261119.json')
    if seed.is_file():
        _read(root, seed, inputs)
    captures = []
    first_codes = set()
    for folder in sorted(first.glob('area-*')):
        if not folder.is_dir():
            continue
        code = folder.name.removeprefix('area-')
        if not CODE.fullmatch(code):
            raise ValueError('invalid modern area folder code')
        first_path = folder / 'pages' / '00001.json'
        if not first_path.is_file():
            raise ValueError('modern first-page checkpoint missing')
        first_codes.add(code)
        variant = {'checkSort': 1, 'ahae0635': None}
        baseline = _page(root, first_path, inputs, code, 1, variant)
        relative_first = first_path.relative_to(root).as_posix()
        observations = first_manifest.get('observations') if first_manifest else None
        observation = observations.get(code) if isinstance(observations, dict) else None
        stored_hash = (observation.get('storedFileSha256')
                       if isinstance(observation, dict) else None)
        first_verified = bool(isinstance(stored_hash, str)
                              and SHA.fullmatch(stored_hash)
                              and stored_hash == inputs[relative_first])
        first_reason = (None if first_verified else
                        'first_page_manifest_missing' if first_manifest is None else
                        'first_page_manifest_hash_mismatch')
        expected = math.ceil(baseline['total'] / baseline['size'])
        followup = small if expected <= 3 else large
        other_mode = large if expected <= 3 else small
        files = {1: first_path}
        page_dir = followup / folder.name / 'pages'
        for path in sorted(page_dir.glob('*.json')):
            if path.name.endswith('.candidate.json'):
                continue
            if not PAGE.fullmatch(path.name) or int(path.stem) == 1:
                raise ValueError('unexpected modern followup page filename')
            files[int(path.stem)] = path
        wrong_mode = []
        for path in sorted((other_mode / folder.name / 'pages').glob('*.json')):
            if path.name.endswith('.candidate.json'):
                continue
            if not PAGE.fullmatch(path.name):
                raise ValueError('unexpected wrong-mode page filename')
            wrong_mode.append(int(path.stem))
            _fingerprint_file(root, path, inputs)
        capture = _capture(
            root, inputs, code=code,
            capture_id=('national-level4-pages-' if level4 else
                        'national-area-pages-') + code,
            source=('level4-first-followup' if expected <= 3 else
                    'level4-first-large') if level4 else
                    ('first-followup' if expected <= 3 else 'first-large'),
            variant=variant, baseline_total=baseline['total'],
            baseline_size=baseline['size'], files=files,
            wrong_mode_pages=tuple(wrong_mode),
            first_manifest_verified=first_verified,
            first_manifest_reason=first_reason)
        if relative_first in inputs.changed:
            capture[0]['firstPageManifestHashVerified'] = False
            capture[0]['pageEvidenceComplete'] = False
            capture[0]['reasons'].append('first_page_changed_during_audit')
        captures.append(capture)
    orphans = []
    for mode, directory in (('followup', small), ('large', large)):
        for folder in sorted(directory.glob('area-*')):
            if not folder.is_dir():
                continue
            code = folder.name.removeprefix('area-')
            if not CODE.fullmatch(code):
                raise ValueError('invalid modern followup area folder code')
            if code in first_codes:
                continue
            numbers = []
            for path in sorted((folder / 'pages').glob('*.json')):
                if path.name.endswith('.candidate.json'):
                    continue
                if not PAGE.fullmatch(path.name):
                    raise ValueError('unexpected orphan followup page filename')
                numbers.append(int(path.stem))
                _fingerprint_file(root, path, inputs)
            if numbers:
                orphans.append({'areaCode': code, 'mode': mode,
                                'cachedPages': numbers})
    return captures, orphans


def _best(captures: list[tuple[dict, set, set]]) -> tuple[dict, set, set]:
    return max(captures, key=lambda item: (
        item[0]['pageEvidenceComplete'],
        len(item[0]['validPages']) / max(1, item[0]['expectedPages']),
        item[0]['observedUniqueIds'], item[0]['captureId']))


def _official_overlay(root, inputs, by_code, children):
    """Extend comparisons only with a fully reaudited official overlay."""
    seed = root / OVERLAY_SEED
    if not seed.is_file():
        return {'sourceVerified': False, 'codedNodeCount': 0,
                'uncodedNodeCount': 0}
    builder = runpy.run_path(
        str(Path(__file__).resolve().with_name('build-mca-level4-overlay-seeds.py')),
        run_name='mca_list_coverage_level4_source')
    document, _sha = builder['load_verified_overlay'](
        seed, root / 'area-tree-20261119')
    _fingerprint_file(root, seed, inputs)
    probe = root / 'area-level3-probe-20261119'
    for path in (*probe.glob('responses/*.json'),
                 *(probe / 'batch-runs').glob('*.status.json'),
                 probe / 'manifest.json'):
        _fingerprint_file(root, path, inputs)
    for row in (*document['seeds'], *document['uncodedNodes']):
        node = row['rawNode']
        children.setdefault(row['sourceParentNodeId'], []).append(node)
        code = row['sbcode']
        if code is not None:
            if code in by_code:
                raise ValueError('overlay code overlaps observed official tree')
            by_code[code] = node
    return {'sourceVerified': True, 'codedNodeCount': document['seedCount'],
            'uncodedNodeCount': document['uncodedNodeCount']}


def audit_cache(root: Path = ROOT) -> dict:
    """Audit one private cache root without acquiring a collector lock or writing."""
    root = Path(root)
    initial_inventory = _source_files(root)
    inputs = _InputHashes()
    tree, by_code, children, missing_raw_parents = _tree(root, inputs)
    tree['rootRecapture'] = _root_recapture(root, tree, missing_raw_parents,
                                            inputs)
    official_overlay = _official_overlay(root, inputs, by_code, children)
    modern_captures, orphans = _modern(root, inputs)
    level4_captures, level4_orphans = _modern(root, inputs, level4=True)
    captures = _legacy(root, inputs) + modern_captures + level4_captures
    orphans.extend(level4_orphans)
    # Group by validated query code, not a display label or total.
    grouped = defaultdict(list)
    for capture in captures:
        grouped[capture[0]['areaCode']].append(capture)
    partitions = {}
    selected = {}
    for code, items in sorted(grouped.items()):
        captures_out = [item[0] for item in items]
        variants = {(item[0]['queryVariant']['checkSort'],
                     item[0]['queryVariant']['ahae0635']) for item in items}
        by_variant = []
        for variant in sorted(variants, key=lambda value: (str(value[0]), str(value[1]))):
            options = [item for item in items if (
                item[0]['queryVariant']['checkSort'],
                item[0]['queryVariant']['ahae0635']) == variant]
            totals = sorted({item[0]['firstPageTotal'] for item in options})
            by_variant.append({'queryVariant': options[0][0]['queryVariant'],
                               'captureCount': len(options), 'firstPageTotals': totals,
                               'betweenCaptureTotalDrift': len(totals) > 1})
            selected[(code, variant)] = _best(options)
        partitions[code] = {
            'captureCount': len(items), 'firstPageTotalsByQueryVariant': by_variant,
            'betweenCaptureTotalDrift': any(item['betweenCaptureTotalDrift']
                                            for item in by_variant),
            'captures': captures_out,
        }
    comparisons = []
    for (parent_code, variant), (parent, parent_ids, direct) in sorted(
            selected.items(), key=lambda item: (item[0][0], str(item[0][1]))):
        node = by_code.get(parent_code)
        if node is None or node['id'] not in children:
            continue
        official_children = children[node['id']]
        child_codes = [item['sbcode'] for item in official_children
                       if isinstance(item.get('sbcode'), str)
                       and CODE.fullmatch(item['sbcode'])]
        present = [selected[(code, variant)] for code in child_codes
                   if (code, variant) in selected]
        child_ids = set().union(*(item[1] for item in present)) if present else set()
        missing = sum((code, variant) not in selected for code in child_codes)
        comparisons.append({
            'parentCode': parent_code, 'queryVariant': parent['queryVariant'],
            'parentCapture': parent['captureId'],
            'officialCodedChildCount': len(child_codes),
            'uncodedChildCount': sum(item.get('sbcode') is None
                                     for item in official_children),
            'invalidCodeChildCount': sum(KNOWN_INVALID_CODE(item)
                                         for item in official_children),
            'missingChildCaptureCount': missing,
            'observedParentOnlyCount': len(parent_ids - child_ids),
            'observedChildOutsideParentCount': len(child_ids - parent_ids),
            'observedDirectCount': len(direct),
            'observedParentOnlyWithoutDirectCodeCount': len((parent_ids - child_ids) - direct),
            'directSeenInChildCount': len(direct & child_ids),
            'comparisonProven': False,
            'reason': 'different_collection_windows_and_unfrozen_offset_pages',
        })
    cached_page_codes = {
        code for code, items in grouped.items()
        if any(any(capture[0][field] for field in (
            'validPages', 'invalidPages', 'extraPages', 'wrongModeCachedPages'))
               for capture in items)
    }
    queried = cached_page_codes & set(by_code)
    reasons = ['no_frozen_snapshot_or_unique_id_order',
               'parent_direct_residual_not_proven_exhaustive',
               'details_and_publication_not_audited']
    if not tree['treeWalkComplete']:
        reasons.append('official_area_tree_incomplete')
    if (tree['responsesWithoutOriginalHttpBody']
            and not tree['rootRecapture']['verified']):
        reasons.append('area_tree_original_http_body_missing')
    if tree['childScopeBeyondTreeUnverified']:
        reasons.append('deeper_area_child_scope_unverified')
    if tree['uncodedNodesObserved']:
        reasons.append('uncoded_official_area_nodes_need_review')
    if tree['invalidCodeNodesObserved']:
        reasons.append('invalid_official_area_code_coverage_gap')
    if len(queried) < len(by_code):
        reasons.append('official_area_queries_not_all_cached')
    cached_outside_tree = len(cached_page_codes - set(by_code))
    if cached_outside_tree:
        reasons.append('cached_partition_outside_observed_tree')
    if level4_captures and not official_overlay['sourceVerified']:
        reasons.append('level4_overlay_source_missing')
    if any(not item[0]['pageEvidenceComplete'] for item in captures):
        reasons.append('cached_partition_pagination_incomplete_or_unstable')
    if orphans:
        reasons.append('orphan_followup_without_first_page')
    unreviewed = sorted(initial_inventory - set(inputs))
    for relative in unreviewed:
        _fingerprint_file(root, root / relative, inputs)
    if unreviewed:
        reasons.append('unreviewed_cached_source_files')
    final_inventory = _source_files(root)
    changed_inputs = []
    for relative, expected_hash in sorted(inputs.items()):
        try:
            actual_hash = hashlib.sha256((root / relative).read_bytes()).hexdigest()
        except OSError:
            actual_hash = None
        if actual_hash != expected_hash:
            changed_inputs.append(relative)
    source_changed = bool(changed_inputs or inputs.changed
                          or initial_inventory != final_inventory)
    tree_changed = any(path.startswith('area-tree-20261119/') for path in (
        set(changed_inputs) | inputs.changed | (initial_inventory ^ final_inventory)))
    if tree_changed:
        tree['treeWalkComplete'] = False
        tree['responseClosureMatchesDeclaredDepth'] = False
        tree['childScopeBeyondTreeUnverified'] = True
        if 'official_area_tree_incomplete' not in reasons:
            reasons.append('official_area_tree_incomplete')
        if 'deeper_area_child_scope_unverified' not in reasons:
            reasons.append('deeper_area_child_scope_unverified')
        reasons.append('area_tree_changed_during_audit')
    if source_changed:
        reasons.append('source_changed_during_audit')
        if tree['rootRecapture']['verified']:
            tree['rootRecapture'] = {
                'verified': False, 'code': 'source_changed_during_audit',
                'compensatedLegacyRootCount': 0,
            }
            reasons.append('area_tree_original_http_body_missing')
    fingerprint = hashlib.sha256(json.dumps(
        {'schemaVersion': 1, 'inputs': sorted(inputs.items())},
        separators=(',', ':'), sort_keys=True).encode('utf-8')).hexdigest()
    return {
        'schemaVersion': 1, 'scope': 'private-offline-cached-observations-only',
        'nationalComplete': False, 'snapshotVerified': False, 'publishable': False,
        'sourceTree': tree,
        'officialLevel4Overlay': official_overlay,
        'summary': {
            'partitionCountWithCachedPages': len(cached_page_codes),
            'captureCount': len(captures),
            'queryableTreeAreasWithoutCachedPages': len(by_code) - len(queried),
            'invalidOfficialAreaCodeNodeCount': tree['invalidCodeNodesObserved'],
            'cachedAreaCodesNotInObservedTreeCount': cached_outside_tree,
            'nationalTotal': None, 'zeroOmissionProven': False,
            'sourceChangedDuringAudit': source_changed,
            'unreviewedCachedSourceFileCount': len(unreviewed),
            'reasons': reasons,
        },
        'partitions': partitions, 'parentChildComparisons': comparisons,
        'orphanModernCheckpoints': orphans,
        'auditFingerprintSha256': fingerprint, 'fingerprintedInputFileCount': len(inputs),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args(argv)
    print(json.dumps(audit_cache(args.root), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
