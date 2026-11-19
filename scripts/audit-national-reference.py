"""Audit the user-supplied nationwide XLSX as a private coverage reference.

The user confirms public display authorization, but its supporting document
and the source data's as-of date are not archived. This script prints aggregate
counts only; public website records come from the separately locked projection.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
from typing import Iterable
import unicodedata

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
HEADERS = ('统一社会信用代码', '地址', '行政区划代码', '机构名称', '地区', '床位数', '省份', '城市', '区县', '经度', '纬度')
PROVINCES = {
    '11': '北京市', '12': '天津市', '13': '河北省', '14': '山西省', '15': '内蒙古自治区',
    '21': '辽宁省', '22': '吉林省', '23': '黑龙江省', '31': '上海市', '32': '江苏省',
    '33': '浙江省', '34': '安徽省', '35': '福建省', '36': '江西省', '37': '山东省',
    '41': '河南省', '42': '湖北省', '43': '湖南省', '44': '广东省', '45': '广西壮族自治区',
    '46': '海南省', '50': '重庆市', '51': '四川省', '52': '贵州省', '53': '云南省',
    '54': '西藏自治区', '61': '陕西省', '62': '甘肃省', '63': '青海省',
    '64': '宁夏回族自治区', '65': '新疆维吾尔自治区',
}
CORPS = '新疆生产建设兵团'


def code_prefix(value: object) -> str:
    code = str(value or '').strip()
    if code.endswith('.0'):
        code = code[:-2]
    if not re.fullmatch(r'\d{12}', code) or code[:2] not in PROVINCES | {'66': CORPS}:
        raise ValueError('invalid 12-digit administrative code')
    return code[:2]


def name_key(value: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def audit_rows(rows: Iterable[tuple]) -> dict:
    province_rows: Counter[str] = Counter()
    stated_mismatch: Counter[str] = Counter()
    region_mismatch: Counter[str] = Counter()
    missing: Counter[str] = Counter()
    uscc: Counter[str] = Counter()
    names: Counter[tuple[str, str]] = Counter()
    total = 0
    for number, row in enumerate(rows, 2):
        if len(row) != len(HEADERS):
            raise ValueError(f'row {number}: expected {len(HEADERS)} columns')
        code, address, administrative, name, region, beds, stated, *_ = row
        try:
            prefix = code_prefix(administrative)
        except ValueError as error:
            raise ValueError(f'row {number}: {error}') from error
        expected = PROVINCES.get(prefix, CORPS)
        province_rows[expected] += 1
        total += 1
        if str(stated or '').strip() != expected:
            stated_mismatch[expected] += 1
        if not str(region or '').strip().startswith(expected):
            region_mismatch[expected] += 1
        if not str(name or '').strip():
            missing['name'] += 1
        else:
            names[(expected, name_key(str(name).strip()))] += 1
        if not str(address or '').strip():
            missing['address'] += 1
        if not str(code or '').strip():
            missing['uscc'] += 1
        else:
            uscc[str(code).strip()] += 1
        if beds is None or str(beds).strip() == '':
            missing['beds'] += 1
    return {
        'rowCount': total, 'provinceRows': dict(province_rows),
        'statedProvinceMismatch': dict(stated_mismatch),
        'regionPrefixMismatch': dict(region_mismatch),
        'missingFields': dict(missing),
        'distinctUSCC': len(uscc),
        'duplicateUSCCGroups': sum(count > 1 for count in uscc.values()),
        'distinctProvinceNameKeys': len(names),
        'duplicateProvinceNameGroups': sum(count > 1 for count in names.values()),
        'provinceNameKeys': {province: sorted(name for area, name in names if area == province) for province in province_rows},
    }


def index_names(root: Path, manifest_path: Path) -> dict[str, set[str]]:
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    by_province: dict[str, set[str]] = {}
    for province in manifest['provinces']:
        keys = by_province.setdefault(province['name'], set())
        for city in province['cities']:
            index = json.loads((root / city['indexPath']).read_text(encoding='utf-8'))
            keys.update(name_key(record['name']) for record in index['records'])
    return by_province


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    args = parser.parse_args()
    source = args.source
    data = source.read_bytes()
    book = load_workbook(source, read_only=True, data_only=True)
    try:
        if len(book.worksheets) != 1:
            raise ValueError('expected one worksheet')
        rows = book.active.values
        if tuple(next(rows)) != HEADERS:
            raise ValueError('reference headers changed')
        report = audit_rows(rows)
    finally:
        book.close()
    report['sourceSha256'] = hashlib.sha256(data).hexdigest()
    report['sourceBytes'] = len(data)
    official_root = ROOT / 'public/data/national-official'
    qcc_root = ROOT / 'public/data/qcc-national'
    official_manifest = json.loads((official_root / 'manifest.v1.json').read_text(encoding='utf-8'))
    qcc_manifest = json.loads((qcc_root / 'manifest.v1.json').read_text(encoding='utf-8'))
    report['officialSourceRows'] = {item['name']: item['count'] for item in official_manifest['provinces']}
    report['officialSourceRows']['广东省'] = len(json.loads((ROOT / 'public/data/guangdong-source-records.v1.json').read_text(encoding='utf-8'))['records'])
    report['registrationCandidateRows'] = {item['name']: item['count'] for item in qcc_manifest['provinces']}
    report['registrationCandidateRows']['广东省'] = len(json.loads((ROOT / 'public/data/qcc/index.v1.json').read_text(encoding='utf-8'))['records'])
    official_names = index_names(official_root, official_root / 'manifest.v1.json')
    official_names['广东省'] = {name_key(record['name']) for record in json.loads((ROOT / 'public/data/guangdong-source-records.v1.json').read_text(encoding='utf-8'))['records']}
    candidate_names = index_names(qcc_root, qcc_root / 'manifest.v1.json')
    candidate_names['广东省'] = {name_key(record['name']) for record in json.loads((ROOT / 'public/data/qcc/index.v1.json').read_text(encoding='utf-8'))['records']}
    report['sameNameOfficialKeys'] = {province: len(set(names) & official_names.get(province, set())) for province, names in report['provinceNameKeys'].items()}
    report['sameNameRegistrationKeys'] = {province: len(set(names) & candidate_names.get(province, set())) for province, names in report['provinceNameKeys'].items()}
    del report['provinceNameKeys']
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
