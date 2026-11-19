"""Read the frozen Wuhan metropolitan-circle government source table.

Returned rows deliberately omit the source's contact-person and phone columns.
The source describes institutions as of May 2026, not current operations.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
HUBEI_HTML = ROOT / "data/private/national-official-source/raw/hubei-wuhancircle-202605.html"
HUBEI_SHA256 = "afafd7dc7a2d60c1a865d86ca2d98eb421ed76bb049f488e2a84eddbfa871955"
HUBEI_BYTES = 1270374
HUBEI_ROWS = 747
TITLE = "武汉都市圈养老机构清单"
HEADERS = ("序号", "市", "机构名称", "单位通信详细地址", "联系人", "联系方式")
PUBLISHED_AT = "2026-06-15"
PUBLISHED_TIMESTAMP = "2026-06-15 16:42"
AS_OF_LABEL = "截止2026年5月底"
REMARK = "备注：统计范围为截止2026年5月底，各市已登记备案且正常运营的养老机构。"
SOURCE_URL = "https://www.hbqj.gov.cn/smzj/xwzx/gsgg/202606/t20260615_5958211.html"
CITY_SLUGS = {
    "武汉市": "wuhan", "黄冈市": "huanggang", "孝感市": "xiaogan",
    "咸宁市": "xianning", "黄石市": "huangshi", "天门市": "tianmen",
    "鄂州市": "ezhou", "仙桃市": "xiantao", "潜江市": "qianjiang",
}
CITY_COUNTS = {
    "武汉市": 230, "黄冈市": 177, "孝感市": 124, "咸宁市": 81,
    "黄石市": 56, "天门市": 22, "鄂州市": 22, "仙桃市": 20,
    "潜江市": 15,
}
CONTACT = re.compile(
    r"(?<![0-9])(?:1[3-9][0-9]{9}|0[0-9]{2,3}[- ]?[0-9]{7,8})(?![0-9])"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class HubeiOfficialRow:
    row_number: int
    name: str
    address: str
    city_name: str
    city_slug: str
    beds: None = None  # This source has no bed-count column.


def _cell_text(cell: html.HtmlElement) -> str:
    return " ".join(" ".join(cell.itertext()).split())


def _public_text(value: str, field: str, row_number: int) -> str:
    if not value:
        raise ValueError(f"Hubei source row {row_number}: missing {field}")
    if CONTACT.search(value):
        raise ValueError(f"Hubei source row {row_number}: contact data in {field}")
    return value


def parse_hubei_rows(raw: bytes, *, expected_sha: str = HUBEI_SHA256) -> list[HubeiOfficialRow]:
    """Validate the frozen HTML and return a privacy-minimal row projection.

    `expected_sha` permits rehashed structural-negative fixtures; production
    callers use the pinned default.
    """
    if expected_sha == HUBEI_SHA256 and len(raw) != HUBEI_BYTES:
        raise ValueError("Hubei source size or SHA-256 changed")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Hubei source SHA-256 changed")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    text = " ".join(document.text_content().split())
    if f"发布日期：{PUBLISHED_TIMESTAMP}" not in text:
        raise ValueError("Hubei source publication date changed")
    tables = document.xpath("//table")
    if len(tables) != 1:
        raise ValueError("Hubei source table count changed")
    table_rows = tables[0].xpath(".//tr")
    if len(table_rows) != HUBEI_ROWS + 3:
        raise ValueError(f"Hubei source expected {HUBEI_ROWS} rows")
    title = [_cell_text(cell) for cell in table_rows[0].xpath("./th|./td")]
    headers = [_cell_text(cell) for cell in table_rows[1].xpath("./th|./td")]
    if title != [TITLE] or tuple(headers) != HEADERS:
        raise ValueError("Hubei source title or headers changed")
    remark = [_cell_text(cell) for cell in table_rows[-1].xpath("./th|./td")]
    if not remark or remark[0] != REMARK or any(remark[1:]) or AS_OF_LABEL not in remark[0]:
        raise ValueError("Hubei source as-of remark changed")

    output: list[HubeiOfficialRow] = []
    cities: Counter[str] = Counter()
    for row_number, table_row in enumerate(table_rows[2:-1], 1):
        cells = table_row.xpath("./th|./td")
        if len(cells) != len(HEADERS):
            raise ValueError(f"Hubei source row {row_number}: columns changed")
        # Read only the four public columns. Contacts remain in the private raw HTML.
        serial, city_name, name, address = (_cell_text(cell) for cell in cells[:4])
        if serial != str(row_number):
            raise ValueError(f"Hubei source row {row_number}: serial changed")
        if city_name not in CITY_SLUGS:
            raise ValueError(f"Hubei source row {row_number}: unknown city")
        name = _public_text(name, "name", row_number)
        address = _public_text(address, "address", row_number)
        cities[city_name] += 1
        output.append(HubeiOfficialRow(
            row_number=row_number, name=name, address=address,
            city_name=city_name, city_slug=CITY_SLUGS[city_name],
        ))
    if len(output) != HUBEI_ROWS or cities != CITY_COUNTS:
        raise ValueError(f"Hubei source row or city distribution changed: {dict(cities)}")
    return output


def load_hubei_rows(path: Path = HUBEI_HTML) -> list[HubeiOfficialRow]:
    return parse_hubei_rows(path.read_bytes())
