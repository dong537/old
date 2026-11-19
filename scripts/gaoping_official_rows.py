"""Validate the frozen Gaoping district eldercare-list attachment.

These 36 names are a dated district source list, not a current Nanchong or
Sichuan institution census.  The workbook provides only a name column.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass
from pathlib import Path

from lxml import html
from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/private/national-official-source/raw"
WORKBOOK = RAW_DIR / "gaoping-202502.xlsx"
PAGE = RAW_DIR / "gaoping-202502-page.html"
WORKBOOK_SHA256 = "16be0957c865e4b68d8eb8f546871998e83a99c30005c192347ef946e20adb08"
WORKBOOK_BYTES = 9751
PAGE_SHA256 = "4a9cfe5eee037359681bbba46456cb9ecc184ae315d24433ab65580c206a502f"
PAGE_BYTES = 72300
ROW_COUNT = 36
PUBLISHED_AT = "2025-02-20"
SOURCE_URL = "https://gaoping.gov.cn/zwgk/zdlygk/ylfw/t_2291011.html"
ATTACHMENT_URL = "https://gaoping.gov.cn/zwgk/zdlygk/ylfw/W020251211378064852623.xlsx"
TITLE = "南充市高坪区民政局2025年2月养老机构名单公示"
SHEET_TITLE = "机构信息管理导出"
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class GaopingOfficialRow:
    row_number: int  # 1-based data sequence; Excel physical row is row_number + 1.
    name: str


def validate_gaoping_page(raw: bytes) -> None:
    if len(raw) != PAGE_BYTES or hashlib.sha256(raw).hexdigest() != PAGE_SHA256:
        raise ValueError("Gaoping source page size or SHA-256 changed")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    if document.xpath('//meta[@name="ArticleTitle"]/@content') != [TITLE]:
        raise ValueError("Gaoping source page title changed")
    if document.xpath('//meta[@name="PubDate"]/@content') != ["2025-02-20 09:20"]:
        raise ValueError("Gaoping source page published date changed")
    if document.xpath('//meta[@name="ContentSource"]/@content') != ["高坪区民政局"]:
        raise ValueError("Gaoping source page authority changed")
    if "W020251211378064852623.xlsx" not in raw.decode("utf-8"):
        raise ValueError("Gaoping source page attachment link changed")


def parse_gaoping_rows(raw: bytes, *, expected_sha: str = WORKBOOK_SHA256) -> list[GaopingOfficialRow]:
    """Fail closed on a changed workbook; tests may rehash structural mutations."""
    if expected_sha == WORKBOOK_SHA256 and len(raw) != WORKBOOK_BYTES:
        raise ValueError("Gaoping workbook size or SHA-256 changed")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Gaoping workbook SHA-256 changed")
    workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    try:
        if len(workbook.worksheets) != 1:
            raise ValueError("Gaoping workbook sheet count changed")
        sheet = workbook.active
        if sheet.title != SHEET_TITLE or sheet.max_column != 1 or sheet.max_row != ROW_COUNT + 1:
            raise ValueError("Gaoping workbook structure or row count changed")
        if sheet.cell(1, 1).value != "单位名称":
            raise ValueError("Gaoping workbook header changed")
        rows: list[GaopingOfficialRow] = []
        names: set[str] = set()
        for row_number, (value,) in enumerate(sheet.iter_rows(min_row=2, max_col=1, values_only=True), 1):
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"Gaoping row {row_number}: missing name")
            name = value.strip()
            if name in names or CONTACT.search(name):
                raise ValueError(f"Gaoping row {row_number}: duplicate name or contact data")
            names.add(name)
            rows.append(GaopingOfficialRow(row_number, name))
        if len(rows) != ROW_COUNT:
            raise ValueError("Gaoping workbook row coverage changed")
        return rows
    finally:
        workbook.close()


def load_gaoping_rows(path: Path = WORKBOOK) -> list[GaopingOfficialRow]:
    validate_gaoping_page(PAGE.read_bytes())
    return parse_gaoping_rows(path.read_bytes())
