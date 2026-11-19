"""Offline source-level MCA field production gate; aggregates only, no export."""
from __future__ import annotations

import argparse
from bisect import bisect_right
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import runpy
import re

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
PROGRESS = runpy.run_path(str(HERE / 'audit-mca-pipeline-progress.py'))
READINESS = runpy.run_path(str(HERE / 'audit-mca-production-readiness.py'))
NORMALIZER = READINESS['NORMALIZER']
ROOT = PROGRESS['ROOT']
MISSING = object()
COMPARE = {
    'facilityName': ('list.axbe0003', 'orgBaseDetail.axbe0003'),
    'facilityAddress': ('list.axbe0013', 'orgBaseDetail.axbe0013'),
    'listedBeds': ('list.ahae2347', 'yangLaoOrgDetail.ahae2347'),
    'nursingBeds': ('list.ahae2323', 'yangLaoOrgDetail.ahae2323'),
}
BED_KEYS = ('ahae2347', 'ahae2323')
NUMERIC_FIELDS = {'listedBeds', 'nursingBeds', 'listedFeeMinRaw', 'listedFeeMaxRaw',
                  'bedFeeRaw', 'careFeeRaw', 'mealFeeRaw', 'platformRating', 'ratingCount', 'areaSqm'}
MODERN_PAGE_DIRS = ('national-area-first-pages-20261119',
                    'national-area-followup-pages-20261119',
                    'national-area-large-pages-20261119',
                    'national-level4-first-pages-v1',
                    'national-level4-followup-pages-v1',
                    'national-level4-large-pages-v1')
MODERN_DETAIL_DIRS = ('national-observed-details-20261119',
                      'national-level4-observed-details-v1')


def input_paths(root):
    pages = sorted(set(PROGRESS['page_files'](root, 'legacyCaptures')) |
                   {p for name in MODERN_PAGE_DIRS
                    for p in (root / name).glob('area-*/pages/*.json')
                    if PROGRESS['PAGE'].fullmatch(p.name)})
    details = sorted({p for folder in root.glob('area-*')
                      if PROGRESS['AREA'].match(folder.name)
                      for p in (folder / 'details').glob('*.json')}
                     | {p for name in MODERN_DETAIL_DIRS
                        for p in (root / name / 'details').glob('*.json')})
    return pages, details


def provenance_paths(root):
    return sorted({p for name in MODERN_DETAIL_DIRS
                   for p in [root / name / 'manifest.json', root / name / 'queue.json',
                             *(root / name / 'batch-runs').glob('*.status.json'),
                             *(root / name / 'detail-checkpoints').glob('*/*'),
                             *(root / name / 'details').glob('*')]
                   if p.is_file()} |
                  {p for p in [root / 'national-area-tree-seeds-20261119.json',
                               root / 'national-area-level4-overlay-seeds.v1.json',
                               *(root / name / 'manifest.json' for name in MODERN_PAGE_DIRS)]
                   if p.is_file()})


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(65536), b''):
            digest.update(chunk)
    return digest.digest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def queue_members(path):
    """Stream top-level array items without materializing either queue array."""
    decoder = json.JSONDecoder()
    with path.open(encoding='utf-8') as stream:
        buffer, position, eof = '', 0, False

        def fill():
            nonlocal buffer, position, eof
            buffer = buffer[position:]
            position = 0
            chunk = stream.read(65536)
            buffer += chunk
            eof = not chunk

        def peek():
            nonlocal position
            while True:
                while position < len(buffer) and buffer[position].isspace():
                    position += 1
                if position < len(buffer):
                    return buffer[position]
                if eof:
                    return ''
                fill()

        def take(token):
            nonlocal position
            if peek() != token:
                raise ValueError('invalid_queue_json')
            position += 1

        def value():
            nonlocal position
            peek()
            while True:
                try:
                    item, end = decoder.raw_decode(buffer, position)
                    if end == len(buffer) and not eof:
                        fill()
                        continue
                    position = end
                    return item
                except json.JSONDecodeError:
                    if eof:
                        raise ValueError('invalid_queue_json')
                    fill()

        take('{')
        seen = set()
        if peek() != '}':
            while True:
                key = value()
                if not isinstance(key, str) or key in seen:
                    raise ValueError('duplicate_queue_key')
                seen.add(key)
                take(':')
                if peek() == '[':
                    take('[')
                    yield key, None, 'array'
                    if peek() != ']':
                        while True:
                            yield key, value(), 'item'
                            if peek() != ',':
                                break
                            take(',')
                    take(']')
                else:
                    yield key, value(), 'value'
                if peek() != ',':
                    break
                take(',')
        take('}')
        if peek():
            raise ValueError('queue_trailing_data')


def verify_modern_batches(root, pages, details, hashes, read_input, now):
    """Verify observed-source lineage, not national or business-field accuracy."""
    stage_results, verified_ids, verified_files = {}, set(), set()
    page_meta, expected_refs = {}, [Counter(), Counter()]
    invalid_families = set()
    for path in pages:
        family = next((i // 3 for i, name in enumerate(MODERN_PAGE_DIRS)
                       if path.parent.parent.parent.name == name), None)
        if family is None:
            continue
        try:
            wrapper = read_input(path)
            area = PROGRESS['AREA'].fullmatch(path.parent.parent.name)
            number = int(path.stem)
            params = wrapper['request']['params']
            data, problem = READINESS['response_data'](wrapper)
            captured = PROGRESS['parsed_utc'](wrapper.get('fetchedAtUtc'))
            if (not area or problem or wrapper.get('rawBodyBase64') is None
                    or not READINESS['check_integrity'](wrapper, Counter(), Counter())
                    or not READINESS['request_valid'](wrapper, 'queryOrganizationDataList', params)
                    or params.get('areaCode') != area.group(1) or params.get('current') != number
                    or data.get('current') != number or type(data.get('size')) is not int
                    or data['size'] <= 0 or type(data.get('total')) is not int or data['total'] < 0
                    or captured is None or captured > now or not isinstance(data.get('records'), list)
                    or len(data['records']) != min(data['size'], max(0, data['total']-(number-1)*data['size']))):
                raise ValueError('source_page_invalid')
            location = str(path.resolve())
            page_meta[location] = (family, hashes[path].hex(), wrapper['responseSha256'],
                                   wrapper['fetchedAtUtc'], area.group(1), number,
                                   math.ceil(data['total'] / data['size']))
            for row in data['records']:
                identifier = row.get('axbe0001') if isinstance(row, dict) else None
                if not isinstance(identifier, str) or not PROGRESS['IDENTIFIER'].fullmatch(identifier):
                    raise ValueError('source_page_identity_invalid')
                expected_refs[family][identifier, location] += 1
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            invalid_families.add(family)

    area_pages = defaultdict(set)
    for meta in page_meta.values():
        area_pages[meta[0], meta[4]].add(meta[5])
    incomplete_areas = {(meta[0], meta[4]) for meta in page_meta.values()
                        if len(area_pages[meta[0], meta[4]]) < meta[6]}
    base_summary = None
    for family, name in enumerate(MODERN_DETAIL_DIRS):
        owner = root / name
        if (not owner.exists() and not expected_refs[family] and family not in invalid_families
                and not any((root / n).exists() for n in MODERN_PAGE_DIRS[family * 3:family * 3 + 3])):
            continue
        try:
            if family in invalid_families or family == 1 and base_summary is None:
                raise ValueError('upstream_provenance_invalid')
            queue_path = owner / 'queue.json'
            metadata, arrays = {}, set()
            for key, value, kind in queue_members(queue_path):
                if kind == 'value':
                    metadata[key] = value
                elif kind == 'array':
                    arrays.add(key)
            if (metadata.get('schemaVersion') != 1 or 'items' not in arrays
                    or type(metadata.get('uniqueIdCount')) is not int
                    or metadata['uniqueIdCount'] < 0
                    or any(metadata.get(flag) is not False for flag in
                           ('nationalComplete', 'snapshotVerified', 'publishable'))):
                raise ValueError('queue_metadata_invalid')
            scope = ('details-for-observed-list-ids-only' if family == 0
                     else 'level4-incremental-details-for-observed-ids-only')
            if metadata.get('scope') != scope:
                raise ValueError('queue_scope_invalid')
            seed_name = ('national-area-tree-seeds-20261119.json' if family == 0
                         else 'national-area-level4-overlay-seeds.v1.json')
            source_files = {'sourceSeedSha256': root / seed_name}
            for key, stage in zip(('sourceFirstPageManifestSha256',
                                   'sourceFollowupManifestSha256', 'sourceLargeManifestSha256'),
                                  MODERN_PAGE_DIRS[family * 3:family * 3 + 3]):
                source_files[key] = root / stage / 'manifest.json'
            if metadata.get('sourceDescendantSeedSha256') is not None:
                source_files['sourceDescendantSeedSha256'] = root / 'national-area-level4-overlay-seeds.v1.json'
            if family:
                source_files['sourceBaseDetailManifestSha256'] = root / MODERN_DETAIL_DIRS[0] / 'manifest.json'
            for key, path in source_files.items():
                actual = hashes[path].hex() if path in hashes else None
                if metadata.get(key) != actual or actual is None and key in (
                        'sourceSeedSha256', 'sourceFirstPageManifestSha256', 'sourceBaseDetailManifestSha256'):
                    raise ValueError('queue_source_hash_mismatch')
            seed_document = read_input(source_files['sourceSeedSha256'])
            seeds = seed_document.get('seeds')
            if (not isinstance(seeds, list) or seed_document.get('seedCount') != len(seeds)
                    or any(not isinstance(s, dict) or not isinstance(s.get('sbcode'), str)
                           or not re.fullmatch(r'[0-9]{12}', s['sbcode']) for s in seeds)):
                raise ValueError('source_seed_inventory_invalid')
            codes = {s['sbcode'] for s in seeds}
            if len(codes) != len(seeds) or not {m[4] for m in page_meta.values() if m[0] == family} <= codes:
                raise ValueError('source_page_not_in_seed')
            source_manifest_times = []
            for key in ('sourceFirstPageManifestSha256', 'sourceFollowupManifestSha256', 'sourceLargeManifestSha256'):
                if source_files[key] not in hashes:
                    continue
                document = read_input(source_files[key])
                if (not isinstance(document, dict) or document.get('schemaVersion') != 1
                        or document.get('sourceSeedSha256') != metadata['sourceSeedSha256']):
                    raise ValueError('source_manifest_seed_mismatch')
                moment = PROGRESS['parsed_utc'](document.get('auditedAtUtc'))
                if moment is None or moment > now:
                    raise ValueError('source_manifest_time_invalid')
                source_manifest_times.append(moment)
                if key != 'sourceFirstPageManifestSha256' and document.get('sourceFirstPageManifestSha256') != metadata['sourceFirstPageManifestSha256']:
                    raise ValueError('source_manifest_first_page_mismatch')
            if family and base_summary['descendant'] != metadata['sourceSeedSha256']:
                raise ValueError('base_descendant_source_mismatch')
            manifest = read_input(owner / 'manifest.json')
            for key in (*source_files, 'sourceInventorySha256', 'sourceDescendantSeedSha256',
                        'sourceBaseDetailManifestSha256', 'uniqueIdCount', 'scope'):
                if manifest.get(key) != metadata.get(key):
                    raise ValueError('detail_manifest_source_mismatch')
            total = metadata['uniqueIdCount']
            if (manifest.get('schemaVersion') != 1 or type(manifest.get('completedDetailCount')) is not int
                    or manifest['completedDetailCount'] != total
                    or manifest.get('detailsCompleteForObservedIds') is not True
                    or any(manifest.get(flag) is not False for flag in
                           ('nationalComplete', 'snapshotVerified', 'publishable'))):
                raise ValueError('detail_manifest_incomplete')
            target = 'mergedItems' if family else 'items'
            if target not in arrays:
                raise ValueError('queue_items_missing')
            inventory = hashlib.sha256()
            if family:
                if metadata.get('sourceBaseInventorySha256') != base_summary['inventory']:
                    raise ValueError('base_inventory_mismatch')
                inventory.update(b'{"baseDetailManifestSha256":' + canonical(metadata['sourceBaseDetailManifestSha256'])
                                 + b',"baseSourceInventorySha256":' + canonical(metadata['sourceBaseInventorySha256'])
                                 + b',"mergedItems":')
            elif metadata.get('sourceDescendantSeedSha256') is not None:
                inventory.update(b'{"items":')
            inventory.update(b'[')
            overlay_inventory = hashlib.sha256(b'[')
            summaries, selected, refs = {}, {}, Counter()
            previous, overlay_count, observation_count = '', 0, 0
            for key, item, kind in queue_members(queue_path):
                if kind != 'item' or key not in ('items', target):
                    continue
                identifier = item.get('institutionId') if isinstance(item, dict) else None
                if not isinstance(identifier, str) or not PROGRESS['IDENTIFIER'].fullmatch(identifier):
                    raise ValueError('queue_identity_invalid')
                if key == 'items':
                    if identifier in selected:
                        raise ValueError('queue_duplicate_identity')
                    selected[identifier] = hashlib.sha256(canonical(item)).digest()
                if key != target:
                    continue
                if identifier <= previous:
                    raise ValueError('queue_order_invalid')
                if summaries:
                    inventory.update(b',')
                inventory.update(canonical(item))
                previous = identifier
                sources = item.get('sourcePages')
                if not isinstance(sources, list) or not sources:
                    raise ValueError('queue_source_pages_missing')
                source_hashes, overlay_sources = [], []
                for source in sources:
                    location = str(Path(source['pagePath']).resolve())
                    meta = page_meta.get(location)
                    if meta is None or family == 0 and meta[0] != 0:
                        raise ValueError('queue_source_path_invalid')
                    if (source.get('storedFileSha256'), source.get('responseSha256'),
                        source.get('fetchedAtUtc'), source.get('areaCode'), source.get('pageNumber')) != meta[1:6]:
                        raise ValueError('queue_source_observation_mismatch')
                    refs[identifier, location] += 1
                    observation_count += 1
                    source_hashes.append(hashlib.sha256(canonical(source)).digest())
                    if meta[0] == 1:
                        overlay_sources.append(source)
                summaries[identifier] = (hashlib.sha256(canonical(item)).digest(), tuple(source_hashes))
                if family and identifier in base_summary['items']:
                    base_sources = base_summary['items'][identifier][1]
                    if tuple(source_hashes[:len(base_sources)]) != base_sources:
                        raise ValueError('base_sources_not_preserved')
                if family and overlay_sources:
                    overlay_item = dict(item, sourcePages=overlay_sources,
                                        listCoverageVerified=all(s['listCoverageVerified'] for s in overlay_sources),
                                        listCoverageIssues=sorted({issue for s in overlay_sources for issue in s['areaIssues']}))
                    for source in overlay_sources:
                        meta = page_meta[str(Path(source['pagePath']).resolve())]
                        if (1, meta[4]) in incomplete_areas:
                            overlay_item['listCoverageIssues'] = sorted(set(overlay_item['listCoverageIssues']) | {'incompletePageCoverage'})
                    if overlay_count:
                        overlay_inventory.update(b',')
                    overlay_inventory.update(canonical(overlay_item))
                    overlay_count += 1
            inventory.update(b']')
            overlay_inventory.update(b']')
            if family:
                inventory.update(b',"overlaySeedSha256":' + canonical(metadata['sourceSeedSha256'])
                                 + b',"overlaySourceInventorySha256":' + canonical(metadata['sourceOverlayInventorySha256']) + b'}')
                if (metadata.get('sourceOverlayInventorySha256') != overlay_inventory.hexdigest()
                        or metadata.get('mergedUniqueIdCount') != len(summaries)
                        or metadata.get('reusedOriginalDetailCount') != len(base_summary['items'])
                        or set(selected) != set(summaries) - set(base_summary['items'])
                        or any(selected[i] != summaries[i][0] for i in selected)):
                    raise ValueError('incremental_queue_mismatch')
            elif metadata.get('sourceDescendantSeedSha256') is not None:
                inventory.update(b',"sourceDescendantSeedSha256":' + canonical(metadata['sourceDescendantSeedSha256']) + b'}')
            expected = expected_refs[0] + expected_refs[1] if family else expected_refs[0]
            if (inventory.hexdigest() != metadata.get('sourceInventorySha256')
                    or len(selected) != total or refs != expected
                    or metadata.get('sourceObservationCount') != observation_count):
                raise ValueError('queue_inventory_mismatch')
            batch_paths = sorted((owner / 'batch-runs').glob('*.status.json'))
            batches, previous_end, completed, prefix = [], None, 0, None
            for number, path in enumerate(batch_paths, 1):
                match = re.fullmatch(r'(detail-[0-9]{8}-auto|l4detail-v1)-([0-9]{4})\.status\.json', path.name)
                if (not match or int(match.group(2)) != number
                        or (family == 1) != (match.group(1) == 'l4detail-v1')
                        or prefix is not None and prefix != match.group(1)):
                    raise ValueError('batch_sequence_invalid')
                prefix = match.group(1)
                status = read_input(path)
                start, end = (PROGRESS['parsed_utc'](status.get(k)) for k in ('startedAtUtc', 'endedAtUtc'))
                count, added, requests = (status.get(k) for k in ('completedDetailCount', 'newlySavedDetails', 'requestsThisRun'))
                final = number == len(batch_paths)
                if (status.get('schemaVersion') != 1 or status.get('runId') != path.name.removesuffix('.status.json')
                        or status.get('phase') != 'finished' or not start or not end or not start <= end <= now
                        or previous_end is not None and start < previous_end
                        or any(type(v) is not int for v in (count, added, requests))
                        or not 0 <= added <= 20 or not 0 <= requests <= 60
                        or count != completed + added or not 0 <= count <= total
                        or status.get('uniqueIdCount') != total
                        or type(status.get('uniqueIdCount')) is not int
                        or status.get('sourceInventorySha256') != metadata['sourceInventorySha256']
                        or status.get('sourceDescendantSeedSha256') != metadata.get('sourceDescendantSeedSha256')
                        or status.get('error') is not None or status.get('rateLimited') is not False
                        or any(status.get(flag) is not False for flag in ('nationalComplete', 'snapshotVerified', 'publishable'))
                        or status.get('exitCode') != (0 if final else 1)
                        or type(status.get('exitCode')) is not int
                        or type(status.get('requestBudgetReached')) is not bool
                        or status.get('detailsCompleteForObservedIds') is not final
                        or final and count != total or not final and count >= total
                        or not final and not (added > 0 or status['requestBudgetReached'] and requests > 0)):
                    raise ValueError('batch_status_invalid')
                batches.append((start, end, requests, added))
                previous_end, completed = end, count
            audited = PROGRESS['parsed_utc'](manifest.get('auditedAtUtc'))
            if not batches or not audited or not batches[-1][0] <= audited <= batches[-1][1]:
                raise ValueError('manifest_batch_time_invalid')
            if family and batches[0][0] < base_summary['ended']:
                raise ValueError('overlay_predates_base_completion')
            if any(moment > batches[0][0] for moment in source_manifest_times):
                raise ValueError('source_manifest_postdates_batch')
            actual_details = {p.stem: p for p in details if p.parent == owner / 'details'}
            checkpoints = set((owner / 'detail-checkpoints').glob('*/*'))
            expected_checkpoints = {owner / 'detail-checkpoints' / i / f'{e}.json'
                                    for i in selected for e in PROGRESS['DETAIL_NAMES']}
            all_detail_paths = set((owner / 'details').glob('*'))
            if (set(actual_details) != set(selected) or checkpoints != expected_checkpoints
                    or all_detail_paths != set(actual_details.values())):
                raise ValueError('detail_cache_inventory_mismatch')
            requests_seen, completed_seen = Counter(), Counter()
            starts = [b[0] for b in batches]
            for identifier, path in actual_details.items():
                combined = read_input(path)
                endpoints = combined.get('endpoints')
                if (combined.get('schemaVersion') != 1 or combined.get('institutionId') != identifier
                        or not isinstance(endpoints, dict) or set(endpoints) != set(PROGRESS['DETAIL_NAMES'])):
                    raise ValueError('detail_envelope_invalid')
                last_batch = -1
                for endpoint, wrapper in endpoints.items():
                    checkpoint = owner / 'detail-checkpoints' / identifier / f'{endpoint}.json'
                    requested, fetched = (PROGRESS['parsed_utc'](wrapper.get(k)) for k in ('requestedAtUtc', 'fetchedAtUtc'))
                    row, problem = READINESS['response_data'](wrapper)
                    if (read_input(checkpoint) != wrapper or wrapper.get('rawBodyBase64') is None
                            or not READINESS['check_integrity'](wrapper, Counter(), Counter()) or problem
                            or not READINESS['request_valid'](wrapper, endpoint, {'axbe0001': identifier})
                            or row.get('axbe0001', identifier) != identifier
                            or not requested or not fetched or requested > fetched or fetched > audited):
                        raise ValueError('detail_raw_provenance_invalid')
                    batch = bisect_right(starts, requested) - 1
                    if batch < 0 or fetched > batches[batch][1]:
                        raise ValueError('detail_not_owned_by_batch')
                    requests_seen[batch] += 1
                    last_batch = max(last_batch, batch)
                completed_seen[last_batch] += 1
            # requestsThisRun counts every site request, including clock HEADs
            # and unsuccessful attempts; saved detail responses are a subset.
            if any(requests_seen[i] > b[2] or completed_seen[i] != b[3] for i, b in enumerate(batches)):
                raise ValueError('batch_response_counts_mismatch')
            if any(PROGRESS['parsed_utc'](meta[3]) > batches[0][0]
                   for meta in page_meta.values() if meta[0] == family):
                raise ValueError('source_page_postdates_batch')
            stage_results[name] = {'verified': True, 'code': 'verified_observed_source_chain',
                                   'detailCount': total, 'batchCount': len(batches),
                                   'requestsWithoutSavedDetailResponse': sum(
                                       b[2] - requests_seen[i] for i, b in enumerate(batches))}
            verified_ids.update(selected)
            verified_files.update(actual_details.values())
            if family == 0:
                base_summary = {'inventory': metadata['sourceInventorySha256'], 'items': summaries,
                                'ended': batches[-1][1], 'descendant': metadata.get('sourceDescendantSeedSha256')}
        except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
            code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'[a-z_]+', str(error)) else 'provenance_input_invalid'
            stage_results[name] = {'verified': False, 'code': code}
    return stage_results, verified_ids, verified_files


def value_state(value):
    if value is MISSING:
        return 'missing'
    if value is None:
        return 'null'
    if isinstance(value, str):
        if value == '':
            return 'empty_string'
        if not value.strip():
            return 'whitespace'
        if value.strip().upper() in ('NA', 'N/A', 'UNKNOWN', 'NULL'):
            return 'literal_unknown'
        return 'string_zero' if value == '0' else 'populated'
    if isinstance(value, (list, dict)) and not value:
        return 'empty_container'
    if type(value) in (int, float) and value == 0:
        return 'numeric_zero'
    return 'populated'


def number_value_valid(value):
    try:
        return (type(value) in (int, float) and math.isfinite(value)
                and value >= 0)
    except OverflowError:
        return False


def bed_value_valid(value):
    return number_value_valid(value) and int(value) == value


def endpoint_evidence(wrapper, now, counts, issues):
    if not isinstance(wrapper, dict):
        issues['invalid_wrapper'] += 1
        return None
    integrity, local = Counter(), Counter()
    if not READINESS['check_integrity'](wrapper, integrity, local):
        issues['invalid_raw_evidence'] += 1
        return None
    data, problem = READINESS['response_data'](wrapper)
    if problem:
        issues['unsuccessful_or_malformed_endpoint'] += 1
        return None
    raw = wrapper.get('rawBodyBase64') is not None
    counts['validEndpointWrappers'] += 1
    counts['wrappersWithVerifiedRawBytes' if raw else 'wrappersWithoutRawBytes'] += 1
    captured = PROGRESS['parsed_utc'](wrapper.get('fetchedAtUtc'))
    if captured is None or captured > now:
        issues['invalid_capture_time'] += 1
        captured = None
    return data, captured, raw


def cohort_paths(root, modern):
    pages, details = input_paths(root)
    return ([p for p in pages if (p.parent.parent.parent.name in MODERN_PAGE_DIRS) == modern],
            [p for p in details if (p.parent.parent.name in MODERN_DETAIL_DIRS) == modern])


def audit_cohort(root, now, *, modern):
    pages, details = cohort_paths(root, modern)
    provenance = provenance_paths(root) if modern else []
    hashes = {path: file_digest(path) for path in [*pages, *details, *provenance]}
    counts, issues, inventory = Counter(), Counter(), {}
    ids, detail_ids, bed_violation_ids = set(), set(), set()
    shape_detail_ids = set()
    fields = {}
    comparable = {field: defaultdict(set) for field in COMPARE}
    known = set(NORMALIZER['FIELD_MAP']) | set(NORMALIZER['RESTRICTED_CONTACT_PATHS'])
    fields_by_endpoint = defaultdict(list)
    for path in sorted(known):
        endpoint, key = path.split('.', 1)
        proposed, _, status = NORMALIZER['FIELD_MAP'].get(path, (None, None, 'restricted'))
        fields_by_endpoint[endpoint].append((path, key, proposed))
        fields[path] = {
            'owner': 'mca_platform_observation', 'proposedField': proposed,
            'semanticStatus': status, 'privateProjection': NORMALIZER['PROJECTED_PATHS'].get(path),
            'productionUse': 'withheld', 'states': Counter(), 'types': Counter(),
            'invalidValueCount': 0, 'rawVerifiedObservationCount': 0,
            'capturedFirstAtUtc': None, 'capturedLastAtUtc': None,
            'sourceEffectiveAt': None, 'freshness': 'unknown',
        }

    def read_input(path):
        raw = path.read_bytes()
        if hashlib.sha256(raw).digest() != hashes.get(path):
            issues['input_changed_during_read'] += 1
        return json.loads(raw)

    def observe(identifier, endpoint, row, captured, raw):
        READINESS['ADD_RECORD'](row, endpoint, inventory)
        for path, key, proposed in fields_by_endpoint[endpoint]:
            field = fields[path]
            value = row.get(key, MISSING)
            state = value_state(value)
            field['states'][state] += 1
            if value is not MISSING:
                field['types'][type(value).__name__] += 1
                field['rawVerifiedObservationCount'] += raw
                if captured:
                    first, last = field['capturedFirstAtUtc'], field['capturedLastAtUtc']
                    field['capturedFirstAtUtc'] = min(first, captured) if first else captured
                    field['capturedLastAtUtc'] = max(last, captured) if last else captured
            if state not in ('populated', 'numeric_zero', 'string_zero'):
                continue
            invalid = (key in BED_KEYS and not bed_value_valid(value)
                       or proposed in NUMERIC_FIELDS and not number_value_valid(value)
                       or proposed == 'ratingCount' and not bed_value_valid(value)
                       or proposed is not None and proposed not in NUMERIC_FIELDS
                       and not isinstance(value, str))
            field['invalidValueCount'] += bool(invalid)
            if invalid:
                continue
            for name, paths in COMPARE.items():
                if path in paths:
                    values = comparable[name][identifier]
                    if len(values) < 2:
                        values.add(hashlib.sha256(json.dumps(
                            value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).digest())
        if endpoint in ('list', 'yangLaoOrgDetail'):
            beds = [row.get(key, MISSING) for key in BED_KEYS]
            for value in beds:
                if value_state(value) in ('populated', 'numeric_zero', 'string_zero') and not bed_value_valid(value):
                    issues['invalid_bed_value'] += 1
                    bed_violation_ids.add(identifier)
            if all(bed_value_valid(v) for v in beds) and beds[1] > beds[0]:
                issues['nursing_beds_exceed_listed_beds'] += 1
                bed_violation_ids.add(identifier)

    for path in pages:
        try:
            wrapper = read_input(path)
            area = PROGRESS['AREA'].match(path.parent.parent.name)
            page = PROGRESS['PAGE'].fullmatch(path.name)
            request = wrapper.get('request', {})
            params = request.get('params', {})
            if (not area or not page or not isinstance(params, dict)
                    or params.get('areaCode') != area.group(1)
                    or params.get('current') != int(page.group(1))
                    or not READINESS['request_valid'](wrapper, 'queryOrganizationDataList', params)):
                issues['invalid_list_request'] += 1
                continue
            evidence = endpoint_evidence(wrapper, now, counts, issues)
            if evidence is None:
                continue
            data, captured, raw = evidence
            rows = data.get('records')
            if (not isinstance(rows, list) or data.get('current') != int(page.group(1))
                    or type(data.get('size')) is not int or data['size'] < 1
                    or type(data.get('total')) is not int or data['total'] < 0
                    or len(rows) != min(data['size'], max(0, data['total'] - (data['current'] - 1) * data['size']))):
                issues['invalid_list_shape'] += 1
                continue
            counts['validPageFiles'] += 1
            for row in rows:
                identifier = row.get('axbe0001') if isinstance(row, dict) else None
                if not isinstance(identifier, str) or not PROGRESS['IDENTIFIER'].fullmatch(identifier):
                    issues['invalid_list_identity'] += 1
                    continue
                ids.add(identifier)
                counts['listRows'] += 1
                observe(identifier, 'list', row, captured, raw)
        except (ValueError, TypeError, KeyError, AttributeError):
            issues['invalid_list_file'] += 1
    for path in details:
        try:
            wrapper = read_input(path)
            identifier = path.stem
            endpoints = wrapper.get('endpoints')
            if (wrapper.get('institutionId') != identifier
                    or not PROGRESS['IDENTIFIER'].fullmatch(identifier)
                    or not isinstance(endpoints, dict) or set(endpoints) != set(PROGRESS['DETAIL_NAMES'])):
                issues['invalid_detail_pair'] += 1
                continue
            pairs = []
            for endpoint in PROGRESS['DETAIL_NAMES']:
                part = endpoints[endpoint]
                if not READINESS['request_valid'](part, endpoint, {'axbe0001': identifier}):
                    issues['detail_identity_mismatch'] += 1
                    break
                evidence = endpoint_evidence(part, now, counts, issues)
                if evidence is None:
                    break
                row, captured, raw = evidence
                if row.get('axbe0001') is None:
                    issues['detail_body_identity_missing'] += 1
                elif row['axbe0001'] != identifier:
                    issues['detail_identity_mismatch'] += 1
                    break
                pairs.append((endpoint, row, captured, raw))
            if len(pairs) != 2:
                continue
            shape_detail_ids.add(identifier)
            counts['shapeValidDetailPairFiles'] += 1
            owner = path.parent.parent
            if owner.name in MODERN_DETAIL_DIRS:
                counts['modernShapeValidDetailPairFiles'] += 1
                checkpoints_match = True
                for endpoint in PROGRESS['DETAIL_NAMES']:
                    checkpoint = owner / 'detail-checkpoints' / identifier / f'{endpoint}.json'
                    try:
                        if read_input(checkpoint) != endpoints[endpoint]:
                            checkpoints_match = False
                    except (OSError, ValueError, TypeError):
                        checkpoints_match = False
                if checkpoints_match:
                    counts['checkpointMatchedModernDetailPairs'] += 1
                else:
                    issues['modern_detail_checkpoint_missing_or_mismatched'] += 1
                if not all((owner / name).is_file() for name in ('manifest.json', 'queue.json')):
                    issues['modern_detail_batch_metadata_missing'] += 1
                # Promotion occurs only after the independent provenance chain audit.
            else:
                detail_ids.add(identifier)
                counts['validDetailPairFiles'] += 1
            for endpoint, row, captured, raw in pairs:
                observe(identifier, endpoint, row, captured, raw)
        except (ValueError, TypeError, KeyError, AttributeError):
            issues['invalid_detail_file'] += 1

    for field in fields.values():
        for key in ('capturedFirstAtUtc', 'capturedLastAtUtc'):
            if field[key] is not None:
                field[key] = field[key].isoformat()
    conflicts = {field: sum(len(values) > 1 for values in per_id.values())
                 for field, per_id in comparable.items()}
    classifications = READINESS['path_report'](inventory)
    source_batches, source_ids, source_files = (verify_modern_batches(
        root, pages, details, hashes, read_input, now) if modern else ({}, set(), set()))
    try:
        unchanged = (cohort_paths(root, modern) == (pages, details)
                     and (not modern or provenance_paths(root) == provenance)
                     and not issues['input_changed_during_read']
                     and all(file_digest(p) == digest for p, digest in hashes.items()))
    except OSError:
        unchanged = False
    if not unchanged:
        issues['input_changed_during_audit'] += 1
        source_ids, source_files = set(), set()
        for stage in source_batches.values():
            stage.update(verified=False, code='input_changed_during_audit')
    detail_ids.update(source_ids)
    counts['sourceVerifiedModernDetailPairFiles'] = len(source_files)
    counts['validDetailPairFiles'] += len(source_files)
    unverified = counts['modernShapeValidDetailPairFiles'] - len(source_files)
    if unverified:
        issues['modern_detail_source_batch_unverified'] += unverified
    counts.update(pageFiles=len(pages), detailPairFiles=len(details), provenanceFiles=len(provenance),
                  uniqueObservedIds=len(ids),
                  idsWithShapeValidDetailPairs=len(ids & shape_detail_ids),
                  idsWithValidDetailPairs=len(ids & detail_ids), missingDetailsForObservedIds=len(ids - detail_ids),
                  orphanDetailIds=len(detail_ids - ids), shortObservedIds=sum(len(v) < 8 for v in ids),
                  bedViolationIdCount=len(bed_violation_ids))
    for key in ('wrappersWithoutRawBytes', 'wrappersWithVerifiedRawBytes', 'validEndpointWrappers',
                'validDetailPairFiles', 'shapeValidDetailPairFiles',
                'modernShapeValidDetailPairFiles', 'checkpointMatchedModernDetailPairs'):
        counts.setdefault(key, 0)
    gates = {
        'observed_population_present': bool(ids),
        'all_observed_ids_have_detail_pairs': bool(ids) and ids <= detail_ids,
        'endpoint_identity_consistent': not any(issues[k] for k in (
            'invalid_list_identity', 'invalid_list_request', 'detail_identity_mismatch')),
        'detail_source_batches_verified': bool(source_batches) and all(
            stage['verified'] for stage in source_batches.values()) and unchanged,
        'detail_body_identity_present': bool(shape_detail_ids) and not issues['detail_body_identity_missing'],
        'endpoint_shapes_valid': not any(issues[key] for key in (
            'invalid_wrapper', 'unsuccessful_or_malformed_endpoint', 'invalid_list_shape',
            'invalid_list_file', 'invalid_detail_pair', 'invalid_detail_file')),
        'all_endpoint_raw_bytes_verified': counts['validEndpointWrappers'] > 0 and counts['wrappersWithoutRawBytes'] == 0 and not issues['invalid_raw_evidence'],
        'capture_times_valid': not issues['invalid_capture_time'],
        'equivalent_fields_conflict_free': not any(conflicts.values()),
        'mapped_value_types_valid': not any(item['invalidValueCount'] for item in fields.values()),
        'dictionary_semantics_reviewed': not classifications['unreviewedNonNullPaths'] and not any(
            item['semanticStatus'].startswith('pending-') and any(
                item['states'].get(state, 0) for state in ('populated', 'numeric_zero', 'string_zero'))
            for item in fields.values()),
        'short_platform_ids_reviewed': counts['shortObservedIds'] == 0,
        'bed_values_consistent': not bed_violation_ids,
        'source_files_unchanged_during_audit': unchanged,
        'legal_identity_verified': False,
        'current_operating_status_verified': False,
        'bed_effective_dates_verified': False,
        'contact_publication_and_recency_verified': False,
        'bulk_republication_review_complete': False,
        'national_snapshot_complete': False,
    }
    if modern and not gates['detail_source_batches_verified']:
        # Shape-valid observations remain diagnostic until their queue and
        # checkpoints are attested; they cannot satisfy production field gates.
        for key in ('all_observed_ids_have_detail_pairs', 'endpoint_identity_consistent',
                    'detail_body_identity_present', 'endpoint_shapes_valid',
                    'all_endpoint_raw_bytes_verified', 'capture_times_valid',
                    'equivalent_fields_conflict_free', 'mapped_value_types_valid',
                    'dictionary_semantics_reviewed', 'short_platform_ids_reviewed',
                    'bed_values_consistent'):
            gates[key] = False
    digest = hashlib.sha256()
    for path, file_hash in sorted(hashes.items()):
        digest.update(path.relative_to(root).as_posix().encode() + b'\0' + file_hash)
    report = {
        'scope': ('modern_private_institution_endpoints' if modern else
                  'historical_legacy_private_institution_endpoints'),
        'counts': dict(counts), 'issues': dict(issues), 'fields': fields, 'conflicts': conflicts,
        'dictionary': {'observedPathCount': classifications['pathCount'],
                       'unreviewedNonNullPathCount': len(classifications['unreviewedNonNullPaths']),
                       'privacyReviewPathCount': len(classifications['privacyReviewPaths']),
                       'restrictedContactPathCount': len(classifications['restrictedContactPaths'])},
        'inputFileSetSha256': digest.hexdigest(),
        'detailValidityMeaning': ('verified_modern_source_chain' if modern else 'legacy_endpoint_checks'),
        'fieldObservationMeaning': 'shape_valid_observations_in_this_cohort',
        'sourceBatchVerification': source_batches,
        'inputDigestMeaning': 'local_wrapper_files_not_original_http_proof',
        'gates': gates, 'blockingCodes': [key for key, passed in gates.items() if not passed],
    }
    return report, hashes


def audit(root, *, now=None):
    root = Path(root)
    if not root.is_dir():
        raise ValueError('cache_root_unavailable')
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('audit_time_requires_timezone')
    now = now.astimezone(timezone.utc)
    modern, modern_hashes = audit_cohort(root, now, modern=True)
    legacy, _ = audit_cohort(root, now, modern=False)
    current_modern_files = set()
    try:
        pages, details = cohort_paths(root, True)
        current_modern_files = set([*pages, *details, *provenance_paths(root)])
        modern_unchanged = (current_modern_files == set(modern_hashes)
                            and all(file_digest(path) == digest
                                    for path, digest in modern_hashes.items()))
    except OSError:
        modern_unchanged = False
    if not modern_unchanged:
        # The legacy scan ran after the modern scan. A change in between
        # invalidates every modern source promotion, not just publication.
        modern['issues']['input_changed_during_audit'] = max(
            modern['issues'].get('input_changed_during_audit', 0), 1)
        for stage in modern['sourceBatchVerification'].values():
            stage.update(verified=False, code='input_changed_during_audit')
        modern['counts'].update(sourceVerifiedModernDetailPairFiles=0,
                                validDetailPairFiles=0, idsWithValidDetailPairs=0,
                                missingDetailsForObservedIds=modern['counts']['uniqueObservedIds'],
                                orphanDetailIds=0, wrappersWithVerifiedRawBytes=0)
        for field in modern['fields'].values():
            field['rawVerifiedObservationCount'] = 0
        modern['detailValidityMeaning'] = 'unverified_modern_source_chain'
        modern['fieldObservationMeaning'] = 'diagnostic_pre_drift_observations'
        modern['gates'] = {key: False for key in modern['gates']}
        modern['blockingCodes'] = list(modern['gates'])
    has_modern_input = bool(modern_hashes or current_modern_files)
    primary = modern if has_modern_input else legacy
    return {
        **primary, 'schemaVersion': 4, 'auditedAtUtc': now.isoformat(),
        'historicalLegacy': legacy,
        'fieldContractSha256': hashlib.sha256(json.dumps(
            {'fieldMap': NORMALIZER['FIELD_MAP'], 'privateProjection': NORMALIZER['PROJECTED_PATHS'],
             'restrictedPaths': sorted(NORMALIZER['RESTRICTED_CONTACT_PATHS']), 'comparison': COMPARE},
            sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
        'manualReviewCodes': ['legal_entity_link', 'current_institution_operating_status',
                              'beds_definition_and_effective_date',
                              'public_business_phone_rights_and_last_verification',
                              'detail_dictionary_labels_and_units'],
        'productionReady': False, 'publishable': False, 'snapshotVerified': False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args(argv)
    try:
        report = audit(args.root)
    except (OSError, ValueError, TypeError):
        print(json.dumps({'code': 'field_gate_unavailable', 'productionReady': False, 'publishable': False}))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    return 1 if report['blockingCodes'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
