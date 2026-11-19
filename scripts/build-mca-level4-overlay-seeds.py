"""Build a private, immutable level-four overlay from terminal audited probe bytes.

The default command is a read-only preflight. --write never requests the MCA
site, changes the bound level-three seed, or publishes directory data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'data/private/mca-institutions-2026-11-18'
DEFAULT_TREE = ROOT / 'area-tree-20261119'
DEFAULT_PROBE = ROOT / 'area-level3-probe-20261119'
DEFAULT_OUTPUT = ROOT / 'national-area-level4-overlay-seeds.v1.json'
PROBE = runpy.run_path(str(PROJECT / 'scripts/probe-mca-level3-children.py'),
                       run_name='mca_level4_probe_source')
BUILDER = PROBE['BUILDER']
SITE_LOCK = BUILDER['SITE_LOCK']


def decode_document(raw: bytes, label: str) -> dict:
    try:
        document = json.loads(raw)
    except ValueError as error:
        raise RuntimeError(f'{label} unreadable') from error
    if not isinstance(document, dict):
        raise RuntimeError(f'{label} must be a JSON object')
    return document


def read_document(path: Path, label: str) -> tuple[dict, str]:
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise RuntimeError(f'{label} missing or unreadable') from error
    return decode_document(raw, label), hashlib.sha256(raw).hexdigest()


def _pending(reason: str) -> dict:
    # Absence of a terminal probe is unknown, never an observed zero.
    return {'status': 'pending', 'reason': reason, 'outputWritten': False}


def _terminal_audit(tree: Path, probe: Path) -> dict:
    if tree.parent.resolve() != probe.parent.resolve():
        raise ValueError('tree and probe must share the same private source root')
    source = BUILDER['build_seeds'](tree)
    plan = PROBE['source_plan'](tree)
    source_bytes = json.dumps(source, ensure_ascii=False, sort_keys=True,
                              separators=(',', ':')).encode('utf-8')
    if hashlib.sha256(source_bytes).hexdigest() != plan['sourceFingerprint']:
        raise RuntimeError('tree source fingerprint differs between audited reads')
    cache = PROBE['scan_cache'](plan, probe)
    manifest, manifest_sha = read_document(probe / 'manifest.json', 'probe manifest')
    if (manifest.get('schemaVersion') != 1
            or manifest.get('kind') != 'mca-level3-child-probe'
            or manifest.get('sourceFingerprint') != plan['sourceFingerprint']
            or manifest.get('sourceTreeManifestSha256') != plan['sourceTreeManifestSha256']
            or manifest.get('plannedParentCount') != len(plan['parents'])
            or manifest.get('activeBatch') is not None
            or manifest.get('allLevel3ChildrenEnumerated') is not True
            or manifest.get('pendingParents') != 0
            or any(manifest.get(key) != value for key, value in cache.items()
                   if key != 'pendingIds')):
        raise RuntimeError('probe manifest source or terminal inventory differs')
    response_dir = probe / 'responses'
    responses = {}
    for parent in plan['parents']:
        parent_id = parent['id']
        path = response_dir / f'{parent_id}.json'
        try:
            raw = path.read_bytes()
        except OSError as error:
            raise RuntimeError('response inventory changed after audit') from error
        responses[parent_id] = (decode_document(raw, 'probe response'),
                                hashlib.sha256(raw).hexdigest())

    inventory_by_count = {}

    def inventory_at(saved: int) -> str:
        if saved not in inventory_by_count:
            digest = hashlib.sha256()
            prefix = sorted(plan['parents'][:saved],
                            key=lambda item: response_dir / f"{item['id']}.json")
            for item in prefix:
                parent_id = item['id']
                file_sha = responses[parent_id][1]
                digest.update(f'{parent_id}.json'.encode('utf-8') + b'\0'
                              + bytes.fromhex(file_sha))
            inventory_by_count[saved] = digest.hexdigest()
        return inventory_by_count[saved]

    if inventory_at(len(plan['parents'])) != cache['responseInventorySha256']:
        raise RuntimeError('response inventory changed after audit')
    for parent in plan['parents']:
        parent_id = parent['id']
        wrapper = responses[parent_id][0]
        if not isinstance(wrapper.get('rawBodyBase64'), str):
            raise RuntimeError(f'{parent_id}: original HTTP response bytes required')
        PROBE['checked_children'](wrapper, parent_id)
    runs = probe / 'batch-runs'
    paths = sorted(runs.iterdir()) if runs.exists() else []
    pattern = PROBE['STATUS_NAME']
    if (not paths or any(not path.is_file() or pattern.fullmatch(path.name) is None
                         for path in paths)
            or [int(pattern.fullmatch(path.name).group(1)) for path in paths]
               != list(range(1, len(paths) + 1))
            or manifest.get('lastBatchNumber') != len(paths)):
        raise RuntimeError('probe batch status chain incomplete')
    final_sha = None
    previous_saved = -1
    for number, path in enumerate(paths, 1):
        status, status_sha = read_document(path, 'probe batch status')
        saved = status.get('savedResponses')
        if (status.get('schemaVersion') != 1
                or status.get('batchNumber') != number
                or status.get('phase') != 'finished'
                or status.get('outcome') != ('complete' if number == len(paths) else 'partial')
                or status.get('sourceFingerprint') != plan['sourceFingerprint']
                or status.get('plannedParentCount') != len(plan['parents'])
                or status.get('rateLimited') is not False
                or status.get('error') is not None
                or type(saved) is not int or not previous_saved <= saved <= len(plan['parents'])
                or status.get('pendingParents') != len(plan['parents']) - saved):
            raise RuntimeError('probe batch status chain invalid or incomplete')
        if status.get('responseInventorySha256') != inventory_at(saved):
            raise RuntimeError('batch response inventory differs from source bytes')
        previous_saved = saved
        if number == len(paths):
            if any(status.get(key) != cache[key] for key in (
                    'savedResponses', 'pendingParents', 'responseInventorySha256')):
                raise RuntimeError('final probe batch differs from response inventory')
            final_sha = status_sha
    if not cache['allLevel3ChildrenEnumerated']:
        raise RuntimeError('level-three children have not all been enumerated')
    return {'source': source, 'plan': plan, 'cache': cache,
            'responses': responses, 'probeManifestSha256': manifest_sha,
            'finalBatchSha256': final_sha}


def preflight(tree: Path = DEFAULT_TREE, probe: Path = DEFAULT_PROBE) -> dict:
    """Audit only terminal input; report pending without invented node counts."""
    tree, probe = Path(tree), Path(probe)
    tree_manifest_path = tree / 'manifest.json'
    if not tree_manifest_path.exists():
        return _pending('area-tree-manifest-not-yet-available')
    tree_manifest, _ = read_document(tree_manifest_path, 'area tree manifest')
    if tree_manifest.get('treeWalkComplete') is not True:
        return _pending('area-tree-not-yet-complete')
    probe_manifest_path = probe / 'manifest.json'
    if not probe_manifest_path.exists():
        return _pending('level3-child-probe-not-yet-run')
    probe_manifest, _ = read_document(probe_manifest_path, 'probe manifest')
    if (probe_manifest.get('activeBatch') is not None
            or probe_manifest.get('allLevel3ChildrenEnumerated') is not True):
        return _pending('level3-child-probe-not-yet-complete')
    audited = _terminal_audit(tree, probe)
    return {'status': 'ready', 'outputWritten': False,
            'sourceFingerprint': audited['plan']['sourceFingerprint'],
            'level4NodeCount': audited['cache']['level4NodeCount'],
            'uncodedLevel4NodeCount': audited['cache']['uncodedLevel4NodeCount'],
            'allLevel3ChildrenEnumerated': True}


def build_overlay(tree: Path, probe: Path) -> dict:
    """Derive fourth-level rows only from verified raw probe responses."""
    tree, probe = Path(tree), Path(probe)
    state = preflight(tree, probe)
    if state['status'] != 'ready':
        raise RuntimeError('level-four overlay source not ready: ' + state['reason'])
    audited = _terminal_audit(tree, probe)
    source, plan, cache = (audited[key] for key in ('source', 'plan', 'cache'))
    ancestors = {item['sourceNodeId']: item for item in
                 (*source['seeds'], *source['uncodedNodes'])}
    coded, uncoded = [], []
    fetch_times = []
    for parent in plan['parents']:
        parent_id = parent['id']
        wrapper, file_sha = audited['responses'][parent_id]
        fetched = BUILDER['checked_time'](wrapper.get('fetchedAtUtc'),
                                          parent_id + ' fetch').isoformat()
        fetch_times.append(fetched)
        parent_row = ancestors[parent_id]
        if parent_row['level'] != 3:
            raise RuntimeError(f'{parent_id}: source parent level differs')
        parts = [
            {'sourceNodeId': ancestors[identifier]['sourceNodeId'],
             'name': ancestors[identifier]['name'],
             'level': ancestors[identifier]['level'],
             'sbcode': ancestors[identifier]['sbcode']}
            for identifier in parent_row['officialPathNodeIds']
        ]
        for child in PROBE['checked_children'](wrapper, parent_id):
            path_ids = [*parent_row['officialPathNodeIds'], child['id']]
            row = {
                'sourceNodeId': child['id'], 'sourceParentNodeId': parent_id,
                'level': 4, 'name': child['name'], 'sbcode': child.get('sbcode'),
                'rawNode': child, 'officialPathNodeIds': path_ids,
                'officialPath': [*parts, {
                    'sourceNodeId': child['id'], 'name': child['name'],
                    'level': 4, 'sbcode': child.get('sbcode')}],
                'sourceResponsePath': f'{probe.name}/responses/{parent_id}.json',
                'sourceResponseSha256': wrapper['responseSha256'],
                'sourceResponseFileSha256': file_sha,
                'sourceFetchedAtUtc': fetched,
                'observedChildCount': None,
                'childEnumerationComplete': False,
                'directHangStatus': 'child_scope_not_enumerated',
                'uncodedAncestorReviewRequired': (
                    parent_row['uncodedAncestorReviewRequired']
                    or parent_row['sbcode'] is None),
            }
            if row['sbcode'] is None:
                uncoded.append({**row, 'coverageReviewRequired': True,
                                'reason': 'missing_official_sbcode'})
            else:
                coded.append(row)
    if len(coded) + len(uncoded) != cache['level4NodeCount']:
        raise RuntimeError('level-four node count differs from audited response inventory')
    return {
        'schemaVersion': 1, 'kind': 'mca-official-area-level4-overlay-seeds',
        'scope': 'audited-level3-children-only',
        'sourceTreeManifestSha256': source['sourceTreeManifestSha256'],
        'sourceFingerprint': plan['sourceFingerprint'],
        'sourceProbeManifestSha256': audited['probeManifestSha256'],
        'sourceProbeFinalBatchSha256': audited['finalBatchSha256'],
        'sourceResponseInventorySha256': cache['responseInventorySha256'],
        'sourceFetchFirstUtc': min(fetch_times),
        'sourceFetchLastUtc': max(fetch_times),
        'allLevel3ChildrenEnumerated': True,
        'level4NodeCount': cache['level4NodeCount'],
        'level4TerminalVerified': cache['level4TerminalVerified'],
        'seedCount': len(coded), 'uncodedNodeCount': len(uncoded),
        'snapshotVerified': False, 'publishable': False,
        'seeds': coded, 'uncodedNodes': uncoded,
    }


def load_verified_overlay(seed_path: Path, tree: Path) -> tuple[dict, str]:
    """Reaudit the immutable overlay and its disjoint original seed scope."""
    seed_path, tree = Path(seed_path), Path(tree)
    if (seed_path.name != DEFAULT_OUTPUT.name or tree.name != DEFAULT_TREE.name
            or seed_path.parent.resolve() != tree.parent.resolve()
            or not any(left.lower() == 'data' and right.lower() == 'private'
                       for left, right in zip(seed_path.resolve().parts,
                                              seed_path.resolve().parts[1:]))):
        raise ValueError('overlay seed must be beside its private official tree')
    supplied, file_sha = read_document(seed_path, 'versioned level-four overlay')
    raw = seed_path.read_bytes()
    expected = build_overlay(tree, tree.parent / DEFAULT_PROBE.name)
    if supplied != expected or hashlib.sha256(raw).hexdigest() != file_sha:
        raise ValueError('level-four overlay differs from terminal source')
    base_path = seed_path.parent / 'national-area-tree-seeds-20261119.json'
    base, _base_sha = read_document(base_path, 'original official area seeds')
    if base != BUILDER['build_seeds'](tree):
        raise ValueError('original official area seed differs from source tree')
    base_codes = {seed['sbcode'] for seed in base['seeds']}
    overlay_codes = [seed['sbcode'] for seed in supplied['seeds']]
    if (len(set(overlay_codes)) != len(overlay_codes)
            or base_codes.intersection(overlay_codes)
            or supplied['seedCount'] != len(overlay_codes)
            or supplied['uncodedNodeCount'] != len(supplied['uncodedNodes'])
            or supplied['level4NodeCount'] !=
            supplied['seedCount'] + supplied['uncodedNodeCount']):
        raise ValueError('overlay code inventory overlaps original area seeds')
    if seed_path.read_bytes() != raw:
        raise ValueError('level-four overlay changed during source audit')
    return supplied, file_sha


def write_overlay(tree: Path, probe: Path, output: Path) -> dict:
    tree, probe, output = Path(tree), Path(probe), Path(output)
    trusted_root = ROOT.resolve()
    if (tree.parent.resolve() != trusted_root
            or probe.parent.resolve() != trusted_root
            or output.parent.resolve() != trusted_root
            or tree.name != DEFAULT_TREE.name
            or probe.name != DEFAULT_PROBE.name
            or output.name != 'national-area-level4-overlay-seeds.v1.json'
            or not any(left.lower() == 'data' and right.lower() == 'private'
                       for left, right in zip(trusted_root.parts,
                                              trusted_root.parts[1:]))):
        raise ValueError('versioned overlay requires the trusted private root')
    state = preflight(tree, probe)
    if state['status'] != 'ready':
        raise RuntimeError('level-four overlay source not ready: ' + state['reason'])
    with SITE_LOCK(tree.parent):
        document = build_overlay(tree, probe)
        if output.exists():
            old, _ = read_document(output, 'existing overlay')
            source_hashes = (
                'sourceTreeManifestSha256', 'sourceFingerprint',
                'sourceProbeManifestSha256', 'sourceProbeFinalBatchSha256',
                'sourceResponseInventorySha256',
            )
            if any(old.get(key) != document[key] for key in source_hashes):
                raise RuntimeError('existing overlay source hashes differ; new version required')
            raise FileExistsError(f'{output}: immutable version already exists')
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=output.name + '.', suffix='.tmp', dir=output.parent)
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as destination:
                json.dump(document, destination, ensure_ascii=False, indent=2)
                destination.write('\n')
                destination.flush()
                os.fsync(destination.fileno())
            # Hard-link creation is atomic and fails if this version exists.
            os.link(temporary, output)
        finally:
            temporary.unlink(missing_ok=True)
    return document


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tree-dir', type=Path, default=DEFAULT_TREE)
    parser.add_argument('--probe-dir', type=Path, default=DEFAULT_PROBE)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--write', action='store_true',
                        help='write an immutable private overlay after terminal audit')
    args = parser.parse_args(argv)
    state = preflight(args.tree_dir, args.probe_dir)
    if not args.write or state['status'] != 'ready':
        print(json.dumps(state, ensure_ascii=False))
        return 0 if not args.write else 2
    document = write_overlay(args.tree_dir, args.probe_dir, args.output)
    print(json.dumps({'status': 'written', 'output': str(args.output),
                      'sourceFingerprint': document['sourceFingerprint'],
                      'level4NodeCount': document['level4NodeCount'],
                      'seedCount': document['seedCount'],
                      'uncodedNodeCount': document['uncodedNodeCount']},
                     ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
