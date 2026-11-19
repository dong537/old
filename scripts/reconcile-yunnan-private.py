"""Privately compare Yunnan institution names without republishing official rows.

A normalized name is a review lead, not proof of identity, operating status,
or permission to republish the source.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import unicodedata

from lxml import html
from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
OFFICIAL = ROOT / 'data/private/national-official-source/raw/yunnan-normal-operation-20250616.html'
QCC = ROOT / 'data/private/qcc-institution-reference/养老机构信息.xlsx'
OUTPUT = ROOT / 'data/private/national-reconciliation/yunnan-20261117.json'
OFFICIAL_SHA256 = '38d32dbebe06b36037616ce9f4d00605183ec9e3174471ec3aa0cfd5b4591b63'
QCC_SHA256 = '6bc157e2695965ed8b1c85e82f6f8b7fa7d13102149f9f1512e9863b2489fd81'
OFFICIAL_HEADERS = ('州市', '区县市', '单位名称', '地址', '法定代表人或负责人姓名')
QCC_HEADERS = ('统一社会信用代码', '地址', '行政区划代码', '机构名称', '地区', '床位数',
               '省份', '城市', '区县', '经度', '纬度')
CITY_BY_CODE = {
    '5301': ('昆明市', '昆明市'), '5303': ('曲靖市', '曲靖市'),
    '5304': ('玉溪市', '玉溪市'), '5305': ('保山市', '保山市'),
    '5306': ('昭通市', '昭通市'), '5307': ('丽江市', '丽江市'),
    '5308': ('普洱市', '普洱市'), '5309': ('临沧市', '临沧市'),
    '5323': ('楚雄州', '楚雄彝族自治州'),
    '5325': ('红河州', '红河哈尼族彝族自治州'),
    '5326': ('文山州', '文山壮族苗族自治州'),
    '5328': ('西双版纳州', '西双版纳傣族自治州'),
    '5329': ('大理州', '大理白族自治州'),
    '5331': ('德宏州', '德宏傣族景颇族自治州'),
    '5333': ('怒江州', '怒江傈僳族自治州'),
    '5334': ('迪庆州', '迪庆藏族自治州'),
}
EXPECTED_CITY_ROWS = {
    '昆明市': 139, '曲靖市': 110, '玉溪市': 53, '保山市': 28,
    '昭通市': 49, '丽江市': 14, '普洱市': 37, '临沧市': 50,
    '楚雄州': 102, '红河州': 84, '文山州': 65, '西双版纳州': 14,
    '大理州': 49, '德宏州': 15, '怒江州': 16, '迪庆州': 9,
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
    if city not in {display for display, _ in CITY_BY_CODE.values()}:
        raise ValueError(f'unknown official Yunnan city: {city}')
    return city


def qcc_city(administrative: object, region: object) -> str:
    code = str(administrative or '').strip()
    if code.endswith('.0'):
        code = code[:-2]
    if not re.fullmatch(r'\d{12}', code) or code[:4] not in CITY_BY_CODE:
        raise ValueError(f'invalid Yunnan administrative code: {code}')
    display, formal = CITY_BY_CODE[code[:4]]
    if not str(region or '').strip().startswith('云南省' + formal):
        raise ValueError('province or city disagrees between code and region')
    return display


def qcc_in_yunnan(administrative: object, region: object) -> bool:
    code_matches = str(administrative or '').strip().startswith('53')
    region_matches = '云南' in str(region or '')
    if code_matches != region_matches:
        raise ValueError('Yunnan code and region disagree')
    return code_matches


def parse_official(content: bytes) -> list[tuple[int, str, str]]:
    document = html.fromstring(content.decode('utf-8'))
    tables = document.xpath('//table')
    if len(tables) != 1:
        raise ValueError('official table count changed')
    rows = tables[0].xpath('.//tr')
    if len(rows) < 3:
        raise ValueError('official table rows missing')
    headers = tuple(cell.text_content().strip() for cell in rows[1].xpath('./th|./td'))
    if headers != OFFICIAL_HEADERS:
        raise ValueError('official table headers changed')

    output: list[tuple[int, str, str]] = []
    active: dict[int, tuple[str, int]] = {}
    for source_row, row in enumerate(rows[2:], 3):
        values: list[str | None] = [None] * len(OFFICIAL_HEADERS)
        next_active: dict[int, tuple[str, int]] = {}
        for column, (value, remaining) in active.items():
            values[column] = value
            if remaining > 1:
                next_active[column] = (value, remaining - 1)
        column = 0
        for cell in row.xpath('./th|./td'):
            while column < len(values) and values[column] is not None:
                column += 1
            if column == len(values) or cell.get('colspan', '1') != '1':
                raise ValueError(f'official row {source_row} width changed')
            value = cell.text_content().strip()
            try:
                rowspan = int(cell.get('rowspan', '1'))
            except ValueError as error:
                raise ValueError(f'official row {source_row} has invalid rowspan') from error
            if not value or rowspan < 1:
                raise ValueError(f'official row {source_row} has empty cell or invalid rowspan')
            values[column] = value
            if rowspan > 1:
                next_active[column] = (value, rowspan - 1)
            column += 1
        if any(value is None for value in values):
            raise ValueError(f'official row {source_row} has missing cells')
        city = official_city(values[0])
        name = values[2]
        name_key(name)
        output.append((source_row, city, name))
        active = next_active
    if active:
        raise ValueError('official table rowspan exceeds last row')
    return output


def read_sources(official_path: Path = OFFICIAL, qcc_path: Path = QCC) -> dict:
    official_digest, qcc_digest = sha256(official_path), sha256(qcc_path)
    if official_digest != OFFICIAL_SHA256 or qcc_digest != QCC_SHA256:
        raise ValueError('private source SHA-256 differs from audited inputs')
    official = parse_official(official_path.read_bytes())
    if len(official) != 834 or Counter(city for _, city, _ in official) != EXPECTED_CITY_ROWS:
        raise ValueError('Yunnan official source rows or city totals changed')
    if len({name_key(name) for _, _, name in official}) != len(official):
        raise ValueError('Yunnan official names are no longer unique')

    book = load_workbook(qcc_path, read_only=True, data_only=True)
    try:
        if book.sheetnames != ['Sheet1']:
            raise ValueError('QCC workbook sheets changed')
        sheet = book['Sheet1']
        if tuple(next(sheet.iter_rows(min_row=1, max_row=1, values_only=True))) != QCC_HEADERS:
            raise ValueError('QCC headers changed')
        qcc: list[tuple[int, str, str]] = []
        for source_row, cells in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
            if len(cells) != len(QCC_HEADERS):
                raise ValueError(f'QCC row {source_row} width changed')
            administrative = str(cells[2] or '').strip()
            region = str(cells[4] or '').strip()
            if not qcc_in_yunnan(administrative, region):
                continue
            city = qcc_city(administrative, region)
            name = cells[3]
            if not isinstance(name, str) or not name.strip():
                raise ValueError(f'QCC row {source_row} name missing')
            name_key(name)
            qcc.append((source_row, city, name))
    finally:
        book.close()
    if len(qcc) != 875:
        raise ValueError('Yunnan QCC source row count changed')
    return {'official': official, 'qcc': qcc,
            'officialSha256': official_digest, 'qccSha256': qcc_digest}


def _record(row: tuple[int, str, str], status: str) -> dict:
    source_row, city, name = row
    if not isinstance(source_row, int) or source_row < 2 or not isinstance(name, str):
        raise ValueError('invalid source row or name')
    return {'sourceRow': source_row, 'name': name.strip(), 'city': city,
            'nameKey': name_key(name), 'matchStatus': status, 'reviewStatus': 'pending'}


def reconcile_rows(official: list[tuple[int, str, str]],
                   qcc: list[tuple[int, str, str]]) -> dict:
    official_cities: dict[str, set[str]] = defaultdict(set)
    qcc_cities: dict[str, set[str]] = defaultdict(set)
    official_keys = [name_key(name) for _, _, name in official]
    qcc_keys = [name_key(name) for _, _, name in qcc]
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
        'sourcePeriod': {'officialPagePublished': '2025-06-16',
                         'officialRecordAsOf': None, 'qcc': None},
        'sourceSha256': {'official': inputs['officialSha256'], 'qcc': inputs['qccSha256']},
        'meaning': 'Private name-key review only; no identity, status, or republishing conclusion.',
        **result,
    }
    write_output(OUTPUT, value, check=args.check)
    print(json.dumps(value['summary'], ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
