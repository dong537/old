"""Clean already purchased company registrations into private, auditable derivatives.

This script never calls the registry API and never establishes institution ownership.
"""

import argparse
import csv
import hashlib
import io
import json
import os
import re
import tempfile
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PAID = ROOT / "data/private/guangdong-eldercare-source/research-batch8/paid-registration"
EXPORTS = PAID / "exports"
ALL_INPUT = EXPORTS / "累计工商登记_25字段.csv"
SCOPED_INPUT = EXPORTS / "累计机构与直接照护工商_25字段.csv"
OUTPUT = ROOT / "data/private/guangdong-eldercare-source/cleaned"

REGISTRATION_FIELDS = tuple(json.loads((PAID / "dimension.json").read_text(encoding="utf-8"))["dimension"]["fields"])
if len(REGISTRATION_FIELDS) != 25 or len(set(REGISTRATION_FIELDS)) != 25:
    raise ValueError("工商字段维度必须为25个唯一字段")
META_BEFORE = ("数据批次", "查询关键词", "来源类别")
META_AFTER = ("来源URL", "证据状态限制", "工商采集时间", "原始回包SHA256")
CLEANED_COLUMNS = (*META_BEFORE, *REGISTRATION_FIELDS, *META_AFTER)
CODE_RE = re.compile(r"[0-9A-HJ-NPQRTUWXY]{18}\Z")
SHA_RE = re.compile(r"[0-9a-f]{64}\Z")
ACTIVE_STATUSES = {"存续（在营、开业、在册）", "存续", "在营（开业）企业", "开业（存续）"}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if tuple(reader.fieldnames or ()) != CLEANED_COLUMNS:
            raise ValueError(f"工商字段与维度定义不一致：{path.name}")
        return list(reader)


def read_inputs() -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    return read_csv(ALL_INPUT), read_csv(SCOPED_INPUT)


def parse_day(value: str, label: str, code: str) -> date:
    if not value or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"{code} 的{label}无效")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{code} 的{label}无效") from error


def source_urls(value: str, code: str) -> list[str]:
    urls = list(dict.fromkeys(part.strip() for part in value.split(" | ") if part.strip()))
    if not urls:
        raise ValueError(f"{code} 缺来源URL")
    for url in urls:
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"{code} 的来源URL无效")
    return urls


def build_dataset(all_rows: list[dict[str, str]], scoped_rows: list[dict[str, str]]):
    if not all_rows:
        raise ValueError("工商全量输入为空")
    all_by_code: dict[str, dict[str, str]] = {}
    for row in all_rows:
        if set(row) != set(CLEANED_COLUMNS):
            raise ValueError("工商输入列不完整")
        code = row["统一社会信用代码"]
        if not CODE_RE.fullmatch(code):
            raise ValueError("统一社会信用代码格式无效")
        if code in all_by_code:
            raise ValueError("统一社会信用代码重复")
        if not row["企业名称"].strip() or not row["查询关键词"].strip() or not row["数据批次"].strip():
            raise ValueError(f"{code} 缺企业名称或查询依据")
        if not SHA_RE.fullmatch(row["原始回包SHA256"]):
            raise ValueError(f"{code} 的原始回包SHA256无效")
        source_urls(row["来源URL"], code)
        established = parse_day(row["成立日期"], "成立日期", code)
        approved = parse_day(row["核准日期"], "核准日期", code)
        queried = parse_day(row["工商采集时间"][:10], "工商采集时间", code)
        if approved < established or approved > queried:
            raise ValueError(f"{code} 的登记日期顺序异常")
        all_by_code[code] = row

    scope_codes: set[str] = set()
    for row in scoped_rows:
        code = row.get("统一社会信用代码", "")
        if code in scope_codes:
            raise ValueError("范围输入信用代码重复")
        if code not in all_by_code or row != all_by_code[code]:
            raise ValueError("范围输入不是全量工商的同值子集")
        scope_codes.add(code)

    companies = []
    review = []
    for code, row in sorted(all_by_code.items()):
        scope = "institution_or_direct_care" if code in scope_codes else "outside_or_pending_scope"
        status = row["登记状态"]
        status_group = "active_registration" if status in ACTIVE_STATUSES else "deregistered" if status == "注销" else "unknown_registration_status"
        flags = []
        if status_group == "deregistered":
            flags.append("registration_deregistered")
        elif status_group == "unknown_registration_status":
            flags.append("registration_status_unrecognized")
        if not row["所属地区"].startswith("广东省"):
            flags.append("registered_outside_guangdong")
        if row["证据状态限制"]:
            flags.append("source_status_caveat")
        if status_group == "active_registration" and "停业" in row["证据状态限制"]:
            flags.append("source_status_conflict_candidate")
        company = {
            "id": "cn-uscc-" + code,
            "scope": scope,
            "registrationStatusGroup": status_group,
            "registration": {field: row[field].strip() or None for field in REGISTRATION_FIELDS},
            "provenance": {
                "batch": row["数据批次"],
                "queryKeyword": row["查询关键词"],
                "sourceCategory": row["来源类别"],
                "sourceUrls": source_urls(row["来源URL"], code),
                "sourceStatusCaveat": row["证据状态限制"] or None,
                "queriedAt": row["工商采集时间"],
                "rawResponseSha256": row["原始回包SHA256"],
            },
            "reviewFlags": flags,
        }
        companies.append(company)
        for flag in flags:
            review.append({
                "entityId": company["id"], "companyName": row["企业名称"], "scope": scope,
                "flag": flag, "sourceStatusCaveat": row["证据状态限制"],
                "sourceUrls": " | ".join(company["provenance"]["sourceUrls"]),
            })

    audit = {
        "schemaVersion": 1,
        "totalUniqueCompanies": len(companies),
        "scope_counts": dict(sorted(Counter(company["scope"] for company in companies).items())),
        "registration_status_counts": dict(sorted(Counter(company["registration"]["登记状态"] for company in companies).items())),
        "review_flag_counts": dict(sorted(Counter(item["flag"] for item in review).items())),
        "field_nonempty_counts": {field: sum(company["registration"][field] is not None for company in companies) for field in REGISTRATION_FIELDS},
        "interpretation": "工商登记主体不是养老机构；历史来源与名称命中不证明当前运营关系。",
    }
    return companies, review, audit


def csv_text(fieldnames: list[str], rows: list[dict[str, str]]) -> str:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def output_contents(companies, review, audit) -> dict[str, str]:
    flat = []
    for company in companies:
        provenance = company["provenance"]
        flat.append({
            "实体ID": company["id"], "范围": company["scope"], "登记状态规范": company["registrationStatusGroup"],
            "待核标记": " | ".join(company["reviewFlags"]),
            **{key: provenance[source] for key, source in [("数据批次", "batch"), ("查询关键词", "queryKeyword"), ("来源类别", "sourceCategory")]},
            **{field: company["registration"][field] or "" for field in REGISTRATION_FIELDS},
            "来源URL": " | ".join(provenance["sourceUrls"]),
            "证据状态限制": provenance["sourceStatusCaveat"] or "",
            "工商采集时间": provenance["queriedAt"], "原始回包SHA256": provenance["rawResponseSha256"],
        })
    contents = {
        "工商主体_清洗版.jsonl": "".join(json.dumps(company, ensure_ascii=False, sort_keys=True) + "\n" for company in companies),
        "工商主体_清洗版.csv": csv_text(["实体ID", "范围", "登记状态规范", "待核标记", *CLEANED_COLUMNS], flat),
        "工商主体_待核事项.csv": csv_text(["entityId", "companyName", "scope", "flag", "sourceStatusCaveat", "sourceUrls"], review),
        "工商清洗核验.json": json.dumps(audit, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
    }
    return contents


def write_or_check(contents: dict[str, str], check: bool) -> None:
    if check:
        stale = [name for name, content in contents.items() if not (OUTPUT / name).exists() or (OUTPUT / name).read_text(encoding="utf-8") != content]
        if stale:
            raise ValueError("工商清洗产物不存在或已过期：" + "、".join(stale))
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, content in contents.items():
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=OUTPUT, prefix=".company-clean-", delete=False) as stream:
            stream.write(content)
            temporary = Path(stream.name)
        os.replace(temporary, OUTPUT / name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只核对现有清洗产物，不写文件")
    args = parser.parse_args()
    all_rows, scoped_rows = read_inputs()
    companies, review, audit = build_dataset(all_rows, scoped_rows)
    audit["inputs"] = {
        path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (ALL_INPUT, SCOPED_INPUT, PAID / "dimension.json")
    }
    write_or_check(output_contents(companies, review, audit), args.check)
    print(json.dumps({"companies": len(companies), "in_scope": audit["scope_counts"]["institution_or_direct_care"], "review_rows": len(review), "checked": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
