"""Validate frozen Weifang open-data rows; expose only names, addresses and beds."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/private/national-official-source/raw"
CATALOG = RAW_DIR / "shandong-weifang-catalog-20261117.html"
LATEST = RAW_DIR / "shandong-weifang-20261110.csv"
PRIOR = RAW_DIR / "shandong-weifang-20250703.csv"
CATALOG_BYTES = 93992
CATALOG_SHA256 = "1afd48d8f30c96b47902678f19ee0d9964f93aa01105ad3f21018f3f9c0e317f"
LATEST_BYTES = 21887
LATEST_SHA256 = "d69e0811b02302c3f9d22f93ef3dd949e0dcecfa1ff26fe44bc2c695e1c1f091"
PRIOR_BYTES = 21887
PRIOR_SHA256 = "44274b20733ed2b68152647c244de59791f6dd1e99508495374243d883ee5b30"
ROW_COUNT = 187
SOURCE_URL = "https://data.sd.gov.cn/portal/catalog/4e8ac605705540028fe52860b69a386a"
TITLE = "养老机构信息"
PUBLISHED_AT = "2026-08-11"
AS_OF = "2025-04-10"
STATISTIC_TIME = "2025-04-10 00:00:00"
COLUMNS = ("所属区划", "机构名称", "地址", "评估星级", "床位总数", "护理型床位数", "入住老年人数", "统计时间")
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8}|\d{17}[\dXx])(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class WeifangOfficialRow:
    row_number: int
    name: str
    address: str
    beds: int


def _check_hash(raw: bytes, expected_sha: str, known_sha: str, known_size: int, label: str) -> None:
    if hashlib.sha256(raw).hexdigest() != expected_sha or (expected_sha == known_sha and len(raw) != known_size):
        raise ValueError(f"Weifang {label} size or SHA-256 changed")


def validate_weifang_catalog(raw: bytes, *, expected_sha: str = CATALOG_SHA256) -> None:
    _check_hash(raw, expected_sha, CATALOG_SHA256, CATALOG_BYTES, "catalog")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    content = " ".join(" ".join(document.itertext()).split())
    required = (
        "养老机构信息", "来源部门： 市民政局", "目录发布时间： 2026-08-11",
        "目录更新时间： 2026-11-10", "数据量 187", "无条件开放",
        "地理空间范围 潍坊市", "可以自由利用、自由传播与分享",
        "在成果中注明数据来源", "定期向数据责任主体反馈数据利用情况",
    )
    descriptions = document.xpath("//tr[td[normalize-space()='描述']]/td[last()]")
    expected_description = "全市各县市区养老机构地址及设施等信息。"
    if not all(part in content for part in required) or len(descriptions) != 1:
        raise ValueError("Weifang catalog metadata or license changed")
    description = " ".join(" ".join(descriptions[0].itertext()).split())
    if expected_description not in description or "禁止商业" in description or "仅限" in description:
        raise ValueError("Weifang dataset-specific 许可 restriction changed")


def _read_rows(raw: bytes, label: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(raw.decode("gb18030", errors="strict"), newline=""))
    if tuple(reader.fieldnames or ()) != COLUMNS:
        raise ValueError(f"Weifang {label} CSV header changed")
    rows = list(reader)
    if len(rows) != ROW_COUNT:
        raise ValueError(f"Weifang {label} CSV row count changed")
    if any(set(row) != set(COLUMNS) or any(value is None for value in row.values()) for row in rows):
        raise ValueError(f"Weifang {label} CSV fields changed")
    return rows


def parse_weifang_rows(
    latest: bytes, prior: bytes, *,
    expected_latest_sha: str = LATEST_SHA256,
    expected_prior_sha: str = PRIOR_SHA256,
) -> list[WeifangOfficialRow]:
    _check_hash(latest, expected_latest_sha, LATEST_SHA256, LATEST_BYTES, "2026 CSV")
    _check_hash(prior, expected_prior_sha, PRIOR_SHA256, PRIOR_BYTES, "2025 CSV")
    current_rows = _read_rows(latest, "2026")
    prior_rows = _read_rows(prior, "2025")
    result = []
    names = set()
    for row_number, row in enumerate(current_rows, 1):
        name, address, district = (row[field].strip() for field in ("机构名称", "地址", "所属区划"))
        if not name or not address or not district:
            raise ValueError(f"Weifang row {row_number}: name, address or district is blank")
        if CONTACT.search(name) or CONTACT.search(address):
            raise ValueError(f"Weifang row {row_number}: contact data in public field")
        if row["统计时间"].strip() != STATISTIC_TIME:
            raise ValueError(f"Weifang row {row_number}: statistics time changed")
        if not row["床位总数"].strip().isdigit() or not 0 < int(row["床位总数"]) <= 10000:
            raise ValueError(f"Weifang row {row_number}: invalid bed count")
        if name in names:
            raise ValueError(f"Weifang row {row_number}: duplicate name")
        names.add(name)
        result.append(WeifangOfficialRow(row_number, name, address, int(row["床位总数"])))
    if Counter(tuple(row[column] for column in COLUMNS) for row in current_rows) != Counter(
        tuple(row[column] for column in COLUMNS) for row in prior_rows
    ):
        raise ValueError("Weifang file versions have different row content")
    return result
