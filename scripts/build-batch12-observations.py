"""Build an immutable private observation batch from reviewed source packages.

Rows are source observations, never approved institution identities or current
operating claims. Quality/status/bed subsets stay in their own source package.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
BASELINE = DATA / "exports/20261114_batch10/机构名录_逐条来源.csv"
EAST = DATA / "research-batch12/east-cities/新增来源观察_非新增机构.csv"
PRD = DATA / "research-batch12/prd-cities/未并表来源观察_待复核.csv"
WEST = DATA / "research-batch12/west-north-cities/逐行观察.csv"
WEST_REGISTER = DATA / "research-batch12/west-north-cities/source-register.json"
WEST_AUDIT_VERSION_ID = "v1-483a87b63d1c3f82"
WEST_AUDIT_VERSION = (DATA / "research-batch12/west-north-cities/versions"
                      / WEST_AUDIT_VERSION_ID)
WEST_AUDIT = WEST_AUDIT_VERSION / "per-row-location-audit.jsonl"
WEST_AUDIT_MANIFEST = WEST_AUDIT_VERSION / "manifest.json"
HK = DATA / "research-batch12/hk-swd-cleaning/建议修正.csv"
OUTPUT = DATA / "research-batch12/merged-observations"
BASELINE_SHA = "6c20c94161f124741e826b5bbb519bb037253e5734925bc5cd6e3aa372f2d266"
FIELDS = ("city", "institution_name", "source_url", "source_published_at", "source_as_of",
          "source_file", "evidence_type", "details")
WEST_ROSTER_CLASSES = {"institution_roster_observation", "historical_roster_observation"}
WEST_EXCLUDED_NAME = "梅花镇中心卫生院"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_table(path: Path) -> tuple[list[dict[str, str]], str]:
    data = path.read_bytes()
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    if reader.fieldnames is None or len(reader.fieldnames) != len(set(reader.fieldnames)):
        raise ValueError(f"Bad or duplicate CSV headers: {path}")
    return list(reader), digest(data)


def source_path(package: str, relative: str, expected_sha: str) -> str:
    package_root = (DATA / "research-batch12" / package).resolve()
    path = (package_root / relative).resolve()
    if not path.is_relative_to(package_root) or not path.is_file():
        raise ValueError(f"Source file missing or outside package: {relative}")
    if digest(path.read_bytes()) != expected_sha:
        raise ValueError(f"Source byte hash mismatch: {relative}")
    return path.relative_to(DATA.resolve()).as_posix()


def validate_west_location_audit(west: list[dict[str, str]],
                                 audit_rows: list[dict[str, object]]) -> None:
    west_keys = [(row["source_file"], row["source_locator"], row["institution_name"], row["source_sha256"])
                 for row in west]
    audit_keys = [(str(row["source_file"]), str(row["source_locator"]), str(row["institution_name"]),
                   str(row["source_sha256"])) for row in audit_rows]
    if len(set(west_keys)) != len(west_keys):
        raise ValueError("Duplicate west/north observation key")
    if len(set(audit_keys)) != len(audit_keys):
        raise ValueError("Duplicate west/north location audit key")
    if set(audit_keys) != set(west_keys):
        raise ValueError("West/north location audit key set differs from its observation ledger")
    if any(row.get("status") != "verified_at_locator" for row in audit_rows):
        raise ValueError("West/north exact-location audit contains a failed or unreviewed row")


def observation(row: dict[str, str], package: str, name_field: str,
                locator_field: str, as_of: str,
                register: dict[str, dict[str, object]] | None = None) -> dict[str, str]:
    for key in ("city", name_field, "source_url", "source_file", "source_sha256", locator_field):
        if not row.get(key, "").strip():
            raise ValueError(f"Missing {key} in {package} source row")
    if not row["source_url"].startswith(("https://", "http://")):
        raise ValueError(f"Invalid source URL: {row['source_url']}")
    file_path = source_path(package, row["source_file"], row["source_sha256"])
    detail: dict[str, object] = {
        "source_sha256": row["source_sha256"],
        "source_row": row[locator_field],
        "source_package": package,
        "original_package_record": row,
    }
    if package == "prd-cities":
        detail["source_row_original"] = row["source_row"]
        detail["source_page_url"] = row["article_url"]
        detail["source_hash_role"] = "attachment" if row["article_url"] != row["source_url"] else "page"
    if package == "east-cities" and row.get("page_file"):
        detail["source_page_file"] = source_path(package, row["page_file"], row["page_sha256"])
        detail["source_page_sha256"] = row["page_sha256"]
        detail["source_download_url"] = row["attachment_url"]
        detail["source_hash_role"] = "attachment" if row["attachment_url"] else "page"
    if package == "west-north-cities":
        if register is None or row["source_file"] not in register:
            raise ValueError("West/north source is missing from the capture register")
        item = register[row["source_file"]]
        if item["source_sha256"] != row["source_sha256"] or item["source_url"] != row["source_url"]:
            raise ValueError("West/north source register disagrees with the observation row")
        detail["source_download_url"] = item["raw_request_url"]
        detail["source_hash_role"] = "attachment" if item["raw_request_url"] != item["source_url"] else "page"
        detail["source_captured_at_utc"] = item["captured_at_utc"]
    return {
        "city": row["city"].strip(),
        "institution_name": row[name_field].strip(),
        "source_url": row["source_url"].strip(),
        "source_published_at": row.get("source_published_at", "").strip(),
        "source_as_of": as_of.strip(),
        "source_file": file_path,
        "evidence_type": row.get("evidence_type", row.get("source_kind", "")).strip(),
        "details": json.dumps(detail, ensure_ascii=False, separators=(",", ":")),
    }


def build() -> tuple[bytes, dict[str, object]]:
    base, base_sha = read_table(BASELINE)
    if base_sha != BASELINE_SHA or len(base) != 2129 or tuple(base[0]) != FIELDS:
        raise ValueError("Batch10 baseline differs from the reviewed 2,129-row input")
    east, east_sha = read_table(EAST)
    prd, prd_sha = read_table(PRD)
    west, west_sha = read_table(WEST)
    west_register_bytes = WEST_REGISTER.read_bytes()
    west_register_sha = digest(west_register_bytes)
    register_rows = json.loads(west_register_bytes)
    if not isinstance(register_rows, list) or len(register_rows) != 17:
        raise ValueError("West/north source register has changed")
    west_register = {r["source_file"]: r for r in register_rows}
    if len(west_register) != len(register_rows):
        raise ValueError("Duplicate source file in west/north register")
    west_audit_bytes = WEST_AUDIT.read_bytes()
    west_audit_sha = digest(west_audit_bytes)
    west_audit_manifest_bytes = WEST_AUDIT_MANIFEST.read_bytes()
    west_audit_manifest_sha = digest(west_audit_manifest_bytes)
    west_audit_manifest = json.loads(west_audit_manifest_bytes)
    audit_rows = [json.loads(line) for line in west_audit_bytes.decode("utf-8").splitlines() if line]
    audit_output = west_audit_manifest.get("outputs", {}).get("per-row-location-audit.jsonl", {})
    audit_input = west_audit_manifest.get("input", {})
    audit_summary = west_audit_manifest.get("summary", {})
    if (west_audit_manifest.get("version_id") != WEST_AUDIT_VERSION_ID or
        west_audit_manifest.get("version_path") != f"versions/{WEST_AUDIT_VERSION_ID}" or
        audit_input.get("path") != WEST.name or audit_input.get("sha256") != west_sha or
        audit_input.get("rows") != len(west) or audit_output.get("sha256") != west_audit_sha or
        audit_output.get("bytes") != len(west_audit_bytes) or
        audit_summary != {"row_count": 179, "verified_at_locator": 179,
                          "manual_review_required": 0, "raw_source_count": 17,
                          "wrong_locator_controls_rejected": 9}):
        raise ValueError("West/north location audit archive manifest differs from the reviewed input")
    validate_west_location_audit(west, audit_rows)
    source_counts = Counter(row["source_file"] for row in west)
    source_hashes: dict[str, str] = {}
    for row in west:
        prior = source_hashes.setdefault(row["source_file"], row["source_sha256"])
        if prior != row["source_sha256"]:
            raise ValueError("West/north observations disagree on a raw source hash")
    archived_sources = {row["source_file"]: row for row in west_audit_manifest.get("sources", [])}
    if (len(archived_sources) != 17 or set(archived_sources) != set(source_counts) or
        any(archived_sources[name].get("sha256") != source_hashes[name] or
            archived_sources[name].get("rows") != source_counts[name]
            for name in source_counts)):
        raise ValueError("West/north audit source manifest differs from its observation ledger")
    for name, source_sha in source_hashes.items():
        source_path("west-north-cities", name, source_sha)
    hk, hk_sha = read_table(HK)
    if (len(east), len(prd), len(west)) != (62, 53, 179):
        raise ValueError("Source package row counts changed; review before rebuilding")
    if len(hk) != 14:
        raise ValueError("HK SWD split count changed; review source table again")
    hk_lines: set[int] = set()
    for item in hk:
        line = int(item["batch10_csv_line"])
        if line in hk_lines or not 2 <= line <= len(base) + 1:
            raise ValueError("HK SWD CSV line is duplicated or outside batch10")
        hk_lines.add(line)
        original = base[line - 2]
        if (original["institution_name"] != item["institution_name_as_exported"] or
            original["city"] != item["city"] or original["source_url"] != item["source_url"] or
            original["source_as_of"] != item["source_as_of_in_batch10"] or
            original["source_as_of"] != "2026-11-13采集" or
            not item["facility_name_suggestion"].strip()):
            raise ValueError(f"HK SWD source row changed at batch10 line {line}")
        html_path = source_path("hk-swd-cleaning", "raw/香港社署广东认可养老院.html",
                                item["source_sha256"])
        old_details = json.loads(original["details"])
        if not isinstance(old_details, dict):
            raise ValueError(f"HK SWD detail is not a JSON object at line {line}")
        cleaned = dict(old_details)
        cleaned["source_period"] = ""
        cleaned.update({
            "source_row": item["table_row_xpath"],
            "source_period_original": old_details.get("source_period"),
            "source_as_of_original": original["source_as_of"],
            "source_file_original": original["source_file"],
            "institution_name_original": original["institution_name"],
            "retrieved_at": item["retrieved_at_local_date"],
            "hk_swd_facility_label_as_published": item["facility_label_as_published"],
            "address_as_published": item["address_as_published"],
            "hk_swd_mainland_organization_as_published": item["mainland_organization_as_published"],
            "hk_swd_hk_organization_as_published": item["hk_organization_as_published"],
            "hk_swd_status_inline_as_published": item["status_inline_as_published"],
            "hk_swd_status_footnotes_as_published": item["status_footnotes_as_published"],
            "hk_swd_rename_note_as_published": item["rename_note_as_published"],
            "hk_swd_source_sha256_candidate": item["source_sha256"],
            "hk_swd_split_candidate_not_identity_review": True,
            "hk_swd_original_details": old_details,
        })
        base[line - 2] = {**original, "institution_name": item["facility_name_suggestion"].strip(),
                          "source_as_of": "", "source_file": html_path,
                          "details": json.dumps(cleaned, ensure_ascii=False, separators=(",", ":"))}
    if "source_cell_or_tr" not in prd[0]:
        raise ValueError("PRD package lacks an unambiguous physical source locator")
    included_west = [r for r in west if r["observation_class"] in WEST_ROSTER_CLASSES
                     and r["institution_name"] != WEST_EXCLUDED_NAME]
    if len(included_west) != 104:
        raise ValueError("West/north roster classification changed; review exclusions")
    appended = [
        *(observation(r, "east-cities", "institution_name_as_published", "source_row", r["source_as_of"])
          for r in east),
        *(observation(r, "prd-cities", "institution_name_as_published", "source_cell_or_tr",
                       r["exact_statistical_cutoff"]) for r in prd),
        *(observation(r, "west-north-cities", "institution_name", "source_locator", "", west_register)
          for r in included_west),
    ]
    if len(appended) != 219:
        raise ValueError("Unexpected number of new source observations")
    baseline_urls = {r["source_url"] for r in base}
    locators: set[tuple[str, str, str]] = set()
    for r in appended:
        d = json.loads(r["details"])
        if r["source_url"] in baseline_urls:
            raise ValueError("New source observation reuses a batch10 URL; examine overlap")
        key = (r["source_url"], r["source_file"], str(d["source_row"]))
        if key in locators:
            raise ValueError(f"Duplicate source location: {key}")
        locators.add(key)
    text = io.StringIO(newline="")
    writer = csv.DictWriter(text, FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows([*base, *appended])
    output = text.getvalue().encode("utf-8")
    manifest: dict[str, object] = {
        "schema_version": 1,
        "scope": "private_source_observations_not_approved_institutions",
        "inputs_sha256": {"batch10": base_sha, "east": east_sha, "prd": prd_sha,
                          "west_north": west_sha, "west_north_register": west_register_sha,
                          "west_north_location_audit": west_audit_sha,
                          "west_north_location_audit_manifest": west_audit_manifest_sha,
                          "hk_swd_split": hk_sha},
        "west_north_location_audit_version": WEST_AUDIT_VERSION.relative_to(ROOT).as_posix(),
        "baseline_rows": len(base),
        "hk_swd_candidate_names_split": len(hk),
        "appended_rows": len(appended),
        "appended_by_package": {"east": len(east), "prd": len(prd), "west_north": len(included_west)},
        "output_rows": len(base) + len(appended),
        "city_count": len({r["city"] for r in [*base, *appended]}),
        "appended_by_city": dict(sorted(Counter(r["city"] for r in appended).items())),
        "west_north_retained_separately": dict(sorted(Counter(r["observation_class"] for r in west
                                                          if r not in included_west).items())),
        "output_sha256": digest(output),
        "entity_identity_reviewed": False,
        "current_operating_status_verified": False,
    }
    return output, manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content, manifest = build()
    combined = digest(json.dumps(manifest["inputs_sha256"], sort_keys=True).encode())
    version = OUTPUT / f"v5-{combined[:12]}"
    files = {
        "机构名录_来源观察_待审核.csv": content,
        "manifest.json": (json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode(),
    }
    if args.check:
        for name, expected in files.items():
            if (version / name).read_bytes() != expected:
                raise ValueError(f"Saved batch differs from regenerated output: {name}")
    else:
        version.mkdir(parents=True, exist_ok=False)
        for name, data in files.items():
            (version / name).write_bytes(data)
    print(json.dumps({"output": str(version), **manifest}, ensure_ascii=False))


if __name__ == "__main__":
    main()
