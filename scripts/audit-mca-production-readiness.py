"""Audit saved MCA list/detail wrappers offline, without exporting source values.

The saved responseSha256 is only independently verifiable when rawBodyBase64
exists. A digest of cache files attests the audited local files, not the HTTP
response bytes or an official snapshot.
"""

from __future__ import annotations

import argparse
import base64
from collections import Counter, defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import re
import runpy
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
INVENTORY = runpy.run_path(str(HERE / 'audit-mca-fields.py'))
NORMALIZER = runpy.run_path(str(HERE / 'normalize-mca-private.py'))
ADD_RECORD = INVENTORY['add_record']
FIELD_MAP = NORMALIZER['FIELD_MAP']
PROJECTED_PATHS = NORMALIZER['PROJECTED_PATHS']
VALIDATED_PATHS = NORMALIZER['VALIDATED_PATHS']
RESTRICTED_CONTACT_PATHS = NORMALIZER['RESTRICTED_CONTACT_PATHS']
PRIVACY_REVIEW_PREFIXES = NORMALIZER['PRIVACY_REVIEW_PREFIXES']
IS_UNDER_PREFIX = NORMALIZER['is_under_prefix']
API_PREFIX = '/ylxxptapi/ylfwpt/ylfw/'
SHA256 = re.compile(r'[0-9a-f]{64}\Z')
AREA_FOLDER = re.compile(r'area-([0-9]{12})(?:-|$)')
LIST_FIELDS = ('axbe0003', 'axbe0013', 'areaCode', 'axbe0004',
               'axbe0004Name', 'ahae2347', 'ahae2323', 'axbe8003', 'axbe8004')
BASE_FIELDS = ('axbe0003', 'axbe0013', 'areaCode', 'axbe0004',
               'axbe0004Name', 'axbe8003', 'axbe8004')
CARE_FIELDS = ('ahae2347', 'ahae2323')
MODERN_PAGE_DIRS = (
    'national-area-first-pages-20261119',
    'national-area-followup-pages-20261119',
    'national-area-large-pages-20261119',
    'national-level4-first-pages-v1',
    'national-level4-followup-pages-v1',
    'national-level4-large-pages-v1',
)
MODERN_DETAIL_DIRS = (
    'national-observed-details-20261119',
    'national-level4-observed-details-v1',
)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def remember_values(target, identifier, record, keys):
    for key in keys:
        value = record.get(key)
        if value is None or value == '':
            continue
        target[identifier][key].add(json.dumps(value, ensure_ascii=False, sort_keys=True))


def request_valid(wrapper, endpoint, params):
    if not isinstance(wrapper, dict) or not isinstance(wrapper.get('request'), dict):
        return False
    request = wrapper['request']
    url = urlsplit(request.get('url', ''))
    return (request.get('method') == 'POST'
            and url.scheme == 'https' and url.hostname == 'yanglao.mca.gov.cn'
            and url.path == API_PREFIX + endpoint and request.get('params') == params)


def check_integrity(wrapper, integrity, issues):
    declared = wrapper.get('responseSha256') if isinstance(wrapper, dict) else None
    if not isinstance(declared, str) or not SHA256.fullmatch(declared):
        issues['invalidDeclaredResponseSha256'] += 1
        return False
    integrity['declaredResponseSha256'] += 1
    encoded = wrapper.get('rawBodyBase64')
    if encoded is None:
        integrity['rawBodyUnavailable'] += 1
        return True  # Contents may be usable for audit, but are not hash-attested.
    try:
        raw = base64.b64decode(encoded, validate=True)
        if hashlib.sha256(raw).hexdigest() != declared or json.loads(raw) != wrapper.get('response'):
            raise ValueError('raw response differs from saved response or hash')
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        issues['responseIntegrityMismatch'] += 1
        return False
    integrity['rawBodyVerified'] += 1
    return True


def response_data(wrapper):
    if wrapper.get('httpStatus') != 200:
        return None, 'httpStatusFailure'
    response = wrapper.get('response')
    if not isinstance(response, dict) or type(response.get('code')) is not int or response['code'] != 0:
        return None, 'businessCodeFailure'
    data = response.get('data')
    if not isinstance(data, dict):
        return None, 'invalidResponseData'
    return data, None


def path_report(fields):
    restricted, privacy_review, unreviewed, unprojected = [], [], [], []
    for path, item in sorted(fields.items()):
        if path in RESTRICTED_CONTACT_PATHS:
            restricted.append(path)
        elif any(IS_UNDER_PREFIX(path, prefix) for prefix in PRIVACY_REVIEW_PREFIXES):
            privacy_review.append(path)
        elif item['nonNullCount'] and path not in FIELD_MAP and path not in VALIDATED_PATHS:
            unreviewed.append(path)
        elif item['nonNullCount'] and path not in PROJECTED_PATHS and path not in VALIDATED_PATHS:
            unprojected.append(path)
    return {
        'pathCount': len(fields), 'projectedPathCount': sum(path in PROJECTED_PATHS for path in fields),
        'restrictedContactPaths': restricted, 'privacyReviewPaths': privacy_review,
        'unreviewedNonNullPaths': unreviewed, 'mappedButUnprojectedNonNullPaths': unprojected,
    }


def conflict_counts(left, right, keys):
    return {key: sum(bool(left[ident][key] and right[ident][key]
                          and len(left[ident][key] | right[ident][key]) > 1)
                     for ident in left.keys() & right.keys())
            for key in keys}


def audit(root):
    if not root.is_dir():
        raise ValueError('private MCA cache root does not exist')
    counts, integrity, issues = Counter(), Counter(), Counter()
    fields = {}
    list_values = defaultdict(lambda: defaultdict(set))
    base_values = defaultdict(lambda: defaultdict(set))
    care_values = defaultdict(lambda: defaultdict(set))
    valid_detail_ids = set()
    list_ids = set()
    file_set = hashlib.sha256()
    modern = {'pageFiles': 0, 'detailFiles': 0,
              'checkpointFiles': 0, 'manifestFiles': 0, 'queueFiles': 0,
              'level4PageFiles': 0, 'level4DetailFiles': 0,
              'level4CheckpointFiles': 0}
    for name in MODERN_PAGE_DIRS:
        folder = root / name
        page_count = sum(1 for path in folder.glob('area-*/pages/*.json')
                         if not path.name.endswith('.candidate.json'))
        modern['pageFiles'] += page_count
        if name.startswith('national-level4-'):
            modern['level4PageFiles'] += page_count
        modern['manifestFiles'] += (folder / 'manifest.json').is_file()
    for name in MODERN_DETAIL_DIRS:
        folder = root / name
        detail_count = sum(1 for _ in (folder / 'details').glob('*.json'))
        checkpoint_count = sum(
            1 for _ in (folder / 'detail-checkpoints').glob('*/*.json'))
        modern['detailFiles'] += detail_count
        modern['checkpointFiles'] += checkpoint_count
        if name.startswith('national-level4-'):
            modern['level4DetailFiles'] += detail_count
            modern['level4CheckpointFiles'] += checkpoint_count
        modern['manifestFiles'] += (folder / 'manifest.json').is_file()
        modern['queueFiles'] += (folder / 'queue.json').is_file()
    if any(modern[key] for key in ('pageFiles', 'detailFiles',
                                   'checkpointFiles', 'manifestFiles', 'queueFiles')):
        issues['modernObservationSourcesNotAudited'] = sum(
            modern[key] for key in ('pageFiles', 'detailFiles',
                                    'checkpointFiles', 'manifestFiles', 'queueFiles'))
    for folder in sorted(root.glob('area-*')):
        if not folder.is_dir():
            continue
        match = AREA_FOLDER.match(folder.name)
        if match is None:
            continue
        counts['captures'] += 1
        input_paths = [folder / 'manifest.json', *sorted((folder / 'pages').glob('*.json')),
                       *sorted((folder / 'details').glob('*.json'))]
        for path in input_paths:
            if path.is_file():
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                file_set.update(f'{path.relative_to(root).as_posix()}\t{digest}\n'.encode())
                integrity['hashedCacheFiles'] += 1
        try:
            manifest = read_json(folder / 'manifest.json')
        except (OSError, ValueError):
            issues['missingOrInvalidManifest'] += 1
            continue
        filters = manifest.get('filters')
        total, size, expected = (manifest.get(key) for key in
                                 ('total', 'serverPageSize', 'expectedPages'))
        if (not isinstance(filters, dict) or filters.get('areaCode') != match.group(1)
                or manifest.get('scope') != folder.name or type(total) is not int or total < 0
                or type(size) is not int or size < 1 or type(expected) is not int
                or expected != math.ceil(total / size)):
            issues['invalidManifest'] += 1
            continue
        if manifest.get('complete') is True:
            counts['manifestCompleteClaims'] += 1
        counts['expectedPages'] += expected
        params = {'areaCode': match.group(1), 'size': size}
        if filters.get('checkSort') is not None:
            params['checkSort'] = filters['checkSort']
        if filters.get('ahae0635') is not None:
            params['ahae0635'] = filters['ahae0635']
        valid_pages = set()
        for path in sorted((folder / 'pages').glob('*.json')):
            counts['pageFiles'] += 1
            try:
                page_no = int(path.stem)
                wrapper = read_json(path)
            except (ValueError, OSError):
                issues['invalidPageFile'] += 1
                continue
            if not isinstance(wrapper, dict):
                issues['invalidPageFile'] += 1
                continue
            intact = check_integrity(wrapper, integrity, issues)
            if not request_valid(wrapper, 'queryOrganizationDataList',
                                 {**params, 'current': page_no}):
                issues['requestMismatch'] += 1
                continue
            if not intact:
                continue
            data, problem = response_data(wrapper)
            if problem:
                issues[problem] += 1
                continue
            records = data.get('records')
            if (expected == 0 and page_no == 1 and data.get('current') == 1
                    and data.get('total') == 0 and data.get('size') == size
                    and records == []):
                counts['zeroTotalProbePages'] += 1
                continue
            if (not 1 <= page_no <= expected or type(data.get('current')) is not int
                    or data['current'] != page_no or type(data.get('total')) is not int
                    or type(data.get('size')) is not int or not isinstance(records, list)):
                issues['invalidPageShape'] += 1
                continue
            if data['total'] != total or data['size'] != size:
                issues['paginationDrift'] += 1
                continue
            expected_length = min(size, max(0, total - (page_no - 1) * size))
            if len(records) != expected_length:
                issues['pageLengthMismatch'] += 1
                continue
            if any(not isinstance(item, dict) or not isinstance(item.get('axbe0001'), str)
                   or not item['axbe0001'] for item in records):
                issues['invalidInstitutionId'] += 1
                continue
            counts['validPages'] += 1
            valid_pages.add(page_no)
            for row in records:
                identifier = row['axbe0001']
                list_ids.add(identifier)
                counts['listRows'] += 1
                ADD_RECORD(row, 'list', fields)
                remember_values(list_values, identifier, row, LIST_FIELDS)
        counts['missingPages'] += expected - len(valid_pages)
        for path in sorted((folder / 'details').glob('*.json')):
            counts['detailFiles'] += 1
            try:
                wrapper = read_json(path)
            except (OSError, ValueError):
                issues['invalidDetailFile'] += 1
                continue
            if not isinstance(wrapper, dict) or wrapper.get('institutionId') != path.stem:
                issues['detailIdMismatch'] += 1
                continue
            endpoints = wrapper.get('endpoints')
            if not isinstance(endpoints, dict):
                issues['missingDetailEndpoints'] += 1
                continue
            records = {}
            for name in ('orgBaseDetail', 'yangLaoOrgDetail'):
                endpoint = endpoints.get(name)
                if not isinstance(endpoint, dict):
                    issues['missingDetailEndpoint'] += 1
                    continue
                intact = check_integrity(endpoint, integrity, issues)
                if not request_valid(endpoint, name, {'axbe0001': path.stem}):
                    issues['requestMismatch'] += 1
                    continue
                if not intact:
                    continue
                data, problem = response_data(endpoint)
                if problem:
                    issues[problem] += 1
                    continue
                if data.get('axbe0001', path.stem) != path.stem:
                    issues['detailIdMismatch'] += 1
                    continue
                records[name] = data
            if len(records) != 2:
                continue
            counts['validDetails'] += 1
            valid_detail_ids.add(path.stem)
            ADD_RECORD(records['orgBaseDetail'], 'orgBaseDetail', fields)
            ADD_RECORD(records['yangLaoOrgDetail'], 'yangLaoOrgDetail', fields)
            remember_values(base_values, path.stem, records['orgBaseDetail'], BASE_FIELDS)
            remember_values(care_values, path.stem, records['yangLaoOrgDetail'], CARE_FIELDS)
    counts['uniqueObservedIds'] = len(list_ids)
    counts['idsWithValidDetails'] = len(list_ids & valid_detail_ids)
    counts['missingDetailsForObservedIds'] = len(list_ids - valid_detail_ids)
    counts['orphanValidDetailIds'] = len(valid_detail_ids - list_ids)
    conflicts = {
        'withinList': {key: sum(len(values[key]) > 1 for values in list_values.values())
                       for key in LIST_FIELDS},
        'listVsOrgBase': conflict_counts(list_values, base_values, BASE_FIELDS),
        'listVsYangLao': conflict_counts(list_values, care_values, CARE_FIELDS),
    }
    count_keys = ('captures', 'expectedPages', 'pageFiles', 'validPages',
                  'zeroTotalProbePages', 'missingPages',
                  'listRows', 'uniqueObservedIds', 'detailFiles', 'validDetails',
                  'idsWithValidDetails', 'missingDetailsForObservedIds',
                  'orphanValidDetailIds', 'manifestCompleteClaims')
    integrity_keys = ('hashedCacheFiles', 'declaredResponseSha256',
                      'rawBodyVerified', 'rawBodyUnavailable')
    return {
        'schemaVersion': 1, 'scope': 'saved private MCA captures', 'publishable': False,
        'counts': {key: counts[key] for key in count_keys},
        'integrity': {**{key: integrity[key] for key in integrity_keys},
                      'cacheFileSetSha256': file_set.hexdigest(),
                      'cacheFileSetMeaning': 'local wrapper/manifest bytes, not original HTTP bytes'},
        'issues': dict(sorted(issues.items())), 'fields': path_report(fields),
        'modernObservationsNotAudited': modern,
        'conflicts': conflicts,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    report = audit(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_name(args.output.name + '.tmp')
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, args.output)
    print(json.dumps({'counts': report['counts'], 'issues': report['issues'],
                      'rawBodyVerified': report['integrity'].get('rawBodyVerified', 0),
                      'rawBodyUnavailable': report['integrity'].get('rawBodyUnavailable', 0)},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
