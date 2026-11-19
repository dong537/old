"""Project verified modern MCA observations into a private evidence file.

This never contacts the site or writes to public/. A complete observed source
chain is required, but national completeness and publication remain unproved.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
from functools import lru_cache
import hashlib
import json
import math
import os
from pathlib import Path
import runpy
import tempfile


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'data/private/mca-institutions-2026-11-18'
OUTPUT_NAME = 'national-observed-normalized-private.v1.json'
BASE = 'national-observed-details-20261119'
OVERLAY = 'national-level4-observed-details-v1'
OVERLAY_SEED = 'national-area-level4-overlay-seeds.v1.json'
GATE = runpy.run_path(str(PROJECT / 'scripts/audit-mca-field-production-gate.py'),
                      run_name='mca_private_projection_gate')

# Only fields with observed, non-contact semantics are included. The field
# name describes this platform's observation, not a registration or live fact.
LIST_FIELDS = (
    ('facilityName', 'axbe0003', 'text'),
    ('facilityTypeCode', 'axbe0004', 'text'),
    ('facilityTypeLabel', 'axbe0004Name', 'text'),
    ('areaCode', 'areaCode', 'text'),
    ('regionLabel', 'areaCodeName', 'text'),
    ('regionPath', 'areaCodeNameFiveLevel', 'text'),
    ('facilityAddress', 'axbe0013', 'text'),
    ('listedBeds', 'ahae2347', 'beds'),
    ('nursingBeds', 'ahae2323', 'beds'),
)
BASE_FIELDS = (
    ('facilityName', 'axbe0003', 'text'),
    ('facilityTypeLabel', 'axbe0004Name', 'text'),
    ('areaCode', 'areaCode', 'text'),
    ('facilityAddress', 'axbe0013', 'text'),
)
CARE_FIELDS = (
    ('listedBeds', 'ahae2347', 'beds'),
    ('nursingBeds', 'ahae2323', 'beds'),
)


def reject(code):
    raise ValueError(code)


def read_json(path):
    try:
        with path.open(encoding='utf-8') as stream:
            return json.load(stream)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError('source_file_unreadable') from error


def utc_time(value):
    if not isinstance(value, str):
        reject('source_time_invalid')
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValueError('source_time_invalid') from error
    if moment.tzinfo is None:
        reject('source_time_invalid')
    return moment


def checked_source_times(wrapper):
    requested = wrapper.get('requestedAtUtc')
    fetched = wrapper.get('fetchedAtUtc')
    if utc_time(requested) > utc_time(fetched):
        reject('source_time_invalid')
    return requested, fetched


def field_evidence(row, fields, source):
    if not isinstance(row, dict):
        reject('source_row_invalid')
    for name, key, kind in fields:
        if key not in row:
            yield name, {'state': 'missing', 'source': source}
            continue
        value = row[key]
        if value is None:
            state = 'null'
        elif kind == 'text':
            if not isinstance(value, str):
                reject('known_field_type_invalid')
            state = ('empty' if value == '' else 'whitespace' if not value.strip()
                     else 'string_zero' if value == '0' else 'populated')
        elif kind == 'beds':
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                reject('known_field_type_invalid')
            state = 'numeric_zero' if value == 0 else 'populated'
        else:
            reject('field_contract_invalid')
        yield name, {'value': value, 'state': state, 'source': source}


def queue_metadata(path):
    metadata = {}
    for key, value, kind in GATE['queue_members'](path):
        if kind == 'value':
            metadata[key] = value
    return metadata


def checked_coverage(verified, issues):
    if (type(verified) is not bool or not isinstance(issues, list)
            or any(not isinstance(issue, str) or not issue for issue in issues)
            or len(issues) != len(set(issues))
            or verified and issues):
        reject('source_list_coverage_invalid')
    return {'verified': verified, 'issues': issues}


def verified_chain(root):
    try:
        report = GATE['audit'](root)
    except (OSError, ValueError, TypeError, KeyError) as error:
        raise ValueError('source_audit_unavailable') from error
    stages = report['sourceBatchVerification']
    required = [BASE]
    overlay_seed = root / OVERLAY_SEED
    if overlay_seed.exists():
        seed = read_json(overlay_seed)
        if type(seed.get('seedCount')) is not int or seed['seedCount'] < 0:
            reject('overlay_seed_invalid')
        if seed['seedCount']:
            required.append(OVERLAY)
    if (not report['gates']['source_files_unchanged_during_audit']
            or not all(stages.get(name, {}).get('verified') is True for name in required)
            or any(not stage.get('verified') for stage in stages.values())):
        reject('source_chain_unverified')
    owner = root / (OVERLAY if OVERLAY in required else BASE)
    queue = owner / 'queue.json'
    metadata = queue_metadata(queue)
    expected = (metadata.get('mergedUniqueIdCount') if owner.name == OVERLAY
                else metadata.get('uniqueIdCount'))
    if type(expected) is not int or expected <= 0:
        reject('source_queue_empty_or_invalid')
    return report, stages, owner, queue, metadata, expected


def source_path(root, value):
    if not isinstance(value, str):
        reject('source_path_invalid')
    path = Path(value).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        reject('source_path_invalid')
    return path


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def records_for_page(root):
    @lru_cache(maxsize=128)
    def load(value):
        path = source_path(root, value)
        raw = path.read_bytes()
        try:
            wrapper = json.loads(raw)
            records = wrapper['response']['data']['records']
            if not isinstance(records, list):
                reject('source_page_invalid')
        except (UnicodeError, json.JSONDecodeError, TypeError, KeyError) as error:
            raise ValueError('source_page_invalid') from error
        return wrapper, records, sha256(raw)
    return load


def add_list_evidence(root, item, fields, used, page_loader):
    identifier = item['institutionId']
    for reference in item['sourcePages']:
        coverage = checked_coverage(reference.get('listCoverageVerified'),
                                    reference.get('areaIssues'))
        path = source_path(root, reference['pagePath'])
        wrapper, rows, file_sha = page_loader(str(path))
        if (file_sha != reference['storedFileSha256']
                or wrapper.get('responseSha256') != reference['responseSha256']
                or wrapper.get('fetchedAtUtc') != reference['fetchedAtUtc']):
            reject('source_page_changed')
        matches = [(position, row) for position, row in enumerate(rows, 1)
                   if isinstance(row, dict) and row.get('axbe0001') == identifier]
        key = (str(path), identifier)
        offset = used[key]
        if offset >= len(matches):
            reject('source_page_row_missing')
        position, row = matches[offset]
        used[key] += 1
        requested, fetched = checked_source_times(wrapper)
        source = {
            'endpoint': 'queryOrganizationDataList',
            'file': path.relative_to(root).as_posix(), 'fileSha256': file_sha,
            'responseSha256': wrapper['responseSha256'],
            'requestedAtUtc': requested, 'fetchedAtUtc': fetched,
            'areaCode': reference['areaCode'], 'pageNumber': reference['pageNumber'],
            'rowNumber': position, 'listCoverageVerified': coverage['verified'],
            'areaIssues': coverage['issues'],
        }
        for name, evidence in field_evidence(row, LIST_FIELDS, source):
            fields.setdefault(name, []).append(evidence)


def add_detail_evidence(root, identifier, fields):
    base_path = root / BASE / 'details' / f'{identifier}.json'
    overlay_path = root / OVERLAY / 'details' / f'{identifier}.json'
    if base_path.is_file() and overlay_path.is_file():
        reject('detail_owner_ambiguous')
    path = overlay_path if overlay_path.is_file() else base_path
    if not path.is_file():
        reject('source_detail_missing')
    raw = path.read_bytes()
    try:
        combined = json.loads(raw)
        if combined['institutionId'] != identifier:
            reject('source_detail_identity_mismatch')
        endpoints = combined['endpoints']
    except (UnicodeError, json.JSONDecodeError, TypeError, KeyError) as error:
        raise ValueError('source_detail_invalid') from error
    file_sha = sha256(raw)
    for endpoint, mapping in (('orgBaseDetail', BASE_FIELDS),
                              ('yangLaoOrgDetail', CARE_FIELDS)):
        try:
            wrapper = endpoints[endpoint]
            row = wrapper['response']['data']
            # The care endpoint may omit the ID. The audited request, path and
            # raw response bind it to the queue ID; a present conflicting ID
            # remains invalid.
            if row.get('axbe0001', identifier) != identifier:
                reject('source_detail_identity_mismatch')
            requested, fetched = checked_source_times(wrapper)
            response_sha = wrapper['responseSha256']
        except (TypeError, KeyError, AttributeError) as error:
            raise ValueError('source_detail_invalid') from error
        source = {
            'endpoint': endpoint, 'file': path.relative_to(root).as_posix(),
            'fileSha256': file_sha, 'responseSha256': response_sha,
            'requestedAtUtc': requested, 'fetchedAtUtc': fetched,
            'responseIdState': ('present' if 'axbe0001' in row else 'absent'),
        }
        for name, evidence in field_evidence(row, mapping, source):
            fields.setdefault(name, []).append(evidence)


def build_private_snapshot(root=ROOT):
    root = Path(root).resolve()
    if not root.is_dir() or root.is_relative_to((PROJECT / 'public').resolve()):
        reject('private_root_invalid')
    before, stages, owner, queue, metadata, expected = verified_chain(root)
    target = 'mergedItems' if owner.name == OVERLAY else 'items'
    output = root / OUTPUT_NAME
    temporary = None
    count = 0
    used = Counter()
    page_loader = records_for_page(root)
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                         prefix=OUTPUT_NAME + '.', suffix='.tmp',
                                         dir=root, delete=False) as stream:
            temporary = Path(stream.name)
            os.chmod(temporary, 0o600)
            header = {
                'schemaVersion': 1, 'scope': 'verified_observed_mca_private_evidence',
                'publishable': False, 'nationalComplete': False,
                'snapshotVerified': False,
                'sourceInventorySha256': metadata['sourceInventorySha256'],
                'sourceInputFileSetSha256': before['inputFileSetSha256'],
                'sourceBatches': [{
                    'stage': name, 'detailCount': stages[name]['detailCount'],
                    'batchCount': stages[name]['batchCount'],
                } for name in (BASE, OVERLAY) if name in stages],
            }
            stream.write(json.dumps(header, ensure_ascii=False, separators=(',', ':'))[:-1])
            stream.write(',"records":[')
            previous = ''
            for key, item, kind in GATE['queue_members'](queue):
                if kind != 'item' or key != target:
                    continue
                if not isinstance(item, dict):
                    reject('source_queue_item_invalid')
                identifier = item.get('institutionId')
                if not isinstance(identifier, str) or identifier <= previous:
                    reject('source_queue_order_invalid')
                coverage = checked_coverage(item.get('listCoverageVerified'),
                                            item.get('listCoverageIssues'))
                references = item.get('sourcePages')
                if not isinstance(references, list) or not references:
                    reject('source_list_coverage_invalid')
                reference_coverages = [checked_coverage(
                    reference.get('listCoverageVerified'), reference.get('areaIssues'))
                    for reference in references]
                if (coverage['verified'] != all(source['verified']
                                               for source in reference_coverages)
                        or not set().union(*(source['issues']
                            for source in reference_coverages)) <= set(coverage['issues'])):
                    reject('source_list_coverage_invalid')
                fields = {}
                add_list_evidence(root, item, fields, used, page_loader)
                add_detail_evidence(root, identifier, fields)
                if not any(evidence.get('state') == 'populated'
                           for evidence in fields.get('facilityName', [])
                           if evidence['source']['endpoint'] == 'queryOrganizationDataList'):
                    reject('source_name_missing')
                if count:
                    stream.write(',')
                stream.write(json.dumps({'mcaId': identifier, 'fields': fields,
                                         'listCoverage': coverage,
                                         'listObservationCount': len(references)},
                                        ensure_ascii=False, separators=(',', ':'),
                                        allow_nan=False))
                count += 1
                previous = identifier
            stream.write('],"recordCount":' + str(count) + '}\n')
        if count != expected:
            reject('source_queue_count_mismatch')
        after, later_stages, later_owner, later_queue, later_metadata, later_expected = verified_chain(root)
        if (after['inputFileSetSha256'] != before['inputFileSetSha256']
                or later_stages != stages or later_owner != owner or later_queue != queue
                or later_metadata['sourceInventorySha256'] != metadata['sourceInventorySha256']
                or later_expected != expected):
            reject('source_changed_during_normalization')
        os.replace(temporary, output)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return {'recordCount': count, 'output': str(output),
            'sourceInventorySha256': metadata['sourceInventorySha256'],
            'publishable': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args(argv)
    try:
        result = build_private_snapshot(ROOT)
    except (OSError, ValueError, TypeError, KeyError) as error:
        code = str(error) if isinstance(error, ValueError) and str(error).replace('_', '').isalnum() else 'private_normalization_failed'
        print(json.dumps({'code': code, 'publishable': False}))
        return 2
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
