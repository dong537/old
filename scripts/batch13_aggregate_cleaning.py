"""Reproducibly consolidate batch12 and independently reviewed batch13 source data."""
from __future__ import annotations

import argparse
import contextlib
import csv
import hashlib
import importlib.util
import io
import json
import os
import re
import tempfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
PACKAGE = DATA / "research-batch13"
BASELINE = DATA / "research-batch12/merged-observations/v5-62e8cc2697dc/机构名录_来源观察_待审核.csv"
BASELINE_SHA = "ddc3db52aa54391b4d3b45fd4148db428a5ed4a832ac66bd100d1e0733bf8a77"
FIELDS = ("city", "institution_name", "source_url", "source_published_at", "source_as_of",
          "source_file", "evidence_type", "details")
CITIES = ("广州", "深圳", "珠海", "汕头", "佛山", "韶关", "河源", "梅州", "惠州", "东莞",
          "中山", "江门", "阳江", "湛江", "茂名", "肇庆", "清远", "潮州", "揭阳", "汕尾", "云浮")
PROVINCE = PACKAGE / "province"
PEARL = PACKAGE / "pearl"
EAST = PACKAGE / "east"
WEST = PACKAGE / "west-north"
OUTPUT_ROOT = PACKAGE / "cleaned"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_sha(data: bytes, expected: str) -> None:
    if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected) or sha256(data) != expected:
        raise ValueError("SHA-256 mismatch")


def packed(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def csv_bytes(rows: list[dict], fields: tuple[str, ...]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n", extrasaction="raise")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


def jsonl_bytes(rows: list[dict]) -> bytes:
    return "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode("utf-8")


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load local verifier: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def data_path(family: str, source_file: str) -> Path:
    relative = Path(source_file)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Invalid source path: {source_file}")
    base = EAST if family == "east-scan" else PACKAGE / family
    path = DATA / relative if relative.parts[:1] in (("research-batch12",), ("research-batch13",)) else base / relative
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def read_output(family: str, filename: str, expected_sha: str | None = None) -> list[dict[str, str]]:
    path = PACKAGE / family / filename
    raw = path.read_bytes()
    if expected_sha:
        require_sha(raw, expected_sha)
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))


def validate_province_rows(rows: list[dict[str, str]]) -> None:
    """Bind each row's name, rating, sequence and city to its actual paragraph."""
    raw_path = PROVINCE / "raw/smzt-star-2023.bin"
    raw = raw_path.read_bytes()
    require_sha(raw, "43cd54246ce237780862bd670cc0777425db3d9696dd920610cafd44bce6058c")
    request = json.loads((PROVINCE / "smzt-star-2023-request.json").read_text(encoding="utf-8"))
    if request["http_status"] != 200 or request["sha256"] != sha256(raw):
        raise ValueError("Province source capture binding mismatch")
    export_module = load_module("batch13_province_star_export", PROVINCE / "export_stars.py")
    parser = export_module.Paragraphs()
    parser.feed(raw.decode("utf-8"))
    published, rating = [], None
    for paragraph_number, text in parser.rows:
        heading = re.fullmatch(r"[一二三四五]、([一二三四五])星级（(\d+)家）", text)
        if heading:
            rating = "一二三四五".index(heading.group(1)) + 1
        match = re.fullmatch(r"(\d+)\.(.+)", text)
        if not match:
            continue
        sequence, name = int(match.group(1)), match.group(2)
        facility_name = re.split(r"[（(]", name, maxsplit=1)[0]
        city_tokens = [city for city in CITIES if city in facility_name]
        city = city_tokens[0] if len(city_tokens) == 1 else ""
        published.append((sequence, name, rating, city, f"div#zoomcon/p[{paragraph_number}]", text))
    if len(rows) != 92 or len(published) != 92:
        raise ValueError("Province published row count mismatch")
    for row, expected in zip(rows, published, strict=True):
        sequence, name, rating, city, locator, text = expected
        detail = json.loads(row["details"])
        if ((row["institution_name"], row["city"], detail["sequence_as_published"],
             detail["star_rating_as_published"], detail["source_row"], detail["source_paragraph_text"])
                != (name, city, sequence, rating, locator, text)):
            raise ValueError("Province published row mismatch")
        if (row["source_url"] != request["url"] or row["source_file"] != "raw/smzt-star-2023.bin"
                or row["evidence_type"] != "省民政厅历史星级评定专项子集（非全量名录）"
                or row["source_published_at"] != "2024-03-21 10:00:00"
                or row["source_as_of"] != "2023年度（星级评定期，非统计截止日）"
                or detail["rating_period_as_published"] != "2023年度"
                or detail["source_sha256"] != request["sha256"]
                or detail["retrieved_at"] != request["requested_at"]):
            raise ValueError("Province date/source binding mismatch")


def class_and_families() -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    records: list[dict] = []
    events: list[dict] = []
    scan_records: list[dict] = []
    package_inputs: list[dict] = []

    # Each package's own deterministic rebuild/check validates its source-specific locators.
    east_builder = load_module("batch13_east_builder", EAST / "build.py")
    east_files = east_builder.build()
    for filename, expected in east_files.items():
        actual = (EAST / filename).read_bytes()
        require_sha(actual, sha256(expected))
        if actual != expected:
            raise ValueError(f"east deterministic output differs: {filename}")
        package_inputs.append({"path": f"east/{filename}", "sha256": sha256(actual)})

    scan_builder = load_module("batch13_east_scan_review", EAST / "scan-review/build.py")
    scan_result = scan_builder.main(check=True)
    if scan_result["counts"] != {"original_sources": 4, "rating_subset": 9,
                                 "rating_eligibility_event": 1, "inspection_event": 4,
                                 "all_observations": 14, "image_locator_boxes": 15, "current_roster": 0}:
        raise ValueError("Scan-review transcription package count mismatch")
    scan_observations_path = EAST / "scan-review/observations.jsonl"
    scan_observations = [json.loads(line) for line in scan_observations_path.read_text(encoding="utf-8").splitlines()]
    for row in scan_observations:
        scan_records.append(normalize_scan_observation(row))
    for filename in ("manifest.json", "observations.jsonl", "special-observations.csv",
                     "event-observations.csv", "transcriptions.json"):
        path = EAST / "scan-review" / filename
        package_inputs.append({"path": f"east/scan-review/{filename}", "sha256": sha256(path.read_bytes())})

    pearl_builder = load_module("batch13_pearl_builder", PEARL / "build_research_batch13.py")
    with contextlib.redirect_stdout(io.StringIO()):
        pearl_result = pearl_builder.check()
    package_inputs.append({"path": "pearl/audit-report.json", "sha256": sha256((PEARL / "audit-report.json").read_bytes())})
    if pearl_result["roster_observations"] != 43 or pearl_result["historical_observations"] != 12:
        raise ValueError("pearl roster/historical audit count mismatch")

    west_builder = load_module("batch13_west_cleaner", ROOT / "scripts/batch13_west_north_cleaning.py")
    west_files, west_report = west_builder.build()
    west_version = json.loads(west_files["manifest.json"])["version_path"]
    for filename, expected in west_files.items():
        actual = (WEST / west_version / filename).read_bytes()
        require_sha(actual, sha256(expected))
        if actual != expected:
            raise ValueError(f"west-north archived output differs: {filename}")
        package_inputs.append({"path": f"west-north/{west_version}/{filename}", "sha256": sha256(actual)})

    # Province public-page detail is historical and separately checked against the source paragraphs.
    star_rows = read_csv(PROVINCE / "official-stars-2023-subset.csv")
    stars_file = PROVINCE / "raw/smzt-star-2023.bin"
    requests = sorted(PROVINCE.glob("*-request.json"))
    manifest_path = PROVINCE / "source-manifest.json"
    province_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if province_manifest["authorization_state"]["restricted_institution_detail_obtained"] is not False:
        raise ValueError("Province dataset authorization boundary changed")
    raw_capture_count = 0
    for request_path in requests:
        request = json.loads(request_path.read_text(encoding="utf-8"))
        if request.get("raw_file"):
            raw = (PROVINCE / request["raw_file"]).read_bytes()
            require_sha(raw, request["sha256"])
            if len(raw) != request["bytes"]:
                raise ValueError("Province captured source byte count mismatch")
            raw_capture_count += 1
    if raw_capture_count != 36 or len(requests) != 39:
        raise ValueError("Province capture manifest shape mismatch")
    star_sha = sha256(stars_file.read_bytes())
    validate_province_rows(star_rows)
    if len(star_rows) != 92:
        raise ValueError("Historical star source row count mismatch")
    for row in star_rows:
        detail = json.loads(row["details"])
        require_sha(stars_file.read_bytes(), detail["source_sha256"])
        if detail["source_sha256"] != star_sha or row["source_file"] != "raw/smzt-star-2023.bin":
            raise ValueError("Historical star source binding mismatch")
    package_inputs.append({"path": "province/source-manifest.json", "sha256": sha256(manifest_path.read_bytes())})

    # The established batch12 review pipeline must remain reproducible and approves no identities.
    pipeline_manifest = json.loads((DATA / "research-batch12/province-pipeline/v8-ddc3db52aa54-04fc73f9de05/manifest.json").read_text(encoding="utf-8"))
    if pipeline_manifest["sourceRows"] != 2348 or pipeline_manifest["candidateNameKeysNotEntities"] != 1770 or pipeline_manifest["approvedInstitutions"] != 0:
        raise ValueError("Reviewed batch12 pipeline boundary changed")
    if pipeline_manifest["sourceShaMissing"] != 821:
        raise ValueError("Reviewed batch12 source-hash backlog changed")

    family_rows = {
        "east": read_output("east", "historical-roster-observations.csv", "7b8c5ba4f19b7a99018b548cbb9614999f602eb3cbc4c6447106974ad2c6edf9"),
        "east_special": read_output("east", "special-observations.csv", "5e4181f001c921802256f957b1b2942683369ab7a7089a77790194cc8139c085"),
        "east_events": read_output("east", "event-observations.csv", "1837a9ecb85f56cd8191bef7b5255418e34887f45499dcdb47789d57d9d46d0f"),
        "pearl_roster": read_output("pearl", "observations.csv"),
        "pearl_historical": read_output("pearl", "historical-observations.csv"),
        "pearl_events": read_output("pearl", "event-observations.csv"),
        "province": star_rows,
    }
    expected = {"east": 118, "east_special": 28, "east_events": 1, "pearl_roster": 43,
                "pearl_historical": 12, "pearl_events": 3, "province": 92}
    for key, rows in family_rows.items():
        if len(rows) != expected[key]:
            raise ValueError(f"Unexpected {key} row count")
    package_inputs.append({"path": "pearl/source-register.csv", "sha256": sha256((PEARL / "source-register.csv").read_bytes())})

    for key, rows in family_rows.items():
        if key.endswith("events"):
            for row in rows:
                event = normalize(row, key.split("_")[0], "status_event")
                event["event_type"] = json.loads(row["details"]).get("event_type", row["evidence_type"])
                event["effective_period_as_published"] = json.loads(row["details"]).get("event_at") or json.loads(row["details"]).get("source_period", "")
                events.append(event)
            continue
        if key == "east": classification = "historical_roster"
        elif key == "east_special" or key == "province": classification = "special_subset"
        elif key == "pearl_roster": classification = "current_roster_candidate"
        elif key == "pearl_historical": classification = "historical_roster"
        else: raise ValueError(f"Unhandled source family: {key}")
        family = "east" if key.startswith("east") else key.split("_")[0]
        for row in rows:
            records.append(normalize(row, family, classification))

    for row in read_output("west-north", f"{west_version}/republication-observations.csv"):
        records.append(normalize(row, "west-north", "republication_candidate"))
    for row in read_output("west-north", f"{west_version}/historical-roster-observations.csv"):
        records.append(normalize(row, "west-north", "historical_roster"))
    west_events = [json.loads(line) for line in (WEST / west_version / "event-observations.jsonl").read_text(encoding="utf-8").splitlines()]
    events.extend(normalize_event(row) for row in west_events)
    if (WEST / west_version / "observations.csv").read_bytes() != west_builder.csv_bytes([]):
        raise ValueError("West-north appendable roster output is not empty")

    if len(records) != 458 or len(events) != 5:
        raise ValueError("Aggregate observation/event row count mismatch")
    return records, events, scan_records, package_inputs


def normalize(row: dict[str, str], family: str, classification: str) -> dict:
    if tuple(row.keys()) != FIELDS:
        raise ValueError(f"Unexpected source observation schema in {family}")
    detail = json.loads(row["details"])
    if not isinstance(detail, dict):
        raise ValueError("Observation details must be an object")
    source_sha = detail.get("source_sha256")
    if not source_sha and family == "west-north":
        source_sha = detail.get("source_sha256")
    if not source_sha or not re.fullmatch(r"[a-f0-9]{64}", source_sha):
        raise ValueError(f"Missing or invalid original source SHA: {row['institution_name']}")
    path = data_path(family, row["source_file"])
    require_sha(path.read_bytes(), source_sha)
    original_as_of = row["source_as_of"]
    date_label, date_label_origin = retained_date_label(row, detail, classification)
    if original_as_of:
        detail["source_as_of_as_supplied_by_subpackage"] = original_as_of
    if date_label:
        detail["source_date_label_as_published"] = date_label
        detail["source_date_label_origin"] = date_label_origin
        detail["source_as_of_normalization"] = "保留为来源日期标签；未经证据确认不视为精确统计截止日"
    if classification == "status_event" and detail.get("event_at"):
        detail["event_effective_date_as_published"] = detail["event_at"]
    locator = (detail.get("source_row") or detail.get("source_locator") or
               detail.get("source_paragraph") or detail.get("source_cell_or_tr") or "")
    if family != "province" and not locator and classification != "status_event":
        raise ValueError(f"Source location missing: {row['institution_name']}")
    canonical_file = path.relative_to(DATA).as_posix()
    detail.update({"source_package": family, "source_file_as_supplied": row["source_file"],
                   "evidence_type_as_supplied": row["evidence_type"],
                   "source_path": canonical_file, "source_sha256": source_sha,
                   "source_location_as_retained": locator,
                   "source_period_label_as_published": date_label,
                   "source_field_audit_status": "verified_by_package" if family != "province" else "name_sequence_rating_paragraph_verified",
                   "institution_identity_verified": False, "current_operating_status_verified": False})
    stable = "\0".join((family, canonical_file, source_sha, locator, row["city"], row["institution_name"]))
    return {"observation_id": "obs-" + sha256(stable.encode("utf-8"))[:24],
            "source_family": family, "classification": classification,
            "institution_identity_verified": False, "current_operating_status": "unknown",
            "date_label_as_published": date_label, **{key: row[key] for key in FIELDS if key != "details"},
            "source_as_of": "", "source_file": canonical_file,
            "evidence_type": classification, "details": detail}


def retained_date_label(row: dict[str, str], detail: dict, classification: str) -> tuple[str, str]:
    if classification == "status_event":
        for key in ("event_at", "source_period", "source_period_as_published"):
            if detail.get(key):
                return str(detail[key]), key
    if row.get("source_as_of"):
        return row["source_as_of"], "subpackage_source_as_of"
    for key in ("source_period", "source_period_as_published", "rating_period_as_published"):
        if detail.get(key):
            return str(detail[key]), key
    return "", ""


def normalize_scan_observation(row: dict) -> dict:
    if tuple(row.keys()) != FIELDS:
        raise ValueError("Unexpected scan-review observation schema")
    detail = json.loads(row["details"])
    source_as_of = row["source_as_of"]
    source_path = data_path("east-scan", row["source_file"])
    source_sha = detail.get("source_sha256")
    require_sha(source_path.read_bytes(), source_sha)
    if detail.get("human_reviewed") is not False or detail.get("machine_text_verified") is not False:
        raise ValueError("Scan transcription review boundary changed")
    for location in detail.get("source_locations", []):
        location_path = data_path("east-scan", location["original_file"])
        require_sha(location_path.read_bytes(), location["source_sha256"])
        if not location.get("bbox_px_xyxy_top_left_origin"):
            raise ValueError("Scan transcription location missing pixel bounds")
        location["original_source_path"] = location_path.relative_to(DATA).as_posix()
        location["visual_reference_source_path"] = data_path("east-scan", location["visual_reference_file"]).relative_to(DATA).as_posix()
        crop_path = data_path("east/scan-review", location["crop_file"])
        require_sha(crop_path.read_bytes(), location["crop_sha256"])
        location["crop_source_path"] = crop_path.relative_to(DATA).as_posix()
        location["normalized_path_base"] = "data/private/guangdong-eldercare-source"
        location["original_path_bases"] = {"original_file": "research-batch13/east",
            "visual_reference_file": "research-batch13/east", "crop_file": "research-batch13/east/scan-review"}
    raw_class = detail["observation_class"]
    classification = {
        "rating_subset": "scan_rating_subset",
        "rating_eligibility_event": "scan_rating_eligibility_event",
        "inspection_event": "scan_inspection_event",
    }.get(raw_class)
    if not classification:
        raise ValueError(f"Unhandled scan transcription class: {raw_class}")
    date_label, date_label_origin = retained_date_label(row, detail, "status_event" if raw_class.endswith("event") else raw_class)
    if detail.get("event_year_inferred"):
        date_label, date_label_origin = source_as_of, "subpackage_source_as_of_with_inference_notice"
        detail["date_label_includes_inferred_year"] = True
    detail["source_as_of_as_supplied_by_subpackage"] = source_as_of
    detail["source_file_as_supplied"] = row["source_file"]
    detail["evidence_type_as_supplied"] = row["evidence_type"]
    detail["source_date_label_as_published"] = date_label
    detail["source_date_label_origin"] = date_label_origin
    detail["source_as_of_normalization"] = "扫描转录日期仅作来源日期标签；不是统计截止日"
    detail["source_path"] = source_path.relative_to(DATA).as_posix()
    detail["source_package"] = "east-scan-review"
    detail["institution_identity_verified"] = False
    detail["current_operating_status_verified"] = False
    locator = json.dumps(detail.get("source_locations", []), ensure_ascii=False, sort_keys=True)
    stable = "\0".join((classification, detail["source_sha256"], row["city"], row["institution_name"], locator))
    return {"observation_id": "scan-" + sha256(stable.encode("utf-8"))[:24],
            "source_family": "east-scan-review", "classification": classification,
            "institution_identity_verified": False, "current_operating_status": "unknown",
            "date_label_as_published": date_label, **{key: row[key] for key in FIELDS if key != "details"},
            "source_as_of": "", "source_file": source_path.relative_to(DATA).as_posix(),
            "evidence_type": "model_visual_review:" + raw_class, "details": detail}


def normalize_event(row: dict) -> dict:
    source = row["source_file"]
    relative = Path(source)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Invalid west-north event source path")
    path = DATA / relative
    require_sha(path.read_bytes(), row["source_sha256"])
    row["source_file"] = relative.as_posix()
    row["effective_date_label_as_published"] = row.get("effective_period_as_published", "")
    row["date_label_as_published"] = row.get("effective_period_as_published", "")
    row["source_date_label_origin"] = "effective_period_as_published"
    row["source_family"] = "west-north"
    row["event_identity_scope"] = "aggregate_only" if row["event_type"] == "aggregate_roster_merger_report" else "source_event_only"
    return row


def existing_baseline() -> tuple[list[dict[str, str]], int, int]:
    raw = BASELINE.read_bytes()
    require_sha(raw, BASELINE_SHA)
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    if len(rows) != 2348 or tuple(rows[0].keys()) != FIELDS:
        raise ValueError("Reviewed batch12 baseline differs")
    missing = 0
    for row in rows:
        detail = json.loads(row["details"])
        missing += not bool(detail.get("source_sha256"))
    if missing != 821:
        raise ValueError("Legacy per-row source SHA backlog differs from reviewed pipeline")
    return rows, len(rows), missing


def make_ledger(records: list[dict], events: list[dict]) -> list[dict]:
    ledger = records + [
        {"observation_id": "evt-" + sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode("utf-8"))[:24],
         "source_family": row.get("source_family", "west-north"), "classification": "status_event",
         "institution_identity_verified": row.get("institution_identity_verified", False),
         "current_operating_status": "unknown", "date_label_as_published": row.get("effective_period_as_published", ""),
         "city": row.get("city", ""), "institution_name": row.get("institution_name", ""),
         "source_url": row.get("source_url", ""), "source_published_at": row.get("source_published_at", ""),
         "source_as_of": "", "source_file": row.get("source_file", ""), "evidence_type": "status_event",
         "details": row} for row in events]
    ids = [row["observation_id"] for row in ledger]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate stable observation IDs")
    return ledger


def city_matrix(legacy: list[dict], records: list[dict], events: list[dict], scan_records: list[dict]) -> list[dict]:
    baseline_counts = Counter(row["city"] for row in legacy)
    record_counts = defaultdict(Counter)
    for row in records:
        if row["city"] not in CITIES and row["city"]:
            raise ValueError("Unexpected city outside Guangdong province list")
        record_counts[row["city"]][row["classification"]] += 1
    for event in events:
        record_counts[event.get("city", "")]["status_event"] += 1
    for row in scan_records:
        record_counts[row["city"]][row["classification"]] += 1
    source_rows = records + events + scan_records
    by_city: dict[str, list[dict]] = defaultdict(list)
    for row in source_rows:
        by_city[row.get("city", "")].append(row)
    coverage = json.loads((PROVINCE / "aggregate-coverage-notes.json").read_text(encoding="utf-8"))
    if [row["city"] for row in coverage["cities"]] != list(CITIES):
        raise ValueError("Coverage notes must list exactly all 21 cities in canonical order")
    coverage_by_city = {row["city"]: row for row in coverage["cities"]}
    for city, note in coverage_by_city.items():
        for key in ("source_scope", "known_source_periods", "specific_gaps", "evidence_paths"):
            if not isinstance(note.get(key), list) or not note[key]:
                raise ValueError(f"Missing substantive city coverage note: {city}/{key}")
        for filename in note["evidence_paths"]:
            data_path("province", filename)
    return [{"city": city, "batch12_observations": baseline_counts[city],
             "batch13_cleaned_observations": sum(record_counts[city].values()),
             "roster_candidates": record_counts[city]["current_roster_candidate"],
             "historical_roster_observations": record_counts[city]["historical_roster"],
             "special_subset_observations": record_counts[city]["special_subset"],
             "republication_candidates": record_counts[city]["republication_candidate"],
             "status_events": record_counts[city]["status_event"],
             "scan_transcriptions_pending_human_review": sum(record_counts[city][kind] for kind in
                 ("scan_rating_subset", "scan_rating_eligibility_event", "scan_inspection_event")),
             "source_families": json.dumps(sorted({row["source_family"] for row in by_city[city]}), ensure_ascii=False),
             "date_labels_as_published": json.dumps(sorted({row["date_label_as_published"] for row in by_city[city]
                 if row.get("date_label_as_published")}), ensure_ascii=False),
             "source_files": json.dumps(sorted({row["source_file"] for row in by_city[city]}), ensure_ascii=False),
             "source_scope": " | ".join(coverage_by_city[city]["source_scope"]),
             "known_source_periods": " | ".join(coverage_by_city[city]["known_source_periods"]),
             "specific_gaps": " | ".join(coverage_by_city[city]["specific_gaps"]),
             "coverage_evidence_paths": json.dumps(coverage_by_city[city]["evidence_paths"], ensure_ascii=False),
             "same_time_full_current_roster_proven": "false",
             "review_note": ("本批有分类来源观察，计数和来源文件仅描述抓取/留存证据，不统计独立机构；"+
                             "当前在营与全市同口径完整性未证明。" if by_city[city] else
                             "本批未增加已定位来源观察；保留batch12基线来源行，当前在营与全市同口径完整性未证明。")}
            for city in CITIES]


def build() -> tuple[dict[str, bytes], dict]:
    legacy, legacy_count, missing_sha = existing_baseline()
    records, events, scan_records, package_inputs = class_and_families()
    coverage_path = PROVINCE / "aggregate-coverage-notes.json"
    coverage_data = coverage_path.read_bytes()
    require_sha(coverage_data, "1c86846700a2005723875e825b08cd9eaa156634df77934754e3344bc9b242d8")
    package_inputs.append({"path": "province/aggregate-coverage-notes.json", "sha256": sha256(coverage_data)})
    company_path = PACKAGE / "company-raw-audit"
    company_auditor = load_module("batch13_company_response_audit", company_path / "audit_raw_registration.py")
    company_outputs = company_auditor.output_bytes()
    for filename, expected_bytes in company_outputs.items():
        actual = (company_path / filename).read_bytes()
        if actual != expected_bytes:
            raise ValueError(f"Company response audit differs: {filename}")
        package_inputs.append({"path": "company-raw-audit/" + filename, "sha256": sha256(actual)})
    company_report = json.loads(company_outputs["audit-report.json"])
    if (company_report["entities_checked"], company_report["raw_responses_sha256_matched"],
        company_report["registration_field_checks"], company_report["mismatches"]) != (583, 583, 14575, 0):
        raise ValueError("Company response audit count boundary changed")
    company_summary = {key: company_report[key] for key in (
        "entities_checked", "in_scope_institution_or_direct_care", "raw_responses_sha256_matched",
        "registration_field_checks", "binding_methods", "ledger_binding_statuses", "mismatches", "limitations")}
    ledger = make_ledger(records, events)
    class_counts = dict(sorted(Counter(row["classification"] for row in ledger).items()))
    expected = {"current_roster_candidate": 43, "historical_roster": 174, "special_subset": 120,
                "republication_candidate": 121, "status_event": 5}
    if class_counts != expected:
        raise ValueError(f"Batch13 class partition differs: {class_counts}")
    legacy_key_counter = Counter((row["city"], re.sub(r"\s+", "", unicodedata.normalize("NFKC", row["institution_name"]))) for row in legacy)
    roster_matches = sum(bool(legacy_key_counter[(row["city"], re.sub(r"\s+", "", unicodedata.normalize("NFKC", row["institution_name"])))])
                         for row in records if row["classification"] == "current_roster_candidate")
    matrix = city_matrix(legacy, records, events, scan_records)
    fields = ("observation_id", "source_family", "classification", "institution_identity_verified",
              "current_operating_status", "date_label_as_published", *FIELDS)
    current_candidates = [row for row in records if row["classification"] == "current_roster_candidate"]
    merged = legacy + [{key: row[key] if key != "details" else json.dumps(row[key], ensure_ascii=False, separators=(",", ":"))
                        for key in FIELDS} for row in current_candidates]
    report = {"legacy_baseline_rows": legacy_count, "batch13_observations": len(ledger),
              "class_counts": class_counts, "current_roster_candidate_rows": len(current_candidates),
              "candidate_rows_with_exact_city_normalized_name_in_baseline": roster_matches,
              "cumulative_source_observations_including_candidate_roster": len(merged),
              "legacy_rows_missing_source_sha": missing_sha,
              "legacy_rows_with_source_sha_recorded_but_not_reverified_here": legacy_count - missing_sha,
              "approved_institution_identities": 0, "cities_proven_complete_current_roster": 0,
              "current_operating_status_verified": False,
              "batch13_city_unknown_rows": sum(not row["city"] for row in ledger),
              "batch13_city_unknown_observations": [{"institution_name": row["institution_name"],
                  "source_url": row["source_url"], "source_file": row["source_file"],
                  "source_sha256": row["details"].get("source_sha256", "")}
                  for row in ledger if not row["city"]],
              "scan_transcription_observations_separate": len(scan_records),
              "scan_transcription_human_reviewed": False,
              "company_raw_response_audit": company_summary,
              "date_rule": "本轮463条机器定位观察与14条扫描转录单独登记来源日期标签；只把证据确认的统计截止日写入source_as_of（本批均留空）。旧2348条基线不在本轮重写日期语义。",
              "date_label_scope": "严格规范限于本轮463条机器定位观察及独立14条扫描转录；累计名录候选中的旧2348条原行原样保留，日期语义待核。",
              "city_count": len(CITIES), "input_package_artifacts": sorted(package_inputs, key=lambda item: item["path"]),
              "unresolved_data": ["揭西扫描件14条已完成模型目视转录和版面定位；尚无人工逐字复核，仍需人工复核。",
                                  "batch12仍有821条观察无逐条原件SHA；名称候选匹配不补足SHA。",
                                  "1527条基线虽有SHA字段，本次没有重新取得其全部关联原件复算。",
                                  "广东省1615条审核开放数据未获逐机构明细；未提交申请。",
                                  "清远市级候选原件返回412；未绕过访问控制。"]}
    city_rows = matrix
    outputs: dict[str, bytes] = {
        "classified-observations.jsonl": jsonl_bytes(ledger),
        "records.jsonl": jsonl_bytes(records),
        "events.jsonl": jsonl_bytes(events),
        "scan-review-observations.jsonl": jsonl_bytes(scan_records),
        "scan-review-observations.csv": csv_bytes([
            {**{key: row[key] for key in fields if key != "details"},
             "details": json.dumps(row["details"], ensure_ascii=False, separators=(",", ":"))}
            for row in scan_records], fields),
        "classified-observations.csv": csv_bytes([{**{key: row[key] for key in fields if key != "details"},
                                                    "details": json.dumps(row["details"], ensure_ascii=False, separators=(",", ":"))}
                                                   for row in ledger], fields),
        "cumulative-roster-candidates.csv": csv_bytes(merged, FIELDS),
        "city-cleaning-matrix.csv": csv_bytes(city_rows, ("city", "batch12_observations", "batch13_cleaned_observations",
                                                             "roster_candidates", "historical_roster_observations",
                                                             "special_subset_observations", "republication_candidates",
                                                             "status_events", "scan_transcriptions_pending_human_review",
                                                             "source_families", "date_labels_as_published", "source_files",
                                                             "source_scope", "known_source_periods", "specific_gaps", "coverage_evidence_paths",
                                                             "same_time_full_current_roster_proven", "review_note")),
        "report.json": packed(report),
        "company-raw-audit-summary.json": packed(company_summary),
        "city-coverage-notes.json": coverage_data,
    }
    # A reproducible list of the legacy holes, rather than treating name matches as SHA repairs.
    legacy_gaps = []
    for line, row in enumerate(legacy, 2):
        detail = json.loads(row["details"])
        if not detail.get("source_sha256"):
            legacy_gaps.append({"baseline_csv_line": line, "city": row["city"],
                                "institution_name": row["institution_name"], "source_url": row["source_url"],
                                "source_file_as_supplied": row["source_file"],
                                "source_published_at": row["source_published_at"],
                                "source_as_of_as_supplied": row["source_as_of"],
                                "review_reason": "逐条原件SHA缺失；名称匹配不等于URL/原件版本/字段位置已验证。",
                                "review_status": "unresolved"})
    outputs["legacy-source-sha-gaps.csv"] = csv_bytes(legacy_gaps, (
        "baseline_csv_line", "city", "institution_name", "source_url", "source_file_as_supplied",
        "source_published_at", "source_as_of_as_supplied", "review_reason", "review_status"))
    date_rows = []
    for row in ledger + scan_records:
        if not row["date_label_as_published"]:
            continue
        detail = row["details"]
        supplied_detail = detail.get("details", detail)
        original_as_of = supplied_detail.get("source_as_of_as_supplied_by_subpackage", "")
        date_rows.append({"observation_id": row["observation_id"], "city": row["city"],
            "institution_name": row["institution_name"], "classification": row["classification"],
            "subpackage_source_as_of": original_as_of,
            "date_label_as_published": row["date_label_as_published"],
            "date_label_origin": supplied_detail.get("source_date_label_origin", ""),
            "normalized_source_as_of": row["source_as_of"],
            "normalization_action": "moved_from_source_as_of_to_date_label" if original_as_of else "carried_as_source_period_label",
            "source_file": row["source_file"]})
    outputs["date-label-register.csv"] = csv_bytes(date_rows, (
        "observation_id", "city", "institution_name", "classification", "subpackage_source_as_of",
        "date_label_as_published", "date_label_origin", "normalized_source_as_of", "normalization_action", "source_file"))

    source_files = {}
    for row in ledger:
        detail = row["details"]
        source_sha = detail.get("source_sha256") or detail.get("details", {}).get("source_sha256")
        if not source_sha:
            raise ValueError("Classified source missing nested SHA")
        path = DATA / row["source_file"]
        require_sha(path.read_bytes(), source_sha)
        record = source_files.setdefault(row["source_file"], {"source_file": row["source_file"],
            "sha256": source_sha, "bytes": path.stat().st_size, "source_urls": set(),
            "source_family": row["source_family"], "rows": 0, "classes": Counter()})
        if record["sha256"] != source_sha:
            raise ValueError("One source path bound to multiple SHA values")
        record["source_urls"].add(row["source_url"])
        record["rows"] += 1
        record["classes"][row["classification"]] += 1
    outputs["observation-source-files.csv"] = csv_bytes([
        {**{key: value for key, value in item.items() if key not in {"source_urls", "classes"}},
         "source_urls": " | ".join(sorted(item["source_urls"])),
         "classes": json.dumps(item["classes"], ensure_ascii=False, sort_keys=True)}
        for _, item in sorted(source_files.items())],
        ("source_file", "sha256", "bytes", "source_family", "rows", "source_urls", "classes"))
    scan_docs = json.loads((EAST / "scan-review/source-register.json").read_text(encoding="utf-8"))
    untranscribed = [item for item in json.loads((EAST / "source-register.json").read_text(encoding="utf-8"))
                    if item["source_id"] in {"jiexi-stars-2025-pdf", "jiexi-inspection-2026-image1",
                                              "jiexi-inspection-2026-image2", "jiexi-inspection-2026-image3"}]
    if len(untranscribed) != 4 or len(scan_docs) != 4:
        raise ValueError("Known scan source register shape differs")
    outputs["scan-source-review-queue.csv"] = csv_bytes([
        {"source_id": item["source_id"], "source_url": item["final_url"],
         "source_file": "research-batch13/east/" + item["raw_file"], "source_sha256": item["sha256"],
         "observation_references": sum(any(doc["source_id"] == item["source_id"]
             for doc in row["details"].get("source_locations", [])) for row in scan_records),
         "review_status": "model_transcribed_pending_human_visual_review",
         "human_reviewed": "false", "machine_text_verified": "false",
         "note": "已独立生成模型目视转录及像素定位；需人工逐字复核，未纳入463条机器定位分类观察。"}
        for item in untranscribed], ("source_id", "source_url", "source_file", "source_sha256",
            "observation_references", "review_status", "human_reviewed", "machine_text_verified", "note"))

    # Persist totals only after all evidence ledgers exist.
    report["date_label_register_rows"] = len(date_rows)
    report["source_as_of_migrated_rows"] = sum(row["normalization_action"] == "moved_from_source_as_of_to_date_label" for row in date_rows)
    report["period_label_only_rows"] = sum(row["normalization_action"] == "carried_as_source_period_label" for row in date_rows)
    report["raw_source_files_bound_to_batch13_observations"] = len(source_files)
    report["scan_sources_requiring_separate_transcription_or_review"] = len(untranscribed)
    report["city_matrix_row_total_excludes_unknown_city_rows"] = sum(int(row["batch13_cleaned_observations"]) for row in city_rows)
    outputs["report.json"] = packed(report)
    outputs["README.md"] = ("""# 第十三批统一数据清洗包

用途：私有来源观察审核，不是全省当前在营名录；不供网站直接读取。

## 先读哪些文件

| 文件 | 内容与口径 |
| --- | --- |
| report.md / report.json | 人类可读报告与可复算计数 |
| classified-observations.csv / .jsonl | 本轮463条分类来源观察；原件和字段定位按来源包校验 |
| records.jsonl / events.jsonl | 458条非事件观察与5条事件，分类保留 |
| scan-review-observations.csv / .jsonl | 独立14条扫描转录；模型目视，未人工复核、未机器逐字验证 |
| cumulative-roster-candidates.csv | 旧2348条原样保留＋43条区级名录候选，共2391来源行 |
| city-cleaning-matrix.csv | 21市分类计数、来源文件、日期标签与覆盖缺口；不含4条城市未知观察 |
| observation-source-files.csv | 本轮463条观察绑定的原件路径、SHA、字节数及行引用数 |
| date-label-register.csv | 日期原值、日期标签、来源字段及动作；原source_as_of迁移与资料期标签分开 |
| legacy-source-sha-gaps.csv | 旧基线821条缺逐条原件SHA的待核行，不通过名称匹配填补 |
| scan-source-review-queue.csv | 4份已转录扫描原件的人工复核队列 |
| manifest.json | 固定基线、构建器与输入/输出哈希；新内容写独立不可覆盖版本 |

## 关键规则

1. 观察、名称候选、登记主体和养老机构实体是不同对象。43条区级名录候选中28条有旧基线同城规范名称候选，15条无此候选；均不等于新增机构。
2. 本轮463条机器定位观察与14条扫描转录将日期标签与统计截止日分开。年度、检查日、决定日和附件名日期不是统计截止日。本轮标准source_as_of均留空。旧2348条基线原行不重写，日期语义尚未重核。
3. 174条历史、120条专项、121条重复发布候选及5条事件不追加进累计名录候选。扫描14条另存，不冒充机器核实的文字。
4. 21市矩阵不包含省级星级表4条城市未知记录；见report.json逐条名称和来源。不凭括号内运营主体名推断地点。
5. 云浮27条只按名称核对旧候选；阳江94条另外核地址/床位。重复发布候选不证明实体相同。阳东11→5为区级汇总事件，不能自动生成6家关闭。
6. 原包details、来源原件、旧批次与网站均不覆盖。source_file以data/private/guangdong-eldercare-source为根；子包原路径和类别另行保留。个人联系字段不复制到新增机构审核导出，原件仍私有。

## 离线复算

在项目根目录运行`python -X utf8 scripts/batch13_aggregate_cleaning.py --check`。
脚本读取本地原件与子包校验器，不访问网络、不使用付费查询或密钥。扫描包检查SHA/版面定位/裁切/导出一致性，不能证明扫描文字准确。
""").encode("utf-8")
    lines = ["# 广东养老来源数据清洗报告", "", "归档口径：2026-11-15（Asia/Shanghai）。原抓取时间按各来源日志保留。", "",
             "本轮完成已有可定位数据的结构化、分类和可复算归档；不是全省机构实体去重或当前在营核验结果。", "",
             "| 类别 | 本轮来源观察 | 处理 |", "| --- | ---: | --- |",
             "| 区级名录候选 | 43 | 累计候选来源行追加 |",
             "| 历史名录 | 174 | 与名录候选分开 |", "| 星级/评估等专项 | 120 | 与全量名录分开 |",
             "| 重复发布候选 | 121 | 保留原证据，不重复追加名录候选 |", "| 状态/检查/汇总事件 | 5 | 不自动改实体当前状态 |",
             "| 机器可定位分类小计 | 463 | 原件定位/子包字段核验 |",
             "| 扫描模型目视转录（另列） | 14 | 获星9、评审资格事件1、检查事件4；需人工复核 |", "",
             "旧2348条名录来源观察保持原样；加43条候选后累计2391条。来源观察不是独立机构；没有身份合并批准，也没有城市已证实同一时点全量当前在营。", "",
             f"本轮463条绑定{len(source_files)}份原件；日期登记{len(date_rows)}条，其中原source_as_of迁移{report['source_as_of_migrated_rows']}条、原本留空而另有资料期标签{report['period_label_only_rows']}条。日期规范范围不覆盖旧2348条。", "",
             "## 21市分类矩阵", "", "| 市 | 旧基线行 | 本轮名录候选 | 历史 | 专项 | 重复候选 | 事件 | 扫描转录 |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for item in city_rows:
        lines.append("| " + " | ".join(str(item[key]) for key in ("city", "batch12_observations", "roster_candidates",
            "historical_roster_observations", "special_subset_observations", "republication_candidates", "status_events",
            "scan_transcriptions_pending_human_review")) + " |")
    lines += ["", "上表本轮共473条，另有4条省级星级观察城市未知，共477条（463＋14）；不把未知城市按企业名或猜测分配。", "",
              "## 仍需审核的证据", ""]
    lines.extend("- " + item for item in report["unresolved_data"])
    lines += ["", "另：583个工商登记主体的既有清洗层与逐原件审计独立于机构来源观察；登记存续不证明服务点现时在营。旧基线821条缺SHA与1527条本轮未逐份复算的原件证据不能标为已补齐。", "",
              "本包只处理数据，未改变网站、公开目录、业务功能或部署。原件和旧版本保留。"]
    outputs["report.md"] = ("\n".join(lines) + "\n").encode("utf-8")
    generator_sha = sha256(Path(__file__).read_bytes())
    content_id = sha256(packed({"generator_sha256": generator_sha,
                               "outputs": {name: sha256(value) for name, value in sorted(outputs.items())}}))
    version_id = "v1-" + content_id[:16]
    manifest = {"version_id": version_id, "version_path": "versions/" + version_id,
                "generator": "scripts/batch13_aggregate_cleaning.py",
                "generator_sha256": generator_sha,
                "baseline": {"path": BASELINE.relative_to(DATA).as_posix(), "sha256": BASELINE_SHA, "rows": legacy_count},
                "package_inputs": sorted(package_inputs, key=lambda item: item["path"]),
                "output_sha256": {name: sha256(value) for name, value in sorted(outputs.items())},
                "summary": report}
    outputs["manifest.json"] = packed(manifest)
    return outputs, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs, report = build()
    manifest = json.loads(outputs["manifest.json"])
    destination = OUTPUT_ROOT / manifest["version_path"]
    if args.check or destination.exists():
        if not destination.is_dir() or {path.name for path in destination.iterdir()} != set(outputs):
            raise ValueError(f"Archive file set differs: {destination}")
        for filename, expected in outputs.items():
            if (destination / filename).read_bytes() != expected:
                raise ValueError(f"Archive bytes differ: {filename}")
        action = "verified"
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".staging-", dir=destination.parent) as temp:
            staging = Path(temp) / "version"
            staging.mkdir()
            for filename, content in outputs.items():
                with (staging / filename).open("xb") as stream:
                    stream.write(content)
            os.replace(staging, destination)
        action = "created"
    print(json.dumps({"action": action, "path": destination.relative_to(ROOT).as_posix(),
                      "summary": {key: value for key, value in report.items() if key != "input_package_artifacts"}},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
