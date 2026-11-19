"""Build a private MCA field-gap and quality report from saved responses.

This is an offline preview, not a public export. Original endpoint responses
remain in data/private; unknown and contact fields are inventoried by path but
their values are never copied into these derived reports.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import runpy
from collections import Counter, defaultdict
from pathlib import Path


FIELD_MAP = {
    'list.axbe0001': ('mcaId', 'id (source-specific)', 'distinct'),
    'list.axbe0003': ('name', 'Institution.name', 'mapped'),
    'list.axbe0004': ('facilityTypeCode', None, 'new'),
    'list.axbe0004Name': ('facilityTypeLabel', None, 'new'),
    'list.areaCode': ('areaCode', None, 'new'),
    'list.areaCodeName': ('regionLabel', 'Institution.district (different level)', 'distinct'),
    'list.areaCodeNameFiveLevel': ('regionPath', None, 'new'),
    'list.axbe0013': ('address', 'Institution.address', 'mapped'),
    'list.ahae2347': ('listedBeds', 'registeredBeds (different definition)', 'distinct'),
    'list.ahae2323': ('nursingBeds', None, 'new'),
    'list.axbe8004': ('listedFeeMinRaw', None, 'pending-unit'),
    'list.axbe8003': ('listedFeeMaxRaw', None, 'pending-unit'),
    'list.ahae0633': ('serviceFunctionCodes', None, 'new'),
    'list.ahae0633Name': ('serviceFunctionLabels', None, 'new'),
    'list.ahae0701': ('networkLevelCode', None, 'pending-semantics'),
    'list.ahae0702': ('networkPositionCode', None, 'pending-semantics'),
    'list.ahae0702Name': ('networkPositionLabel', None, 'pending-semantics'),
    'list.ahde8404': ('platformStarCode', None, 'pending-semantics'),
    'list.overallEvaluation': ('platformRating', None, 'new'),
    'list.evaluationCount': ('ratingCount', None, 'new'),
    'list.ahae0635': ('subsidyFilterValue', None, 'pending-semantics'),
    'list.bedCost': ('bedFeeRaw', None, 'pending-unit'),
    'list.careCost': ('careFeeRaw', None, 'pending-unit'),
    'list.eatCost': ('mealFeeRaw', None, 'pending-unit'),
    'orgBaseDetail.ahae0021': ('areaSqm', None, 'new'),
    'orgBaseDetail.axbe0001': ('mcaId', 'id (source-specific)', 'distinct'),
    'orgBaseDetail.axbe0003': ('name', 'Institution.name', 'mapped'),
    # Saved detail samples put the type *label* here, unlike list's code.
    # Keep it out of the preview until endpoint semantics are fully checked.
    'orgBaseDetail.axbe0004': ('facilityTypeLabel', None, 'pending-semantics'),
    'orgBaseDetail.axbe0004Name': ('facilityTypeLabel', None, 'new'),
    'orgBaseDetail.axbe0013': ('address', 'Institution.address', 'mapped'),
    'orgBaseDetail.areaCode': ('areaCode', None, 'new'),
    'orgBaseDetail.areaCodeName': ('regionLabel', None, 'new'),
    'orgBaseDetail.axbe8004': ('listedFeeMinRaw', None, 'pending-unit'),
    'orgBaseDetail.axbe8003': ('listedFeeMaxRaw', None, 'pending-unit'),
    'yangLaoOrgDetail.ahae2347': ('listedBeds', 'registeredBeds (different definition)', 'distinct'),
    'yangLaoOrgDetail.ahae2323': ('nursingBeds', None, 'new'),
    'yangLaoOrgDetail.axbe0001': ('mcaId', 'id (source-specific)', 'distinct'),
}

# Only these paths have evidence of contact/person content in saved samples.
# Uninterpreted nested structures are withheld separately pending privacy review.
RESTRICTED_CONTACT_PATHS = frozenset((
    'list.ahae0012', 'orgBaseDetail.ahae2572', 'orgBaseDetail.ahae2573',
))
PRIVACY_REVIEW_PREFIXES = (
    'list.hae5List', 'orgBaseDetail.ahae2574', 'orgBaseDetail.orgBaseInfo',
    'orgBaseDetail.orgServiceInfo', 'orgBaseDetail.hae5List',
    'yangLaoOrgDetail.hae4List', 'yangLaoOrgDetail.hae8List',
)

# This table reflects code paths that actually read the source value into the
# private preview. FIELD_MAP alone also includes merely proposed/deferred fields.
PROJECTED_PATHS = {
    'list.axbe0001': 'observations[].mcaId',
    'list.axbe0003': 'observations[].list.name',
    'list.axbe0004': 'observations[].list.facilityTypeCode',
    'list.axbe0004Name': 'observations[].list.facilityTypeLabel',
    'list.areaCode': 'observations[].list.areaCode',
    'list.areaCodeName': 'observations[].list.regionLabel',
    'list.areaCodeNameFiveLevel': 'observations[].list.regionPath',
    'list.axbe0013': 'observations[].list.address',
    'list.ahae2347': 'observations[].list.listedBeds',
    'list.ahae2323': 'observations[].list.nursingBeds',
    'list.axbe8004': 'observations[].list.listedFeeMinRaw',
    'list.axbe8003': 'observations[].list.listedFeeMaxRaw',
    'list.ahae0633': 'observations[].list.serviceFunctionCodes',
    'list.ahae0633Name': 'observations[].list.serviceFunctionLabels',
    'list.ahae0701': 'observations[].list.networkLevelCode',
    'list.ahae0702': 'observations[].list.networkPositionCode',
    'list.ahae0702Name': 'observations[].list.networkPositionLabel',
    'list.overallEvaluation': 'observations[].list.platformRating',
    'list.evaluationCount': 'observations[].list.ratingCount',
    'orgBaseDetail.axbe0003': 'details[].name',
    'orgBaseDetail.axbe0013': 'details[].address',
    'orgBaseDetail.areaCode': 'details[].areaCode',
    'orgBaseDetail.ahae0021': 'details[].areaSqm',
    'yangLaoOrgDetail.ahae2347': 'details[].listedBeds',
    'yangLaoOrgDetail.ahae2323': 'details[].nursingBeds',
}
VALIDATED_PATHS = frozenset(('orgBaseDetail.axbe0001', 'yangLaoOrgDetail.axbe0001'))


def is_under_prefix(path, prefix):
    return path == prefix or path.startswith(prefix + '.') or path.startswith(prefix + '[]')


def read_json(path):
    with path.open(encoding='utf-8-sig') as stream:
        return json.load(stream)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def text_or_none(value, field, issues):
    if value is None:
        return None
    if not isinstance(value, str):
        issues[field] += 1
        return None
    return value.strip() or None


def number_or_none(value, field, issues):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        issues[field] += 1
        return None
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        issues[field + ':nonfinite'] += 1
        return None
    if value < 0:
        issues[field + ':negative'] += 1
    return value


def csv_or_none(value, field, issues):
    clean = text_or_none(value, field, issues)
    return [part.strip() for part in clean.split(',') if part.strip()] if clean else None


def normalize_list(row, issues):
    return {
        'name': text_or_none(row.get('axbe0003'), 'name', issues),
        'facilityTypeCode': text_or_none(row.get('axbe0004'), 'facilityTypeCode', issues),
        'facilityTypeLabel': text_or_none(row.get('axbe0004Name'), 'facilityTypeLabel', issues),
        'areaCode': text_or_none(row.get('areaCode'), 'areaCode', issues),
        'regionLabel': text_or_none(row.get('areaCodeName'), 'regionLabel', issues),
        'regionPath': text_or_none(row.get('areaCodeNameFiveLevel'), 'regionPath', issues),
        'address': text_or_none(row.get('axbe0013'), 'address', issues),
        'listedBeds': number_or_none(row.get('ahae2347'), 'listedBeds', issues),
        'nursingBeds': number_or_none(row.get('ahae2323'), 'nursingBeds', issues),
        'listedFeeMinRaw': number_or_none(row.get('axbe8004'), 'listedFeeMinRaw', issues),
        'listedFeeMaxRaw': number_or_none(row.get('axbe8003'), 'listedFeeMaxRaw', issues),
        'serviceFunctionCodes': csv_or_none(row.get('ahae0633'), 'serviceFunctionCodes', issues),
        'serviceFunctionLabels': csv_or_none(row.get('ahae0633Name'), 'serviceFunctionLabels', issues),
        'networkLevelCode': text_or_none(row.get('ahae0701'), 'networkLevelCode', issues),
        'networkPositionCode': text_or_none(row.get('ahae0702'), 'networkPositionCode', issues),
        'networkPositionLabel': text_or_none(row.get('ahae0702Name'), 'networkPositionLabel', issues),
        'platformRating': number_or_none(row.get('overallEvaluation'), 'platformRating', issues),
        'ratingCount': number_or_none(row.get('evaluationCount'), 'ratingCount', issues),
    }


def normalize_detail(wrapper, identifier, issues):
    if not isinstance(wrapper, dict):
        raise ValueError('detail wrapper is not an object')
    if wrapper.get('institutionId') != identifier:
        raise ValueError('detail filename/ID mismatch')
    endpoints = wrapper.get('endpoints')
    if not isinstance(endpoints, dict):
        raise ValueError('detail endpoints missing')
    for name in ('orgBaseDetail', 'yangLaoOrgDetail'):
        endpoint = endpoints.get(name)
        if not isinstance(endpoint, dict):
            raise ValueError(f'{name}: endpoint missing')
        request, response = endpoint.get('request'), endpoint.get('response')
        if not isinstance(request, dict) or request.get('params') != {'axbe0001': identifier}:
            raise ValueError(f'{name}: request ID mismatch')
        if endpoint.get('httpStatus') != 200 or not isinstance(response, dict) or response.get('code') != 0:
            raise ValueError(f'{name}: unsuccessful response')
    base = endpoints.get('orgBaseDetail', {}).get('response', {}).get('data')
    care = endpoints.get('yangLaoOrgDetail', {}).get('response', {}).get('data')
    if not isinstance(base, dict) or not isinstance(care, dict):
        raise ValueError('detail endpoint data missing')
    if base.get('axbe0001') is not None and base['axbe0001'] != identifier:
        raise ValueError('detail body/ID mismatch')
    if care.get('axbe0001') is not None and care['axbe0001'] != identifier:
        raise ValueError('detail body/ID mismatch')
    return {
        'name': text_or_none(base.get('axbe0003'), 'detail.name', issues),
        'address': text_or_none(base.get('axbe0013'), 'detail.address', issues),
        'areaCode': text_or_none(base.get('areaCode'), 'detail.areaCode', issues),
        'areaSqm': number_or_none(base.get('ahae0021'), 'areaSqm', issues),
        'listedBeds': number_or_none(care.get('ahae2347'), 'detail.listedBeds', issues),
        'nursingBeds': number_or_none(care.get('ahae2323'), 'detail.nursingBeds', issues),
        'fetchedAtUtc': wrapper.get('fetchedAtUtc'),
    }


def field_gap_report(root, scope_code, detail_ids):
    inventory = runpy.run_path(str(Path(__file__).with_name('audit-mca-fields.py')))['inventory'](root, scope_code, detail_ids)
    fields = {}
    for path, counts in inventory['fields'].items():
        if path in RESTRICTED_CONTACT_PATHS:
            proposed, existing, status = None, None, 'restricted'
            projection_status = 'restricted'
        elif any(is_under_prefix(path, prefix) for prefix in PRIVACY_REVIEW_PREFIXES):
            proposed, existing, status = None, None, 'privacy-review'
            projection_status = 'withheld'
        elif path in FIELD_MAP:
            proposed, existing, status = FIELD_MAP[path]
            projection_status = ('projected' if path in PROJECTED_PATHS else
                                 'validated' if path in VALIDATED_PATHS else 'unprojected')
        else:
            proposed, existing, status = None, None, 'unreviewed'
            projection_status = 'validated' if path in VALIDATED_PATHS else 'unprojected'
        fields[path] = {**counts, 'proposedField': proposed, 'existingField': existing,
                        'status': status, 'projectionStatus': projection_status,
                        'projectedTo': PROJECTED_PATHS.get(path)}
    unprojected_non_null = [path for path, field in fields.items()
                            if field['projectionStatus'] == 'unprojected' and field['nonNullCount']]
    unprojected_null_only = [path for path, field in fields.items()
                             if field['projectionStatus'] == 'unprojected' and not field['nonNullCount']]
    top_level = {}
    for endpoint in ('list', 'orgBaseDetail', 'yangLaoOrgDetail'):
        prefix = endpoint + '.'
        top_level[endpoint] = {
            path[len(prefix):].split('.')[0].split('[]')[0]
            for path in fields if path.startswith(prefix)
        }
    list_keys = top_level['list']
    base_keys = top_level['orgBaseDetail']
    care_keys = top_level['yangLaoOrgDetail']
    endpoint_comparison = {
        'basis': 'top-level key names only; no semantic equivalence',
        'listKeyCount': len(list_keys), 'orgBaseKeyCount': len(base_keys),
        'yangLaoKeyCount': len(care_keys),
        'sharedDetailKeys': sorted(base_keys & care_keys),
        'orgBaseOnlyKeys': sorted(base_keys - care_keys),
        'yangLaoOnlyKeys': sorted(care_keys - base_keys),
        'detailKeysAbsentFromList': sorted((base_keys | care_keys) - list_keys),
        'orgBaseCoveredByYangLao': base_keys <= care_keys if base_keys and care_keys else None,
        'yangLaoCoveredByOrgBase': care_keys <= base_keys if base_keys and care_keys else None,
        'listCoversBothDetails': (base_keys | care_keys) <= list_keys if base_keys and care_keys else None,
    }
    return {
        'schemaVersion': 2, 'scope': 'area-' + scope_code, 'publishable': False,
        'observedListRows': inventory['listRows'], 'observedDetailFiles': inventory['detailFiles'],
        'fieldPathCount': len(fields),
        'projectedPathCount': sum(field['projectionStatus'] == 'projected' for field in fields.values()),
        'validatedPathCount': sum(field['projectionStatus'] == 'validated' for field in fields.values()),
        'restrictedContactPaths': [path for path, field in fields.items() if field['status'] == 'restricted'],
        'privacyReviewPaths': [path for path, field in fields.items() if field['status'] == 'privacy-review'],
        'unprojectedNonNullPaths': unprojected_non_null,
        'unprojectedNullOnlyPaths': unprojected_null_only,
        'endpointTopLevelComparison': endpoint_comparison,
        'fields': fields,
    }


def normalize_scope(root, area_code, check_sort=False):
    scope_code = area_code + ('-check-sort-1' if check_sort else '')
    folder = root / ('area-' + scope_code)
    manifest = read_json(folder / 'manifest.json')
    if manifest.get('scope') != folder.name:
        raise ValueError('manifest scope mismatch')
    if check_sort:
        filters = manifest.get('filters')
        if (not isinstance(filters, dict) or filters.get('areaCode') != area_code
                or type(filters.get('checkSort')) is not int or filters['checkSort'] != 1):
            raise ValueError('manifest checkSort filter mismatch')
    expected_pages = manifest.get('expectedPages')
    if not isinstance(expected_pages, int) or expected_pages < 1:
        raise ValueError('manifest expectedPages invalid')
    total = manifest.get('total')
    page_size = manifest.get('serverPageSize')
    if (not isinstance(total, int) or total < 1 or not isinstance(page_size, int)
            or page_size < 1 or expected_pages != (total + page_size - 1) // page_size):
        raise ValueError('manifest total/page size/page count inconsistent')
    issues = Counter()
    observations = []
    hashes_by_id = defaultdict(set)
    counts = Counter()
    total_drift_pages = []
    size_drift_pages = []
    page_length_mismatch_pages = []
    page_numbers = []
    for path in sorted((folder / 'pages').glob('*.json')):
        page = int(path.stem)
        wrapper = read_json(path)
        data = wrapper.get('response', {}).get('data')
        if (wrapper.get('httpStatus') != 200 or wrapper.get('response', {}).get('code') != 0
                or not isinstance(data, dict) or not isinstance(data.get('records'), list)
                or data.get('current') != page):
            raise ValueError(f'invalid saved page: {path.name}')
        params = wrapper.get('request', {}).get('params')
        expected_params = {'current': page, 'size': 10, 'areaCode': area_code}
        if check_sort:
            expected_params['checkSort'] = 1
        if (params != expected_params
                or (check_sort and type(params.get('checkSort')) is not int)):
            raise ValueError(f'saved page query mismatch: {path.name}')
        page_numbers.append(page)
        if data.get('total') != manifest.get('total'):
            total_drift_pages.append(page)
        if data.get('size') != manifest.get('serverPageSize'):
            size_drift_pages.append(page)
        expected_length = page_size if page < expected_pages else total - page_size * (expected_pages - 1)
        if page > expected_pages or len(data['records']) != expected_length:
            page_length_mismatch_pages.append(page)
        for position, row in enumerate(data['records'], 1):
            if not isinstance(row, dict) or not isinstance(row.get('axbe0001'), str) or not row['axbe0001']:
                raise ValueError(f'missing platform ID: {path.name}:{position}')
            identifier = row['axbe0001']
            normalized = normalize_list(row, issues)
            observations.append({'page': page, 'position': position,
                                 'fetchedAtUtc': wrapper.get('fetchedAtUtc'),
                                 'mcaId': identifier, 'list': normalized})
            counts[identifier] += 1
            hashes_by_id[identifier].add(hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest())
            beds, nursing = normalized['listedBeds'], normalized['nursingBeds']
            if beds is not None and nursing is not None and nursing > beds:
                issues['invalidNursingBedRows'] += 1
            minimum, maximum = normalized['listedFeeMinRaw'], normalized['listedFeeMaxRaw']
            if minimum is not None and maximum is not None and minimum > maximum:
                issues['invertedFeeRows'] += 1
    details = {}
    invalid_detail_files = []
    for path in sorted((folder / 'details').glob('*.json')):
        try:
            details[path.stem] = normalize_detail(read_json(path), path.stem, issues)
        except ValueError:
            invalid_detail_files.append(path.name)
    list_detail_bed_conflicts = set()
    for observation in observations:
        detail = details.get(observation['mcaId'])
        if detail and detail['listedBeds'] is not None and observation['list']['listedBeds'] is not None and detail['listedBeds'] != observation['list']['listedBeds']:
            list_detail_bed_conflicts.add(observation['mcaId'])
    gap = field_gap_report(root, scope_code, set(details))
    saved = set(page_numbers)
    missing = [page for page in range(1, expected_pages + 1) if page not in saved]
    duplicate_count = sum(count - 1 for count in counts.values())
    manifest_claims_complete = manifest.get('complete') is True
    source_manifest_complete = (
        manifest_claims_complete and not missing and len(saved) == expected_pages
        and not duplicate_count and not total_drift_pages and not size_drift_pages
        and not page_length_mismatch_pages
        and len(observations) == manifest.get('total')
    )
    quality = {
        'schemaVersion': 2, 'scope': folder.name,
        'manifestClaimsComplete': manifest_claims_complete,
        'sourceManifestComplete': source_manifest_complete,
        'observedRows': len(observations), 'uniqueIds': len(counts),
        'savedPages': len(page_numbers), 'expectedPages': expected_pages,
        'missingPages': missing, 'totalDriftPages': total_drift_pages,
        'sizeDriftPages': size_drift_pages,
        'pageLengthMismatchPages': page_length_mismatch_pages,
        'duplicateIdCount': duplicate_count,
        'conflictingDuplicateIdCount': sum(len(hashes) > 1 for hashes in hashes_by_id.values()),
        'savedDetails': len(details), 'invalidDetailFiles': invalid_detail_files,
        'orphanDetails': sorted(set(details) - set(counts)),
        'invalidNursingBedRows': issues['invalidNursingBedRows'],
        'invertedFeeRows': issues['invertedFeeRows'],
        'listDetailBedConflictIds': sorted(list_detail_bed_conflicts),
        'fieldTypeIssues': {key: count for key, count in sorted(issues.items())
                            if key not in ('invalidNursingBedRows', 'invertedFeeRows')},
        'unreviewedPathCount': sum(field['status'] == 'unreviewed' for field in gap['fields'].values()),
        'restrictedPathCount': sum(field['status'] == 'restricted' for field in gap['fields'].values()),
        'privacyReviewPathCount': len(gap['privacyReviewPaths']),
        'unprojectedNonNullPathCount': len(gap['unprojectedNonNullPaths']),
        'unprojectedNullOnlyPathCount': len(gap['unprojectedNullOnlyPaths']),
        'readyForFullProjection': False,
    }
    return {
        'schemaVersion': 1, 'source': '全国养老服务信息平台',
        'scope': folder.name, 'publishable': False,
        'reason': 'private incomplete/unaudited preview; not a public data export',
        'observations': observations, 'details': details,
    }, gap, quality


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--area-code', required=True)
    parser.add_argument('--check-sort', action='store_true',
                        help='normalize only area-<code>-check-sort-1 private cache')
    args = parser.parse_args()
    if len(args.area_code) != 12 or not args.area_code.isdigit():
        parser.error('--area-code must be a 12-digit administrative code')
    preview, gaps, quality = normalize_scope(args.root, args.area_code, args.check_sort)
    folder = args.root / ('area-' + args.area_code + ('-check-sort-1' if args.check_sort else ''))
    write_json(folder / 'normalized-preview.json', preview)
    write_json(folder / 'field-gap-report.json', gaps)
    write_json(folder / 'quality-report.json', quality)
    print(json.dumps({key: quality[key] for key in (
        'scope', 'observedRows', 'uniqueIds', 'duplicateIdCount',
        'savedDetails', 'unreviewedPathCount', 'sourceManifestComplete')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
