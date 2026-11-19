"""Audit the Wenzhou open-data portal's historical eldercare XLS export.

This is a historical ZIP, not a proven current Wenzhou institution register.
The portal marks the dataset as citywide, but the export contains names from
other Zhejiang cities and almost all addresses are absent.  Do not assign
municipal locations or publish these rows without resolving that discrepancy.
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

from lxml import html
import xlrd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/private/national-official-source/raw'
METADATA = RAW / 'wenzhou-yljg-14697-metadata-20261117.html'
LICENSE = RAW / 'wenzhou-yljg-14697-license-20261117.html'
ARCHIVE = RAW / 'wenzhou-yljg-14697-history-20261117.zip'
METADATA_BYTES = 92146
METADATA_SHA256 = '8997406f94155935f1b5943f335c64babb361c83cfb0b2088be53058975f211b'
LICENSE_BYTES = 16248
LICENSE_SHA256 = 'e6c39136d04f5102c45a795f77e3dbe26b491f76b37c15b0331e7ce28e4c3de6'
ARCHIVE_BYTES = 97287
ARCHIVE_SHA256 = 'a18e6f082ff9e8745e3825100a9f39036fe6320b90a0117244550503b5f52fa1'
WORKBOOK_BYTES = 390656
WORKBOOK_SHA256 = '81dc2405c62d166180915dfd407f3f7d4e71a8897cccc699b8475323ec92f43a'
MEMBER = 'cata_14697.xls'
ROW_COUNT = 1574
DATASET_URL = 'https://data.wenzhou.gov.cn/jdop_front/detail/data.do?iid=14697'
LICENSE_URL = 'https://data.wenzhou.gov.cn/jdop_front/channal/kfxy_history.do?type=xls&id=14697&history=1'
DOWNLOAD_URL = 'https://data.wenzhou.gov.cn/jdop_front/resource/data/download.do?fileType=xls&iid=14697&history=1'
HEADERS = (
    '机构名称', '机构类型', '服务范围', '总床位数', '护理型床位数',
    '占地面积', '建筑面积', '管理机关名称', '机构法人的证件类型',
    '机构负责人证件类型', '许可机关名称', '经营地址',
)
CONTACT = re.compile(
    r'(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)'
    r'|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.IGNORECASE,
)


@dataclass(frozen=True)
class WenzhouHistoricalRow:
    source_row: int  # Physical XLS row; 2..1575. No inferred city or current status.
    name: str
    kind: str
    beds: int
    nursing_beds: int
    address: str | None


def _check(raw: bytes, size: int, sha256: str, label: str) -> None:
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError(f'Wenzhou {label} size or SHA-256 changed')


def validate_wenzhou_source_pages(metadata: bytes, license: bytes) -> None:
    """Check frozen provenance and reuse terms, not current live availability."""
    _check(metadata, METADATA_BYTES, METADATA_SHA256, 'source page')
    _check(license, LICENSE_BYTES, LICENSE_SHA256, 'license')
    page = html.fromstring(metadata.decode('utf-8', errors='strict'))
    meta = {element.get('name'): element.get('content') for element in page.xpath('//meta') if element.get('name')}
    page_text = ' '.join(page.xpath('//body//text()'))
    if meta.get('ArticleTitle') != '养老机构信息' or meta.get('ContentSource') != '温州市民政局':
        raise ValueError('Wenzhou source page title or authority changed')
    if not all(term in page_text for term in ('S330301TAB0220230712000041', '2026-09-08', '1574', '完全开放', '历史数据下载')):
        raise ValueError('Wenzhou source page metadata changed')
    agreement = ' '.join(html.fromstring(license.decode('utf-8', errors='strict')).xpath('//body//text()'))
    if not all(term in agreement for term in (
        '自由地复制、发布、利用、传播和分享信息',
        '注明公共数据资源来源为“温州市公共数据开放平台”',
        '应用情况通过网站进行备案',
        '用户应立即删除相关数据',
    )):
        raise ValueError('Wenzhou license obligations changed')


def _count(value: object, field: str, source_row: int) -> int:
    if not isinstance(value, str) or not value.isdecimal():
        raise ValueError(f'Wenzhou XLS row {source_row}: invalid {field}')
    return int(value)


def parse_wenzhou_historical_rows(raw: bytes, *, expected_sha: str = ARCHIVE_SHA256) -> list[WenzhouHistoricalRow]:
    """Return privacy-minimal rows without inferring municipality or currency."""
    if expected_sha == ARCHIVE_SHA256 and len(raw) != ARCHIVE_BYTES:
        raise ValueError('Wenzhou archive size or SHA-256 changed')
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError('Wenzhou archive SHA-256 changed')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if archive.namelist() != [MEMBER]:
            raise ValueError('Wenzhou archive member changed')
        member = archive.getinfo(MEMBER)
        if member.file_size != WORKBOOK_BYTES:
            raise ValueError('Wenzhou workbook size changed')
        workbook_raw = archive.read(MEMBER)
    if expected_sha == ARCHIVE_SHA256:
        _check(workbook_raw, WORKBOOK_BYTES, WORKBOOK_SHA256, 'workbook')
    workbook = xlrd.open_workbook(file_contents=workbook_raw)
    if workbook.nsheets != 1:
        raise ValueError('Wenzhou workbook sheet count changed')
    sheet = workbook.sheet_by_index(0)
    if sheet.name != 'Sheet1' or sheet.nrows != ROW_COUNT + 1 or sheet.ncols != len(HEADERS):
        raise ValueError('Wenzhou workbook shape changed')
    if tuple(sheet.row_values(0)) != HEADERS:
        raise ValueError('Wenzhou workbook headers changed')
    rows = []
    for source_row in range(2, sheet.nrows + 1):
        cells = sheet.row_values(source_row - 1)
        name, kind = (str(cells[i]).strip() for i in (0, 1))
        address = str(cells[11]).strip()
        if not name or not kind or CONTACT.search(name) or CONTACT.search(address):
            raise ValueError(f'Wenzhou XLS row {source_row}: name, kind or contact changed')
        beds = _count(cells[3], 'beds', source_row)
        nursing_beds = _count(cells[4], 'nursing beds', source_row)
        if nursing_beds > beds:
            raise ValueError(f'Wenzhou XLS row {source_row}: nursing beds exceed total')
        rows.append(WenzhouHistoricalRow(
            source_row, name, kind, beds, nursing_beds,
            None if address in ('', '无记录') else address,
        ))
    if len(rows) != ROW_COUNT or sum(row.address is None for row in rows) != 1564:
        raise ValueError('Wenzhou historical row coverage changed')
    return rows


def load_wenzhou_historical_rows() -> list[WenzhouHistoricalRow]:
    validate_wenzhou_source_pages(METADATA.read_bytes(), LICENSE.read_bytes())
    return parse_wenzhou_historical_rows(ARCHIVE.read_bytes())
