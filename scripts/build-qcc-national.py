"""Audit private QCC exports and project a city-sharded public snapshot.

These are dated registration-subject candidates, not an institution roster.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import unicodedata
import warnings
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = Path("C:/Users/Lenovo/Desktop/search/example")
SOURCE_MANIFEST = ROOT / "data/raw/qcc-national-source-manifest.json"
OUTPUT_DIR = ROOT / "public/data/qcc-national"
AUDIT_PATH = ROOT / "data/private/qcc-national-audit.json"
CHUNK_SIZE = 100
EXPECTED_SOURCE_FILES = 25
EXPECTED_ROWS = 141364
EXPECTED_PROVINCES = 30
EXPECTED_CITY_GROUPS = 320
EXPECTED_MISSING_CODES = 2161
EXPECTED_INVALID_CODES = 9
EXPECTED_MISSING_CITIES = 3
EXPECTED_DUPLICATE_GROUPS = 1

EXPECTED_HEADERS = (
    "企业名称", "登记状态", "法定代表人", "注册资本", "成立日期", "统一社会信用代码",
    "注册地址", "注册地址邮编", "所属省份", "所属城市", "所属区县", "有效手机号",
    "更多电话", "邮箱", "企业(机构)类型", "纳税人识别号", "注册号", "组织机构代码",
    "参保人数", "参保人数所属年报", "营业期限", "国标行业门类", "国标行业大类",
    "国标行业中类", "国标行业小类", "企查查行业门类", "企查查行业大类",
    "企查查行业中类", "企查查行业小类", "企业规模", "曾用名", "英文名",
    "官网网址", "通信地址", "通信地址邮编", "企业简介", "经营范围",
)

# Matches the existing normalized fields of build-qcc-public.py; their reviewed
# redaction rules remain separate from the complete original sourceFields.
DETAIL_COLUMNS = {
    "legalRepresentative": "法定代表人",
    "establishedAt": "成立日期",
    "registeredCapital": "注册资本",
    "organizationCode": "组织机构代码",
    "registrationNo": "注册号",
    "taxId": "纳税人识别号",
    "businessTerm": "营业期限",
    "insuredPersons": "参保人数",
    "insuredYear": "参保人数所属年报",
    "nationalIndustry": "国标行业大类",
    "address": "注册地址",
    "mailingAddress": "通信地址",
    "businessScope": "经营范围",
    "formerName": "曾用名",
    "englishName": "英文名",
    "companySize": "企业规模",
}

CODE_ALPHABET = "0123456789ABCDEFGHJKLMNPQRTUWXY"
CODE_WEIGHTS = (1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28)
CODE_PATTERN = re.compile(rf"[{CODE_ALPHABET}]{{18}}\Z")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:(?:\+86|0086)[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)")
EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
LANDLINE_PATTERN = re.compile(r"(?<!\d)\(?0\d{2,3}\)?[\s-]*\d{7,8}(?!\d)")
SHA_PATTERN = re.compile(r"[0-9a-f]{64}\Z")
SOURCE_ID_PATTERN = re.compile(r"[a-z0-9-]+\Z")
MASKED_NAME = "已遮蔽"
MASKED_SOURCE_FIELD = "[已遮蔽]"
# Public output bytes changed while the locked source XLSX did not. Keep the
# policy in the snapshot seed so readers cannot confuse both projections.
PUBLIC_PROJECTION_POLICY = "qcc-national-mask-contacts-v3"
CONTACT_SOURCE_FIELDS = frozenset(("有效手机号", "更多电话", "邮箱"))
NON_CONTACT_SOURCE_FIELDS = frozenset((
    "统一社会信用代码", "纳税人识别号", "注册号", "组织机构代码",
    "注册资本", "参保人数", "参保人数所属年报", "注册地址邮编", "通信地址邮编", "企业规模",
))
NON_CONTACT_DETAIL_FIELDS = frozenset(
    field for field, header in DETAIL_COLUMNS.items() if header in NON_CONTACT_SOURCE_FIELDS)
MISSING_CITY = "城市未提供"


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            + "\n").encode("utf-8")


def slug(name: str) -> str:
    return hashlib.sha256(name.encode("utf-8")).hexdigest()[:12]


def validate_headers(headers: tuple[object, ...] | list[object]) -> None:
    if tuple(headers) != EXPECTED_HEADERS:
        raise ValueError("QCC XLSX headers differ from the reviewed 37-column export")


def present(value: object) -> str | int | float | None:
    if value is None or (isinstance(value, str) and value.strip() in ("", "-")):
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError("QCC field contains an unexpected value type")
    return value


def source_fields(row: dict[str, object]) -> dict[str, str | int | float | None]:
    result = {}
    for header in EXPECTED_HEADERS:
        value = row[header]
        if (isinstance(value, bool) or
                (value is not None and not isinstance(value, (str, int, float))) or
                (isinstance(value, float) and not math.isfinite(value))):
            raise ValueError(f"QCC source field {header} contains an unexpected value")
        if header in CONTACT_SOURCE_FIELDS and value is not None and (
                not isinstance(value, str) or value.strip() not in ("", "-")):
            result[header] = MASKED_SOURCE_FIELD
            continue
        if value is not None:
            normalized = unicodedata.normalize("NFKC", str(value))
            if (EMAIL_PATTERN.search(normalized) or
                    (header not in NON_CONTACT_SOURCE_FIELDS and
                     (PHONE_PATTERN.search(normalized) or LANDLINE_PATTERN.search(normalized)))):
                result[header] = MASKED_SOURCE_FIELD
                continue
        result[header] = value
    return result


def public_text(value: object, field: str, redactions: Counter[str] | None
                ) -> str | int | float | None:
    result = present(value)
    if result is not None:
        normalized = unicodedata.normalize("NFKC", str(result))
        if (EMAIL_PATTERN.search(normalized) or
                (field not in NON_CONTACT_DETAIL_FIELDS and
                 (PHONE_PATTERN.search(normalized) or LANDLINE_PATTERN.search(normalized)))):
            if redactions is not None:
                redactions[field] += 1
            return None
    return result


def location(value: object, kind: str) -> str:
    result = present(value)
    if kind == "city" and result is None:
        return MISSING_CITY
    if not isinstance(result, str) or not result.strip():
        raise ValueError(f"QCC row has no {kind}")
    result = unicodedata.normalize("NFKC", result).strip()
    if kind == "city" and result.endswith("市"):
        result = result[:-1]
    return result


def code_validity(value: object) -> str:
    code = present(value)
    if code is None:
        return "missing"
    if not isinstance(code, str) or CODE_PATTERN.fullmatch(code) is None:
        return "invalid_format"
    total = sum(CODE_ALPHABET.index(char) * weight
                for char, weight in zip(code[:17], CODE_WEIGHTS))
    check = CODE_ALPHABET[(31 - total % 31) % 31]
    return "valid" if code[-1] == check else "invalid_checksum"


def project_row(row_number: int, row: dict[str, object], source_id: str,
                source_sha256: str, chunk: int, redactions: Counter[str] | None = None
                ) -> tuple[dict[str, object], dict[str, object]]:
    original_name = present(row["企业名称"])
    if not isinstance(original_name, str) or not original_name.strip():
        raise ValueError(f"QCC row {row_number} has no subject name")
    safe_name = public_text(original_name, "name", redactions)
    name = safe_name if isinstance(safe_name, str) else MASKED_NAME
    province = location(row["所属省份"], "province")
    city = location(row["所属城市"], "city")
    code = present(row["统一社会信用代码"])
    validity = code_validity(code)
    identity = (f"code:{code}" if validity == "valid" else
                f"row:{source_sha256}:{row_number}")
    subject_id = "qcc-n-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
    index = {
        "id": subject_id, "rowNumber": row_number, "name": name,
        "province": province, "city": city,
        "district": public_text(row["所属区县"], "district", redactions),
        "subjectType": public_text(row["企业(机构)类型"], "subjectType", redactions),
        "registrationStatus": public_text(row["登记状态"], "registrationStatus", redactions),
        "sourceId": source_id, "chunk": f"chunk-{chunk:03d}.v1.json",
    }
    detail = {key: value for key, value in index.items() if key != "chunk"}
    detail["sourceFields"] = source_fields(row)
    # A credit code is an identifier; phone-pattern checks can misclassify it.
    detail["creditCode"] = code
    detail["codeValidity"] = validity
    for output_key, source_header in DETAIL_COLUMNS.items():
        detail[output_key] = public_text(row[source_header], output_key, redactions)
    return index, detail


def load_source_manifest(path: Path) -> dict[str, object]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(manifest, dict) or set(manifest) !=
            {"schemaVersion", "exportedAt", "rowCount", "sourceFiles"} or
            manifest["schemaVersion"] != 1 or
            not isinstance(manifest["exportedAt"], str) or
            not re.fullmatch(r"\d{4}-\d{2}-\d{2}", manifest["exportedAt"]) or
            not isinstance(manifest["rowCount"], int) or manifest["rowCount"] < 1 or
            not isinstance(manifest["sourceFiles"], list) or not manifest["sourceFiles"]):
        raise ValueError("QCC source manifest schema differs")
    names: set[str] = set()
    ids: set[str] = set()
    count = 0
    for source in manifest["sourceFiles"]:
        if (not isinstance(source, dict) or
                set(source) != {"id", "filename", "sha256", "rowCount"} or
                not isinstance(source["id"], str) or
                SOURCE_ID_PATTERN.fullmatch(source["id"]) is None or
                not isinstance(source["filename"], str) or
                Path(source["filename"]).name != source["filename"] or
                not source["filename"].lower().endswith(".xlsx") or
                not isinstance(source["sha256"], str) or
                SHA_PATTERN.fullmatch(source["sha256"]) is None or
                not isinstance(source["rowCount"], int) or source["rowCount"] < 1):
            raise ValueError("QCC source manifest file entry differs")
        if source["filename"] in names or source["id"] in ids:
            raise ValueError("QCC source manifest has duplicate file or source ID")
        names.add(source["filename"])
        ids.add(source["id"])
        count += source["rowCount"]
    if count != manifest["rowCount"]:
        raise ValueError("QCC source manifest row count differs")
    return manifest


def read_source_file(path: Path, expected_sha256: str, expected_rows: int):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError(f"QCC XLSX hash mismatch: {path.name}")
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Workbook contains no default style")
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    try:
        if len(workbook.worksheets) != 1:
            raise ValueError(f"QCC XLSX sheet count differs: {path.name}")
        sheet = workbook.active
        sheet.reset_dimensions()  # The source XLSX files falsely declare A1:A1.
        headers = None
        seen = 0
        for row_number, cells in enumerate(sheet.iter_rows(values_only=True), start=1):
            if row_number == 1:
                continue  # Disclaimer, not the data header.
            if row_number == 2:
                validate_headers(cells)
                headers = tuple(cells)
                continue
            if headers is None or len(cells) > len(headers):
                raise ValueError(f"QCC XLSX row width differs: {path.name}:{row_number}")
            seen += 1
            padded = cells + (None,) * (len(headers) - len(cells))
            yield row_number, dict(zip(headers, padded))
        if seen != expected_rows:
            raise ValueError(f"QCC XLSX row count differs: {path.name}: {seen}")
    finally:
        workbook.close()


def build(source_dir: Path = SOURCE_DIR, source_manifest_path: Path = SOURCE_MANIFEST,
          *, expected_provinces: int | None = None, expected_city_groups: int | None = None
          ) -> tuple[dict[str, bytes], dict[str, object]]:
    source_dir = Path(source_dir)
    manifest = load_source_manifest(Path(source_manifest_path))
    expected_names = {source["filename"] for source in manifest["sourceFiles"]}
    actual_names = {path.name for path in source_dir.glob("*.xlsx")}
    if expected_names != actual_names:
        raise ValueError("QCC XLSX file set differs from locked source manifest")

    groups: dict[tuple[str, str], dict[str, list[dict[str, object]]]] = defaultdict(
        lambda: {"indexes": [], "details": []})
    redactions: Counter[str] = Counter()
    duplicate_keys: Counter[tuple[str, str]] = Counter()
    ids: set[str] = set()
    validity_counts: Counter[str] = Counter()
    missing_city_count = 0
    total = 0
    for source in manifest["sourceFiles"]:
        for row_number, row in read_source_file(
                source_dir / source["filename"], source["sha256"], source["rowCount"]):
            province = location(row["所属省份"], "province")
            city = location(row["所属城市"], "city")
            group = groups[(province, city)]
            chunk = len(group["indexes"]) // CHUNK_SIZE + 1
            index, detail = project_row(row_number, row, source["id"],
                                        source["sha256"], chunk, redactions)
            if index["id"] in ids:
                raise ValueError(f"Duplicate QCC public subject ID: {index['id']}")
            ids.add(index["id"])
            group["indexes"].append(index)
            group["details"].append(detail)
            duplicate_keys[(str(row["企业名称"]), str(row["统一社会信用代码"]))] += 1
            validity_counts[detail["codeValidity"]] += 1
            missing_city_count += city == MISSING_CITY
            total += 1
    if total != manifest["rowCount"]:
        raise ValueError("QCC XLSX total row count differs from locked source manifest")

    provinces_by_name: dict[str, list[str]] = defaultdict(list)
    for province, city in groups:
        provinces_by_name[province].append(city)
    if expected_provinces is not None and len(provinces_by_name) != expected_provinces:
        raise ValueError("QCC province count differs from reviewed snapshot")
    if expected_city_groups is not None and len(groups) != expected_city_groups:
        raise ValueError("QCC city group count differs from reviewed snapshot")

    snapshot_seed = json_bytes({"exportedAt": manifest["exportedAt"],
                                "sourceFiles": manifest["sourceFiles"],
                                "projectionPolicy": PUBLIC_PROJECTION_POLICY})
    snapshot_id = "v1-" + hashlib.sha256(snapshot_seed).hexdigest()[:16]
    outputs: dict[str, bytes] = {}
    provinces = []
    province_slugs: dict[str, str] = {}
    for province in sorted(provinces_by_name):
        province_slug = "p-" + slug(province)
        if province_slug in province_slugs and province_slugs[province_slug] != province:
            raise ValueError("QCC province slug collision")
        province_slugs[province_slug] = province
        cities = []
        province_count = 0
        city_slugs: dict[str, str] = {}
        for city in sorted(provinces_by_name[province]):
            city_slug = "c-" + slug(city)
            if city_slug in city_slugs and city_slugs[city_slug] != city:
                raise ValueError("QCC city slug collision")
            city_slugs[city_slug] = city
            group = groups[(province, city)]
            root = f"{province_slug}/{city_slug}/"
            index_path = root + "index.v1.json"
            outputs[index_path] = json_bytes({
                "schemaVersion": 1, "snapshotId": snapshot_id,
                "provinceSlug": province_slug, "citySlug": city_slug,
                "records": group["indexes"],
            })
            details = group["details"]
            for offset in range(0, len(details), CHUNK_SIZE):
                chunk_number = offset // CHUNK_SIZE + 1
                outputs[root + f"chunk-{chunk_number:03d}.v1.json"] = json_bytes({
                    "schemaVersion": 1, "snapshotId": snapshot_id,
                    "provinceSlug": province_slug, "citySlug": city_slug,
                    "records": details[offset:offset + CHUNK_SIZE],
                })
            count = len(group["indexes"])
            cities.append({"slug": city_slug, "name": city, "count": count,
                           "indexPath": index_path})
            province_count += count
        provinces.append({"slug": province_slug, "name": province,
                          "count": province_count, "cities": cities})
    outputs = {"manifest.v1.json": json_bytes({
        "schemaVersion": 1, "snapshotId": snapshot_id,
        "exportedAt": manifest["exportedAt"], "rowCount": total,
        "sourceFiles": manifest["sourceFiles"], "provinces": provinces,
    }), **outputs}
    audit = {
        "schemaVersion": 1, "snapshotId": snapshot_id,
        "exportedAt": manifest["exportedAt"], "rowCount": total,
        "sourceFiles": manifest["sourceFiles"],
        "provinceCount": len(provinces), "cityGroupCount": len(groups),
        "missingCodeCount": validity_counts["missing"],
        "invalidCodeCount": validity_counts["invalid_format"] + validity_counts["invalid_checksum"],
        "invalidFormatCount": validity_counts["invalid_format"],
        "invalidChecksumCount": validity_counts["invalid_checksum"],
        "validCodeCount": validity_counts["valid"],
        "cityMissingCount": missing_city_count,
        "duplicateGroupCount": sum(count > 1 for count in duplicate_keys.values()),
        "contactRedactions": dict(sorted(redactions.items())),
    }
    return outputs, audit


def write_outputs(outputs: dict[str, bytes], output_dir: Path, check: bool) -> None:
    output_dir = Path(output_dir)
    actual = {path.relative_to(output_dir).as_posix() for path in output_dir.rglob("*")
              if path.is_file()} if output_dir.exists() else set()
    expected = set(outputs)
    if check and actual != expected:
        raise ValueError("QCC public output file set differs from generated projection")
    if not check and actual - expected:
        raise ValueError("Stale QCC public output files remain")
    for name, data in outputs.items():
        path = output_dir / name
        if check:
            if path.read_bytes() != data:
                raise ValueError(f"QCC public output differs: {name}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)


def write_audit(audit: dict[str, object], path: Path, check: bool) -> None:
    path = Path(path)
    data = json_bytes(audit)
    if check:
        if not path.is_file() or path.read_bytes() != data:
            raise ValueError("QCC private audit differs from generated audit")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--check", action="store_true",
                        help="Compare existing outputs with the locked private source files")
    args = parser.parse_args()
    source_manifest = load_source_manifest(SOURCE_MANIFEST)
    if (len(source_manifest["sourceFiles"]) != EXPECTED_SOURCE_FILES or
            source_manifest["rowCount"] != EXPECTED_ROWS):
        raise ValueError("QCC locked source file or total row count differs")
    outputs, audit = build(args.source_dir, SOURCE_MANIFEST,
                           expected_provinces=EXPECTED_PROVINCES,
                           expected_city_groups=EXPECTED_CITY_GROUPS)
    expected_audit = {
        "missingCodeCount": EXPECTED_MISSING_CODES,
        "invalidCodeCount": EXPECTED_INVALID_CODES,
        "cityMissingCount": EXPECTED_MISSING_CITIES,
        "duplicateGroupCount": EXPECTED_DUPLICATE_GROUPS,
    }
    for field, expected in expected_audit.items():
        if audit[field] != expected:
            raise ValueError(f"QCC {field} differs: {audit[field]} != {expected}")
    write_outputs(outputs, OUTPUT_DIR, check=args.check)
    write_audit(audit, AUDIT_PATH, check=args.check)
    action = "Checked" if args.check else "Wrote"
    print(f"{action} {len(outputs)} public JSON files, "
          f"{sum(map(len, outputs.values()))} bytes, {audit['rowCount']} rows, "
          f"{audit['provinceCount']} provinces, {audit['cityGroupCount']} city groups; "
          f"contact redactions {audit['contactRedactions']}")


if __name__ == "__main__":
    main()
