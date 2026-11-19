"""Validate Jinan historical CSV and project contact-free source rows."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / 'data/private/national-official-source/raw'
CATALOG = RAW_DIR / 'shandong-jinan-catalog-20261117.html'
OLDER = RAW_DIR / 'shandong-jinan-202507210938.csv'
LATEST = RAW_DIR / 'shandong-jinan-202607211315.csv'
PRIOR = RAW_DIR / 'shandong-jinan-202405231945.csv'
CATALOG_BYTES = 89615
CATALOG_SHA256 = 'ca19cf0ae3cbe7630c751bec49f342c9cbc634d1437f6addc0804281fcbf5fcf'
OLDER_BYTES = 11655
OLDER_SHA256 = '939c9aac194b05cce5eb655bf7843694c39601c4710310e23a55658acde58761'
LATEST_BYTES = 1766
LATEST_SHA256 = 'aeff3c115c9cbf45640d727276af97beb4fcdf4066b52788e3119eb90e00498e'
ROW_COUNT = 135
LATEST_ROW_COUNT = 20
SOURCE_URL = 'https://data.sd.gov.cn/portal/catalog/7900f7ace36c4faca8a17b5af1d9d784'
TITLE = '济南市养老机构基本信息数据'
PUBLISHED_AT = '2023-08-21'
COLUMNS = ('所属区划', '机构名称', '机构地址', '床位数')
CONTACT = re.compile(
    r'(?<![0-9])(?:1[3-9][0-9]{9}|0[0-9]{2,3}[- ]?[0-9]{7,8}|[0-9]{17}[0-9Xx])(?![0-9])'
    r'|[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}', re.IGNORECASE,
)


@dataclass(frozen=True)
class JinanOfficialRow:
    row_number: int
    name: str
    address: str
    beds: int


def _check_hash(raw: bytes, expected_sha: str, known_sha: str, known_size: int, label: str) -> None:
    if hashlib.sha256(raw).hexdigest() != expected_sha or (expected_sha == known_sha and len(raw) != known_size):
        raise ValueError(f'Jinan {label} size or SHA-256 changed')


def validate_jinan_catalog(raw: bytes, *, expected_sha: str = CATALOG_SHA256) -> None:
    _check_hash(raw, expected_sha, CATALOG_SHA256, CATALOG_BYTES, 'catalog')
    document = html.fromstring(raw.decode('utf-8', errors='strict'))
    content = ' '.join(' '.join(document.itertext()).split())
    required = (
        TITLE, '来源部门： 济南市民政局', '目录发布时间： 2023-08-21',
        '目录更新时间： 2026-07-21', '数据量 135', '无条件开放',
        '地理空间范围 济南市', '数据时间范围 从2023年08月至2024年05月',
        '可以自由利用、自由传播与分享', '在成果中注明数据来源',
        '定期向数据责任主体反馈数据利用情况',
    )
    descriptions = document.xpath('//tr[td[normalize-space()="描述"]]/td[last()]')
    if not all(part in content for part in required) or len(descriptions) != 1:
        raise ValueError('Jinan catalog metadata or license changed')
    description = ' '.join(' '.join(descriptions[0].itertext()).split())
    expected_description = '济南市养老机构基本信息数据，提供养老机构的详细信息，包括位置、床位数、服务等级等，方便家属选择。'
    if expected_description != description or '禁止商业' in description or '仅限' in description:
        raise ValueError('Jinan dataset-specific license restriction changed')


def _read_rows(raw: bytes, count: int, label: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(raw.decode('gb18030', errors='strict'), newline=''))
    if tuple(reader.fieldnames or ()) != COLUMNS:
        raise ValueError(f'Jinan {label} CSV header changed')
    rows = list(reader)
    if len(rows) != count:
        raise ValueError(f'Jinan {label} row count changed')
    if any(set(row) != set(COLUMNS) or any(value is None for value in row.values()) for row in rows):
        raise ValueError(f'Jinan {label} fields changed')
    return rows


def parse_jinan_rows(
    older: bytes, latest: bytes, *,
    expected_older_sha: str = OLDER_SHA256, expected_latest_sha: str = LATEST_SHA256,
) -> list[JinanOfficialRow]:
    _check_hash(older, expected_older_sha, OLDER_SHA256, OLDER_BYTES, '2025 CSV')
    _check_hash(latest, expected_latest_sha, LATEST_SHA256, LATEST_BYTES, '2026 CSV')
    old_rows = _read_rows(older, ROW_COUNT, '2025')
    new_rows = _read_rows(latest, LATEST_ROW_COUNT, '2026')
    result = []
    names = set()
    for row_number, row in enumerate(old_rows, 1):
        region, name, address, beds_text = (row[field].strip() for field in COLUMNS)
        if not region.startswith('山东省济南市') or not name or not address:
            raise ValueError(f'Jinan row {row_number}: missing or conflicting city/name/address')
        if CONTACT.search(name) or CONTACT.search(address):
            raise ValueError(f'Jinan row {row_number}: contact data in public field')
        if not beds_text.isdigit() or not 0 < int(beds_text) <= 10000:
            raise ValueError(f'Jinan row {row_number}: invalid beds')
        if name in names:
            raise ValueError(f'Jinan row {row_number}: duplicate name')
        names.add(name)
        result.append(JinanOfficialRow(row_number, name, address, int(beds_text)))
    old_content = Counter(tuple(row[column] for column in COLUMNS) for row in old_rows)
    new_content = Counter(tuple(row[column] for column in COLUMNS) for row in new_rows)
    if new_content - old_content:
        raise ValueError('Jinan latest CSV is not a subset of 2025 version')
    return result
