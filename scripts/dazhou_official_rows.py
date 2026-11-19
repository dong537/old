"""Validate Darzhou's open-data preview without publishing contact fields.

The catalog claims 179 records, but its anonymous data preview actually returns
30. Only those 30 frozen rows are projected; they are not a citywide census.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/private/national-official-source/raw"
CATALOG = RAW_DIR / "dazhou-catalog-20260814.html"
PREVIEW = RAW_DIR / "dazhou-preview-20261117.json"
CATALOG_BYTES = 89275
CATALOG_SHA256 = "c381d1d93f71f253370efaf9981675520191fc93ec66198a1f4e4bc54ed1e39d"
PREVIEW_BYTES = 21585
PREVIEW_SHA256 = "ce692c03de0ab538305ee9714045734f0eefc7e42c7a18868c760b46f65955d5"
ROW_COUNT = 30
SOURCE_URL = "https://www.dazhoudata.cn/oportal/catalog/8295bd1137254b6699c69992f30de94d"
PREVIEW_URL = SOURCE_URL + "/getData"
TITLE = "达州市养老机构基本信息"
PUBLISHED_AT = "2024-01-10"
UPDATED_AT = "2026-08-14"
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)
FIELDS = {
    "sfwtkjzgyjg", "qu", "ejdwxz", "dwmc", "sheng", "dwjlrqy",
    "dwtxxxdz", "szlnrs", "cyryrs", "dwjlrqn", "cwzsl", "shi",
    "qtcwsl", "dwjlrqr", "rtcwsl", "yjdwxz", "hlxcwsl", "xbzt",
    "frfzrxm", "jzmj", "zdmj",
}


@dataclass(frozen=True)
class DazhouOfficialRow:
    row_number: int  # 1-based position in the frozen preview's data array.
    name: str
    address: str
    beds: int | None


def _check_hash(raw: bytes, expected_sha: str, expected_bytes: int, label: str) -> None:
    if expected_sha == hashlib.sha256(raw).hexdigest():
        if expected_sha in (CATALOG_SHA256, PREVIEW_SHA256) and len(raw) != expected_bytes:
            raise ValueError(f"Dazhou {label} size or SHA-256 changed")
    else:
        raise ValueError(f"Dazhou {label} SHA-256 changed")


def validate_dazhou_catalog(raw: bytes, *, expected_sha: str = CATALOG_SHA256) -> None:
    _check_hash(raw, expected_sha, CATALOG_BYTES, "catalog")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    text = " ".join(" ".join(document.itertext()).split())
    required = (
        TITLE, "达州市民政局", "发布时间： 2024-01-10",
        "最后更新时间 2026-08-14", "数据量 179", "无条件开放",
        "可以自由利用、自由传播与分享", "在成果中注明数据来源",
    )
    if not all(fragment in text for fragment in required):
        raise ValueError("Dazhou open-data licence or catalog metadata changed")


def _public_text(value: object, row_number: int, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Dazhou row {row_number}: missing {field}")
    result = value.strip()
    if CONTACT.search(result):
        raise ValueError(f"Dazhou row {row_number}: contact data in {field}")
    return result


def parse_dazhou_rows(raw: bytes, *, expected_sha: str = PREVIEW_SHA256) -> list[DazhouOfficialRow]:
    _check_hash(raw, expected_sha, PREVIEW_BYTES, "preview")
    payload = json.loads(raw.decode("utf-8", errors="strict"))
    if not isinstance(payload, dict) or set(payload) != {"recordsFiltered", "data", "draw", "recordsTotal", "items"}:
        raise ValueError("Dazhou preview structure changed")
    data = payload["data"]
    if (payload["recordsTotal"] != ROW_COUNT or payload["recordsFiltered"] != ROW_COUNT
            or not isinstance(data, list) or len(data) != ROW_COUNT):
        raise ValueError("Dazhou preview row count changed")
    if not isinstance(payload["items"], list) or len(payload["items"]) != len(FIELDS):
        raise ValueError("Dazhou preview field dictionary changed")
    rows: list[DazhouOfficialRow] = []
    for row_number, item in enumerate(data, 1):
        if not isinstance(item, dict) or set(item) != FIELDS:
            raise ValueError(f"Dazhou row {row_number}: fields changed")
        if item["sheng"] != "四川省" or item["shi"] != "达州市" or item["qu"] not in ("通川区", "达川区", ""):
            raise ValueError(f"Dazhou row {row_number}: geography changed")
        name = _public_text(item["dwmc"], row_number, "name")
        address = _public_text(item["dwtxxxdz"], row_number, "address")
        raw_beds = item["cwzsl"]
        if raw_beds in (None, ""):
            beds = None
        elif isinstance(raw_beds, str) and re.fullmatch(r"\d+", raw_beds):
            beds = int(raw_beds)
        else:
            raise ValueError(f"Dazhou row {row_number}: invalid beds")
        rows.append(DazhouOfficialRow(row_number, name, address, beds))
    if len({row.name for row in rows}) != ROW_COUNT:
        raise ValueError("Dazhou preview duplicate names changed")
    return rows
