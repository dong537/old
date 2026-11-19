"""Privately reconcile Liaoning institution name leads without publishing source rows.

An exact normalized name is only a review candidate, never a verified institution
identity, current operating status, or permission to republish the official list.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import unicodedata

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
OFFICIAL = ROOT / 'data/private/national-official-source/raw/liaoning-supply-2024.xlsx'
QCC = ROOT / 'data/private/qcc-institution-reference/养老机构信息.xlsx'
OUTPUT = ROOT / 'data/private/national-reconciliation/liaoning-20261117.json'
OFFICIAL_SHA256 = '71cfd254833ae2a24e79b21e22386d3703dd42467fef765c996c887e4174e5d4'
QCC_SHA256 = '6bc157e2695965ed8b1c85e82f6f8b7fa7d13102149f9f1512e9863b2489fd81'
OFFICIAL_HEADERS = ('市级', '机构名称', '所在区', '详细地址', '联系人', '联系电话')
QCC_HEADERS = ('统一社会信用代码', '地址', '行政区划代码', '机构名称', '地区', '床位数',
               '省份', '城市', '区县', '经度', '纬度')
CITY_BY_CODE = {
    '2101': '沈阳市', '2102': '大连市', '2103': '鞍山市', '2104': '抚顺市',
    '2105': '本溪市', '2106': '丹东市', '2107': '锦州市', '2108': '营口市',
    '2109': '阜新市', '2110': '辽阳市', '2111': '盘锦市', '2112': '铁岭市',
    '2113': '朝阳市', '2114': '葫芦岛市', '2199': '沈抚示范区',
}
SEPARATORS = re.compile(r'[\s()（）\[\]【】－—-]')
PRIVATE_CONTACT = re.compile(r'1[3-9]\d{9}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}')


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def name_key(value: str) -> str:
    key = SEPARATORS.sub('', unicodedata.normalize('NFKC', str(value).strip()))
    if not key or PRIVATE_CONTACT.search(key):
        raise ValueError('empty or contact-bearing institution name')
    return key


def official_city(value: object) -> str:
    city = str(value or '').strip()
    if city == '葫芦岛':
        city = '葫芦岛市'
    if city not in CITY_BY_CODE.values() or city == '沈抚示范区':
        raise ValueError(f'unknown official Liaoning city: {city}')
    return city


def qcc_city(administrative: object, region: object) -> str:
    code = str(administrative or '').strip()
    if code.endswith('.0'):
        code = code[:-2]
    if not re.fullmatch(r'\d{12}', code) or code[:4] not in CITY_BY_CODE:
        raise ValueError(f'invalid Liaoning administrative code: {code}')
    city = CITY_BY_CODE[code[:4]]
    if not str(region or '').strip().startswith('辽宁省' + city):
        raise ValueError('province or city disagrees between code and region')
    return city


def _record(row: tuple[int, str, str], status: str) -> dict:
    source_row, city, name = row
    if not isinstance(source_row, int) or source_row < 2 or not isinstance(name, str):
        raise ValueError('invalid source row or name')
    return {'sourceRow': source_row, 'name': name.strip(), 'city': city,
            'nameKey': name_key(name), 'matchStatus': status,
            'reviewStatus': 'pending'}


def reconcile_rows(official: list[tuple[int, str, str]],
                   qcc: list[tuple[int, str, str]]) -> dict:
    official_cities: dict[str, set[str]] = defaultdict(set)
    qcc_cities: dict[str, set[str]] = defaultdict(set)
    official_keys = [name_key(name) for _, city, name in official]
    qcc_keys = [name_key(name) for _, city, name in qcc]
    for (_, city, _), key in zip(official, official_keys):
        official_cities[key].add(city)
    for (_, city, _), key in zip(qcc, qcc_keys):
        qcc_cities[key].add(city)
    common = official_cities.keys() & qcc_cities.keys()

    def status(key: str, city: str, other: dict[str, set[str]], only: str) -> str:
        if key not in other:
            return only
        return 'same_city_name_key' if city in other[key] else 'cross_city_name_key'

    official_records = [_record(row, status(key, row[1], qcc_cities, 'official_only_name_key'))
                        for row, key in zip(official, official_keys)]
    qcc_records = [_record(row, status(key, row[1], official_cities, 'qcc_only_name_key'))
                   for row, key in zip(qcc, qcc_keys)]
    summary = {
        'officialRows': len(official_records), 'qccRows': len(qcc_records),
        'officialKeys': len(official_cities), 'qccKeys': len(qcc_cities),
        'commonNameKeys': len(common),
        'officialOnlyNameKeys': len(official_cities.keys() - qcc_cities.keys()),
        'qccOnlyNameKeys': len(qcc_cities.keys() - official_cities.keys()),
        'qccDuplicateNameKeys': sum(count > 1 for count in Counter(qcc_keys).values()),
        'crossCityCommonNameKeys': sum(not (official_cities[key] & qcc_cities[key]) for key in common),
        'officialMatchStatusRows': dict(Counter(record['matchStatus'] for record in official_records)),
        'qccMatchStatusRows': dict(Counter(record['matchStatus'] for record in qcc_records)),
    }
    return {'summary': summary, 'officialRows': official_records, 'qccRows': qcc_records}


def read_sources(official_path: Path = OFFICIAL, qcc_path: Path = QCC) -> dict:
    official_digest = sha256(official_path)
    qcc_digest = sha256(qcc_path)
    if official_digest != OFFICIAL_SHA256 or qcc_digest != QCC_SHA256:
        raise ValueError('private source SHA-256 differs from audited inputs')

    book = load_workbook(official_path, read_only=True, data_only=True)
    try:
        if 'Sheet1' not in book.sheetnames:
            raise ValueError('official Sheet1 missing')
        sheet = book['Sheet1']
        if tuple(next(sheet.iter_rows(min_row=2, max_row=2, values_only=True))) != OFFICIAL_HEADERS:
            raise ValueError('official headers changed')
        official = []
        for number, cells in enumerate(sheet.iter_rows(min_row=3, values_only=True), 3):
            if len(cells) != len(OFFICIAL_HEADERS):
                raise ValueError(f'official row {number} width changed')
            city = official_city(cells[0])
            name = cells[1]
            if not isinstance(name, str) or not name.strip():
                raise ValueError(f'official row {number} name missing')
            official.append((number, city, name))
    finally:
        book.close()

    book = load_workbook(qcc_path, read_only=True, data_only=True)
    try:
        if book.sheetnames != ['Sheet1']:
            raise ValueError('QCC workbook sheets changed')
        sheet = book['Sheet1']
        if tuple(next(sheet.iter_rows(min_row=1, max_row=1, values_only=True))) != QCC_HEADERS:
            raise ValueError('QCC headers changed')
        qcc = []
        for number, cells in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
            if len(cells) != len(QCC_HEADERS):
                raise ValueError(f'QCC row {number} width changed')
            administrative = str(cells[2] or '').strip()
            region = str(cells[4] or '').strip()
            if not administrative.startswith('21') or '辽宁' not in region:
                continue
            city = qcc_city(administrative, region)
            name = cells[3]
            if not isinstance(name, str) or not name.strip():
                raise ValueError(f'QCC row {number} name missing')
            qcc.append((number, city, name))
    finally:
        book.close()
    if len(official) != 2375 or len(qcc) != 2321:
        raise ValueError('Liaoning source row counts changed')
    return {'official': official, 'qcc': qcc,
            'officialSha256': official_digest, 'qccSha256': qcc_digest}


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def write_output(path: Path, value: dict, *, check: bool) -> None:
    content = json_bytes(value)
    if check:
        if not path.is_file() or path.read_bytes() != content:
            raise ValueError('private reconciliation output differs')
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='compare private output with locked sources')
    args = parser.parse_args()
    inputs = read_sources()
    result = reconcile_rows(inputs['official'], inputs['qcc'])
    value = {
        'schemaVersion': 1,
        'sourcePeriod': {'official': '2024', 'qcc': None},
        'sourceSha256': {'official': inputs['officialSha256'], 'qcc': inputs['qccSha256']},
        'meaning': 'Private name-key review only; no identity, status, or republishing conclusion.',
        **result,
    }
    write_output(OUTPUT, value, check=args.check)
    print(json.dumps(value['summary'], ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
