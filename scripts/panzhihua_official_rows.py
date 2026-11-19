"""Validate Panzhihua's frozen, open-data preview before public projection.

The source covers only homes with at least 100 beds. It provides no address,
current operating status, vacancy, or per-institution as-of date.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/private/national-official-source/raw"
CATALOG = RAW_DIR / "panzhihua-43f1109ec4c04fde854889873395d4cd-catalog-20261117.html"
FULL_PREVIEW = RAW_DIR / "panzhihua-43f1109ec4c04fde854889873395d4cd-full-20261117.json"
CATALOG_BYTES = 71328
CATALOG_SHA256 = "b4accaf0b64276ffd3ad7000e8f14b7f7be45c25d74e1cea6da34bd3dbdca1be"
FULL_PREVIEW_BYTES = 4333
FULL_PREVIEW_SHA256 = "f28e202542356ff06722a0c3863fb6a76e5f11fcadd7f03aa8798da4079ccc78"
ROW_COUNT = 21
SOURCE_URL = "https://pzhdata.cn/oportal/catalog/43f1109ec4c04fde854889873395d4cd"
PREVIEW_URL = SOURCE_URL + "/getData"
TITLE = "攀枝花市_市民政局_养老机构信息一览表"
PUBLISHED_AT = "2026-09-01"
AS_OF = None
SCOPE = "攀枝花市民政局无条件开放目录：仅床位数100张以上的养老机构；不代表全市全量或当前在营"
FIELDS = {"id", "ssqy", "jgmc", "jglx", "cws"}
ITEMS = (
    ("id", "排序"), ("ssqy", "所属区域"), ("jgmc", "机构名称"),
    ("jglx", "机构性质"), ("cws", "床位数"),
)
REGION_COUNTS = {
    "市级": 1, "东区": 3, "西区": 2, "仁和区": 7, "米易县": 5, "盐边县": 3,
}
NATURE_COUNTS = {"公办": 12, "民办": 9}
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class PanzhihuaOfficialRow:
    row_number: int
    name: str
    district: str
    nature: str
    beds: int


def _check_hash(raw: bytes, expected_sha: str, frozen_sha: str, frozen_bytes: int, label: str) -> None:
    if hashlib.sha256(raw).hexdigest() != expected_sha or (
        expected_sha == frozen_sha and len(raw) != frozen_bytes
    ):
        raise ValueError(f"Panzhihua {label} size or SHA-256 changed")


def validate_panzhihua_catalog(raw: bytes, *, expected_sha: str = CATALOG_SHA256) -> None:
    _check_hash(raw, expected_sha, CATALOG_SHA256, CATALOG_BYTES, "catalog")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    text = " ".join(" ".join(document.itertext()).split())
    required = (
        TITLE, "来源部门： 市民政局", "发布时间： 2026-09-01",
        "最后更新时间 2026-09-01", "数据量 21", "开放状态 无条件开放",
        "描述 攀枝花市养老机构统计信息（床位数100张以上）",
        "可以自由利用、自由传播与分享", "在成果中注明数据来源",
        "定期向数据责任主体反馈数据利用情况",
    )
    if not all(fragment in text for fragment in required):
        raise ValueError("Panzhihua catalog metadata or open-data license changed")


def parse_panzhihua_rows(
    raw: bytes, *, expected_sha: str = FULL_PREVIEW_SHA256,
) -> list[PanzhihuaOfficialRow]:
    _check_hash(raw, expected_sha, FULL_PREVIEW_SHA256, FULL_PREVIEW_BYTES, "preview")
    payload = json.loads(raw.decode("utf-8", errors="strict"))
    if not isinstance(payload, dict) or set(payload) != {
        "recordsFiltered", "data", "draw", "recordsTotal", "items",
    }:
        raise ValueError("Panzhihua preview fields changed")
    data = payload["data"]
    if (payload["recordsTotal"] != ROW_COUNT
            or payload["recordsFiltered"] != ROW_COUNT
            or payload["draw"] != 1
            or not isinstance(data, list) or len(data) != ROW_COUNT):
        raise ValueError("Panzhihua preview row count changed")
    items = payload["items"]
    if (not isinstance(items, list)
            or tuple((item.get("column_name_en"), item.get("name_cn"))
                     for item in items if isinstance(item, dict)) != ITEMS
            or len(items) != len(ITEMS)):
        raise ValueError("Panzhihua preview field dictionary changed")

    rows: list[PanzhihuaOfficialRow] = []
    for row_number, item in enumerate(data, 1):
        if not isinstance(item, dict) or set(item) != FIELDS:
            raise ValueError(f"Panzhihua row {row_number}: fields changed")
        if item["id"] != row_number:
            raise ValueError(f"Panzhihua row {row_number}: ordering changed")
        district = item["ssqy"]
        if not isinstance(district, str) or district not in REGION_COUNTS:
            raise ValueError(f"Panzhihua row {row_number}: region changed")
        nature = item["jglx"]
        if not isinstance(nature, str) or nature not in NATURE_COUNTS:
            raise ValueError(f"Panzhihua row {row_number}: nature changed")
        name = item["jgmc"]
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"Panzhihua row {row_number}: blank name")
        name = name.strip()
        if CONTACT.search(name):
            raise ValueError(f"Panzhihua row {row_number}: contact data in name")
        raw_beds = item["cws"]
        if not isinstance(raw_beds, str) or not re.fullmatch(r"\d+", raw_beds):
            raise ValueError(f"Panzhihua row {row_number}: invalid beds")
        beds = int(raw_beds)
        if beds < 100:
            raise ValueError(f"Panzhihua row {row_number}: beds below source threshold")
        rows.append(PanzhihuaOfficialRow(row_number, name, district, nature, beds))

    if len({row.name for row in rows}) != ROW_COUNT:
        raise ValueError("Panzhihua preview duplicate names changed")
    if dict(Counter(row.district for row in rows)) != REGION_COUNTS:
        raise ValueError("Panzhihua preview region distribution changed")
    if dict(Counter(row.nature for row in rows)) != NATURE_COUNTS:
        raise ValueError("Panzhihua preview nature distribution changed")
    return rows
