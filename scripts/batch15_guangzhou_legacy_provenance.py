"""Archive exact official source-cell links for legacy Guangzhou observations."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import tempfile
import unicodedata
from pathlib import Path

from lxml import html

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
SOURCE = DATA / "research-batch3/pearl-expansion/raw/guangzhou-235.html"
LEGACY = DATA / "exports/20261114_batch10/机构名录_逐条来源.csv"
PUBLIC_CSV = ROOT / "data/raw/family_fields_official.csv"
VERSIONS = DATA / "research-batch15/guangzhou-legacy-provenance/versions"
SOURCE_URL = "https://mzj.gz.gov.cn/gk/fwjgylb/content/post_11018696.html"
SOURCE_SHA = "588ac7e9d2ffae76ebe5ffcd522a865665d4ffa39cdb12e04fbca88ec5e4e46e"
LEGACY_SHA = "6c20c94161f124741e826b5bbb519bb037253e5734925bc5cd6e3aa372f2d266"
PUBLIC_SHA = "9260f573915bd78497906e3c75b3dab2f306b68a8fafeb68de2c1af112b5eace"
PUBLIC_FIELDS = ("序号", "区", "机构名称", "地址", "电话号码", "备案床位数",
                 "是否预收养老服务费", "是否收取押金", "是否收取会员费")
FIELDS = ("legacy_csv_line", "legacy_name", "legacy_district", "source_serial", "source_name",
          "source_district", "name_comparison", "name_xpath", "district_xpath", "source_file",
          "source_sha256", "source_url", "source_link_verified", "all_fields_verified",
          "institution_identity_verified", "current_operating_status_verified")


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def verified(path: Path, expected: str) -> bytes:
    raw = path.read_bytes()
    if sha(raw) != expected:
        raise ValueError("Pinned source SHA mismatch: " + str(path))
    return raw


def key(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value))


def source_rows(raw: bytes) -> list[dict]:
    page = html.fromstring(raw)
    tables = page.xpath("//table")
    if len(tables) != 1 or len(tables[0].xpath(".//tr")) != 237:
        raise ValueError("Expected one table with two headers and 235 official rows")
    result = []
    for tr in tables[0].xpath(".//tr")[2:]:
        cells = tr.xpath("./th|./td")
        values = [" ".join("".join(cell.itertext()).split()) for cell in cells]
        if len(values) != 9 or not values[0].isdigit() or not values[1] or not values[2]:
            raise ValueError("Malformed official row")
        result.append({"serial": int(values[0]), "district": values[1], "name": values[2],
                       "district_xpath": page.getroottree().getpath(cells[1]),
                       "name_xpath": page.getroottree().getpath(cells[2]),
                       "cell_values": values,
                       "cell_xpaths": [page.getroottree().getpath(cell) for cell in cells]})
    if [item["serial"] for item in result] != list(range(1, 236)):
        raise ValueError("Official serials changed")
    return result


def legacy_rows(raw: bytes) -> list[dict]:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    result = []
    for line, row in enumerate(reader, start=2):
        if row["source_url"] != SOURCE_URL:
            continue
        detail = json.loads(row["details"])
        if (row["city"] != "广州" or row["source_as_of"] or
                any(detail.get(field) for field in ("source_sha256", "source_page_sha256", "sha256"))):
            raise ValueError("Legacy Guangzhou row has unexpected city, cutoff or SHA")
        result.append({"line": line, "serial": int(detail["原始序号"]),
                       "district": detail["区"], "name": row["institution_name"]})
    if len(result) != 235 or sorted(item["serial"] for item in result) != list(range(1, 236)):
        raise ValueError("Legacy serial mapping is incomplete or ambiguous")
    return result


def link(legacy: list[dict], official: list[dict]) -> list[dict]:
    if len(legacy) != 235 or sorted(item["serial"] for item in legacy) != list(range(1, 236)):
        raise ValueError("Legacy serial mapping is incomplete or ambiguous")
    by_serial = {item["serial"]: item for item in official}
    if len(official) != 235 or sorted(by_serial) != list(range(1, 236)):
        raise ValueError("Official serial mapping is incomplete or ambiguous")
    output = []
    for row in sorted(legacy, key=lambda item: item["serial"]):
        source = by_serial[row["serial"]]
        if row["district"] != source["district"] or key(row["name"]) != key(source["name"]):
            raise ValueError(f"Legacy row differs from official source at serial {row['serial']}")
        output.append({
            "legacy_csv_line": row["line"], "legacy_name": row["name"],
            "legacy_district": row["district"], "source_serial": row["serial"],
            "source_name": source["name"], "source_district": source["district"],
            "name_comparison": "literal_equal" if row["name"] == source["name"] else "nfkc_whitespace_equal",
            "name_xpath": source["name_xpath"], "district_xpath": source["district_xpath"],
            "source_file": SOURCE.relative_to(DATA).as_posix(), "source_sha256": SOURCE_SHA,
            "source_url": SOURCE_URL, "source_link_verified": True, "all_fields_verified": False,
            "institution_identity_verified": False, "current_operating_status_verified": False,
        })
    return output


def compare_public_fields(raw: bytes, official: list[dict]) -> list[dict]:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    if tuple(reader.fieldnames or ()) != PUBLIC_FIELDS:
        raise ValueError("Public snapshot field schema changed")
    rows = list(reader)
    if len(rows) != 235 or [row["序号"] for row in rows] != [str(i) for i in range(1, 236)]:
        raise ValueError("Public snapshot serial mapping changed")
    by_serial = {row["serial"]: row for row in official}
    evidence = []
    for csv_line, row in enumerate(rows, start=2):
        source = by_serial[int(row["序号"])]
        for column, field in enumerate(PUBLIC_FIELDS):
            value, original = row[field], source["cell_values"][column]
            if key(value) != key(original):
                raise ValueError(f"Public snapshot field differs at serial {source['serial']}, field {field}")
            evidence.append({
                "snapshot_csv_line": csv_line, "source_serial": source["serial"],
                "field_as_supplied": field, "snapshot_value": value,
                "official_value": original, "source_cell_xpath": source["cell_xpaths"][column],
                "comparison": "literal_equal" if value == original else "nfkc_whitespace_equal",
                "source_file": SOURCE.relative_to(DATA).as_posix(), "source_sha256": SOURCE_SHA,
            })
    return evidence


def packed(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def build() -> tuple[dict[str, bytes], dict]:
    official = source_rows(verified(SOURCE, SOURCE_SHA))
    rows = link(legacy_rows(verified(LEGACY, LEGACY_SHA)), official)
    evidence = compare_public_fields(verified(PUBLIC_CSV, PUBLIC_SHA), official)
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\n", extrasaction="raise")
    writer.writeheader()
    writer.writerows(rows)
    report = {
        "legacy_rows_with_supplemental_source_link": len(rows),
        "literal_equal_names": sum(row["name_comparison"] == "literal_equal" for row in rows),
        "nfkc_whitespace_name_variants": sum(row["name_comparison"] == "nfkc_whitespace_equal" for row in rows),
        "verified_fields": ["serial", "district", "name_after_nfkc_whitespace_only"],
        "all_fields_verified": False, "institution_identity_verified": False,
        "current_operating_status_verified": False, "source_as_of": None,
        "canonical_legacy_csv_modified": False,
        "public_snapshot_fields_compared": len(evidence),
        "public_snapshot_literal_equal_cells": sum(item["comparison"] == "literal_equal" for item in evidence),
        "public_snapshot_nfkc_whitespace_equal_cells": sum(item["comparison"] == "nfkc_whitespace_equal" for item in evidence),
        "public_snapshot_non_normalization_discrepancies": 0,
        "interpretation": "哈希和序号/区/规范化名称/单元格位置逐行对应；不证明其他字段、机构身份或当前在营。",
    }
    outputs = {"links.csv": stream.getvalue().encode("utf-8-sig"), "report.json": packed(report)}
    outputs["public-snapshot-field-evidence.jsonl"] = "".join(
        json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n" for item in evidence).encode("utf-8")
    sources = {SOURCE.relative_to(DATA).as_posix(): SOURCE_SHA, LEGACY.relative_to(DATA).as_posix(): LEGACY_SHA}
    sources["project:data/raw/family_fields_official.csv"] = PUBLIC_SHA
    hashes = {name: sha(raw) for name, raw in sorted(outputs.items())}
    generator = sha(Path(__file__).read_bytes())
    version = "v1-" + sha(packed({"generator": generator, "sources": sources, "outputs": hashes}))[:16]
    outputs["manifest.json"] = packed({"version_id": version, "generator_sha256": generator,
                                       "source_sha256": sources, "output_sha256": hashes, "summary": report})
    return outputs, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs, report = build()
    destination = VERSIONS / json.loads(outputs["manifest.json"])["version_id"]
    if args.check or destination.exists():
        if not destination.is_dir() or {item.name for item in destination.iterdir()} != set(outputs):
            raise ValueError("Archived file set differs")
        for name, raw in outputs.items():
            if (destination / name).read_bytes() != raw:
                raise ValueError("Archived bytes differ: " + name)
        action = "verified"
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".staging-", dir=destination.parent) as temp:
            stage = Path(temp) / "version"
            stage.mkdir()
            for name, raw in outputs.items():
                (stage / name).write_bytes(raw)
            stage.rename(destination)
        action = "created"
    print(json.dumps({"action": action, "path": destination.relative_to(ROOT).as_posix(),
                      "summary": report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
