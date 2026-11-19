"""Parse the frozen Nanjing city roster into contact-free official source rows.

This source reports institutions as of February 2026. Rows are observations
from one dated publication, not proof of current operation or bed vacancies.
"""

from __future__ import annotations

import hashlib
import re

from lxml import html


SOURCE_URL = "https://mzj.nanjing.gov.cn/njsmzj/ztzl/njylfw/fwjgxx/202603/t20260310_5803250.html"
SOURCE_BYTES = 579360
SOURCE_SHA256 = "ace786a9e7c97e2a5e41f58302fe78e86fdfae43734b4d8ac91ee16900054c8c"
PUBLISHED_AT = "2026-03-10"
AS_OF = "2026年2月底"
ROW_COUNT = 278
HEADERS = (
    "序号", "所属区", "所属街镇", "服务机构名称", "地址",
    "机构性质（1.公办公营；2.公办民营；3.民营）", "等级（未评级的不填）",
    "全托床位数（张）", "入住咨询电话",
    "内设医疗机构类型（以卫健备案或审批内容为准）",
)
MOBILE = re.compile(r"(?<!\d)(?:(?:\+86|0086)[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)")
LANDLINE = re.compile(r"(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)")
EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)


def _cell_text(cell: html.HtmlElement) -> str:
    return " ".join(" ".join(cell.itertext()).split())


def _safe_public_text(value: str, row_number: int, field: str) -> str:
    if not value:
        raise ValueError(f"Nanjing row {row_number}: missing {field}")
    if MOBILE.search(value) or LANDLINE.search(value) or EMAIL.search(value):
        raise ValueError(f"Nanjing row {row_number}: contact in {field}")
    return value


def parse_nanjing_rows(raw: bytes) -> list[dict[str, str | int]]:
    """Validate the official HTML structure and return only approved fields."""
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    text = " ".join(document.xpath("//text()"))
    if f"全市养老机构明细表公示（截至{AS_OF}）" not in text:
        raise ValueError("Nanjing as-of title changed")
    if not re.search(r"发表时间：\s*" + re.escape(PUBLISHED_AT), text):
        raise ValueError("Nanjing published date changed")
    tables = document.xpath("//table")
    if len(tables) != 1:
        raise ValueError("Nanjing expected one official table")
    table_rows = tables[0].xpath(".//tr")
    if len(table_rows) != ROW_COUNT + 2:
        raise ValueError("Nanjing source row count changed")
    title = tuple(_cell_text(cell) for cell in table_rows[0].xpath("./th|./td"))
    if title != (f"全市养老机构统计表（{AS_OF}）",):
        raise ValueError("Nanjing table title changed")
    header = tuple(_cell_text(cell) for cell in table_rows[1].xpath("./th|./td"))
    if header != HEADERS:
        raise ValueError("Nanjing header changed")
    records: list[dict[str, str | int]] = []
    for number, row in enumerate(table_rows[2:], 1):
        cells = [_cell_text(cell) for cell in row.xpath("./th|./td")]
        if len(cells) != len(HEADERS):
            raise ValueError(f"Nanjing row {number}: column count changed")
        if cells[0] != str(number):
            raise ValueError(f"Nanjing row {number}: serial changed")
        name = _safe_public_text(cells[3], number, "name")
        address = _safe_public_text(cells[4], number, "address")
        if not re.fullmatch(r"[0-9]+", cells[7]):
            raise ValueError(f"Nanjing row {number}: beds invalid")
        records.append({
            "rowNumber": number, "name": name, "address": address,
            "beds": int(cells[7]), "citySlug": "nanjing", "cityName": "南京",
        })
    return records


def validate_nanjing_source(raw: bytes) -> list[dict[str, str | int]]:
    """Reject any byte drift before projecting the frozen source."""
    if len(raw) != SOURCE_BYTES:
        raise ValueError("Nanjing frozen source length changed")
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("Nanjing frozen source SHA-256 changed")
    return parse_nanjing_rows(raw)
