"""Project the reviewed private QCC XLSX into an approved static public schema.

The export is a dated registration-subject snapshot, not an institution roster or
evidence of a current operating relationship with an official source record.
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
SOURCE_DIR = (ROOT / "data/private/guangdong-eldercare-source"
              / "research-batch29-qcc-export-20261116")
OFFICIAL_SOURCE = ROOT / "public/data/guangdong-source-records.v1.json"
OUTPUT_DIR = ROOT / "public/data/qcc"
SOURCE_SHA256 = "e573e8072e65385b48185e5645fffc0ce297a2c28aeae11ed5272ac4f926e480"
EXPORTED_AT = "2026-11-16"
ROW_COUNT = 6777
CITY_COUNT = 21
CHUNK_SIZE = 100
PROJECTION_POLICY_VERSION = b"qcc-public-contact-redaction-v3"

EXPECTED_HEADERS = (
    "企业名称", "登记状态", "法定代表人", "注册资本", "成立日期", "统一社会信用代码",
    "注册地址", "注册地址邮编", "所属省份", "所属城市", "所属区县", "有效手机号",
    "更多电话", "邮箱", "企业(机构)类型", "纳税人识别号", "注册号", "组织机构代码",
    "参保人数", "参保人数所属年报", "营业期限", "国标行业门类", "国标行业大类",
    "国标行业中类", "国标行业小类", "企查查行业门类", "企查查行业大类",
    "企查查行业中类", "企查查行业小类", "企业规模", "曾用名", "英文名",
    "官网网址", "通信地址", "通信地址邮编", "企业简介", "经营范围",
)

# Existing normalized fields retain their reviewed mapping and redaction rules.
# Detail sourceFields keeps every column, but public contact values are redacted.
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
CODE_PATTERN = re.compile(f"[{CODE_ALPHABET}]{{18}}\\Z")
CONTACT_PATTERN = re.compile(
    r"(?<!\d)(?:(?:\+86|0086)[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)"
    r"|(?<!\d)\(?0\d{2,3}\)?[\s-]*\d{7,8}(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",
    re.IGNORECASE,
)
CONTACT_SOURCE_HEADERS = frozenset(("有效手机号", "更多电话", "邮箱"))
NON_CONTACT_SOURCE_HEADERS = frozenset((
    "统一社会信用代码", "纳税人识别号", "注册号", "组织机构代码",
    "注册资本", "参保人数", "参保人数所属年报", "企业规模",
    "注册地址邮编", "通信地址邮编",
))
NON_CONTACT_DETAIL_FIELDS = frozenset((
    "registeredCapital", "insuredPersons", "insuredYear", "companySize",
))
SOURCE_CONTACT_REDACTION = "[已遮蔽]"


def source_path() -> Path:
    paths = list(SOURCE_DIR.glob("*.xlsx"))
    if len(paths) != 1:
        raise ValueError(f"Expected exactly one QCC XLSX; found {len(paths)}")
    return paths[0]


def validate_headers(headers: list[object] | tuple[object, ...]) -> None:
    if tuple(headers) != EXPECTED_HEADERS:
        raise ValueError("QCC XLSX headers differ from the reviewed 37-column export")


def read_source(path: Path | None = None, expected_sha256: str = SOURCE_SHA256
                ) -> tuple[tuple[str, ...], list[tuple[int, dict[str, object]]]]:
    path = path or source_path()
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError("QCC XLSX hash mismatch")
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Workbook contains no default style")
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    if len(workbook.worksheets) != 1:
        raise ValueError("QCC XLSX sheet count differs from reviewed export")
    sheet = workbook.active
    # The reviewed XLSX declares A1:A1 even though it contains 6,779 rows.
    sheet.reset_dimensions()
    headers: tuple[str, ...] | None = None
    rows: list[tuple[int, dict[str, object]]] = []
    for row_number, cells in enumerate(sheet.iter_rows(values_only=True), start=1):
        if row_number == 1:
            continue  # Export disclaimer, not a data header.
        if row_number == 2:
            validate_headers(cells)
            headers = tuple(cells)
            continue
        if headers is None or len(cells) != len(headers):
            raise ValueError(f"QCC XLSX row {row_number} differs from reviewed width")
        rows.append((row_number, dict(zip(headers, cells))))
    workbook.close()
    if headers is None or len(rows) != ROW_COUNT:
        raise ValueError(f"QCC XLSX row count differs: {len(rows)}")
    if len({row["所属城市"] for _, row in rows}) != CITY_COUNT:
        raise ValueError("QCC XLSX city count differs from reviewed 21 cities")
    return headers, rows


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
        if header in CONTACT_SOURCE_HEADERS and not (
                value is None or (isinstance(value, str) and value.strip() in ("", "-"))):
            result[header] = SOURCE_CONTACT_REDACTION
        elif (value is not None and header not in NON_CONTACT_SOURCE_HEADERS and
              CONTACT_PATTERN.search(unicodedata.normalize("NFKC", str(value)))):
            result[header] = SOURCE_CONTACT_REDACTION
        else:
            result[header] = value
    return result


def public_text(value: object, field: str, redactions: Counter[str] | None
                ) -> str | int | float | None:
    result = present(value)
    if (result is not None and field not in NON_CONTACT_DETAIL_FIELDS and
            CONTACT_PATTERN.search(unicodedata.normalize("NFKC", str(result)))):
        if redactions is not None:
            redactions[field] += 1
        return None
    return result


def normalized_city(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("QCC row has no city")
    city = unicodedata.normalize("NFKC", value).strip()
    return city[:-1] if city.endswith("市") else city


def match_key(city: object, name: object) -> tuple[str, str]:
    if not isinstance(name, str) or not name.strip():
        raise ValueError("QCC or official record has no name")
    return (normalized_city(city), unicodedata.normalize("NFKC", name).strip())


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


def project_row(row_number: int, row: dict[str, object], chunk: int,
                redactions: Counter[str] | None = None
                ) -> tuple[dict[str, object], dict[str, object]]:
    name = public_text(row["企业名称"], "name", redactions)
    city = normalized_city(row["所属城市"])
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"QCC row {row_number} has no subject name")
    code = present(row["统一社会信用代码"])
    validity = code_validity(code)
    identity = (f"code:{code}" if validity == "valid" else
                f"row:{city}\0{name}\0{row_number}")
    subject_id = "gd-qcc-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
    index = {
        "id": subject_id,
        "rowNumber": row_number,
        "name": name,
        "city": city,
        "district": public_text(row["所属区县"], "district", redactions),
        "subjectType": public_text(row["企业(机构)类型"], "subjectType", redactions),
        "registrationStatus": public_text(row["登记状态"], "registrationStatus", redactions),
        "chunk": f"chunk-{chunk:03d}.v1.json",
    }
    detail = {key: value for key, value in index.items() if key != "chunk"}
    detail["sourceFields"] = source_fields(row)
    detail["creditCode"] = code
    detail["codeValidity"] = validity
    for output_key, source_header in DETAIL_COLUMNS.items():
        value = row[source_header]
        detail[output_key] = (present(value) if output_key in
                              ("organizationCode", "registrationNo", "taxId") else
                              public_text(value, output_key, redactions))
    return index, detail


def link_candidates(sources: list[dict[str, object]], subjects: list[dict[str, object]]
                    ) -> list[dict[str, object]]:
    by_key: dict[tuple[str, str], list[str]] = defaultdict(list)
    for subject in subjects:
        by_key[match_key(subject["city"], subject["name"])].append(str(subject["id"]))
    links = []
    for source in sources:
        subject_ids = by_key.get(match_key(source["city"], source["name"]), [])
        if subject_ids:
            links.append({"sourceRecordId": source["id"], "subjectIds": subject_ids.copy()})
    return links


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            + "\n").encode("utf-8")


def build(redactions: Counter[str] | None = None) -> dict[str, bytes]:
    _, source_rows = read_source()
    official_bytes = OFFICIAL_SOURCE.read_bytes()
    official = json.loads(official_bytes)
    if (official.get("schemaVersion") != 1 or not isinstance(official.get("records"), list)
            or len(official["records"]) != 781):
        raise ValueError("Official public source snapshot differs from reviewed 781 records")
    source_ids = [record["id"] for record in official["records"]]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("Duplicate official source record ID")
    snapshot_seed = (SOURCE_SHA256.encode("ascii")
                     + hashlib.sha256(official_bytes).digest()
                     + PROJECTION_POLICY_VERSION)
    snapshot_id = "v1-" + hashlib.sha256(snapshot_seed).hexdigest()[:16]

    indexes: list[dict[str, object]] = []
    details: list[dict[str, object]] = []
    for position, (row_number, row) in enumerate(source_rows):
        index, detail = project_row(row_number, row, position // CHUNK_SIZE + 1,
                                    redactions=redactions)
        indexes.append(index)
        details.append(detail)
    if len({row["id"] for row in indexes}) != ROW_COUNT:
        raise ValueError("Duplicate QCC public subject ID")

    links = link_candidates(official["records"], indexes)
    if len(links) != 157 or sum(len(link["subjectIds"]) for link in links) != 158:
        raise ValueError("Official/QCC exact name-city candidate counts differ")

    outputs = {
        "index.v1.json": json_bytes({
            "schemaVersion": 1, "snapshotId": snapshot_id, "exportedAt": EXPORTED_AT,
            "sourceSha256": SOURCE_SHA256, "records": indexes,
        }),
        "links.v1.json": json_bytes({
            "schemaVersion": 1, "snapshotId": snapshot_id, "links": links,
        }),
    }
    for offset in range(0, len(details), CHUNK_SIZE):
        number = offset // CHUNK_SIZE + 1
        outputs[f"chunk-{number:03d}.v1.json"] = json_bytes({
            "schemaVersion": 1, "snapshotId": snapshot_id,
            "records": details[offset:offset + CHUNK_SIZE],
        })
    return outputs


def write_outputs(outputs: dict[str, bytes], output_dir: Path, check: bool) -> None:
    if check:
        actual = {path.name for path in output_dir.glob("*.v1.json")}
        if actual != set(outputs):
            raise ValueError("QCC public output file set differs from generated projection")
        for name, data in outputs.items():
            if (output_dir / name).read_bytes() != data:
                raise ValueError(f"QCC public output differs: {name}")
        return
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, data in outputs.items():
        (output_dir / name).write_bytes(data)
    extra = {path.name for path in output_dir.glob("*.v1.json")} - set(outputs)
    if extra:
        raise ValueError("Stale QCC public output files remain")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="Verify committed public JSON matches the reviewed private XLSX")
    args = parser.parse_args()
    redactions: Counter[str] = Counter()
    outputs = build(redactions=redactions)
    write_outputs(outputs, OUTPUT_DIR, check=args.check)
    action = "Checked" if args.check else "Wrote"
    print(f"{action} {len(outputs)} QCC JSON files; {sum(map(len, outputs.values()))} bytes; "
          f"contact redactions {dict(redactions)}")


if __name__ == "__main__":
    main()
