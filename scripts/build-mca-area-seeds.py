"""Build private, auditable list-query seeds from a complete official area tree.

No network requests are made. An incomplete or inconsistent tree produces no
output. These are administrative area seeds, not institution records.
"""

from __future__ import annotations

import argparse
from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy


PROJECT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
DEFAULT_TREE = PRIVATE_ROOT / 'area-tree-20261119'
DEFAULT_OUTPUT = PRIVATE_ROOT / 'national-area-tree-seeds-20261119.json'
COLLECTOR = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-area-tree.py'),
                           run_name='mca_area_tree_collector')
CHECK_RESPONSE = COLLECTOR['checked_response']
KNOWN_INVALID_CODE = COLLECTOR['known_invalid_code']
SITE_LOCK = COLLECTOR['CORE']['exclusive_run_lock']
MAX_LEVEL = 3


def read_json(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError(f'{path.name}: missing or unreadable') from error
    if not isinstance(value, dict):
        raise ValueError(f'{path.name}: expected JSON object')
    return value


def checked_time(value, label):
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError('timezone missing')
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError) as error:
        raise ValueError(f'{label}: invalid UTC timestamp') from error


def checked_manifest(tree):
    path = tree / 'manifest.json'
    try:
        raw = path.read_bytes()
        manifest = json.loads(raw)
    except (OSError, ValueError) as error:
        raise ValueError('tree manifest missing or unreadable') from error
    if not isinstance(manifest, dict):
        raise ValueError('tree manifest must be a JSON object')
    if (manifest.get('schemaVersion') != 1
            or manifest.get('scope') != 'coded-mainland-roots-through-level-3'
            or type(manifest.get('maxLevel')) is not int
            or manifest['maxLevel'] != MAX_LEVEL
            or manifest.get('treeWalkComplete') is not True
            or manifest.get('rateLimited') is not False
            or manifest.get('lastError') is not None
            or manifest.get('pendingParentIds') != []):
        raise ValueError('official area tree must be complete and error-free')
    for field in ('savedResponses', 'discoveredNodes', 'rootNodes',
                  'queryableRootNodes', 'excludedRootNodes'):
        if type(manifest.get(field)) is not int or manifest[field] < 0:
            raise ValueError(f'tree manifest {field} invalid')
    checked_time(manifest.get('auditedAtUtc'), 'tree audit')
    return manifest, hashlib.sha256(raw).hexdigest()


def build_seeds(tree):
    """Validate every expected cached response and preserve source hierarchy."""
    tree = Path(tree)
    manifest, manifest_sha = checked_manifest(tree)
    responses = tree / 'responses'
    queue = deque([('-1', 0, [])])
    expected_parent_ids = set()
    nodes = []
    node_ids = set()
    sbcodes = set()
    children_per_parent = {}
    fetched_times = []
    invalid_code_nodes = []
    while queue:
        parent_id, parent_level, parent_path = queue.popleft()
        if parent_id in expected_parent_ids:
            raise ValueError(f'{parent_id}: duplicate parent visit')
        expected_parent_ids.add(parent_id)
        response_path = responses / f'{parent_id}.json'
        wrapper = read_json(response_path)
        children = CHECK_RESPONSE(wrapper, parent_id, parent_level)
        fetched = checked_time(wrapper.get('fetchedAtUtc'), parent_id + ' fetch')
        fetched_times.append(fetched)
        children_per_parent[parent_id] = len(children)
        for child in children:
            identifier = child['id']
            if identifier in node_ids:
                raise ValueError(f'{identifier}: duplicate official node ID')
            node_ids.add(identifier)
            level = child['level']
            if level > MAX_LEVEL:
                raise ValueError(f'{identifier}: level exceeds complete tree scope')
            code = child.get('sbcode')
            if KNOWN_INVALID_CODE(child):
                invalid_code_nodes.append(COLLECTOR['invalid_code_record'](child, wrapper))
            if code is not None:
                if code in sbcodes:
                    raise ValueError(f'{code}: duplicate sbcode')
                sbcodes.add(code)
            path_ids = [*parent_path, identifier]
            nodes.append({
                'sourceNodeId': identifier,
                'sourceParentNodeId': child['pid'],
                'level': level, 'name': child['name'], 'sbcode': code,
                'rawNode': child,
                'officialPathNodeIds': path_ids,
                'sourceResponsePath': f'responses/{parent_id}.json',
                'sourceResponseSha256': wrapper['responseSha256'],
                'sourceFetchedAtUtc': fetched.isoformat(),
            })
            # The collector deliberately excludes uncoded first-level roots.
            if level < MAX_LEVEL and (parent_id != '-1' or code is not None):
                queue.append((identifier, level, path_ids))
    actual_files = {path.stem for path in responses.glob('*.json')}
    if actual_files != expected_parent_ids:
        missing = sorted(expected_parent_ids - actual_files)
        extra = sorted(actual_files - expected_parent_ids)
        raise ValueError(f'tree response inventory differs: missing={missing[:5]}, extra={extra[:5]}')
    if len(actual_files) != manifest['savedResponses']:
        raise ValueError('tree response count differs from manifest')
    if len(nodes) != manifest['discoveredNodes']:
        raise ValueError('tree node count differs from manifest')
    if (manifest.get('invalidCodeNodeCount', 0) != len(invalid_code_nodes)
            or manifest.get('invalidCodeNodes', []) != invalid_code_nodes):
        raise ValueError('tree invalid-code coverage gaps differ from manifest')
    roots = [item for item in nodes if item['sourceParentNodeId'] == '-1']
    if (len(roots) != manifest['rootNodes']
            or sum(item['sbcode'] is not None for item in roots)
               != manifest['queryableRootNodes']
            or sum(item['sbcode'] is None for item in roots)
               != manifest['excludedRootNodes']):
        raise ValueError('root counts differ from manifest')
    seeds = []
    uncoded = []
    node_by_id = {item['sourceNodeId']: item for item in nodes}
    for item in nodes:
        child_count = children_per_parent.get(item['sourceNodeId'])
        # level 3 was not queried for children; do not claim it is a leaf.
        observed_children = child_count is not None and child_count > 0
        direct_hang_status = ('child_scope_not_enumerated' if child_count is None
                              else 'pending_review' if observed_children
                              else 'no_observed_children')
        row = {**item, 'observedChildCount': child_count,
               'queryable': item['sbcode'] is not None and not KNOWN_INVALID_CODE(item['rawNode']),
               'directHangReviewRequired': observed_children,
               'directHangStatus': direct_hang_status,
               'childEnumerationComplete': child_count is not None,
               'uncodedAncestorReviewRequired': any(
                   node_by_id[ancestor_id]['sbcode'] is None
                   for ancestor_id in item['officialPathNodeIds'][:-1])}
        if KNOWN_INVALID_CODE(row['rawNode']):
            # Legacy bucket is also used by ID-based child probes. Preserve
            # this node there, but never admit its malformed code to seeds.
            uncoded.append({**row, 'coverageReviewRequired': True, 'coverageGap': True,
                            'reason': 'invalid_official_sbcode',
                            'evidenceResponseSha256': COLLECTOR['INVALID_CODE_EVIDENCE_SHA256']})
        elif row['sbcode'] is None:
            uncoded.append({**row, 'coverageReviewRequired': True,
                            'reason': ('outside_coded_root_scope'
                                       if row['sourceParentNodeId'] == '-1'
                                       else 'missing_official_sbcode')})
        else:
            seeds.append(row)
    return {
        'schemaVersion': 1, 'kind': 'mca-official-area-list-query-seeds',
        'scope': manifest['scope'], 'treeWalkComplete': True,
        'snapshotVerified': False, 'publishable': False,
        'sourceTreeManifestPath': str(tree / 'manifest.json'),
        'sourceTreeManifestSha256': manifest_sha,
        'treeAuditAtUtc': manifest['auditedAtUtc'],
        'sourceFetchFirstUtc': min(fetched_times).isoformat(),
        'sourceFetchLastUtc': max(fetched_times).isoformat(),
        'nodeCount': len(nodes), 'seedCount': len(seeds),
        'uncodedNodeCount': len(uncoded),
        'missingCodeNodeCount': sum(row['sbcode'] is None for row in uncoded),
        'invalidCodeNodeCount': len(invalid_code_nodes),
        'invalidCodeNodes': invalid_code_nodes,
        'directHangReviewSeedCount': sum(row['directHangReviewRequired']
                                         for row in seeds),
        'seeds': seeds, 'uncodedNodes': uncoded,
    }


def write_seeds(tree, output):
    tree, output = Path(tree), Path(output)
    if output.parent.resolve() != tree.parent.resolve():
        raise ValueError('seed output must be beside the private tree directory')
    # The source collector holds this same lock during every network pass.
    with SITE_LOCK(tree.parent):
        document = build_seeds(tree)
        temporary = output.with_suffix(output.suffix + '.tmp')
        temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n',
                             encoding='utf-8')
        os.chmod(temporary, 0o600)
        os.replace(temporary, output)
    return document


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tree-dir', type=Path, default=DEFAULT_TREE)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    document = write_seeds(args.tree_dir, args.output)
    print(json.dumps({key: document[key] for key in (
        'nodeCount', 'seedCount', 'uncodedNodeCount',
        'directHangReviewSeedCount', 'treeWalkComplete', 'publishable')},
        ensure_ascii=False))


if __name__ == '__main__':
    main()
