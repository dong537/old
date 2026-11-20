"""Build a private MCA JSON catalog from immutable local mirrors, without HTTP."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile


PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT / 'data/private/generated/mca-observed-catalog'
SHA = re.compile(r'[0-9a-f]{64}\Z')
ID = re.compile(r'(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})\Z')
LANES = (
    ('', {'institutionListPage': 'list', 'institutionDetailPair': 'detail'}),
    ('province-root-pages', {'sealedRootPageResponse': 'list'}),
    ('area-page-observations', {'sealedAreaPageResponse': 'list'}),
    ('detail-collection', {'committedDetailItemEvidence': 'detail'}),
    ('newpage-detail-collection', {'sealedNewPageDetailItemEvidence': 'detail'}),
    ('unified-detail-collection', {'committedDetailItemEvidence': 'detail'}),
)
MAPPINGS = {
    'list': {'name': 'axbe0003', 'facilityTypeCode': 'axbe0004',
             'facilityTypeLabel': 'axbe0004Name', 'areaCode': 'areaCode',
             'regionLabel': 'areaCodeName', 'regionPath': 'areaCodeNameFiveLevel',
             'address': 'axbe0013', 'listedBeds': 'ahae2347',
             'nursingBeds': 'ahae2323', 'listedMonthlyFeeMin': 'axbe8004',
             'listedMonthlyFeeMax': 'axbe8003',
             'platformStarCode': 'ahde8404',
             'evaluationCount': 'evaluationCount',
             'overallEvaluation': 'overallEvaluation',
             'functionPositioningLabel': 'ahae0702Name',
             'platformTagsRaw': 'tag'},
    'orgBaseDetail': {'name': 'axbe0003', 'facilityTypeLabel': 'axbe0004Name',
                      'areaCode': 'areaCode', 'address': 'axbe0013',
                      'listedMonthlyFeeMin': 'axbe8004',
                      'listedMonthlyFeeMax': 'axbe8003',
                      'evaluationCount': 'evaluationCount',
                      'overallEvaluation': 'overallEvaluation',
                      'functionPositioningLabel': 'ahae0702Name',
                      'platformTagsRaw': 'tag'},
    'yangLaoOrgDetail': {'listedBeds': 'ahae2347', 'nursingBeds': 'ahae2323'},
}
FIELDS = tuple(MAPPINGS['list'])
NUMERIC = {'listedBeds', 'nursingBeds', 'listedMonthlyFeeMin', 'listedMonthlyFeeMax',
           'evaluationCount', 'overallEvaluation'}
RAW_TEXT = {'platformStarCode', 'platformTagsRaw'}
TRANSFORM_VERSION = 4


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def checked_json(raw):
    return json.loads(raw.decode('utf-8-sig'),
                      parse_constant=lambda value: (_ for _ in ()).throw(
                          ValueError('nonfinite JSON: ' + value)))


def read_file(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError('missing or unsafe file: ' + str(path))
    return path.read_bytes()


def load_snapshot(mirror, lane):
    base = mirror / lane
    pointer = checked_json(read_file(base / 'latest.json'))
    sha = pointer.get('snapshotSha256')
    if pointer.get('schemaVersion') != 1 or not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError('invalid mirror pointer: ' + lane)
    raw = read_file(base / 'snapshots' / (sha + '.json'))
    if digest(raw) != sha:
        raise ValueError('mirror snapshot SHA mismatch: ' + lane)
    snap = checked_json(raw)
    if (snap.get('schemaVersion') != 1 or snap.get('publishable') is not False
            or not isinstance(snap.get('files'), list)
            or snap.get('fileCount') != len(snap['files'])):
        raise ValueError('invalid mirror snapshot: ' + lane)
    return {'lane': lane or 'base', 'sha256': sha,
            'capturedAtUtc': snap.get('capturedAtUtc')}, snap['files']


def load_object(mirror, lane, entry):
    sha, relative = entry.get('sha256'), entry.get('objectRelativePath')
    if not isinstance(sha, str) or not SHA.fullmatch(sha) or not isinstance(relative, str):
        raise ValueError('invalid mirror object metadata')
    path = PurePosixPath(relative)
    if (path.is_absolute() or path.as_posix() != relative
            or path.parts != ('objects', sha[:2], sha + '.json')):
        raise ValueError('unsafe mirror object path')
    raw = read_file((mirror / lane).joinpath(*path.parts))
    if digest(raw) != sha or len(raw) != entry.get('bytes'):
        raise ValueError('mirror object SHA or length mismatch: ' + relative)
    return checked_json(raw)


def source(lane, entry, wrapper, row=None):
    result = {'mirror': lane or 'base',
              'sourceRelativePath': entry['sourceRelativePath'],
              'fileSha256': entry['sha256'],
              'responseSha256': wrapper.get('responseSha256'),
              'fetchedAtUtc': wrapper.get('fetchedAtUtc')}
    if row is not None:
        result['rowNumber'] = row
    return result


def response_data(wrapper):
    if not isinstance(wrapper, dict):
        raise ValueError('response wrapper invalid')
    response = wrapper.get('response')
    if wrapper.get('httpStatus') != 200 or not isinstance(response, dict):
        return None
    if response.get('code') not in (0, '0'):
        return None
    data = response.get('data')
    if not isinstance(data, dict):
        raise ValueError('successful response data invalid')
    return data


def inventory_paths(value, path, counts):
    row = counts.setdefault(path, {'occurrences': 0, 'nullCount': 0,
                                   'emptyCount': 0, 'types': Counter()})
    row['occurrences'] += 1
    kind = ('null' if value is None else 'boolean' if isinstance(value, bool) else
            'number' if isinstance(value, (int, float)) else
            'string' if isinstance(value, str) else
            'array' if isinstance(value, list) else 'object')
    row['types'][kind] += 1
    row['nullCount'] += value is None
    row['emptyCount'] += (value == '' if isinstance(value, str) else
                          len(value) == 0 if isinstance(value, (dict, list)) else False)
    if isinstance(value, dict):
        for key, child in value.items():
            inventory_paths(child, path + '.' + key, counts)
    elif isinstance(value, list):
        for child in value:
            inventory_paths(child, path + '[]', counts)


def collect(mirror):
    records = defaultdict(lambda: {'listObservations': [], 'detailObservations': []})
    paths, inputs, ignored = {}, [], Counter()
    seen = {'list': set(), 'detail': set()}
    for lane, categories in LANES:
        reference, files = load_snapshot(mirror, lane)
        inputs.append(reference)
        for entry in files:
            kind = categories.get(entry.get('category'))
            if kind is None:
                continue
            relative = entry.get('sourceRelativePath', '')
            if kind == 'detail' and not re.search(r'/details/[^/]+\.json\Z', relative):
                continue
            if entry['sha256'] in seen[kind]:
                ignored['duplicateObjects'] += 1
                continue
            seen[kind].add(entry['sha256'])
            doc = load_object(mirror, lane, entry)
            if kind == 'list':
                data = response_data(doc)
                if data is None:
                    ignored['nonSuccessfulListResponses'] += 1
                    continue
                rows = data.get('records')
                if not isinstance(rows, list):
                    raise ValueError('list records missing: ' + relative)
                for number, row in enumerate(rows, 1):
                    identifier = row.get('axbe0001') if isinstance(row, dict) else None
                    if not isinstance(identifier, str) or not ID.fullmatch(identifier):
                        raise ValueError('invalid list ID: ' + relative)
                    records[identifier]['listObservations'].append({
                        'source': source(lane, entry, doc, number),
                        'sourceFields': row})
                    inventory_paths(row, 'list', paths)
            else:
                identifier = doc.get('institutionId') if isinstance(doc, dict) else None
                endpoints = doc.get('endpoints') if isinstance(doc, dict) else None
                if (not isinstance(identifier, str) or not ID.fullmatch(identifier)
                        or not isinstance(endpoints, dict)
                        or set(endpoints) != {'orgBaseDetail', 'yangLaoOrgDetail'}):
                    raise ValueError('invalid detail pair: ' + relative)
                parts = {}
                for endpoint in ('orgBaseDetail', 'yangLaoOrgDetail'):
                    wrapper = endpoints[endpoint]
                    data = response_data(wrapper)
                    if data is None:
                        raise ValueError('unsuccessful detail endpoint: ' + relative)
                    if 'axbe0001' in data and data['axbe0001'] != identifier:
                        raise ValueError('detail endpoint ID differs: ' + relative)
                    parts[endpoint] = {'source': source(lane, entry, wrapper),
                                       'sourceFields': data}
                    inventory_paths(data, endpoint, paths)
                records[identifier]['detailObservations'].append({
                    'source': {'mirror': lane or 'base',
                               'sourceRelativePath': relative,
                               'fileSha256': entry['sha256'],
                               'fetchedAtUtc': doc.get('fetchedAtUtc')},
                    'endpoints': parts})
    return records, paths, inputs, ignored


def usable(value, field):
    if value is None:
        return None
    if field in NUMERIC:
        return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 else None
    if field in RAW_TEXT:
        return value if isinstance(value, str) and value.strip() else None
    return value.strip() if isinstance(value, str) and value.strip() else None


def project(identifier, observations):
    candidates = defaultdict(list)
    for item in observations['listObservations']:
        for field, key in MAPPINGS['list'].items():
            if key in item['sourceFields']:
                value = usable(item['sourceFields'][key], field)
                if value is not None:
                    candidates[field].append((1, item['source']['fetchedAtUtc'] or '',
                                              item['source']['fileSha256'], value,
                                              'list', item['source']))
    for item in observations['detailObservations']:
        for endpoint in ('orgBaseDetail', 'yangLaoOrgDetail'):
            part = item['endpoints'][endpoint]
            for field, key in MAPPINGS[endpoint].items():
                if key in part['sourceFields']:
                    value = usable(part['sourceFields'][key], field)
                    if value is not None:
                        candidates[field].append((2, part['source']['fetchedAtUtc'] or '',
                                                  part['source']['fileSha256'], value,
                                                  endpoint, part['source']))
    values, selected, conflicts = {}, {}, []
    for field in FIELDS:
        options = candidates[field]
        if not options:
            values[field] = None
            continue
        if len({json.dumps(option[3], ensure_ascii=False, sort_keys=True)
                for option in options}) > 1:
            values[field] = None
            conflicts.append(field)
            continue
        chosen = max(options, key=lambda option: option[:3])
        values[field] = chosen[3]
        selected[field] = {'channel': chosen[4], 'source': chosen[5]}
    detail_path = 'details/' + digest(identifier.encode('utf-8')) + '.json'
    index = {'mcaId': identifier, 'detailPath': detail_path, **values,
             'hasDetail': bool(observations['detailObservations']),
             'listObservationCount': len(observations['listObservations']),
             'detailObservationCount': len(observations['detailObservations']),
             'conflictFields': conflicts}
    detail = {'schemaVersion': 1, 'mcaId': identifier, 'publishable': False,
              'selectedFieldSources': selected, 'conflictFields': conflicts,
              **observations}
    return index, detail


def atomic_write(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def catalog_documents(records, paths, inputs, ignored, snapshot_id):
    """Render the current transform identically for creation and offline reuse checks."""
    rows, counts = [], Counter()
    for identifier in sorted(records):
        index, detail = project(identifier, records[identifier])
        rows.append(index)
        yield index['detailPath'], canonical(detail)
        counts['lists'] += index['listObservationCount']
        counts['details'] += index['detailObservationCount']
        counts['withDetail'] += index['hasDetail']
        counts['withConflict'] += bool(index['conflictFields'])
    fields = [{'path': key, 'occurrences': value['occurrences'],
               'nullCount': value['nullCount'], 'emptyCount': value['emptyCount'],
               'types': dict(sorted(value['types'].items()))}
              for key, value in sorted(paths.items())]
    manifest = {'schemaVersion': 1, 'snapshotId': snapshot_id,
                'scope': 'private_mca_observed_institutions',
                'publishable': False, 'nationalComplete': False,
                'snapshotVerified': False, 'fieldSemantics': 'partially_mapped',
                'privacyReview': 'required', 'sourceSnapshots': inputs,
                'recordCount': len(rows), 'withDetailCount': counts['withDetail'],
                'listObservationCount': counts['lists'],
                'detailObservationCount': counts['details'],
                'withConflictCount': counts['withConflict'],
                'fieldPathCount': len(fields), 'ignored': dict(sorted(ignored.items())),
                'indexPath': 'index.json', 'fieldCatalogPath': 'field-catalog.json',
                'detailDirectory': 'details'}
    yield 'index.json', canonical({'schemaVersion': 1, 'snapshotId': snapshot_id,
                                   'publishable': False, 'records': rows})
    yield 'field-catalog.json', canonical({'schemaVersion': 1, 'snapshotId': snapshot_id,
                                           'publishable': False, 'fields': fields})
    yield 'manifest.json', canonical(manifest)


def verify_existing_snapshot(target, documents):
    """Never repair immutable output; reject any missing, extra or differing artifact."""
    if target.is_symlink() or not target.is_dir():
        raise ValueError('existing catalog snapshot path invalid')
    actual = set()
    for location in target.rglob('*'):
        if location.is_symlink():
            raise ValueError('existing catalog snapshot contains a symlink')
        if location.is_file():
            actual.add(location.relative_to(target).as_posix())
    expected = set()
    for relative, raw in documents:
        expected.add(relative)
        location = target / relative
        if not location.is_file() or read_file(location) != raw:
            raise ValueError('existing catalog snapshot differs: ' + relative)
    if actual != expected:
        raise ValueError('existing catalog snapshot file set differs')


def build(mirror, output=DEFAULT_OUTPUT):
    mirror, output = Path(mirror).resolve(), Path(output).resolve()
    public, out = (PROJECT / 'public').resolve(), (PROJECT / 'out').resolve()
    if (not mirror.is_dir() or mirror == output or mirror in output.parents
            or output in mirror.parents or output in (public, out)
            or public in output.parents or out in output.parents):
        raise ValueError('mirror/output location invalid')
    records, paths, inputs, ignored = collect(mirror)
    if not records:
        raise ValueError('no MCA institutions observed')
    fingerprint = digest(canonical({
        'transformVersion': TRANSFORM_VERSION,
        'sources': [{'lane': item['lane'], 'sha256': item['sha256']} for item in inputs],
    }))
    snapshot_id = 'observed-' + fingerprint[:24]
    target = output / 'snapshots' / snapshot_id
    if not target.exists():
        (output / 'snapshots').mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix='.catalog-', dir=output / 'snapshots'))
        try:
            (temporary / 'details').mkdir()
            for relative, raw in catalog_documents(records, paths, inputs, ignored, snapshot_id):
                (temporary / relative).write_bytes(raw)
            os.rename(temporary, target)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
    else:
        verify_existing_snapshot(
            target, catalog_documents(records, paths, inputs, ignored, snapshot_id))
    manifest = checked_json(read_file(target / 'manifest.json'))
    atomic_write(output / 'current.json', canonical({'schemaVersion': 1,
                                                   'snapshotId': snapshot_id}))
    return {'snapshotId': snapshot_id, 'output': str(target),
            'recordCount': manifest['recordCount'],
            'withDetailCount': manifest['withDetailCount'],
            'listObservationCount': manifest['listObservationCount'],
            'detailObservationCount': manifest['detailObservationCount'],
            'fieldPathCount': manifest['fieldPathCount'],
            'withConflictCount': manifest['withConflictCount']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mirror', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    print(json.dumps(build(args.mirror, args.output), ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
