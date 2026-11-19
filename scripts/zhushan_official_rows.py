"""Validate the frozen Zhushan government attachment for private source review.

Reading the source does not grant permission to republish its rows. Keep this
parser and its output out of the public data pipeline pending reuse clearance.
"""

from __future__ import annotations

import hashlib
import io
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser

from openpyxl import load_workbook


WORKBOOK_BYTES = 108556
WORKBOOK_SHA256 = "cf5b6e271c80826dfc6846268e900f7f7c1573e8c043d90ede07e9488861e75f"
PAGE_BYTES = 43455
PAGE_SHA256 = "d3df4e46d95ff7bb832f0d4996a80dba38951105d99ff4a4340b4ea60e20c03c"
TITLE = "2025年养老服务领域公开养老机构信息名单"
PUBLISHED_AT = "2025-12-04 10:56"
CONTENT_SOURCE = "珠山区民政局珠山区人民政府"
ATTACHMENT_HREF = "./P020251204394048702723.xlsx"
SHEET_NAME = "景德镇市"
ROW_COUNT = 7
HEADERS = (
    "序号", "统一社会信用代码\n", "单位名称", "单位建立日期", "省", "市", "区县",
    "街镇", "村社区", "单位通信详细地址", "法定代表人或负责人姓名",
    "法定代表人或负责人联系方式", "法人登记机关", "法人类型\n",
    "全托床位数量", "日托床位数量", "护理型床位数量", "床位总数量",
    "建筑面积", "占地面积", "场所性质", "单位性质一级", "单位性质二级",
    "是否为特困救助供养机构", "是否为光荣院", "是否为街道乡镇区域性养老服务中心",
    "兴办主体", "经营状况", "是否备案", "备案时间", "注册（开办资金）",
)


@dataclass(frozen=True)
class ZhushanOfficialRow:
    row_number: int
    excel_row: int
    name: str
    province: str
    city: str
    district: str
    address: str
    total_beds: int


@dataclass(frozen=True)
class ZhushanPage:
    title: str
    published_at: str
    content_source: str
    attachment_href: str


def _verify_bytes(raw: bytes, expected_sha: str, frozen_sha: str, frozen_size: int, label: str) -> None:
    if expected_sha == frozen_sha and len(raw) != frozen_size:
        raise ValueError(f"Zhushan {label} size changed")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError(f"Zhushan {label} SHA-256 changed")


def _required_text(value: object, excel_row: int, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Zhushan Excel row {excel_row}: missing {field}")
    return value.strip()


def _bed_count(value: object, excel_row: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"Zhushan Excel row {excel_row}: invalid total beds")
    if isinstance(value, int):
        beds = value
    elif isinstance(value, str) and re.fullmatch(r"[0-9]+", value.strip()):
        beds = int(value.strip())
    else:
        raise ValueError(f"Zhushan Excel row {excel_row}: invalid total beds")
    if beds < 0:
        raise ValueError(f"Zhushan Excel row {excel_row}: negative total beds")
    return beds


def _assert_no_trailing_values(raw: bytes) -> None:
    """Inspect populated XML cells, not the formatted 1,856 x 16,384 grid."""
    cell_tag = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"
    value_tags = {
        "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v",
        "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}is",
        "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}f",
    }
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        with archive.open("xl/worksheets/sheet1.xml") as sheet_xml:
            for _, cell in ET.iterparse(sheet_xml, events=("end",)):
                if cell.tag != cell_tag:
                    continue
                reference = cell.get("r", "")
                row_match = re.fullmatch(r"[A-Z]+([0-9]+)", reference)
                if row_match and int(row_match.group(1)) > ROW_COUNT + 4:
                    if any(child.tag in value_tags and "".join(child.itertext()).strip() for child in cell):
                        raise ValueError(f"Zhushan workbook unexpected extra row {row_match.group(1)}")
                cell.clear()


def parse_zhushan_rows(raw: bytes, *, expected_sha: str = WORKBOOK_SHA256) -> list[ZhushanOfficialRow]:
    """Extract only selected fields; reject changed sequence, geography or grid."""
    _verify_bytes(raw, expected_sha, WORKBOOK_SHA256, WORKBOOK_BYTES, "workbook")
    workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    try:
        if workbook.sheetnames != [SHEET_NAME]:
            raise ValueError("Zhushan workbook sheet names changed")
        sheet = workbook[SHEET_NAME]
        rows = list(sheet.iter_rows(min_row=1, max_row=ROW_COUNT + 4,
                                    max_col=len(HEADERS), values_only=True))
        if len(rows) != ROW_COUNT + 4:
            raise ValueError("Zhushan workbook row count changed")
        title = rows[0]
        header = rows[2]
        if title is None or title[0] != TITLE:
            raise ValueError("Zhushan workbook title changed")
        if header != HEADERS:
            raise ValueError("Zhushan workbook header changed")

        records: list[ZhushanOfficialRow] = []
        for excel_row, cells in enumerate(rows[4:], start=5):
            serial = cells[0]
            expected_serial = excel_row - 4
            if isinstance(serial, bool) or not isinstance(serial, int) or serial != expected_serial:
                raise ValueError(f"Zhushan Excel row {excel_row}: serial changed")
            province = _required_text(cells[4], excel_row, "province")
            city = _required_text(cells[5], excel_row, "city")
            district = _required_text(cells[6], excel_row, "district")
            if (province, city, district) != ("江西省", "景德镇市", "珠山区"):
                raise ValueError(f"Zhushan Excel row {excel_row}: province/city/district location changed")
            records.append(ZhushanOfficialRow(
                row_number=expected_serial,
                excel_row=excel_row,
                name=_required_text(cells[2], excel_row, "name"),
                province=province,
                city=city,
                district=district,
                address=_required_text(cells[9], excel_row, "address"),
                total_beds=_bed_count(cells[17], excel_row),
            ))
        _assert_no_trailing_values(raw)
        return records
    finally:
        workbook.close()


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title_parts: list[str] = []
        self.in_title = False
        self.attachments: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "title":
            self.in_title = True
        elif tag == "meta" and attributes.get("name") in {"ArticleTitle", "PubDate", "ContentSource"}:
            self.meta[attributes["name"]] = attributes.get("content") or ""
        elif tag == "a":
            href = attributes.get("href") or ""
            if href.lower().endswith(".xlsx"):
                self.attachments.append(href)

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False


def parse_zhushan_page(raw: bytes, *, expected_sha: str = PAGE_SHA256) -> ZhushanPage:
    """Validate the saved government-page metadata and its attachment link."""
    _verify_bytes(raw, expected_sha, PAGE_SHA256, PAGE_BYTES, "page")
    try:
        html = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Zhushan page encoding changed") from exc
    parser = _PageParser()
    parser.feed(html)
    title = "".join(parser.title_parts).strip()
    if title != TITLE or parser.meta.get("ArticleTitle") != TITLE:
        raise ValueError("Zhushan page title metadata changed")
    if parser.meta.get("PubDate") != PUBLISHED_AT:
        raise ValueError("Zhushan page published metadata changed")
    if parser.meta.get("ContentSource") != CONTENT_SOURCE:
        raise ValueError("Zhushan page source metadata changed")
    if parser.attachments != [ATTACHMENT_HREF]:
        raise ValueError("Zhushan page attachment link changed")
    return ZhushanPage(title, PUBLISHED_AT, CONTENT_SOURCE, ATTACHMENT_HREF)
