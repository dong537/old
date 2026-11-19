"""Parse the frozen Ganzhou directory for private source review.

The government page permits public reading, but its copyright statement asks
reusers to obtain consent before reposting. Do not project these rows publicly
until a separately recorded reuse permission covers this use.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import xlrd


SOURCE_URL = "https://www.ganzhou.gov.cn/zfxxgk/c143793/202606/a73d1b1b1bc14a38a23cf4bb17f9fb30.shtml"
COPYRIGHT_URL = "https://www.ganzhou.gov.cn/gzszf/bqsm/ott.shtml"
PUBLISHED_AT = "2026-06-05"
SOURCE_BYTES = 56832
SOURCE_SHA256 = "bd541c35f3fe06a6d8f6b8259ebc5de27db6420efa13f9218b57150b4a5068fd"
ROW_COUNT = 292
HEADERS = ("序号", "县（市、区）", "机构名称", "机构地址", "备注")


@dataclass(frozen=True)
class GanzhouOfficialRow:
    row_number: int
    excel_row: int
    district: str
    name: str
    address: str
    remarks: str | None


def _required_text(value: object, row_number: int, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Ganzhou row {row_number}: missing {field}")
    return value.strip()


def parse_ganzhou_table(rows: list[list[object]]) -> list[GanzhouOfficialRow]:
    """Validate the source's physical table and return its 292 original rows."""
    if len(rows) != ROW_COUNT + 2 or any(len(row) != len(HEADERS) for row in rows):
        raise ValueError("Ganzhou source dimensions or row count changed")
    if rows[0] != ["赣州市养老机构名录", "", "", "", ""]:
        raise ValueError("Ganzhou source title changed")
    if tuple(rows[1]) != HEADERS:
        raise ValueError("Ganzhou source header changed")

    records = []
    for row_number, row in enumerate(rows[2:], 1):
        serial, district, name, address, remarks = row
        if isinstance(serial, bool) or not isinstance(serial, (int, float)) or serial != row_number:
            raise ValueError(f"Ganzhou row {row_number}: serial is {serial!r}")
        if remarks not in ("", None) and not isinstance(remarks, str):
            raise ValueError(f"Ganzhou row {row_number}: remarks type changed")
        records.append(GanzhouOfficialRow(
            row_number=row_number,
            excel_row=row_number + 2,
            district=_required_text(district, row_number, "district"),
            name=_required_text(name, row_number, "name"),
            address=_required_text(address, row_number, "address"),
            remarks=(remarks.strip() or None) if isinstance(remarks, str) else None,
        ))
    return records


def parse_ganzhou_rows(raw: bytes, *, expected_sha: str = SOURCE_SHA256) -> list[GanzhouOfficialRow]:
    """Fail closed on byte or structure drift; preserve the source's row order."""
    if expected_sha == SOURCE_SHA256 and len(raw) != SOURCE_BYTES:
        raise ValueError("Ganzhou source size changed")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Ganzhou source SHA-256 changed")

    workbook = xlrd.open_workbook(file_contents=raw, on_demand=True)
    try:
        if workbook.sheet_names() != ["Sheet1"]:
            raise ValueError("Ganzhou source sheet names changed")
        sheet = workbook.sheet_by_index(0)
        if sheet.ncols != len(HEADERS):
            raise ValueError("Ganzhou source dimensions or row count changed")
        return parse_ganzhou_table([sheet.row_values(index) for index in range(sheet.nrows)])
    finally:
        workbook.release_resources()
