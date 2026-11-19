"""Validate two frozen Tai'an CSV versions; publish only historical names/addresses."""

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
CATALOG = RAW_DIR / "shandong-taian-catalog-20261117.html"
OLDER = RAW_DIR / "shandong-taian-20250724.csv"
NEWER = RAW_DIR / "shandong-taian-20260801.csv"
CATALOG_BYTES = 91593
CATALOG_SHA256 = "db6bba9719caac0ab49b1a3ccdd7ebf8a946cd7e58d2ad55993e8b82a806ee7d"
OLDER_BYTES = 11662
OLDER_SHA256 = "4a257ac2ee58ce604beea9b7e7a7f28b1048868d58bce51730d17303ddbd9e65"
NEWER_BYTES = 1428
NEWER_SHA256 = "7b5e9675c8ef02a87999af6171fb1eb62c0421967b24db54af64824ccd7da11f"
ROW_COUNT = 93
NEWER_ROW_COUNT = 10
SOURCE_URL = "https://data.sd.gov.cn/portal/catalog/19223520c2494a94af3ccbacfc17cf91"
TITLE = "泰安市养老机构信息"
PUBLISHED_AT = "2025-07-29"
AS_OF = None
COLUMNS = ("机构名称", "机构详细地址", "所属区划代码", "所属区划名称", "开办时间")
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class TaianOfficialRow:
    row_number: int
    name: str
    address: str


def _check_hash(raw: bytes, expected_sha: str, expected_bytes: int, actual_sha: str, label: str) -> None:
    if hashlib.sha256(raw).hexdigest() != expected_sha or (expected_sha == actual_sha and len(raw) != expected_bytes):
        raise ValueError(f"Tai'an {label} size or SHA-256 changed")


def validate_taian_catalog(raw: bytes, *, expected_sha: str = CATALOG_SHA256) -> None:
    _check_hash(raw, expected_sha, CATALOG_BYTES, CATALOG_SHA256, "catalog")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    content = " ".join(" ".join(document.itertext()).split())
    required = (
        TITLE, "来源部门： 泰安市民政局", "目录发布时间： 2025-07-29",
        "目录更新时间： 2026-08-28", "数据量 93", "无条件开放",
        "可以自由利用、自由传播与分享", "在成果中注明数据来源",
    )
    if not all(part in content for part in required):
        raise ValueError("Tai'an catalog metadata or open-data licence changed")


def _read_csv(raw: bytes, label: str, expected_count: int) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(raw.decode("gb18030", errors="strict"), newline=""))
    if tuple(reader.fieldnames or ()) != COLUMNS:
        raise ValueError(f"Tai'an {label} CSV header changed")
    rows = list(reader)
    if len(rows) != expected_count:
        raise ValueError(f"Tai'an {label} CSV row count changed")
    if any(set(row) != set(COLUMNS) or any(value is None for value in row.values()) for row in rows):
        raise ValueError(f"Tai'an {label} CSV fields changed")
    return rows


def parse_taian_rows(
    older: bytes, newer: bytes, *,
    expected_older_sha: str = OLDER_SHA256,
    expected_newer_sha: str = NEWER_SHA256,
) -> list[TaianOfficialRow]:
    _check_hash(older, expected_older_sha, OLDER_BYTES, OLDER_SHA256, "2025 CSV")
    _check_hash(newer, expected_newer_sha, NEWER_BYTES, NEWER_SHA256, "2026 CSV")
    old_rows = _read_csv(older, "2025", ROW_COUNT)
    new_rows = _read_csv(newer, "2026", NEWER_ROW_COUNT)
    result = []
    for row_number, row in enumerate(old_rows, 1):
        name, address = row["机构名称"].strip(), row["机构详细地址"].strip()
        if not name or not address:
            raise ValueError(f"Tai'an row {row_number}: name or address is blank")
        if CONTACT.search(name) or CONTACT.search(address):
            raise ValueError(f"Tai'an row {row_number}: contact data in public field")
        result.append(TaianOfficialRow(row_number, name, address))
    if len({row.name for row in result}) != ROW_COUNT:
        raise ValueError("Tai'an source names are no longer unique")
    if any(row not in old_rows for row in new_rows):
        raise ValueError("Tai'an 2026 revision is not an exact subset of the 2025 CSV")
    return result
