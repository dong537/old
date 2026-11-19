"""Parse a frozen Shijiazhuang civil-affairs PDF into contact-free source rows.

The PDF prints names on pages 1–7 and addresses/phones on pages 8–14.
Page pairs have identical physical table rows, so we align those rows exactly.
Its 265 printed serials include three additional, unnumbered site rows; they
produce 268 observations. The source has no explicit as-of date and does not
establish current operation or availability.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "data/private/national-official-source/raw/shijiazhuang-2026.pdf"
PDF_BYTES = 334248
PDF_SHA256 = "af8ee7ef6bece727da874a5ef04dbbc0ea0956f2f98d51931e61bb454ed15bab"
SOURCE_URL = "https://mzj.sjz.gov.cn/columns/b8e89be9-bfd0-4d9b-91f9-895bf1d6c3fc/201909/17/80d454bf-14e3-48c7-81f2-0e34fa50edfa.html"
PUBLISHED_AT = "2026-03-20"  # Article metadata; attachment path contains 2026-03-30.
SOURCE_TITLE = "石家庄市养老机构信息一览表"
PAGE_ROW_COUNTS = (43, 41, 46, 45, 45, 46, 3)
NAME_HEADER = ("序号", "县/市/区", "养老机构名称", "等级及有效期限")
ADDRESS_HEADER = ("地 址", "联系电话")
UNNUMBERED_ROW_NUMBERS = (2, 155, 156)
CONTACT = re.compile(
    r"(?<![0-9])(?:1[3-9][0-9]{9}|0[0-9]{2,3}[- ]?[0-9]{7,8})(?![0-9])"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class ShijiazhuangOfficialRow:
    row_number: int  # Continuous physical row index, not the PDF's printed serial.
    source_serial: int
    is_unnumbered_site: bool
    district: str
    name: str
    address: str
    city_name: str = "石家庄"
    city_slug: str = "shijiazhuang"
    beds: None = None


def _text(value: str | None) -> str:
    return " ".join((value or "").split())


def _public_text(value: str | None, row_number: int, field: str) -> str:
    result = _text(value)
    if not result:
        raise ValueError(f"Shijiazhuang row {row_number}: missing {field}")
    if CONTACT.search(result):
        raise ValueError(f"Shijiazhuang row {row_number}: contact in {field}")
    return result


def extract_shijiazhuang_tables(raw: bytes) -> list[list[list[str | None]]]:
    """Extract exactly one table per PDF page, keeping private columns in memory.

    Callers must project with `project_shijiazhuang_tables`; do not serialize
    these extracted tables because pages 8–14 contain telephone numbers.
    """
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        if len(pdf.pages) != 14:
            raise ValueError("Shijiazhuang PDF page count changed")
        tables = []
        for index, page in enumerate(pdf.pages):
            if abs(page.width - 595.32) > 1 or abs(page.height - 841.92) > 1:
                raise ValueError(f"Shijiazhuang page {index + 1}: dimensions changed")
            if index in (0, 7):
                lines = (page.extract_text() or "").splitlines()
                if not lines or _text(lines[0]) != SOURCE_TITLE:
                    raise ValueError(f"Shijiazhuang page {index + 1}: title changed")
            found = page.find_tables()
            if len(found) != 1:
                raise ValueError(f"Shijiazhuang page {index + 1}: table count changed")
            tables.append(found[0].extract())
        return tables


def project_shijiazhuang_tables(
    tables: list[list[list[str | None]]],
) -> list[ShijiazhuangOfficialRow]:
    """Validate table halves and pair each name/address by physical row."""
    if len(tables) != 14:
        raise ValueError("Shijiazhuang PDF table count changed")
    for index, rows in enumerate(tables):
        expected = PAGE_ROW_COUNTS[index % 7]
        if len(rows) != expected:
            raise ValueError(f"Shijiazhuang page {index + 1}: row count changed")
        expected_columns = 4 if index < 7 else 2
        if any(len(row) != expected_columns for row in rows):
            raise ValueError(f"Shijiazhuang page {index + 1}: column count changed")
    if tuple(map(_text, tables[0][0])) != NAME_HEADER:
        raise ValueError("Shijiazhuang name header changed")
    if tuple(map(_text, tables[7][0])) != ADDRESS_HEADER:
        raise ValueError("Shijiazhuang address header changed")

    names: list[list[str | None]] = []
    addresses: list[list[str | None]] = []
    for page_index in range(7):
        first = 1 if page_index == 0 else 0
        names.extend(tables[page_index][first:])
        addresses.extend(tables[page_index + 7][first:])
    if len(names) != 268 or len(addresses) != 268:
        raise ValueError("Shijiazhuang name/address alignment row count changed")

    output: list[ShijiazhuangOfficialRow] = []
    source_serial = 0
    district = ""
    unnumbered: list[int] = []
    for row_number, (name_cells, address_cells) in enumerate(zip(names, addresses), 1):
        serial_text = _text(name_cells[0])
        if serial_text:
            if not serial_text.isdecimal() or int(serial_text) != source_serial + 1:
                raise ValueError(f"Shijiazhuang row {row_number}: serial changed")
            source_serial = int(serial_text)
            district = _public_text(name_cells[1], row_number, "district")
            is_unnumbered_site = False
        else:
            if name_cells[1] is not None or not district:
                raise ValueError(f"Shijiazhuang row {row_number}: unnumbered site structure changed")
            unnumbered.append(row_number)
            is_unnumbered_site = True
        output.append(ShijiazhuangOfficialRow(
            row_number=row_number, source_serial=source_serial,
            is_unnumbered_site=is_unnumbered_site, district=district,
            name=_public_text(name_cells[2], row_number, "name"),
            address=_public_text(address_cells[0], row_number, "address"),
        ))
    if source_serial != 265 or tuple(unnumbered) != UNNUMBERED_ROW_NUMBERS:
        raise ValueError("Shijiazhuang source serial or unnumbered site rows changed")
    return output


def parse_shijiazhuang_rows(raw: bytes) -> list[ShijiazhuangOfficialRow]:
    """Reject byte drift, then project only approved public fields."""
    if len(raw) != PDF_BYTES:
        raise ValueError("Shijiazhuang frozen PDF size changed")
    if hashlib.sha256(raw).hexdigest() != PDF_SHA256:
        raise ValueError("Shijiazhuang frozen PDF SHA-256 changed")
    return project_shijiazhuang_tables(extract_shijiazhuang_tables(raw))


def load_shijiazhuang_rows(path: Path = PDF_PATH) -> list[ShijiazhuangOfficialRow]:
    return parse_shijiazhuang_rows(path.read_bytes())
