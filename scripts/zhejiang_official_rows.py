"""Audit a five-city subset in Zhejiang's provincial open-data CSV.

The 1,147 source rows are not a province-wide or current institution count.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/private/national-official-source/raw"
CSV_FILE = RAW_DIR / "zhejiang-provincial-yljg-20260902.csv"
CATALOG_DETAIL = RAW_DIR / "zhejiang-provincial-yljg-catalog-detail-20261117.json"
DATASET_DETAIL = RAW_DIR / "zhejiang-provincial-yljg-dataset-detail-20261117.json"
PREVIEW = RAW_DIR / "zhejiang-provincial-yljg-preview-20261117.json"
CSV_BYTES = 114573
CSV_SHA256 = "ca151f6b8a03715be2bc14a1c466ee53d6d3a34a52b5fb53df5a4f91d89c047f"
CATALOG_BYTES = 17873
CATALOG_SHA256 = "b0691e17a3127362ee65914470c0fec0cab24fa2e090b2476ebf961dbfdfd6c7"
DATASET_BYTES = 20123
DATASET_SHA256 = "bf2782a6d70ea4f66e656977812d0d71761c804b9f7243d9a4d411c0a9937c6a"
PREVIEW_BYTES = 2315
PREVIEW_SHA256 = "201c81ed85d9aecadcbfc5e04dee5c5d897f8863d009c698d072be590dd56d14"
SOURCE_CODE = "S330000TAB0220260805000022"
CATALOG_ID = "hjiVC2086lVfI5xHiciluQ=="
DATASET_ID = "Wlb3SwaMpZEgoCnFF7UBwQ=="
CATALOG_URL = "https://data.zjzwfw.gov.cn/dopServer/index.html#/dataCatalogDetail?id=hjiVC2086lVfI5xHiciluQ%3D%3D"
DATASET_URL = "https://data.zjzwfw.gov.cn/dopServer/index.html#/dataDetail?id=Wlb3SwaMpZEgoCnFF7UBwQ%3D%3D"
DOWNLOAD_URL = "https://data.zjzwfw.gov.cn/dopServer/storageFile/dataFileDownload/05088507fab14ebcbbb415dea689548e"
SOURCE_UPDATED_AT = "2026-08-21 09:31:12"
FILE_CREATED_AT = "2026-09-02 10:38:40"
AS_OF = None  # Uniform update timestamp is not proof of each row's current status.
HEADERS = ("所属地市", "机构名称", "机构地址", "总床位数", "更新时间", "")
PUBLIC_COLUMNS = HEADERS[:5]
ROW_COUNT = 1147
CITY_COUNTS = {"宁波市": 520, "台州市": 321, "杭州市": 217, "衢州市": 52, "绍兴市": 37}
CITY_SLUGS = {"宁波市": "ningbo", "台州市": "taizhou", "杭州市": "hangzhou", "衢州市": "quzhou", "绍兴市": "shaoxing"}
MISSING_ADDRESS_COUNT = 55
MISSING_BED_COUNT = 148
EXACT_DUPLICATE_EXTRA_ROWS = 263
UNIQUE_CITY_NAME_KEYS = 672  # Diagnostic key count, not an entity count.
GENERIC_NAME_COUNT = 212  # All 212 are Taizhou rows named only "养老机构".
UNIQUE_SOURCE_ROWS = 884
GENERIC_UNIQUE_ROWS = 210
PUBLIC_ROW_COUNT = 674
CONTACT = re.compile(
    r"(?<![0-9])(?:1[3-9][0-9]{9}|0[0-9]{2,3}[- ]?[0-9]{7,8})(?![0-9])"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class ZhejiangOfficialRow:
    row_number: int  # Data ordinal 1..1147; physical CSV line is one higher.
    name: str
    city_name: str
    city_slug: str
    address: str | None
    beds: int | None


def _frozen_result(raw: bytes, size: int, sha256: str, label: str) -> dict:
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError(f"Zhejiang {label} size or SHA-256 changed")
    response = json.loads(raw.decode("utf-8", errors="strict"))
    if response.get("success") is not True or str(response.get("code")) != "2000":
        raise ValueError(f"Zhejiang {label} portal response changed")
    result = response.get("result")
    if not isinstance(result, dict):
        raise ValueError(f"Zhejiang {label} portal result missing")
    return result


def validate_zhejiang_provenance(catalog: bytes, dataset: bytes, preview: bytes) -> None:
    """Pin directory scope, CSV link, permitted fields and licence obligations."""
    cat = _frozen_result(catalog, CATALOG_BYTES, CATALOG_SHA256, "catalog")
    data = _frozen_result(dataset, DATASET_BYTES, DATASET_SHA256, "dataset")
    prev = _frozen_result(preview, PREVIEW_BYTES, PREVIEW_SHA256, "preview")
    cat_source = cat.get("dopSourceInfo", {})
    data_source = data.get("dopSourceInfo", {})
    if (cat_source.get("id") != CATALOG_ID or
            cat.get("dataSetSource", {}).get("sourceId") != DATASET_ID or
            data_source.get("id") != DATASET_ID):
        raise ValueError("Zhejiang catalog-to-dataset link changed")
    for source in (cat_source, data_source):
        if not all((source.get("sourceCode") == SOURCE_CODE,
                    source.get("sourceName") == "养老机构信息",
                    source.get("regionName") == "浙江省",
                    source.get("dataField") == "全省",
                    source.get("openType") == "A",
                    source.get("dataCount") == ROW_COUNT,
                    source.get("updateTime") == SOURCE_UPDATED_AT)):
            raise ValueError("Zhejiang catalog provenance or openness changed")
    columns = data.get("columnList")
    if (not isinstance(columns, list) or
            tuple(item.get("colNameCn") for item in columns) != PUBLIC_COLUMNS or
            any(item.get("openType") != "A" for item in columns)):
        raise ValueError("Zhejiang dataset columns or openness changed")
    downloads = data.get("dataDownloadList")
    if not isinstance(downloads, list) or not any(
        item.get("fileType") == "Csv" and item.get("filePath") == DOWNLOAD_URL and
        item.get("createDate") == FILE_CREATED_AT for item in downloads
    ):
        raise ValueError("Zhejiang dataset CSV download changed")
    agreement_html = data.get("agreement")
    agreement = " ".join(html.fromstring(agreement_html).itertext()) if isinstance(agreement_html, str) else ""
    agreement = " ".join(agreement.split())
    obligations = (
        "自由地复制、发布、利用、传播和分享信息",
        "注明公共数据资源来源为“浙江省数据开放平台”，及从平台下载的日期",
        "及时将应用情况通过网站进行备案",
        "在基于本平台数据资源的应用程序或互联网服务中应清楚地声明",
        "用户应立即删除相关数据并停止服务",
        "用户不得以任何理由继续保存或使用该数据",
    )
    if not all(term in agreement for term in obligations):
        raise ValueError("Zhejiang reuse licence or takedown obligation changed")
    preview_data = prev.get("data")
    if (prev.get("sourceInfo", {}).get("id") != CATALOG_ID or
            not isinstance(preview_data, list) or len(preview_data) != 6 or
            tuple(preview_data[0]) != PUBLIC_COLUMNS):
        raise ValueError("Zhejiang five-row preview changed")


def parse_zhejiang_rows(raw: bytes, *, expected_sha: str = CSV_SHA256) -> list[ZhejiangOfficialRow]:
    """Return privacy-minimal observations without merging repeated source rows."""
    if expected_sha == CSV_SHA256 and len(raw) != CSV_BYTES:
        raise ValueError("Zhejiang CSV size or SHA-256 changed")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Zhejiang CSV SHA-256 changed")
    if not raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError("Zhejiang CSV UTF-8 BOM changed")
    table = list(csv.reader(io.StringIO(raw.decode("utf-8-sig", errors="strict"), newline="")))
    if not table or tuple(table[0]) != HEADERS or len(table) != ROW_COUNT + 1:
        raise ValueError("Zhejiang CSV header or row count changed")
    result: list[ZhejiangOfficialRow] = []
    city_counts: Counter[str] = Counter()
    source_rows: Counter[tuple[str, ...]] = Counter()
    city_name_keys: set[tuple[str, str]] = set()
    missing_addresses = missing_beds = 0
    generic_names = 0
    for row_number, cells in enumerate(table[1:], 1):
        if len(cells) != len(HEADERS) or cells[5] != "":
            raise ValueError(f"Zhejiang CSV row {row_number}: columns changed")
        city, name, address, bed_text, updated_at = (value.strip() for value in cells[:5])
        if city not in CITY_SLUGS or not name or updated_at != SOURCE_UPDATED_AT:
            raise ValueError(f"Zhejiang CSV row {row_number}: city, name or update changed")
        if CONTACT.search(name) or CONTACT.search(address):
            raise ValueError(f"Zhejiang CSV row {row_number}: contact data in public field")
        if not address:
            address = None
            missing_addresses += 1
        if bed_text == "-":
            beds = None
            missing_beds += 1
        elif bed_text.isdecimal():
            beds = int(bed_text)
        else:
            raise ValueError(f"Zhejiang CSV row {row_number}: unknown bed token")
        result.append(ZhejiangOfficialRow(row_number, name, city, CITY_SLUGS[city], address, beds))
        city_counts[city] += 1
        city_name_keys.add((city, name))
        source_rows[tuple(cells[:5])] += 1
        generic_names += name == "养老机构"
    extra_duplicates = sum(count - 1 for count in source_rows.values())
    if (city_counts != CITY_COUNTS or missing_addresses != MISSING_ADDRESS_COUNT or
            missing_beds != MISSING_BED_COUNT or extra_duplicates != EXACT_DUPLICATE_EXTRA_ROWS or
            len(city_name_keys) != UNIQUE_CITY_NAME_KEYS or generic_names != GENERIC_NAME_COUNT):
        raise ValueError("Zhejiang CSV coverage, missingness or duplicates changed")
    return result


def load_zhejiang_rows(raw_dir: Path = RAW_DIR, *, source_raw: bytes | None = None) -> list[ZhejiangOfficialRow]:
    """Read a complete, pinned source bundle from the requested raw directory."""
    catalog = raw_dir / CATALOG_DETAIL.name
    dataset = raw_dir / DATASET_DETAIL.name
    preview_file = raw_dir / PREVIEW.name
    csv_file = raw_dir / CSV_FILE.name
    validate_zhejiang_provenance(catalog.read_bytes(), dataset.read_bytes(), preview_file.read_bytes())
    raw = csv_file.read_bytes() if source_raw is None else source_raw
    rows = parse_zhejiang_rows(raw)
    actual = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline="")))[1:6]
    preview = json.loads(preview_file.read_bytes())["result"]["data"][1:]
    if [row[:5] for row in actual] != preview:
        raise ValueError("Zhejiang official preview does not match downloaded CSV")
    return rows


def project_public_zhejiang_rows(rows: list[ZhejiangOfficialRow]) -> list[ZhejiangOfficialRow]:
    """Keep first exact row, then omit unidentifiable generic-name observations.

    The returned row_number is the original CSV ordinal, not a new sequence.
    Distinct named rows with conflicting addresses or bed counts are not merged.
    """
    if len(rows) != ROW_COUNT or [row.row_number for row in rows] != list(range(1, ROW_COUNT + 1)):
        raise ValueError("Zhejiang source row ordinals changed")
    seen: set[tuple[str, str, str | None, int | None]] = set()
    unique: list[ZhejiangOfficialRow] = []
    for row in rows:
        key = (row.city_name, row.name, row.address, row.beds)
        if key not in seen:
            seen.add(key)
            unique.append(row)
    public = [row for row in unique if row.name != "养老机构"]
    if len(unique) != UNIQUE_SOURCE_ROWS or len(unique) - len(public) != GENERIC_UNIQUE_ROWS or len(public) != PUBLIC_ROW_COUNT:
        raise ValueError("Zhejiang public projection counts changed")
    return public
