"""Validate a dated Wenzhou open-data care-home listing before projection.

The 196 rows describe a 2022 portal snapshot, not today's operating homes.
Only source row, name, explicit district and stated total beds leave this parser.
The masked legal-person column and free-form description stay in the private ZIP.
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from lxml import html
import xlrd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/private/national-official-source/raw'
METADATA = RAW / 'wenzhou-care-homes-6724-metadata-20261117.html'
LICENSE = RAW / 'wenzhou-care-homes-6724-license-20261117.html'
ARCHIVE = RAW / 'wenzhou-care-homes-6724-current-20261117.zip'
METADATA_BYTES = 59781
METADATA_SHA256 = 'f38bbd3d54869ac7ece2c12c43e73b7d8447ff9769d399f255988330844472de'
LICENSE_BYTES = 17973
LICENSE_SHA256 = '99f3f824e580ee89fd29206ae632734834c7f7c758a98b0a67fdf1deca737d63'
ARCHIVE_BYTES = 44182
ARCHIVE_SHA256 = '2f5cfcf1810f85f733c5b487cdfcb2138b867266fe2bd017fdfb6a0e851e04c0'
WORKBOOK_BYTES = 125952
WORKBOOK_SHA256 = '551cc860fa6b82b306d3d403f237104a501fe8481233df0e76253450ed2561a6'
MEMBER = 'cata_6724.xls'
ROW_COUNT = 196
BED_COMPONENT_MISMATCH_COUNT = 10
UPDATED_AT = '2022-08-26'
PUBLISHED_AT = '2021-11-09'
DATASET_URL = 'https://data.wenzhou.gov.cn/jdop_front/detail/data.do?iid=6724'
LICENSE_URL = 'https://data.wenzhou.gov.cn/jdop_front/channal/kfxy.do?type=xls&id=6724'
DOWNLOAD_URL = 'https://data.wenzhou.gov.cn/jdop_front/resource/data/download.do?fileType=xls&iid=6724'
HEADERS = (
    'ID', '服务场所性质', '建筑面积', '占地面积', '普通床位数',
    '护理床位数', '养老总床位数', '法定代表人', '服务范围',
    '成立时间', '机构类型', '机构名称', '行政区域', '机构简介',
)
REGION_COUNTS = {
    '温州市瑞安市': 53, '温州市苍南县': 34, '温州市平阳县': 31,
    '温州市瓯海区': 17, '温州市乐清市': 16, '温州市鹿城区': 15,
    '温州市文成县': 9, '温州市洞头区': 7, '温州市永嘉县': 7,
    '温州市泰顺县': 6, '温州市龙湾区': 1,
}
CONTACT = re.compile(
    r'(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)'
    r'|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.IGNORECASE,
)


@dataclass(frozen=True)
class Wenzhou6724Row:
    source_row: int  # Physical XLS row, 2..197. Duplicated source IDs are not used as keys.
    name: str
    region: str
    beds: int  # Source's total; 10 rows disagree with ordinary+nursing components.


def _check(raw: bytes, size: int, sha256: str, label: str) -> None:
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError(f'Wenzhou 6724 {label} size or SHA-256 changed')


def validate_wenzhou_6724_pages(metadata: bytes, license: bytes) -> None:
    """Validate frozen provenance and licence obligations, not live freshness."""
    _check(metadata, METADATA_BYTES, METADATA_SHA256, 'metadata')
    _check(license, LICENSE_BYTES, LICENSE_SHA256, 'license')
    page = html.fromstring(metadata.decode('utf-8', errors='strict'))
    meta = {element.get('name'): element.get('content') for element in page.xpath('//meta') if element.get('name')}
    text = ' '.join(page.xpath('//body//text()'))
    if meta.get('ArticleTitle') != '温州养老院信息' or meta.get('ContentSource') != '温州市数据局（市人工智能局）':
        raise ValueError('Wenzhou 6724 metadata title or authority changed')
    if not all(term in text for term in (UPDATED_AT, PUBLISHED_AT, '完全开放', '196', '数据下载')):
        raise ValueError('Wenzhou 6724 metadata dates or access changed')
    agreement = ' '.join(html.fromstring(license.decode('utf-8', errors='strict')).xpath('//body//text()'))
    if not all(term in agreement for term in (
        '自由地复制、发布、利用、传播和分享信息',
        '注明公共数据资源来源为“温州市公共数据开放平台”',
        '应用情况通过网站进行备案',
        '用户应立即删除相关数据',
    )):
        raise ValueError('Wenzhou 6724 license obligations changed')


def _bed(value: object, field: str, source_row: int) -> int:
    if not isinstance(value, str) or not value.strip().isdecimal():
        raise ValueError(f'Wenzhou 6724 XLS row {source_row}: invalid {field}')
    return int(value.strip())


def parse_wenzhou_6724_rows(raw: bytes, *, expected_sha: str = ARCHIVE_SHA256) -> list[Wenzhou6724Row]:
    """Read only whitelisted fields; preserve every source row separately."""
    if expected_sha == ARCHIVE_SHA256 and len(raw) != ARCHIVE_BYTES:
        raise ValueError('Wenzhou 6724 ZIP size or SHA-256 changed')
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError('Wenzhou 6724 ZIP SHA-256 changed')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if archive.namelist() != [MEMBER]:
            raise ValueError('Wenzhou 6724 ZIP member changed')
        if archive.getinfo(MEMBER).file_size != WORKBOOK_BYTES:
            raise ValueError('Wenzhou 6724 XLS size changed')
        workbook_raw = archive.read(MEMBER)
    if expected_sha == ARCHIVE_SHA256:
        _check(workbook_raw, WORKBOOK_BYTES, WORKBOOK_SHA256, 'XLS')
    workbook = xlrd.open_workbook(file_contents=workbook_raw)
    if workbook.nsheets != 1:
        raise ValueError('Wenzhou 6724 XLS sheet count changed')
    sheet = workbook.sheet_by_index(0)
    if sheet.name != 'Sheet1' or sheet.nrows != ROW_COUNT + 1 or sheet.ncols != len(HEADERS):
        raise ValueError('Wenzhou 6724 XLS shape changed')
    if tuple(sheet.row_values(0)) != HEADERS:
        raise ValueError('Wenzhou 6724 XLS headers changed')
    rows = []
    components_mismatch = 0
    for source_row in range(2, sheet.nrows + 1):
        cells = sheet.row_values(source_row - 1)
        name = str(cells[11]).strip()
        region = str(cells[12]).strip()
        if not name or region not in REGION_COUNTS or CONTACT.search(name) or CONTACT.search(region):
            raise ValueError(f'Wenzhou 6724 XLS row {source_row}: name or region changed')
        ordinary = _bed(cells[4], 'ordinary beds', source_row)
        nursing = _bed(cells[5], 'nursing beds', source_row)
        beds = _bed(cells[6], 'total beds', source_row)
        components_mismatch += ordinary + nursing != beds
        rows.append(Wenzhou6724Row(source_row, name, region, beds))
    if Counter(row.region for row in rows) != REGION_COUNTS or components_mismatch != BED_COMPONENT_MISMATCH_COUNT:
        raise ValueError('Wenzhou 6724 XLS coverage or bed inconsistencies changed')
    return rows


def load_wenzhou_6724_rows() -> list[Wenzhou6724Row]:
    validate_wenzhou_6724_pages(METADATA.read_bytes(), LICENSE.read_bytes())
    return parse_wenzhou_6724_rows(ARCHIVE.read_bytes())
