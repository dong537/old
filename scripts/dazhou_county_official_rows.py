"""Validate four Dazhou county open-data previews with minimal public fields.

Only name and address leave this parser. Names are source observations, not
verified currently operating institutions; all per-person columns stay private.
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
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class CountySource:
    source_id: str
    catalog_id: str
    county: str
    title: str
    published_at: str
    updated_at: str
    row_count: int
    catalog_bytes: int
    catalog_sha256: str
    preview_bytes: int
    preview_sha256: str
    name_field: str
    address_field: str
    items: tuple[tuple[str, str], ...]
    county_field: str | None = None
    sequence_field: str | None = None
    county_in_name: bool = False

    @property
    def url(self) -> str:
        return f"https://www.dazhoudata.cn/oportal/catalog/{self.catalog_id}"

    @property
    def catalog(self) -> Path:
        return RAW_DIR / f"dazhou-{self.catalog_id}-catalog-20261117.html"

    @property
    def preview(self) -> Path:
        return RAW_DIR / f"dazhou-{self.catalog_id}-preview-20261117.json"


COMMON_ITEMS = (
    ("XH", "序号"), ("QY", "区域"), ("JGMC", "养老机构名称"),
    ("XXDZ", "详细地址"), ("CWS", "床位数（张）"), ("LXDH", "联系电话"),
    ("FR", "法人或主要负责人"), ("JGXZ", "机构性质"),
    ("DJJG", "登记机关"), ("BAJG", "备案机关"),
)
SOURCES = {
    "xuanhan": CountySource(
        "sc-dz-xuanhan-20260722", "98c83f7a84a0488290df5a2025ad6932",
        "宣汉县", "宣汉县养老机构信息", "2024-10-30", "2026-07-22", 27,
        69652, "63d86eec0011e5bc4591b8cdef5152eff0500d492ecb2e47cc73c0e26bf42d1c",
        6280, "d226ac58d257a1463483b145d68f008f8d4889dcd44d37dd80bbf7cdadfdb248",
        "jgname", "jgadd", (
            ("id", "ID"), ("jgname", "机构名称"), ("jgadd", "机构通讯地址"),
            ("jglianxiren", "机构联系人"), ("jgtel", "机构联系电话"),
        ), sequence_field="id", county_in_name=True,
    ),
    "wanyuan": CountySource(
        "sc-dz-wanyuan-20260722", "567ef5ba62324c16a39e16dfe43094bd",
        "万源市", "万源市养老机构信息", "2022-04-21", "2026-07-22", 21,
        75477, "2f416d0cad1980afc3452b31b5d17814bcebff5253723b7cca24150a9011ac81",
        8871, "55b7d23917bd47ff2aa10aa8c4ea53db988b5632bebb15bc50a528cb50ffd8c8",
        "JGMC", "XXDZ", COMMON_ITEMS, county_field="QY", sequence_field="XH",
    ),
    "dazhu": CountySource(
        "sc-dz-dazhu-20260722", "2bba3e7042374a84bf1c479e066a5c0f",
        "大竹县", "大竹县养老机构信息", "2024-10-30", "2026-07-22", 21,
        75478, "b9a079402f2004a35a6466b67ac37923745ea14c41d61d93eb16dcab5817115f",
        8792, "7f85369ab2e72aa28054fd5d31272c3887b49119930566a6f7ad733c26dc6d90",
        "JGMC", "XXDZ", COMMON_ITEMS, county_field="QY", sequence_field="XH",
    ),
    "kaijiang": CountySource(
        "sc-dz-kaijiang-20260722", "3583b17b10e544e080458b8107e9364c",
        "开江县", "开江县养老机构地址信息", "2021-12-07", "2026-07-22", 14,
        68487, "6ae70dc676781730ce763fc295076ec6f4d10163bc0697852b13fb4e026a30da",
        3104, "70a3dc1a41e3c41e6e6bf8cf689cb71ea2bc16ab80a31e7b7889acf09698c79c",
        "yljgmc", "dz", (
            ("yljgmc", "养老机构名称"), ("dz", "地址"),
            ("cw", "床位(张）"), ("rz", "入住"),
        ), county_in_name=True,
    ),
}


@dataclass(frozen=True)
class DazhouCountyOfficialRow:
    row_number: int  # 1-based position in this frozen preview, not source XH.
    name: str
    address: str
    county: str


def _check_hash(raw: bytes, expected_sha: str, frozen_sha: str, frozen_bytes: int, label: str) -> None:
    if hashlib.sha256(raw).hexdigest() != expected_sha or (
        expected_sha == frozen_sha and len(raw) != frozen_bytes
    ):
        raise ValueError(f"Dazhou county {label} size or SHA-256 changed")


def validate_dazhou_county_catalog(
    source: CountySource, raw: bytes, *, expected_sha: str | None = None,
) -> None:
    _check_hash(raw, expected_sha or source.catalog_sha256,
                source.catalog_sha256, source.catalog_bytes, source.county + " catalog")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    text = " ".join(" ".join(document.itertext()).split())
    required = (
        source.title, f"来源部门： {source.county}",
        f"发布时间： {source.published_at}",
        f"最后更新时间 {source.updated_at}",
        f"数据量 {source.row_count}", "开放状态 无条件开放",
        "可以自由利用、自由传播与分享", "在成果中注明数据来源",
        "定期向数据责任主体反馈数据利用情况",
    )
    if not all(fragment in text for fragment in required):
        raise ValueError(f"Dazhou {source.county} catalog metadata or open-data licence changed")


def _public_text(value: object, row_number: int, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Dazhou county row {row_number}: missing {field}")
    text = value.strip()
    if CONTACT.search(text):
        raise ValueError(f"Dazhou county row {row_number}: contact data in {field}")
    return text


def parse_dazhou_county_rows(
    source: CountySource, raw: bytes, *, expected_sha: str | None = None,
) -> list[DazhouCountyOfficialRow]:
    _check_hash(raw, expected_sha or source.preview_sha256,
                source.preview_sha256, source.preview_bytes, source.county + " preview")
    payload = json.loads(raw.decode("utf-8", errors="strict"))
    if not isinstance(payload, dict) or set(payload) != {
        "recordsFiltered", "data", "draw", "recordsTotal", "items",
    }:
        raise ValueError(f"Dazhou {source.county} preview fields changed")
    data = payload["data"]
    if (payload["recordsTotal"] != 30 or payload["recordsFiltered"] != 30
            or payload["draw"] != 1 or not isinstance(data, list)
            or len(data) != source.row_count):
        raise ValueError(f"Dazhou {source.county} preview row count changed")
    items = payload["items"]
    if (not isinstance(items, list) or len(items) != len(source.items)
            or tuple((item.get("column_name_en"), item.get("name_cn"))
                     for item in items if isinstance(item, dict)) != source.items):
        raise ValueError(f"Dazhou {source.county} preview field dictionary changed")
    fields = {column for column, _ in source.items}
    rows: list[DazhouCountyOfficialRow] = []
    sequences: list[int] = []
    for row_number, item in enumerate(data, 1):
        if not isinstance(item, dict) or set(item) != fields:
            raise ValueError(f"Dazhou {source.county} row {row_number}: fields changed")
        name = _public_text(item[source.name_field], row_number, "name")
        address = _public_text(item[source.address_field], row_number, "address")
        if source.county_field is not None and item[source.county_field] != source.county:
            raise ValueError(f"Dazhou {source.county} row {row_number}: county changed")
        if source.county_in_name and source.county not in name:
            raise ValueError(f"Dazhou {source.county} row {row_number}: county missing in name")
        if source.sequence_field is not None:
            sequence = item[source.sequence_field]
            if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 1:
                raise ValueError(f"Dazhou {source.county} row {row_number}: sequence changed")
            sequences.append(sequence)
        rows.append(DazhouCountyOfficialRow(row_number, name, address, source.county))
    if len({row.name for row in rows}) != source.row_count:
        raise ValueError(f"Dazhou {source.county} duplicate names changed")
    if len(set(sequences)) != len(sequences):
        raise ValueError(f"Dazhou {source.county} duplicate source sequences changed")
    if source.county == "宣汉县" and sequences != list(range(1, source.row_count + 1)):
        raise ValueError("Dazhou Xuanhan source sequence changed")
    return rows
