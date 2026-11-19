"""Offline private candidate index for two locked official XLSX sources.

Contact fields remain private. Name matches do not establish institution identity,
current operation, or third-party republication permission.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import unicodedata

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / 'data/private/official-downloads/2026-11-19'
QCC_PATH = ROOT / 'data/private/qcc-institution-reference/养老机构信息.xlsx'
QCC_MANIFEST = ROOT / 'data/raw/qcc-institutions-source-manifest.json'
OUTPUT_DIR = ROOT / 'data/private/national-reconciliation/official-downloads-20261119'
QCC_SHA256 = '6bc157e2695965ed8b1c85e82f6f8b7fa7d13102149f9f1512e9863b2489fd81'
QCC_HEADERS = ('统一社会信用代码', '地址', '行政区划代码', '机构名称', '地区',
               '床位数', '省份', '城市', '区县', '经度', '纬度')
SEPARATORS = re.compile(r'[	\s()（）\[\]【】－—-]')
MCA_DIR = ROOT / 'data/private/mca-institutions-2026-11-18/area-410221000000-check-sort-1'
MCA_PAGE_SHA256 = {
    1: 'dac7de0d59ad65fce87544330525134544dc23bc0c7e192c280dc4a01fc2854e',
    2: '77b6b8326566f210f6a9668a5b7ade25a09a1a5280ec6e75628c4f4c7bacd2bc',
}
SOURCES = (
    {'key': 'dalian-hightech', 'file': 'dalian-hightech-20260716.xlsx',
     'sha256': 'e11ce7663d65c1b73fe644ce6d4fc8b0e7ba2ee4a1287230fc3c7dc866337238',
     'metadataSha256': '5813584e803636851e813e57e31b2c22d5a9d8b2464ae895d50e0040d1842b26',
     'sourcePage': 'https://www.dlhitech.gov.cn/news/view_79540.html',
     'downloadUrl': 'https://www.dlhitech.gov.cn/resources/news/newsConstantImages/2026071608580170901.xlsx',
     'title': '高新区养老机构名单（2026年7月16日更新）',
     'headers': ('序号', '性质', '名称', '地址', '对外电话'), 'nameColumn': '名称',
     'count': 9, 'areaPrefix': '2102', 'dateLabel': {'value': '2026-07-16', 'meaning': 'attachment_update_date'},
     'publishedAt': '2026-07-16', 'geographicScope': '大连高新区公告范围'},
    {'key': 'qixian', 'file': 'qixian-202512.xlsx',
     'sha256': '782f23319ea67685e71fb9f83bf011208c4a69bd32366bfbb295ced6c8c5c62e',
     'metadataSha256': 'ab8fc607ef5b49cd41971a7d3fa83273709a795c537ba519f418b23ff7e3daf2',
     'sourcePage': 'https://www.zgqx.gov.cn/qx/c00885/pc/content/content_2008114325447831552.html',
     'downloadUrl': 'https://www.zgqx.gov.cn/qx/c00885/2008114325447831552/HLvT3blQ.xlsx',
     'title': '2025年12月杞县民政系统已备案养老服务机构名单',
     'headers': ('序号', '县区', '机构名称', '地址'), 'nameColumn': '机构名称',
     'count': 33, 'areaPrefix': '410221', 'dateLabel': {'value': '2025-12', 'meaning': 'filename_reference_month'},
     'publishedAt': None, 'geographicScope': '杞县民政系统已备案机构'},
)
SOURCE_BY_KEY = {source['key']: source for source in SOURCES}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def name_key(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError('institution name missing')
    key = SEPARATORS.sub('', unicodedata.normalize('NFKC', value.strip()))
    if not key:
        raise ValueError('institution name has no comparison characters')
    return key


def _sidecar(path: Path, spec: dict, file_sha: str) -> dict:
    metadata_path = path.with_name(path.name + '.source.json')
    if digest(metadata_path) != spec['metadataSha256']:
        raise ValueError(f"{spec['key']}: source metadata SHA-256 differs")
    value = json.loads(metadata_path.read_text(encoding='utf-8'))
    if (value.get('file') != path.name or value.get('sha256') != file_sha
            or value.get('bytes') != path.stat().st_size or value.get('httpStatus') != 200
            or value.get('sourcePage') != spec['sourcePage']
            or value.get('downloadUrl') != spec['downloadUrl']):
        raise ValueError(f"{spec['key']}: source metadata differs from locked download")
    try:
        captured = datetime.fromisoformat(value['capturedAtUtc'])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"{spec['key']}: invalid capture time") from error
    if captured.tzinfo is None:
        raise ValueError(f"{spec['key']}: capture time lacks timezone")
    return value


def read_official_sources(source_dir: Path = SOURCE_DIR) -> tuple[list[dict], dict]:
    observations = []
    sources = {}
    for spec in SOURCES:
        path = source_dir / spec['file']
        file_sha = digest(path)
        if file_sha != spec['sha256']:
            raise ValueError(f"{spec['key']}: official file SHA-256 differs")
        sidecar = _sidecar(path, spec, file_sha)
        book = load_workbook(path, read_only=True, data_only=True)
        try:
            if 'Sheet1' not in book.sheetnames:
                raise ValueError(f"{spec['key']}: Sheet1 missing")
            for sheet in book.worksheets:
                if sheet.title != 'Sheet1' and any(
                        any(value is not None for value in row) for row in sheet.values):
                    raise ValueError(f"{spec['key']}: unexpected populated sheet {sheet.title}")
            sheet = book['Sheet1']
            title = tuple(next(sheet.iter_rows(min_row=1, max_row=1, values_only=True)))
            headers = tuple(next(sheet.iter_rows(min_row=2, max_row=2, values_only=True)))
            if title[0] != spec['title'] or any(value is not None for value in title[1:]):
                raise ValueError(f"{spec['key']}: title changed")
            if headers != spec['headers']:
                raise ValueError(f"{spec['key']}: headers changed")
            rows = []
            for excel_row, cells in enumerate(sheet.iter_rows(min_row=3, values_only=True), 3):
                if all(value is None for value in cells):
                    continue
                if len(cells) != len(headers):
                    raise ValueError(f"{spec['key']}: row {excel_row} width changed")
                raw = dict(zip(headers, cells))
                if raw['序号'] != len(rows) + 1:
                    raise ValueError(f"{spec['key']}: row {excel_row} sequence changed")
                name = raw[spec['nameColumn']]
                rows.append({
                    'sourceKey': spec['key'], 'sheet': 'Sheet1', 'excelRow': excel_row,
                    'sourceSequence': raw['序号'], 'name': name, 'nameKey': name_key(name),
                    'rawFields': raw, 'sourcePage': spec['sourcePage'],
                    'downloadUrl': sidecar['downloadUrl'], 'sourceSha256': file_sha,
                    'capturedAtUtc': sidecar['capturedAtUtc'], 'dateLabel': spec['dateLabel'],
                    'publishedAt': spec['publishedAt'], 'geographicScope': spec['geographicScope'],
                    'operatingStatus': None,
                })
        finally:
            book.close()
        if len(rows) != spec['count']:
            raise ValueError(f"{spec['key']}: expected {spec['count']} rows, got {len(rows)}")
        observations.extend(rows)
        sources[spec['key']] = {
            'sourcePage': spec['sourcePage'], 'downloadUrl': sidecar['downloadUrl'],
            'sha256': file_sha, 'bytes': path.stat().st_size, 'rowCount': len(rows),
            'dateLabel': spec['dateLabel'], 'publishedAt': spec['publishedAt'],
            'geographicScope': spec['geographicScope'],
            'capturedAtUtc': sidecar['capturedAtUtc'], 'reusePermissionVerified': False,
        }
    return observations, sources


def read_qcc_rows(path: Path = QCC_PATH, manifest_path: Path = QCC_MANIFEST) -> tuple[list[dict], str]:
    file_sha = digest(path)
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if (file_sha != QCC_SHA256 or manifest.get('sha256') != file_sha
            or manifest.get('bytes') != path.stat().st_size or manifest.get('rowCount') != 41955):
        raise ValueError('QCC source differs from locked 41,955-row workbook')
    book = load_workbook(path, read_only=True, data_only=True)
    try:
        if book.sheetnames != ['Sheet1']:
            raise ValueError('QCC sheet structure changed')
        sheet = book['Sheet1']
        headers = tuple(next(sheet.iter_rows(min_row=1, max_row=1, values_only=True)))
        if headers != QCC_HEADERS:
            raise ValueError('QCC headers changed')
        rows = []
        for excel_row, cells in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
            if len(cells) != len(headers):
                raise ValueError(f'QCC row {excel_row}: width changed')
            name = cells[3]
            rows.append({
                'excelRow': excel_row, 'name': name, 'nameKey': name_key(name),
                'divisionCode': str(cells[2] or '').removesuffix('.0'),
                'region': str(cells[4] or '').strip(),
            })
    finally:
        book.close()
    if len(rows) != 41955:
        raise ValueError(f'QCC row count changed: {len(rows)}')
    return rows, file_sha


def _match_scope(source_key: str, division_code: str) -> str:
    prefix = SOURCE_BY_KEY[source_key]['areaPrefix']
    if division_code.startswith(prefix):
        return 'same_county' if source_key == 'qixian' else 'same_city_scope_unverified'
    if division_code.startswith(prefix[:2]):
        return 'same_province_other_area'
    return 'other_province'


def build_candidate_index(official: list[dict], qcc: list[dict]) -> dict:
    qcc_by_key = defaultdict(list)
    for row in qcc:
        qcc_by_key[row.get('nameKey') or name_key(row['name'])].append(row)
    duplicate_details = {}
    for source_key in SOURCE_BY_KEY:
        keys = defaultdict(list)
        for record in official:
            if record['sourceKey'] == source_key:
                keys[record.get('nameKey') or name_key(record['name'])].append(record['excelRow'])
        duplicate_details[source_key] = [
            {'nameKey': key, 'excelRows': rows} for key, rows in keys.items() if len(rows) > 1
        ]
    candidates = []
    matched_rows = same_locality_rows = cross_area_rows = scope_unverified_rows = 0
    for record in official:
        key = record.get('nameKey') or name_key(record['name'])
        matches = qcc_by_key.get(key, ())
        matched_rows += bool(matches)
        scopes = set()
        for match in matches:
            scope = _match_scope(record['sourceKey'], match['divisionCode'])
            scopes.add(scope)
            candidates.append({
                'officialSourceKey': record['sourceKey'],
                'officialExcelRow': record['excelRow'], 'officialName': record['name'],
                'qccExcelRow': match['excelRow'], 'qccName': match['name'],
                'qccDivisionCode': match['divisionCode'], 'qccRegion': match['region'],
                'nameKey': key, 'matchScope': scope, 'reviewStatus': 'pending',
            })
        same_locality_rows += 'same_county' in scopes
        scope_unverified_rows += 'same_city_scope_unverified' in scopes
        cross_area_rows += bool(scopes & {'same_province_other_area', 'other_province'})
    audit = {
        'officialRows': len(official), 'qccRowsScanned': len(qcc),
        'officialRowsBySource': dict(Counter(r['sourceKey'] for r in official)),
        'officialDuplicateNameKeys': {key: len(value) for key, value in duplicate_details.items()},
        'officialDuplicateNameKeyDetails': duplicate_details,
        'qccDuplicateNameKeys': sum(count > 1 for count in Counter(
            r.get('nameKey') or name_key(r['name']) for r in qcc).values()),
        'matchedOfficialRows': matched_rows, 'sameLocalityMatchedRows': same_locality_rows,
        'scopeUnverifiedMatchedRows': scope_unverified_rows,
        'crossAreaMatchedRows': cross_area_rows,
        'unmatchedOfficialRows': len(official) - matched_rows,
        'candidatePairs': len(candidates),
        'candidatePairsByScope': dict(Counter(r['matchScope'] for r in candidates)),
    }
    return {'candidates': candidates, 'audit': audit}


def read_mca_saved_rows(folder: Path = MCA_DIR) -> tuple[list[dict], dict]:
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    if (manifest.get('total') != 19 or manifest.get('serverPageSize') != 10
            or manifest.get('expectedPages') != 2 or manifest.get('savedPages') != 2
            or manifest.get('uniqueIds') != 19 or manifest.get('pageAuditReconciled') is not True
            or manifest.get('complete') is not False
            or manifest.get('filters', {}).get('areaCode') != '410221000000'
            or manifest.get('filters', {}).get('checkSort') != 1):
        raise ValueError('MCA Qixian cache manifest differs from reviewed partial pass')
    rows = []
    page_hashes = {}
    for page in (1, 2):
        path = folder / 'pages' / f'{page:05d}.json'
        page_sha = digest(path)
        if page_sha != MCA_PAGE_SHA256[page]:
            raise ValueError(f'MCA Qixian cached page {page} SHA-256 differs')
        wrapper = json.loads(path.read_text(encoding='utf-8'))
        expected_params = {'current': page, 'size': 10, 'areaCode': '410221000000', 'checkSort': 1}
        data = wrapper.get('response', {}).get('data')
        if (wrapper.get('request', {}).get('params') != expected_params
                or wrapper.get('httpStatus') != 200 or wrapper.get('response', {}).get('code') != 0
                or not isinstance(data, dict) or data.get('current') != page
                or data.get('size') != 10 or data.get('total') != 19
                or not isinstance(data.get('records'), list)
                or len(data['records']) != (10 if page == 1 else 9)):
            raise ValueError(f'MCA Qixian cached page {page} response differs')
        fetched_at = wrapper.get('fetchedAtUtc')
        try:
            timestamp = datetime.fromisoformat(fetched_at)
        except (TypeError, ValueError) as error:
            raise ValueError(f'MCA Qixian cached page {page} time invalid') from error
        if timestamp.tzinfo is None:
            raise ValueError(f'MCA Qixian cached page {page} time lacks timezone')
        page_hashes[str(page)] = {'sha256': page_sha, 'fetchedAtUtc': fetched_at}
        for page_row, raw in enumerate(data['records'], 1):
            identifier, name = raw.get('axbe0001'), raw.get('axbe0003')
            if (not isinstance(identifier, str) or not identifier
                    or not isinstance(name, str) or not name.strip()
                    or raw.get('areaCode') != '410221000000'):
                raise ValueError(f'MCA Qixian cached page {page} row {page_row} differs')
            rows.append({'mcaId': identifier, 'name': name, 'nameKey': name_key(name),
                         'page': page, 'pageRow': page_row, 'pageSha256': page_sha})
    if len(rows) != 19 or len({row['mcaId'] for row in rows}) != 19:
        raise ValueError('MCA Qixian cached IDs or count differ')
    return rows, {
        'sourcePage': 'https://yanglao.mca.gov.cn/#/index/institutionList',
        'areaCode': '410221000000', 'checkSort': 1,
        'savedPages': 2, 'reportedTotal': 19, 'cachedRows': 19,
        'pageAuditReconciled': True, 'snapshotVerified': False,
        'firstFetchedAtUtc': manifest['firstFetchedAtUtc'],
        'auditedAtUtc': manifest['auditedAtUtc'], 'pageHashes': page_hashes,
    }


def build_mca_candidates(qixian: list[dict], mca: list[dict]) -> dict:
    by_name = defaultdict(list)
    by_key = defaultdict(list)
    for row in mca:
        by_name[row['name']].append(row)
        by_key[row.get('nameKey') or name_key(row['name'])].append(row)
    candidates = []
    exact_rows = normalized_rows = unmatched_rows = 0
    for record in qixian:
        if record['sourceKey'] != 'qixian':
            raise ValueError('MCA Qixian comparison received another official source')
        key = record.get('nameKey') or name_key(record['name'])
        exact = by_name.get(record['name'], ())
        matches = by_key.get(key, ())
        if exact:
            exact_rows += 1
        elif matches:
            normalized_rows += 1
        else:
            unmatched_rows += 1
        for match in matches:
            candidates.append({
                'officialSourceKey': 'qixian', 'officialExcelRow': record['excelRow'],
                'officialName': record['name'], 'mcaId': match['mcaId'],
                'mcaName': match['name'], 'mcaPage': match['page'],
                'mcaPageRow': match['pageRow'], 'mcaPageSha256': match['pageSha256'],
                'matchType': 'exact' if record['name'] == match['name'] else 'normalized',
                'reviewStatus': 'pending',
            })
    return {'candidates': candidates, 'audit': {
        'officialRows': len(qixian), 'mcaCachedRows': len(mca),
        'exactOfficialRows': exact_rows, 'normalizedOnlyOfficialRows': normalized_rows,
        'unmatchedOfficialRows': unmatched_rows, 'candidatePairs': len(candidates),
        'candidatePairsByType': dict(Counter(row['matchType'] for row in candidates)),
    }}


def output_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify private output without writing')
    args = parser.parse_args()
    official, sources = read_official_sources()
    qcc, qcc_sha = read_qcc_rows()
    qcc_result = build_candidate_index(official, qcc)
    mca_rows, mca_source = read_mca_saved_rows()
    mca_result = build_mca_candidates(
        [row for row in official if row['sourceKey'] == 'qixian'], mca_rows
    )
    payload = {
        'schemaVersion': 2,
        'meaning': 'Private name-key candidates only; identity and current status unverified.',
        'sourceIndex': sources,
        'qccSource': {'filename': QCC_PATH.name, 'publisher': '企查查',
                      'asOf': None, 'sha256': qcc_sha, 'rowCount': len(qcc)},
        'mcaCache': mca_source, 'observations': official,
        'qccCandidates': qcc_result['candidates'], 'qccAudit': qcc_result['audit'],
        'mcaCandidates': mca_result['candidates'], 'mcaAudit': mca_result['audit'],
    }
    target = OUTPUT_DIR / 'candidate-index.v2.json'
    content = output_bytes(payload)
    if args.check:
        if not target.is_file() or target.read_bytes() != content:
            raise ValueError('private candidate index differs from locked inputs')
    else:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != content:
            raise ValueError('private candidate index already exists with different bytes')
        if not target.exists():
            target.write_bytes(content)
    print(json.dumps({'qcc': qcc_result['audit'], 'mca': mca_result['audit']},
                     ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()

