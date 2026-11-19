"""Audit the private MCA collection pipeline without contacting the site.

Counts describe files actually present at the instant of this scan. A running
collector may have written responses that its batch manifest has not yet
committed. Neither a reported API total nor a complete page-number walk proves
an exhaustive or publishable national snapshot. No source values or IDs leave
the private cache in this report.
"""

from __future__ import annotations

import argparse
import base64
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1] / 'data/private/mca-institutions-2026-11-18'
SITE = 'yanglao.mca.gov.cn'
LIST_PATH = '/ylxxptapi/ylfwpt/ylfw/queryOrganizationDataList'
DETAIL_PATH = '/ylxxptapi/ylfwpt/ylfw/'
TREE_PATH = '/ylxxptapi/console/area/childs/'
SHA = re.compile(r'[0-9a-f]{64}\Z')
AREA = re.compile(r'area-([0-9]{12})(?:-|$)')
IDENTIFIER = re.compile(r'[A-Za-z0-9_-]{7,64}\Z')
PAGE = re.compile(r'([0-9]{5})\.json\Z')
PAGE_DIRS = {
    'firstPages': 'national-area-first-pages-20261119',
    'smallFollowups': 'national-area-followup-pages-20261119',
    'largeFollowups': 'national-area-large-pages-20261119',
    'level4FirstPages': 'national-level4-first-pages-v1',
    'level4SmallFollowups': 'national-level4-followup-pages-v1',
    'level4LargeFollowups': 'national-level4-large-pages-v1',
}
DETAIL_DIRS = {
    'observedDetails': 'national-observed-details-20261119',
    'level4Details': 'national-level4-observed-details-v1',
}
DETAIL_NAMES = ('orgBaseDetail', 'yangLaoOrgDetail')


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def parsed_utc(value):
    if not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value)
    except ValueError:
        return None
    return result.astimezone(timezone.utc) if result.tzinfo else None


def official_url(value, path):
    if not isinstance(value, str):
        return False
    url = urlsplit(value)
    return url.scheme == 'https' and url.hostname == SITE and url.path == path


def check_body(wrapper, integrity, issues, *, tree=False):
    """Return whether the saved JSON has valid local evidence.

    Legacy wrappers may have only parsed JSON. They remain observable but the
    original HTTP bytes are explicitly counted as unavailable.
    """
    if not isinstance(wrapper, dict) or not isinstance(wrapper.get('response'), dict):
        issues['invalidWrapper'] += 1
        return False
    declared = wrapper.get('responseSha256')
    if not isinstance(declared, str) or not SHA.fullmatch(declared):
        issues['invalidDeclaredResponseSha256'] += 1
        return False
    encoded = wrapper.get('rawBodyBase64')
    if encoded is None:
        provenance = wrapper.get('provenance', {})
        if tree:
            if (not isinstance(provenance, dict)
                    or provenance.get('kind') != 'cached-json-payload'
                    or provenance.get('originalHttpBodyAvailable') is not False):
                issues['unattributedMissingTreeRawBody'] += 1
                return False
            canonical = json.dumps(wrapper['response'], ensure_ascii=False,
                                   sort_keys=True, separators=(',', ':'),
                                   allow_nan=False).encode('utf-8')
            if hashlib.sha256(canonical).hexdigest() != declared:
                issues['cachedTreePayloadHashMismatch'] += 1
                return False
        integrity['originalHttpBodyUnavailable'] += 1
        return True
    try:
        raw = base64.b64decode(encoded, validate=True)
        if (hashlib.sha256(raw).hexdigest() != declared
                or json.loads(raw) != wrapper['response']):
            raise ValueError('saved raw response differs')
    except (TypeError, ValueError, UnicodeDecodeError):
        issues['rawBodyHashOrJsonMismatch'] += 1
        return False
    integrity['rawHttpBodyVerified'] += 1
    return True


def inspect_tree(root, integrity, issues, file_set, timestamps):
    folder = root / 'area-tree-20261119'
    files = sorted((folder / 'responses').glob('*.json'))
    result = {'responseFiles': len(files), 'validResponses': 0,
              'originalHttpBodyUnavailable': 0, 'manifestSavedResponses': None,
              'pendingParentCount': None, 'treeWalkComplete': False}
    for path in files:
        file_set.update(path.relative_to(root).as_posix().encode() + b'\t'
                        + hashlib.sha256(path.read_bytes()).hexdigest().encode() + b'\n')
        try:
            item = read_json(path)
            if not check_body(item, integrity, issues, tree=True):
                continue
            response = item['response']
            if (item.get('parentId') != path.stem
                    or not official_url(item.get('sourceUrl'), TREE_PATH + path.stem)
                    or item.get('method') != 'GET' or item.get('httpStatus') != 200
                    or response.get('code') != 0
                    or not isinstance(response.get('data'), list)):
                raise ValueError('tree response shape or source differs')
            result['validResponses'] += 1
            result['originalHttpBodyUnavailable'] += item.get('rawBodyBase64') is None
            moment = parsed_utc(item.get('fetchedAtUtc'))
            if moment:
                timestamps.append(moment)
        except (OSError, ValueError, TypeError, KeyError):
            issues['invalidTreeResponse'] += 1
    manifest = folder / 'manifest.json'
    if manifest.exists():
        try:
            item = read_json(manifest)
            result['manifestSavedResponses'] = item.get('savedResponses')
            pending = item.get('pendingParentIds')
            result['pendingParentCount'] = len(pending) if isinstance(pending, list) else None
            result['treeWalkComplete'] = item.get('treeWalkComplete') is True
            if (type(result['manifestSavedResponses']) is int
                    and result['manifestSavedResponses'] > len(files)):
                issues['treeManifestAheadOfFiles'] += 1
        except (OSError, ValueError, TypeError):
            issues['invalidTreeManifest'] += 1
    return result


def page_files(root, stage):
    if stage == 'legacyCaptures':
        for folder in sorted(root.glob('area-*')):
            if folder.is_dir() and AREA.match(folder.name):
                yield from sorted((folder / 'pages').glob('*.json'))
    else:
        yield from sorted((root / PAGE_DIRS[stage]).glob('area-*/pages/*.json'))


def inspect_pages(root, stage, integrity, issues, file_set, timestamps, values, short_rows):
    files = list(page_files(root, stage))
    counts = {'pageFiles': len(files), 'validPages': 0, 'rows': 0,
              'uniqueIds': 0, 'duplicateIdOccurrences': 0}
    ids = set()
    for path in files:
        file_set.update(path.relative_to(root).as_posix().encode() + b'\t'
                        + hashlib.sha256(path.read_bytes()).hexdigest().encode() + b'\n')
        try:
            match = AREA.match(path.parent.parent.name)
            number = PAGE.fullmatch(path.name)
            item = read_json(path)
            if not match or not number or not check_body(item, integrity, issues):
                raise ValueError('invalid page file or wrapper')
            request = item.get('request', {})
            params = request.get('params', {}) if isinstance(request, dict) else {}
            data = item['response'].get('data')
            page = int(number.group(1))
            if (not official_url(request.get('url'), LIST_PATH)
                    or request.get('method') != 'POST'
                    or not isinstance(params, dict)
                    or params.get('areaCode') != match.group(1)
                    or params.get('current') != page
                    or item.get('httpStatus') != 200
                    or item['response'].get('code') != 0
                    or not isinstance(data, dict)
                    or type(data.get('current')) is not int or data['current'] != page
                    or type(data.get('size')) is not int or data['size'] < 1
                    or type(data.get('total')) is not int or data['total'] < 0
                    or not isinstance(data.get('records'), list)):
                raise ValueError('page source or shape differs')
            records = data['records']
            if (len(records) > data['size'] or any(
                    not isinstance(row, dict) or not isinstance(row.get('axbe0001'), str)
                    or not IDENTIFIER.fullmatch(row['axbe0001']) for row in records)):
                raise ValueError('invalid page records or IDs')
            expected_length = min(data['size'], max(0, data['total'] - (page - 1) * data['size']))
            if len(records) != expected_length:
                issues['pageLengthMismatch'] += 1
            counts['validPages'] += 1
            counts['rows'] += len(records)
            for row in records:
                identifier = row['axbe0001']
                if len(identifier) < 8:
                    issues['shortInstitutionIdObserved'] += 1
                    short_rows['rowOccurrences'] += 1
                    if item.get('rawBodyBase64') is None:
                        short_rows['rowsWithoutOriginalHttp'] += 1
                    else:
                        short_rows['rowsWithVerifiedRawHttp'] += 1
                counts['duplicateIdOccurrences'] += identifier in ids
                ids.add(identifier)
                for key in ('axbe0003', 'axbe0013', 'areaCode'):
                    value = row.get(key)
                    if value is not None and value != '':
                        values[identifier][key].add(json.dumps(value, ensure_ascii=False, sort_keys=True))
            moment = parsed_utc(item.get('fetchedAtUtc'))
            if moment:
                timestamps.append(moment)
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            issues[stage + 'InvalidPage'] += 1
    counts['uniqueIds'] = len(ids)
    return counts, ids


def inspect_details(root, integrity, issues, file_set, timestamps):
    paths = []
    for folder in root.glob('area-*'):
        if folder.is_dir() and AREA.match(folder.name):
            paths.extend((folder / 'details').glob('*.json'))
    modern_dirs = [root / name for name in DETAIL_DIRS.values()]
    for directory in modern_dirs:
        paths.extend((directory / 'details').glob('*.json'))
    result = {'detailFiles': len(paths), 'validDetailPairs': 0,
              'checkpointEndpointFiles': sum(
                  len(list((directory / 'detail-checkpoints').glob('*/*.json')))
                  for directory in modern_dirs)}
    ids = set()
    for path in sorted(paths):
        file_set.update(path.relative_to(root).as_posix().encode() + b'\t'
                        + hashlib.sha256(path.read_bytes()).hexdigest().encode() + b'\n')
        try:
            combined = read_json(path)
            identifier = path.stem
            endpoints = combined.get('endpoints')
            if (combined.get('institutionId') != identifier
                    or not IDENTIFIER.fullmatch(identifier)
                    or not isinstance(endpoints, dict)
                    or set(endpoints) != set(DETAIL_NAMES)):
                raise ValueError('combined detail shape differs')
            for name in DETAIL_NAMES:
                item = endpoints[name]
                if not check_body(item, integrity, issues):
                    raise ValueError('detail response body differs')
                request = item.get('request', {})
                if (not official_url(request.get('url'), DETAIL_PATH + name)
                        or request.get('method') != 'POST'
                        or request.get('params') != {'axbe0001': identifier}
                        or item.get('httpStatus') != 200
                        or item['response'].get('code') != 0
                        or not isinstance(item['response'].get('data'), dict)):
                    raise ValueError('detail source or shape differs')
                moment = parsed_utc(item.get('fetchedAtUtc'))
                if moment:
                    timestamps.append(moment)
                owner = next((directory for directory in modern_dirs
                              if path.parent == directory / 'details'), None)
                if owner is not None:
                    checkpoint = owner / 'detail-checkpoints' / identifier / f'{name}.json'
                    if not checkpoint.is_file() or read_json(checkpoint) != item:
                        raise ValueError('detail endpoint checkpoint differs')
            result['validDetailPairs'] += 1
            ids.add(identifier)
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            issues['invalidDetailPair'] += 1
    result['uniqueIdsWithValidPairs'] = len(ids)
    return result, ids


def manifest_observations(root, issues):
    found = {}
    names = {**PAGE_DIRS, **DETAIL_DIRS}
    for key, dirname in names.items():
        path = root / dirname / 'manifest.json'
        if not path.exists():
            found[key] = {'state': 'not_started'}
            continue
        try:
            item = read_json(path)
            if not isinstance(item, dict):
                raise ValueError('manifest is not an object')
            labels = (('seedCount', 'completedAreaCount', 'pendingAreaCount')
                      if key in ('firstPages', 'level4FirstPages') else
                      ('selectedAreaCount', 'areasPagesObservedComplete', 'areasUnverified')
                      if key in ('smallFollowups', 'largeFollowups',
                                 'level4SmallFollowups', 'level4LargeFollowups') else
                      ('uniqueIdCount', 'completedDetailCount'))
            found[key] = {'state': 'manifest_present',
                          'reported': {label: item.get(label) for label in labels}}
        except (OSError, ValueError, TypeError):
            issues[key + 'InvalidManifest'] += 1
            found[key] = {'state': 'invalid_manifest'}
    return found


def latest_status(paths, issues, label):
    entries = []
    for path in paths:
        try:
            item = read_json(path)
            if not isinstance(item, dict):
                raise ValueError('status is not an object')
            entries.append((parsed_utc(item.get('startedAtUtc') or item.get('checkedAtUtc'))
                            or datetime.min.replace(tzinfo=timezone.utc), item))
        except (OSError, ValueError, TypeError):
            issues['invalidStatusFile'] += 1
    if not entries:
        return {'state': 'not_started'}
    item = max(entries, key=lambda entry: entry[0])[1]
    phase = item.get('phase')
    exit_code = item.get('exitCode')
    return {'state': 'recorded', 'phase': phase, 'exitCode': exit_code,
            'rateLimited': item.get('rateLimited') is True,
            'blocked': phase == 'blocked' or item.get('rateLimited') is True
            or (phase == 'finished' and exit_code == 2),
            'endedAtUtc': item.get('endedAtUtc'),
            'errorPresent': bool(item.get('error') or item.get('lastError'))}


def status_observations(root, issues):
    runs = root / 'batch-runs'
    patterns = {
        'tree': runs.glob('tree-*.status.json'),
        **{key: (root / name / 'batch-runs').glob('*.status.json')
           for key, name in {**PAGE_DIRS, **DETAIL_DIRS}.items()},
        'level3Probe': (root / 'area-level3-probe-20261119' / 'batch-runs').glob('*.status.json'),
        'stageHandoff': [runs / 'observed-stage-handoff.status.json'],
    }
    return {label: latest_status((p for p in paths if p.is_file()), issues, label)
            for label, paths in patterns.items()}


def audit(root: Path, now=None):
    root = Path(root)
    if not root.is_dir():
        raise ValueError('private MCA cache root does not exist')
    now = now or datetime.now(timezone.utc)
    integrity, issues = Counter(), Counter()
    file_set = hashlib.sha256()
    timestamps = []
    values = defaultdict(lambda: defaultdict(set))
    short_rows = Counter()
    tree = inspect_tree(root, integrity, issues, file_set, timestamps)
    stages, all_ids = {}, set()
    for stage in ('legacyCaptures', *PAGE_DIRS):
        stages[stage], ids = inspect_pages(
            root, stage, integrity, issues, file_set, timestamps, values, short_rows)
        all_ids.update(ids)
    details, detail_ids = inspect_details(root, integrity, issues, file_set, timestamps)
    manifests = manifest_observations(root, issues)
    statuses = status_observations(root, issues)
    cooldown = {'recorded': False, 'active': False}
    rate_path = root / 'rate-limit.json'
    if rate_path.exists():
        try:
            item = read_json(rate_path)
            until = parsed_utc(item.get('cooldownUntilUtc'))
            detected = parsed_utc(item.get('detectedAtUtc'))
            if not until or not detected:
                raise ValueError('invalid cooldown timestamp')
            cooldown = {'recorded': True, 'active': now < until,
                        'detectedAtUtc': detected.isoformat(),
                        'cooldownUntilUtc': until.isoformat()}
        except (OSError, ValueError, TypeError, AttributeError):
            issues['invalidRateLimitRecord'] += 1
            cooldown = {'recorded': True, 'active': None}
    disagreements = {key: sum(len(fields[key]) > 1 for fields in values.values())
                     for key in ('axbe0003', 'axbe0013', 'areaCode')}
    return {
        'schemaVersion': 1, 'scope': 'private local MCA pipeline observations',
        'auditedAtUtc': now.astimezone(timezone.utc).isoformat(),
        'nationalComplete': False, 'snapshotVerified': False, 'publishable': False,
        'tree': tree, 'pages': stages, 'details': details,
        'observed': {'uniqueIdsFromValidPages': len(all_ids),
                     'idsWithValidDetailPairs': len(all_ids & detail_ids),
                     'idsStillMissingDetailPairs': len(all_ids - detail_ids),
                     'orphanValidDetailIds': len(detail_ids - all_ids),
                     'shortIds': {
                         'rowOccurrences': short_rows['rowOccurrences'],
                         'uniqueIdCount': sum(len(identifier) < 8 for identifier in all_ids),
                         'rowsWithVerifiedRawHttp': short_rows['rowsWithVerifiedRawHttp'],
                         'rowsWithoutOriginalHttp': short_rows['rowsWithoutOriginalHttp'],
                     }},
        'literalListFieldDisagreements': disagreements,
        'integrity': {**{key: integrity[key] for key in (
            'rawHttpBodyVerified', 'originalHttpBodyUnavailable')},
            'auditedWrapperFileSetSha256': file_set.hexdigest(),
            'fileSetMeaning': 'local wrapper bytes, not official snapshot proof'},
        'manifests': manifests, 'statuses': statuses, 'rateLimit': cooldown,
        'lastValidResponseAtUtc': max(timestamps).isoformat() if timestamps else None,
        'issues': dict(sorted(issues.items())),
    }


def write_private_report(root: Path, output: Path, report):
    root = root.resolve()
    output = output.resolve()
    if not output.is_relative_to(root):
        raise ValueError('audit output must remain in private MCA cache root')
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_name(output.name + '.tmp')
    temp.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.chmod(temp, 0o600)
    os.replace(temp, output)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    if args.root.resolve() != ROOT.resolve():
        parser.error('CLI root must be the project private MCA cache')
    report = audit(args.root)
    output = args.output or args.root / 'pipeline-progress-audit.json'
    write_private_report(args.root, output, report)
    print(json.dumps({'treeResponses': report['tree']['validResponses'],
                      'observedIds': report['observed']['uniqueIdsFromValidPages'],
                      'detailPairs': report['observed']['idsWithValidDetailPairs'],
                      'issues': report['issues'],
                      'nationalComplete': False, 'publishable': False},
                     ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
