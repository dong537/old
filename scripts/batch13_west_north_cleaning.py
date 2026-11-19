"""Offline, loss-aware cleaning of the reviewed batch13 west/north sources.

This produces private source observations, never verified institution identities.
Source dates, source periods and operating status deliberately remain distinct.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
from collections import Counter
from pathlib import Path

from lxml import html

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
PACKAGE = DATA / "research-batch13/west-north"
BASELINE = DATA / "research-batch12/merged-observations/v5-62e8cc2697dc/机构名录_来源观察_待审核.csv"
BASELINE_SHA = "ddc3db52aa54391b4d3b45fd4148db428a5ed4a832ac66bd100d1e0733bf8a77"
FIELDS = ("city", "institution_name", "source_url", "source_published_at", "source_as_of",
          "source_file", "evidence_type", "details")

# Physical table/row/column indexes are 1-based. No person or phone column is retained.
SPECS = (
    {"key": "yunfu-city-current", "city": "云浮", "table": 1, "physical_rows": 28,
     "header_row": 1, "data_start": 2, "data_end": 28, "classification": "republication_candidate",
     "scope": "云浮市表", "period": "",
     "sha256": "23ecf7a16b31c971abd959ee3e86954a3359ca790d88f6df3f9bb38957bd5c56",
     "headers": ("序号", "辖区", "机构名称", "性质（公办/民办/公建民营）", "机构负责人", "地址", "对外公开电话", "床位数"),
     "retain": {"district_as_published": 2, "institution_name": 3, "nature_as_published": 4,
                "address_as_published": 6, "beds_as_published": 8},
     "baseline_url": "https://www.yunfu.gov.cn/yfmzj/gkmlpt/content/1/1994/post_1994203.html"},
    {"key": "yunfu-luoding-city-2026", "city": "云浮", "table": 1, "physical_rows": 10,
     "header_row": 1, "data_start": 2, "data_end": 10, "classification": "historical_roster_candidate",
     "scope": "罗定市页面所列9行，标题写云浮市，不据此扩张范围", "period": "",
     "sha256": "15dee75bb5dbaa24b3f8b5e6c18e030841c2ba11837389fb5e26a011989c22e6",
     "headers": ("序号", "辖区", "机构名称", "性质（公办/民办/公建民营）", "机构负责人", "地址", "对外公开电话", "床位数"),
     "retain": {"district_as_published": 2, "institution_name": 3, "nature_as_published": 4,
                "address_as_published": 6, "beds_as_published": 8}},
    {"key": "yunfu-yunan-2025", "city": "云浮", "table": 2, "physical_rows": 18,
     "header_row": 1, "data_start": 2, "data_end": 18, "classification": "historical_roster_candidate",
     "scope": "郁南县表", "period": "",
     "sha256": "79d5294cee5ae673966142c837b9e5472f030c1e8b468dae917c0e7621581951",
     "headers": ("机构名称", "地址", "电话号码", "床位数", "备注"),
     "retain": {"institution_name": 1, "address_as_published": 2,
                "beds_as_published": 4, "remarks_as_published": 5}},
    {"key": "yangdong-2024", "city": "阳江", "table": 1, "physical_rows": 43,
     "header_row": 2, "data_start": 3, "data_end": 20, "classification": "historical_roster_candidate",
     "scope": "阳东区2024年度表", "period": "2024年",
     "sha256": "612d853fc80169f97bae1903fe25af388110d29e217a3afa7118aa3a3bb6d885",
     "headers": ("序号", "机构名称", "负责人", "地址", "联系电话", "床位数"),
     "retain": {"institution_name": 2, "address_as_published": 4, "beds_as_published": 6}},
    {"key": "yangjiang-city-2024", "city": "阳江", "table": 2, "physical_rows": 95,
     "header_row": 1, "data_start": 2, "data_end": 95, "classification": "republication_candidate",
     "scope": "阳江市2024年度表", "period": "2024年",
     "sha256": "a7e95f16fe250dcd4657a2abe803ec8a68bf507687cf63e702e284fb944fce94",
     "headers": ("机构名称", "负责人", "地址", "联系电话", "床位数"),
     "retain": {"institution_name": 1, "address_as_published": 3, "beds_as_published": 5},
     "baseline_url": "https://www.yangjiang.gov.cn/yj/zwgk/zdlyxxgk/mzxx/yljgjbxx/content/post_793894.html"},
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def clean(value: str) -> str:
    return " ".join(value.split())


def name_key(value: str) -> str:
    return re.sub(r"\s+", "", value).replace("（", "(").replace("）", ")")


def packed(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def csv_bytes(rows: list[dict[str, str]]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


def jsonl_bytes(rows: list[dict]) -> bytes:
    return "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode("utf-8")


def verified_document(path: Path, expected_sha: str):
    raw = path.read_bytes()
    if digest(raw) != expected_sha:
        raise ValueError(f"Source hash mismatch: {path}")
    return html.fromstring(raw.decode("utf-8-sig"))


def verify_fields(doc, detail: dict) -> None:
    row = doc.xpath(detail["source_row"])
    if len(row) != 1 or row[0].tag != "tr":
        raise ValueError("Source row locator mismatch")
    for field, cell in detail["retained_source_cells"].items():
        found = doc.xpath(cell["xpath"])
        if (len(found) != 1 or found[0].getparent() is not row[0]
                or clean(found[0].text_content()) != cell["value"]):
            raise ValueError(f"Field value mismatch: {field}")


def read_register() -> tuple[dict, list[dict]]:
    register, inputs = {}, []
    for filename in ("fetch-register.json", "fetch-more-register.json"):
        path = PACKAGE / filename
        data = path.read_bytes()
        entries = json.loads(data)
        inputs.append({"path": path.relative_to(DATA).as_posix(), "sha256": digest(data)})
        for entry in entries:
            if entry["key"] in register:
                raise ValueError("Duplicate capture register key")
            if entry.get("source_file"):
                source = (PACKAGE / entry["source_file"]).resolve()
                if not source.is_relative_to(PACKAGE.resolve()) or digest(source.read_bytes()) != entry["sha256"]:
                    raise ValueError(f"Capture register source hash mismatch: {entry['key']}")
            register[entry["key"]] = entry
    return register, inputs


def compare_republication(spec: dict, rows: list[dict], baseline: list[dict]) -> dict:
    old = [row for row in baseline if row["source_url"] == spec["baseline_url"]]
    old_names = Counter(name_key(row["institution_name"]) for row in old)
    new_names = Counter(name_key(row["institution_name"]) for row in rows)
    if not old or old_names != new_names:
        raise ValueError(f"Republication name multiset differs: {spec['key']}")
    comparisons = []
    if spec["key"] == "yangjiang-city-2024":
        if len(old_names) != len(old):
            raise ValueError("Ambiguous repeated baseline name in mirror comparison")
        by_name = {name_key(row["institution_name"]): row for row in old}
        for row in rows:
            previous = by_name[name_key(row["institution_name"])]
            before = json.loads(previous["details"])
            after = json.loads(row["details"])
            for field in ("address_as_published", "beds_as_published"):
                expected = re.sub(r"\s+", "", str(before[field]))
                actual = re.sub(r"\s+", "", str(after["retained_source_cells"][field]["value"]))
                comparisons.append({"institution_name": row["institution_name"], "field": field,
                                    "baseline_value": str(before[field]),
                                    "new_value": after["retained_source_cells"][field]["value"],
                                    "equal_after_whitespace_normalization": expected == actual})
        if any(not item["equal_after_whitespace_normalization"] for item in comparisons):
            raise ValueError("Republication retained field differs; review before classification")
    return {"source_key": spec["key"], "baseline_url": spec["baseline_url"],
            "rows": len(rows), "name_multiset_matches": True,
            "comparison_scope": "names_addresses_beds" if comparisons else "names_only_baseline_has_no_address_or_beds",
            "field_comparisons": comparisons, "institution_identity_verified": False}


def build() -> tuple[dict[str, bytes], dict]:
    baseline_raw = BASELINE.read_bytes()
    if digest(baseline_raw) != BASELINE_SHA:
        raise ValueError("Batch12 baseline hash mismatch")
    baseline = list(csv.DictReader(io.StringIO(baseline_raw.decode("utf-8-sig"))))
    if len(baseline) != 2348:
        raise ValueError("Batch12 baseline row count mismatch")
    register, inputs = read_register()
    inputs.append({"path": BASELINE.relative_to(DATA).as_posix(), "sha256": BASELINE_SHA})
    roster, audits, comparisons, source_summary = [], [], [], []
    for spec in SPECS:
        capture = register[spec["key"]]
        if capture.get("status") != 200 or capture["sha256"] != spec["sha256"]:
            raise ValueError("Reviewed source capture changed")
        path = PACKAGE / capture["source_file"]
        doc = verified_document(path, spec["sha256"])
        tables = doc.xpath("//table")
        table = tables[spec["table"] - 1]
        physical_rows = table.xpath(".//tr")
        if len(physical_rows) != spec["physical_rows"]:
            raise ValueError(f"Physical row count mismatch: {spec['key']}")
        headers = [clean(cell.text_content()) for cell in physical_rows[spec["header_row"] - 1].xpath("./th|./td")]
        if tuple(headers) != spec["headers"]:
            raise ValueError(f"Source table header mismatch: {spec['key']}: {headers}")
        source_rows = []
        for physical in range(spec["data_start"], spec["data_end"] + 1):
            tr = physical_rows[physical - 1]
            cells = tr.xpath("./th|./td")
            if len(cells) != len(headers):
                raise ValueError("Source row cell count mismatch")
            retained = {field: {"column_label": headers[column - 1],
                                "xpath": doc.getroottree().getpath(cells[column - 1]),
                                "value": clean(cells[column - 1].text_content())}
                        for field, column in spec["retain"].items()}
            detail = {"source_sha256": spec["sha256"], "source_row": doc.getroottree().getpath(tr),
                      "source_table": spec["table"], "physical_tr": physical,
                      "source_captured_at": capture["retrieved_at"],
                      "source_scope_as_published": spec["scope"],
                      "source_period_as_published": spec["period"],
                      "classification": spec["classification"], "institution_identity_verified": False,
                      "current_operating_status_verified": False, "retained_source_cells": retained}
            verify_fields(doc, detail)
            name = retained["institution_name"]["value"]
            if not name or name == "合计":
                raise ValueError("Empty/total row selected as an institution")
            row = {"city": spec["city"], "institution_name": name,
                   "source_url": capture["final_url"], "source_published_at": capture["published_at_meta"][0],
                   "source_as_of": "", "source_file": path.relative_to(DATA).as_posix(),
                   "evidence_type": spec["classification"],
                   "details": json.dumps(detail, ensure_ascii=False, separators=(",", ":"))}
            source_rows.append(row)
            audits.append({"city": spec["city"], "institution_name": name, "source_file": row["source_file"],
                           "source_sha256": spec["sha256"], "source_row": detail["source_row"],
                           "retained_source_cells": retained, "status": "verified_at_exact_cells"})
        if spec["classification"] == "republication_candidate":
            comparisons.append(compare_republication(spec, source_rows, baseline))
        source_summary.append({"key": spec["key"], "rows": len(source_rows), "classification": spec["classification"],
                               "source_file": path.relative_to(DATA).as_posix(), "sha256": spec["sha256"]})
        roster.extend(source_rows)

    capture = register["yangdong-merger-news-2025"]
    event_sha = "cfff0365288ab5bda8fe8d434513c8a11716a7202e63fcc04cb9a61f5a6ff4d9"
    event_doc = verified_document(PACKAGE / capture["source_file"], event_sha)
    phrase = "将原有11家敬老院撤并为5家，分别为合山、塘坪、东平、北惯、大沟镇敬老院"
    paragraphs = [p for p in event_doc.xpath("//p") if phrase in clean(p.text_content())]
    if len(paragraphs) != 1 or "2024年12月" not in paragraphs[0].text_content():
        raise ValueError("Aggregate merger event source locator mismatch")
    event = {"city": "阳江", "district_as_published": "阳东区", "event_type": "aggregate_roster_merger_report",
             "source_url": capture["final_url"], "source_published_at": capture["published_at_meta"][0],
             "source_file": (PACKAGE / capture["source_file"]).relative_to(DATA).as_posix(),
             "source_sha256": event_sha, "source_locator": event_doc.getroottree().getpath(paragraphs[0]),
             "source_captured_at": capture["retrieved_at"], "source_text": clean(paragraphs[0].text_content()),
             "effective_period_as_published": "2024年12月", "previous_count_as_published": 11,
             "retained_count_as_published": 5, "retained_towns_as_published": ["合山", "塘坪", "东平", "北惯", "大沟"],
             "individual_institution_closures": [], "institution_identity_verified": False,
             "current_operating_status_verified": False}
    report = {"roster_rows": len(roster), "field_audit_rows": len(audits),
              "retained_fields_verified": sum(len(row["retained_source_cells"]) for row in audits),
              "historical_roster_rows": sum(row["evidence_type"] == "historical_roster_candidate" for row in roster),
              "republication_candidate_rows": sum(row["evidence_type"] == "republication_candidate" for row in roster),
              "appendable_roster_rows": 0, "aggregate_status_events": 1,
              "current_operating_status_verified": False, "sources": source_summary,
              "limitations": ["重复发布候选不证明实体相同；云浮基线仅能核名称，不能核地址/床位一致。",
                              "罗定/郁南分类为较早发布快照，不表示已取得明确统计截止日或已确认失效。",
                              "清远另入口返回412挑战页，不作为机构明细；不绕过访问控制。",
                              "湛江另入口链接同一51家附件，已在旧批次，不重复计为新观察。",
                              "郁南备注中的状态只保留来源原文，不能外推为当前状态。"]}
    files = {"roster-observations.csv": csv_bytes(roster),
             "historical-roster-observations.csv": csv_bytes([r for r in roster if r["evidence_type"] == "historical_roster_candidate"]),
             "republication-observations.csv": csv_bytes([r for r in roster if r["evidence_type"] == "republication_candidate"]),
             "observations.csv": csv_bytes([]), "field-audit.jsonl": jsonl_bytes(audits),
             "event-observations.jsonl": jsonl_bytes([event]), "republication-comparison.json": packed(comparisons),
             "report.json": packed(report)}
    content_hash = digest(packed({name: digest(raw) for name, raw in sorted(files.items())}))
    version_id = "v1-" + content_hash[:16]
    manifest = {"version_id": version_id, "version_path": "versions/" + version_id,
                "generator": "scripts/batch13_west_north_cleaning.py",
                "generator_sha256": digest(Path(__file__).read_bytes()), "inputs": inputs,
                "outputs": {name: {"sha256": digest(raw), "bytes": len(raw)} for name, raw in sorted(files.items())},
                "summary": report}
    files["manifest.json"] = packed(manifest)
    return files, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Recompute and verify all archived bytes")
    args = parser.parse_args()
    files, report = build()
    manifest = json.loads(files["manifest.json"])
    destination = PACKAGE / manifest["version_path"]
    if args.check or destination.exists():
        if not destination.is_dir() or set(p.name for p in destination.iterdir()) != set(files):
            raise ValueError(f"Archived file set mismatch: {destination}")
        for name, raw in files.items():
            if (destination / name).read_bytes() != raw:
                raise ValueError(f"Archived bytes differ: {name}")
        action = "verified"
    else:
        destination.mkdir(parents=True, exist_ok=False)
        for name, raw in files.items():
            with (destination / name).open("xb") as stream:
                stream.write(raw)
        action = "created"
    print(json.dumps({"action": action, "path": destination.relative_to(ROOT).as_posix(), "summary": report},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
