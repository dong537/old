"""Project a frozen QCC institution-source workbook into minimal public JSON.

These are dated source observations, not verified currently operating institutions.
Supplemental geography and coordinates are preserved as raw values, never grouping inputs.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data/private/qcc-institution-reference"
SOURCE_MANIFEST = ROOT / "data/raw/qcc-institutions-source-manifest.json"
OUTPUT_DIR = ROOT / "public/data/qcc-institutions"
AUDIT_PATH = SOURCE_DIR / "audit.json"
SOURCE_TITLE = "企查查养老机构信息表（用户提供）"
RECEIVED_AT = "2026-11-17"
CHUNK_SIZE = 100
EXPECTED_ROWS = 41955
EXPECTED_PROVINCES = 31
MISSING_CITY = "地市未标"
HEADERS = (
    "统一社会信用代码", "地址", "行政区划代码", "机构名称", "地区", "床位数",
    "省份", "城市", "区县", "经度", "纬度",
)
FREE_TEXT_SOURCE_HEADERS = frozenset(("地址", "省份", "城市", "区县"))
REDACTED_SOURCE_VALUE = "[已遮蔽]"
PROJECTION_POLICY = "contact-redaction-v2"
PROVINCE_BY_PREFIX = {
    "11": "北京市", "12": "天津市", "13": "河北省", "14": "山西省",
    "15": "内蒙古自治区", "21": "辽宁省", "22": "吉林省", "23": "黑龙江省",
    "31": "上海市", "32": "江苏省", "33": "浙江省", "34": "安徽省",
    "35": "福建省", "36": "江西省", "37": "山东省", "41": "河南省",
    "42": "湖北省", "43": "湖南省", "44": "广东省", "45": "广西壮族自治区",
    "46": "海南省", "50": "重庆市", "51": "四川省", "52": "贵州省",
    "53": "云南省", "54": "西藏自治区", "61": "陕西省", "62": "甘肃省",
    "63": "青海省", "64": "宁夏回族自治区", "65": "新疆维吾尔自治区",
    "66": "新疆生产建设兵团",
}
MUNICIPAL_PREFIXES = {"11", "12", "31", "50"}
SPECIAL_CITY_PREFIXES = (
    "雄安新区", "沈抚示范区", "平潭综合实验区", "长白山管理委员会",
    "贵安新区", "兰州新区", "广德县(省直管)",
)
CODE_ALPHABET = "0123456789ABCDEFGHJKLMNPQRTUWXY"
CODE_WEIGHTS = (1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28)
CODE_PATTERN = re.compile(rf"[{CODE_ALPHABET}]{{18}}\Z")
DIVISION_PATTERN = re.compile(r"\d{12}\Z")
SOURCE_SHA_PATTERN = re.compile(r"[0-9a-f]{64}\Z")
PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:(?:\+86|0086)[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)"
    r"|(?<!\d)0\d{2,3}[-\s]?\d{7,8}(?!\d)"
)
EMAIL_PATTERN = re.compile(r"[\w.%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            + "\n").encode("utf-8")


def slug(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def load_source_manifest(path: Path) -> dict[str, object]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(manifest, dict) or set(manifest) !=
            {"schemaVersion", "filename", "sha256", "bytes", "rowCount"} or
            manifest["schemaVersion"] != 1 or
            not isinstance(manifest["filename"], str) or
            manifest["filename"] != Path(manifest["filename"]).name or
            not manifest["filename"].endswith(".xlsx") or
            not isinstance(manifest["sha256"], str) or
            SOURCE_SHA_PATTERN.fullmatch(manifest["sha256"]) is None or
            not isinstance(manifest["bytes"], int) or manifest["bytes"] < 1 or
            not isinstance(manifest["rowCount"], int) or manifest["rowCount"] < 1):
        raise ValueError("QCC institution source lock differs")
    return manifest


def _required_text(value: object, field: str, row_number: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"QCC institution row {row_number}: missing {field}")
    result = value.strip()
    normalized = unicodedata.normalize("NFKC", result)
    if PHONE_PATTERN.search(normalized) or EMAIL_PATTERN.search(normalized):
        raise ValueError(f"QCC institution row {row_number}: contact in {field}")
    return result


def _optional_address(value: object, row_number: int) -> tuple[str | None, bool]:
    if value is None or value == "":
        return None, False
    if (isinstance(value, (str, int, float)) and not isinstance(value, bool) and
            not (isinstance(value, float) and not math.isfinite(value))):
        normalized = unicodedata.normalize("NFKC", str(value))
        if PHONE_PATTERN.search(normalized) or EMAIL_PATTERN.search(normalized):
            return None, True
    if not isinstance(value, str):
        raise ValueError(f"QCC institution row {row_number}: invalid address")
    result = value.strip()
    if not result:
        return None, False
    return result, False


def _beds(value: object, row_number: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"QCC institution row {row_number}: invalid beds")
    if isinstance(value, int):
        result = value
    elif isinstance(value, float) and value.is_integer():
        result = int(value)
    elif isinstance(value, str) and re.fullmatch(r"\d+(?:\.0+)?", value.strip()):
        result = int(float(value.strip()))
    else:
        raise ValueError(f"QCC institution row {row_number}: invalid beds")
    if result < 0:
        raise ValueError(f"QCC institution row {row_number}: invalid beds")
    return result


def code_status(value: object) -> tuple[str | None, str]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, "missing"
    if not isinstance(value, str):
        return None, "invalid"
    code = value.strip().upper()
    if code == "0" * 18:
        return None, "placeholder"
    if CODE_PATTERN.fullmatch(code) is None:
        return None, "invalid"
    total = sum(CODE_ALPHABET.index(char) * weight
                for char, weight in zip(code[:17], CODE_WEIGHTS))
    check_digit = CODE_ALPHABET[(31 - total % 31) % 31]
    return (code, "valid") if code[-1] == check_digit else (None, "invalid")


def city_from_region(prefix: str, region: str) -> str:
    source_province = PROVINCE_BY_PREFIX[prefix]
    if not region.startswith(source_province):
        raise ValueError("QCC institution region and division disagree")
    if prefix == "66":
        return "新疆生产建设兵团"
    if prefix in MUNICIPAL_PREFIXES:
        return source_province
    rest = region[len(source_province):]
    if not rest:
        return MISSING_CITY
    if rest.startswith("省直辖县级行政区划"):
        rest = rest[len("省直辖县级行政区划"):]
        if not rest:
            return "省直辖县级行政区划"
    elif rest.startswith("省直辖县"):
        rest = rest[len("省直辖县"):]
    elif rest.startswith("自治区直辖县级行政区划"):
        rest = rest[len("自治区直辖县级行政区划"):]
        if not rest:
            return "自治区直辖县级行政区划"
    for special in SPECIAL_CITY_PREFIXES:
        if rest.startswith(special):
            return "广德县（省直管）" if special.startswith("广德县") else special
    match = re.match(r"^(.+?(?:自治州|地区|盟|市))", rest)
    if match:
        return match.group(1)
    if prefix == "46" and rest.endswith("县"):
        return rest
    if rest.startswith("神农架林区"):
        return "神农架林区"
    return MISSING_CITY


def project_row(row_number: int, row: dict[str, object], source_sha: str,
                chunk_number: int
                ) -> tuple[str, str, dict[str, object], dict[str, object], bool, bool]:
    name = _required_text(row["机构名称"], "name", row_number)
    division = row["行政区划代码"]
    if isinstance(division, bool) or not isinstance(division, (str, int)):
        raise ValueError(f"QCC institution row {row_number}: invalid division code")
    division = str(division).strip()
    if DIVISION_PATTERN.fullmatch(division) is None or division[:2] not in PROVINCE_BY_PREFIX:
        raise ValueError(f"QCC institution row {row_number}: invalid division code")
    region = _required_text(row["地区"], "region", row_number)
    prefix = division[:2]
    if not region.startswith(PROVINCE_BY_PREFIX[prefix]):
        raise ValueError(f"QCC institution row {row_number}: region and division disagree")
    province = ("新疆维吾尔自治区" if prefix == "66" else PROVINCE_BY_PREFIX[prefix])
    city = city_from_region(prefix, region)
    address, redacted = _optional_address(row["地址"], row_number)
    address_equals_name = (
        address is not None and
        unicodedata.normalize("NFKC", address).casefold() ==
        unicodedata.normalize("NFKC", name).casefold()
    )
    if address_equals_name:
        address = None
    beds = _beds(row["床位数"], row_number)
    code, status = code_status(row["统一社会信用代码"])
    record_id = f"qi-{source_sha[:12]}-{row_number}"
    shared = {"id": record_id, "sourceRow": row_number, "name": name,
              "region": region, "address": address, "beds": beds}
    index = {**shared, "chunk": f"chunk-{chunk_number:03d}.v1.json"}
    source_fields = {header: row[header] for header in HEADERS}
    for header, value in source_fields.items():
        if (value is not None and
                (isinstance(value, bool) or not isinstance(value, (str, int, float)) or
                 isinstance(value, float) and not math.isfinite(value))):
            raise ValueError(f"QCC institution row {row_number}: invalid raw field {header}")
        if header in FREE_TEXT_SOURCE_HEADERS and value is not None:
            normalized = unicodedata.normalize("NFKC", str(value))
            if PHONE_PATTERN.search(normalized) or EMAIL_PATTERN.search(normalized):
                source_fields[header] = REDACTED_SOURCE_VALUE
    detail = {**shared, "creditCode": code, "codeStatus": status,
              "sourceFields": source_fields}
    return province, city, index, detail, redacted, address_equals_name


def build(source_path: Path, source_manifest_path: Path
          ) -> tuple[dict[str, bytes], dict[str, object]]:
    source_path = Path(source_path)
    source_manifest = load_source_manifest(Path(source_manifest_path))
    source = source_manifest
    if source_path.name != source["filename"]:
        raise ValueError("QCC institution source filename differs from lock")
    raw = source_path.read_bytes()
    if len(raw) != source["bytes"] or hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("QCC institution source hash or bytes differ")

    workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    groups: dict[tuple[str, str], dict[str, list[dict[str, object]]]] = defaultdict(
        lambda: {"indexes": [], "details": []})
    code_counts: Counter[str] = Counter()
    enriched_blank = 0
    enriched_conflict = 0
    missing_addresses = 0
    redacted_addresses = 0
    address_equals_name_count = 0
    missing_cities = 0
    total = 0
    try:
        if len(workbook.worksheets) != 1:
            raise ValueError("QCC institution XLSX sheet count differs")
        sheet = workbook.active
        if sheet.max_column != len(HEADERS):
            raise ValueError("QCC institution XLSX headers or column count differs")
        rows = sheet.iter_rows(values_only=True)
        if tuple(next(rows, ())) != HEADERS:
            raise ValueError("QCC institution XLSX headers differ")
        for row_number, values in enumerate(rows, start=2):
            if len(values) != len(HEADERS):
                raise ValueError(f"QCC institution XLSX row width differs: {row_number}")
            row = dict(zip(HEADERS, values))
            division = str(row["行政区划代码"]).strip()
            prefix = division[:2]
            if prefix not in PROVINCE_BY_PREFIX:
                raise ValueError(f"QCC institution row {row_number}: invalid division code")
            source_province = PROVINCE_BY_PREFIX[prefix]
            enriched_province = row["省份"]
            if enriched_province is None or not str(enriched_province).strip():
                enriched_blank += 1
            elif str(enriched_province).strip() != source_province:
                enriched_conflict += 1
            region = _required_text(row["地区"], "region", row_number)
            province = ("新疆维吾尔自治区" if prefix == "66" else source_province)
            city = city_from_region(prefix, region)
            group = groups[(province, city)]
            chunk_number = len(group["indexes"]) // CHUNK_SIZE + 1
            got_province, got_city, index, detail, redacted, address_equals_name = project_row(
                row_number, row, source["sha256"], chunk_number)
            if (got_province, got_city) != (province, city):
                raise ValueError(f"QCC institution row {row_number}: grouping changed")
            group["indexes"].append(index)
            group["details"].append(detail)
            code_counts[detail["codeStatus"]] += 1
            missing_addresses += detail["address"] is None
            redacted_addresses += redacted
            address_equals_name_count += address_equals_name
            missing_cities += city == MISSING_CITY
            total += 1
    finally:
        workbook.close()
    if total != source["rowCount"]:
        raise ValueError(f"QCC institution XLSX row count differs: {total}")

    province_to_cities: dict[str, list[str]] = defaultdict(list)
    for province, city in groups:
        province_to_cities[province].append(city)
    snapshot_seed = json_bytes({"source": source_manifest,
                                "projectionPolicy": PROJECTION_POLICY})
    snapshot_id = "v1-" + hashlib.sha256(snapshot_seed).hexdigest()[:16]
    outputs: dict[str, bytes] = {}
    provinces: list[dict[str, object]] = []
    for province in sorted(province_to_cities):
        province_slug = "p-" + slug(province)
        cities: list[dict[str, object]] = []
        province_count = 0
        seen_city_slugs: set[str] = set()
        for city in sorted(province_to_cities[province]):
            city_slug = "c-" + slug(province + "|" + city)
            if city_slug in seen_city_slugs:
                raise ValueError("QCC institution city slug collision")
            seen_city_slugs.add(city_slug)
            root = f"{province_slug}/{city_slug}/"
            group = groups[(province, city)]
            indexes = group["indexes"]
            details = group["details"]
            index_path = root + "index.v1.json"
            outputs[index_path] = json_bytes({
                "schemaVersion": 1, "snapshotId": snapshot_id,
                "provinceSlug": province_slug, "citySlug": city_slug,
                "records": indexes,
            })
            for offset in range(0, len(details), CHUNK_SIZE):
                chunk_number = offset // CHUNK_SIZE + 1
                outputs[root + f"chunk-{chunk_number:03d}.v1.json"] = json_bytes({
                    "schemaVersion": 1, "snapshotId": snapshot_id,
                    "provinceSlug": province_slug, "citySlug": city_slug,
                    "records": details[offset:offset + CHUNK_SIZE],
                })
            count = len(indexes)
            cities.append({"slug": city_slug, "name": city, "count": count,
                           "indexPath": index_path})
            province_count += count
        provinces.append({"slug": province_slug, "name": province,
                          "count": province_count, "cities": cities})
    public_source = {"title": SOURCE_TITLE, "sha256": source["sha256"], "asOf": None}
    outputs = {"manifest.v1.json": json_bytes({
        "schemaVersion": 1, "snapshotId": snapshot_id,
        "receivedAt": RECEIVED_AT,
        "rowCount": total, "source": public_source, "provinces": provinces,
    }), **outputs}
    audit = {
        "schemaVersion": 1, "snapshotId": snapshot_id, "rowCount": total,
        "provinceCount": len(provinces), "cityGroupCount": len(groups),
        "codeStatusCounts": {status: code_counts[status] for status in
                             ("valid", "missing", "placeholder", "invalid")},
        "enrichedProvinceBlankCount": enriched_blank,
        "enrichedProvinceConflictCount": enriched_conflict,
        "missingAddressCount": missing_addresses,
        "redactedAddressCount": redacted_addresses,
        "addressEqualsNameCount": address_equals_name_count,
        "missingCityCount": missing_cities,
    }
    return outputs, audit


def write_outputs(outputs: dict[str, bytes], output_dir: Path, *, check: bool) -> None:
    output_dir = Path(output_dir)
    actual = ({path.relative_to(output_dir).as_posix() for path in output_dir.rglob("*")
               if path.is_file()} if output_dir.exists() else set())
    expected = set(outputs)
    if check and actual != expected:
        raise ValueError("QCC institution public output file set differs")
    if not check and actual - expected:
        raise ValueError("QCC institution stale public output files remain")
    for name, data in outputs.items():
        path = output_dir / name
        if check:
            if not path.is_file() or path.read_bytes() != data:
                raise ValueError(f"QCC institution public output differs: {name}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="Compare all existing public JSON with the locked private XLSX")
    args = parser.parse_args()
    source_manifest = load_source_manifest(SOURCE_MANIFEST)
    if source_manifest["rowCount"] != EXPECTED_ROWS:
        raise ValueError("QCC institution locked row count differs")
    source_file = SOURCE_DIR / source_manifest["filename"]
    outputs, audit = build(source_file, SOURCE_MANIFEST)
    if audit["provinceCount"] != EXPECTED_PROVINCES:
        raise ValueError("QCC institution province count differs")
    write_outputs(outputs, OUTPUT_DIR, check=args.check)
    audit_bytes = json_bytes(audit)
    if args.check:
        if not AUDIT_PATH.is_file() or AUDIT_PATH.read_bytes() != audit_bytes:
            raise ValueError("QCC institution private audit differs")
    else:
        AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        AUDIT_PATH.write_bytes(audit_bytes)
    action = "Checked" if args.check else "Wrote"
    print(f"{action} {len(outputs)} public JSON files, "
          f"{sum(map(len, outputs.values()))} bytes, {audit['rowCount']} source rows, "
          f"{audit['provinceCount']} provinces, {audit['cityGroupCount']} city groups; "
          f"code statuses {audit['codeStatusCounts']}")


if __name__ == "__main__":
    main()
