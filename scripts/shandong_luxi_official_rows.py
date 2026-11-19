"""Validate the Luxi District open-data snapshots before a minimal public projection."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/private/national-official-source/raw"
CATALOG = RAW_DIR / "shandong-luxi-catalog-20261117.html"
OLDER = RAW_DIR / "shandong-luxi-20250627.csv"
NEWER = RAW_DIR / "shandong-luxi-20261110.csv"
CATALOG_BYTES = 92875
CATALOG_SHA256 = "568f35128dbf05492aabfdfdb3c5b0486aa4eabde063d6fc0607861e92cb1fb1"
OLDER_BYTES = 3199
OLDER_SHA256 = "780fd0150064bbb7946e15c51491412f305726019914863d2eba885e3130c2fc"
NEWER_BYTES = 794
NEWER_SHA256 = "256877cea4ccfe1beee6488ccd331338cbf36a3434cccbd0bdee565e9108c14a"
ROW_COUNT = 23
NEWER_ROW_COUNT = 5
SOURCE_URL = "https://data.sd.gov.cn/portal/catalog/CD7009EDC99348728AAAD80F06AE1BFE"
TITLE = "养老机构信息"
PUBLISHED_AT = "2025-07-28"
AS_OF = None
COLUMNS = ("统一社会信用代码", "法人性质", "机构名称", "法定代表人", "机构类别", "机构地址", "运营方式")
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class LuxiOfficialRow:
    row_number: int
    name: str
    address: str


def _check_hash(raw: bytes, expected_sha: str, expected_bytes: int, actual_sha: str, label: str) -> None:
    if hashlib.sha256(raw).hexdigest() != expected_sha or (expected_sha == actual_sha and len(raw) != expected_bytes):
        raise ValueError(f"Luxi {label} size or SHA-256 changed")


def validate_luxi_catalog(raw: bytes, *, expected_sha: str = CATALOG_SHA256) -> None:
    _check_hash(raw, expected_sha, CATALOG_BYTES, CATALOG_SHA256, "catalog")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    text = " ".join(" ".join(document.itertext()).split())
    required = (
        TITLE, "来源部门： 菏泽鲁西新区", "目录发布时间： 2025-07-28",
        "目录更新时间： 2026-11-10", "数据量 23", "无条件开放",
        "可以自由利用、自由传播与分享", "在成果中注明数据来源",
    )
    if not all(part in text for part in required):
        raise ValueError("Luxi catalog metadata or open-data licence changed")


def _read_csv(raw: bytes, label: str, expected_count: int) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(raw.decode("gb18030", errors="strict"), newline=""))
    if tuple(reader.fieldnames or ()) != COLUMNS:
        raise ValueError(f"Luxi {label} CSV header changed")
    rows = list(reader)
    if len(rows) != expected_count:
        raise ValueError(f"Luxi {label} row count changed")
    if any(set(row) != set(COLUMNS) or any(value is None for value in row.values()) for row in rows):
        raise ValueError(f"Luxi {label} CSV fields changed")
    codes = [row["统一社会信用代码"].strip() for row in rows]
    if any(not code for code in codes) or len(set(codes)) != len(codes):
        raise ValueError(f"Luxi {label} entity codes are blank or repeated")
    return rows


def parse_luxi_rows(
    older: bytes, newer: bytes, *,
    expected_older_sha: str = OLDER_SHA256,
    expected_newer_sha: str = NEWER_SHA256,
) -> list[LuxiOfficialRow]:
    _check_hash(older, expected_older_sha, OLDER_BYTES, OLDER_SHA256, "2025 CSV")
    _check_hash(newer, expected_newer_sha, NEWER_BYTES, NEWER_SHA256, "2026 CSV")
    old_rows = _read_csv(older, "2025", ROW_COUNT)
    new_rows = _read_csv(newer, "2026", NEWER_ROW_COUNT)
    result: list[LuxiOfficialRow] = []
    for row_number, row in enumerate(old_rows, 1):
        name, address = row["机构名称"].strip(), row["机构地址"].strip()
        if not name or not address:
            raise ValueError(f"Luxi row {row_number}: name or address is blank")
        if CONTACT.search(name) or CONTACT.search(address):
            raise ValueError(f"Luxi row {row_number}: contact data in public field")
        result.append(LuxiOfficialRow(row_number, name, address))
    older_by_code = {row["统一社会信用代码"].strip(): row for row in old_rows}
    if any(older_by_code.get(row["统一社会信用代码"].strip()) != row for row in new_rows):
        raise ValueError("Luxi 2026 revision is not an exact subset of the 2025 CSV")
    return result
