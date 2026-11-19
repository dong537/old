"""Additively archive batch14 source observations; never publish or approve entities."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import tempfile
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
PACKAGE = DATA / "research-batch14"
BASELINE = DATA / "research-batch13/cleaned/versions/v1-5aa4fce7142b23b2"
BASELINE_MANIFEST_SHA = "37013b52e370cb54c21e0f7f11f590212f3df6a34c546973e7d1746842c414c8"
FIELDS = ("city", "institution_name", "source_url", "source_published_at", "source_as_of",
          "source_file", "evidence_type", "details")
CLASSES = ("current_roster_candidate", "historical_roster", "special_subset",
           "republication_candidate", "status_event")
CITIES = ("广州", "深圳", "珠海", "汕头", "佛山", "韶关", "河源", "梅州", "惠州", "东莞",
          "中山", "江门", "阳江", "湛江", "茂名", "肇庆", "清远", "潮州", "揭阳", "汕尾", "云浮")
BATCH14_FAMILIES = ("pearl", "east", "west-north")
CLASSIFIED_FIELDS = ("observation_id", "source_family", "classification", "institution_identity_verified",
                     "current_operating_status", "date_label_as_published", *FIELDS)


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def packed(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def csv_bytes(rows: list[dict], fields: tuple) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n", extrasaction="raise")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
                         if isinstance(value, (dict, list)) else value for key, value in row.items()})
    return stream.getvalue().encode("utf-8-sig")


def jsonl_bytes(rows: list[dict]) -> bytes:
    return "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode("utf-8")


def normalize_observation(row: dict, family: str, data_root: Path = DATA) -> dict:
    if tuple(row) != FIELDS:
        raise ValueError("Unexpected eight-column observation schema")
    detail = json.loads(row["details"])
    if not isinstance(detail, dict):
        raise ValueError("Observation details must be an object")
    classification = detail.get("classification")
    if classification not in CLASSES:
        raise ValueError("Unknown observation classification")
    relative = Path(row["source_file"])
    path = (data_root / relative).resolve()
    expected_prefix = f"research-batch14/{family}/"
    if (relative.is_absolute() or ".." in relative.parts or
            not relative.as_posix().startswith(expected_prefix) or
            not path.is_relative_to(data_root.resolve())):
        raise ValueError("Invalid observation source path outside batch/family")
    digest = detail.get("source_sha256", "")
    if not re.fullmatch(r"[a-f0-9]{64}", digest) or sha(path.read_bytes()) != digest:
        raise ValueError("Observation raw source SHA mismatch")
    locator = detail.get("source_locator") or detail.get("locator") or detail.get("source_row")
    if not locator:
        raise ValueError("Observation physical source locator is missing")
    if row["source_as_of"]:
        raise ValueError("Batch14 source_as_of has no approved independent cutoff evidence")
    if row["city"] not in CITIES or not row["institution_name"].strip():
        raise ValueError("Observation city/name is missing or outside reviewed scope")
    label = (detail.get("source_period_label") or detail.get("period_label") or
             detail.get("source_period_as_published") or "")
    detail = {**detail, "source_package": "research-batch14/" + family,
              "evidence_type_as_supplied": row["evidence_type"], "source_location_as_retained": locator,
              "institution_identity_verified": False, "current_operating_status_verified": False}
    stable = "\0".join((family, relative.as_posix(), digest, str(locator), row["city"],
                         row["institution_name"], classification))
    result = {"observation_id": "obs-" + sha(stable.encode("utf-8"))[:24],
              "source_family": family, "classification": classification,
              "institution_identity_verified": False, "current_operating_status": "unknown",
              "date_label_as_published": label, **row}
    result.update(source_file=relative.as_posix(), evidence_type=classification, details=detail)
    return result


def append_roster_candidates(legacy: list[dict], classified: list[dict]) -> list[dict]:
    return [dict(row) for row in legacy] + [
        {key: json.dumps(row[key], ensure_ascii=False, separators=(",", ":")) if key == "details" else row[key]
         for key in FIELDS}
        for row in classified if row["classification"] == "current_roster_candidate"]


def retained_field_rows(observations: list[dict]) -> list[dict]:
    claims = []
    for row in observations:
        detail = row["details"]
        raw_fields = detail.get("raw_fields")
        if isinstance(raw_fields, list):
            for item in raw_fields:
                if not isinstance(item, dict) or "value_raw" not in item:
                    raise ValueError("Raw field evidence is malformed")
                claims.append({**field_provenance(row, item),
                               "field_as_published": item.get("header_text_raw") or item.get("header_raw") or "",
                               "value_as_published": item["value_raw"],
                               "cell_locator": item.get("cell_xpath") or item.get("cell") or ""})
            continue
        raw_values = detail.get("raw_values")
        if isinstance(raw_values, dict):
            for name, value in raw_values.items():
                claims.append({**field_provenance(row, detail), "field_as_published": name,
                               "value_as_published": value,
                               "cell_locator": detail.get("source_locator") or detail.get("locator") or ""})
    return claims


def field_provenance(row: dict, evidence: dict) -> dict:
    return {"observation_id": row["observation_id"], "city": row["city"],
            "institution_name_as_published": row["institution_name"],
            "classification": row["classification"], "source_file": row["source_file"],
            "source_sha256": row["details"]["source_sha256"],
            "source_locator": (evidence.get("cell_xpath") or evidence.get("source_locator") or
                               evidence.get("locator") or evidence.get("source_row") or "")}


def verified_input(path: Path, expected: str, inputs: dict) -> bytes:
    raw = path.read_bytes()
    if sha(raw) != expected:
        raise ValueError("Pinned input SHA mismatch: " + str(path))
    inputs[path.relative_to(DATA).as_posix()] = expected
    return raw


def verified_package_input(relative: str, declared: dict, inputs: dict,
                           data_root: Path = DATA, package_root: Path = PACKAGE) -> Path:
    candidate = Path(relative)
    path = (data_root / candidate).resolve()
    if (candidate.is_absolute() or ".." in candidate.parts or
            not candidate.as_posix().startswith("research-batch14/") or
            not path.is_relative_to(package_root.resolve())):
        raise ValueError("Invalid batch14 package input path")
    expected = declared.get(candidate.as_posix())
    if not expected:
        raise ValueError("Batch14 package input is not pinned: " + candidate.as_posix())
    raw = path.read_bytes()
    if sha(raw) != expected:
        raise ValueError("Pinned input SHA mismatch: " + candidate.as_posix())
    inputs[path.relative_to(data_root.resolve()).as_posix()] = expected
    return path


def build() -> tuple[dict[str, bytes], dict]:
    inputs = {}
    prior_manifest = json.loads(verified_input(BASELINE / "manifest.json", BASELINE_MANIFEST_SHA, inputs))
    for name, digest in prior_manifest["output_sha256"].items():
        verified_input(BASELINE / name, digest, inputs)
    legacy = read_csv(BASELINE / "cumulative-roster-candidates.csv")
    if len(legacy) != 2391 or any(tuple(row) != FIELDS for row in legacy):
        raise ValueError("Reviewed 2391-row legacy baseline changed")
    spec_path = PACKAGE / "cleaning-inputs.json"
    spec_raw = spec_path.read_bytes()
    inputs[spec_path.relative_to(DATA).as_posix()] = sha(spec_raw)
    spec = json.loads(spec_raw)
    if spec["baseline_manifest_sha256"] != BASELINE_MANIFEST_SHA:
        raise ValueError("Batch14 source contract references a different baseline")
    if tuple(part["family"] for part in spec["partitions"]) != BATCH14_FAMILIES:
        raise ValueError("Batch14 input contract must include each reviewed partition exactly once")
    referenced = []
    for part in spec["partitions"]:
        referenced.extend(part["observations"])
        referenced.extend(part.get("scans", []))
        referenced.extend(part["coverage"])
    if len(referenced) != len(set(referenced)) or set(referenced) != set(spec["inputs_sha256"]):
        raise ValueError("Batch14 input hashes must exactly cover referenced observation, scan, and coverage files")
    for relative in sorted(referenced):
        verified_package_input(relative, spec["inputs_sha256"], inputs)
    observations = []
    scans = []
    coverage = []
    for part in spec["partitions"]:
        family = part["family"]
        for filename in part["observations"]:
            path = verified_package_input(filename, spec["inputs_sha256"], inputs)
            observations.extend(normalize_observation(row, family) for row in read_csv(path))
        for filename in part.get("scans", []):
            path = verified_package_input(filename, spec["inputs_sha256"], inputs)
            for row in read_csv(path):
                normalized = normalize_observation(row, family)
                normalized["details"].update(human_reviewed=False, machine_text_verified=False,
                                              scan_transcription_separate=True)
                scans.append(normalized)
        coverage.append({"family": family, "evidence_files": [
            {"path": relative, "sha256": spec["inputs_sha256"][relative]}
            for relative in part["coverage"]
        ]})
    ids = [row["observation_id"] for row in observations + scans]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate physical observation IDs in batch14")
    for row in observations + scans:
        source_path = row["source_file"]
        source_sha = row["details"]["source_sha256"]
        prior_sha = inputs.setdefault(source_path, source_sha)
        if prior_sha != source_sha:
            raise ValueError("Original source SHA conflicts with a pinned package input: " + source_path)
    counts = dict(sorted(Counter(row["classification"] for row in observations).items()))
    if counts != spec["expected_class_counts"] or len(scans) != spec["expected_scan_rows"]:
        raise ValueError("Classified observation/scan counts differ from reviewed contract")
    merged = append_roster_candidates(legacy, observations)
    old_classified = read_csv(BASELINE / "classified-observations.csv")
    combined_classified = old_classified + observations
    old_scans = read_csv(BASELINE / "scan-review-observations.csv")
    combined_scans = old_scans + scans
    date_rows = [{"observation_id": row["observation_id"], "city": row["city"],
                  "institution_name": row["institution_name"], "classification": row["classification"],
                  "date_label_as_published": row["date_label_as_published"], "normalized_source_as_of": "",
                  "source_file": row["source_file"]} for row in observations + scans]
    field_rows = retained_field_rows(observations + scans)
    source_rows = []
    for filename in sorted({row["source_file"] for row in observations + scans}):
        linked = [row for row in observations + scans if row["source_file"] == filename]
        digests = {row["details"]["source_sha256"] for row in linked}
        if len(digests) != 1:
            raise ValueError("One original source path has multiple hashes")
        source_rows.append({"source_file": filename, "sha256": digests.pop(),
                            "bytes": (DATA / filename).stat().st_size,
                            "machine_located_observations": sum(row in observations for row in linked),
                            "scan_transcriptions": sum(row in scans for row in linked)})
    matrix = []
    for city in CITIES:
        current = [row for row in observations if row["city"] == city]
        matrix.append({"city": city, "prior_roster_candidate_observations": sum(r["city"] == city for r in legacy),
                       "batch14_machine_observations": len(current),
                       **{kind: sum(r["classification"] == kind for r in current) for kind in CLASSES},
                       "batch14_scan_transcriptions": sum(r["city"] == city for r in scans),
                       "cumulative_roster_candidate_observations": sum(r["city"] == city for r in merged),
                       "citywide_complete_current_roster_proven": False})
    if sum(r["batch14_machine_observations"] for r in matrix) != len(observations):
        raise ValueError("City totals do not conserve observations")
    report = {"prior_roster_candidate_observations": 2391, "batch14_machine_observations": len(observations),
              "batch14_class_counts": counts, "batch14_scan_transcriptions_separate": len(scans),
              "cumulative_roster_candidate_observations": len(merged),
              "combined_batch13_batch14_machine_classified_observations": len(combined_classified),
              "combined_scan_transcriptions_pending_human_review": len(combined_scans),
              "bound_batch14_raw_source_files": len(source_rows), "city_count": 21,
              "approved_institution_identities": 0, "cities_proven_complete_current_roster": 0,
              "current_operating_status_verified": False,
              "legacy_missing_row_source_sha": 821,
              "company_unique_entities_retained": 583, "company_registration_field_audit_count": 14575,
              "company_snapshots_without_original_per_request_ledger": 126,
              "prior_field_review_pipeline_rows": 2391,
              "limits": ["来源行、名称候选、登记主体、养老场所不是同一种计数。",
                         "本批38条名录候选追加；专项、历史、转述、活动/状态事件及扫描不追加。",
                         "全部新观察无已批准统计截止日，source_as_of保持空；原日期标签及状态原文保留。",
                         "旧2391行八字段原样保留；旧日期和821条逐条SHA缺口未按同名自动补写。",
                         "原2391行逐字段审核管道不自动扩容；本批字段位置与原值见各分区明细。",
                         "扫描转录需人工逐字复核；不以模型读取冒充人工确认。"]}
    outputs = {
        "classified-observations.csv": csv_bytes(observations, CLASSIFIED_FIELDS),
        "classified-observations.jsonl": jsonl_bytes(observations),
        "cumulative-roster-candidates.csv": csv_bytes(merged, FIELDS),
        "combined-classified-observations.csv": csv_bytes(combined_classified, CLASSIFIED_FIELDS),
        "scan-review-observations.csv": csv_bytes(scans, CLASSIFIED_FIELDS),
        "combined-scan-review-observations.csv": csv_bytes(combined_scans, CLASSIFIED_FIELDS),
        "date-label-register.csv": csv_bytes(date_rows, tuple(date_rows[0])),
        "retained-field-evidence.jsonl": jsonl_bytes(field_rows),
        "observation-source-files.csv": csv_bytes(source_rows, tuple(source_rows[0])),
        "city-cleaning-matrix.csv": csv_bytes(matrix, tuple(matrix[0])),
        "coverage-evidence-index.json": packed(coverage), "report.json": packed(report),
    }
    lines = ["# 第十四批养老来源清洗报告", "", "归档日期：2026-11-15（Asia/Shanghai）。本包为本机私有审核资料。", "",
             f"本批机器定位分类观察{len(observations)}条，另有扫描转录{len(scans)}条；累计名录候选来源行{len(merged)}条。",
             "不同期的来源行不可相加为独立机构数或当前在营总量。", "", "| 本批分类 | 行数 |", "| --- | ---: |"]
    lines += [f"| {kind} | {counts.get(kind, 0)} |" for kind in CLASSES]
    lines += ["", "## 21市清洗计数", "", "| 城市 | 旧候选行 | 本批机器定位 | 本批扫描 | 累计候选行 |", "| --- | ---: | ---: | ---: | ---: |"]
    lines += [f"| {r['city']} | {r['prior_roster_candidate_observations']} | {r['batch14_machine_observations']} | {r['batch14_scan_transcriptions']} | {r['cumulative_roster_candidate_observations']} |" for r in matrix]
    lines += ["", "## 已保留的边界与未完成项", ""] + ["- " + item for item in report["limits"]]
    lines += ["- 工商583主体及14,575字段原件审计维持独立；126历史快照仍无原始逐笔账本。",
              "- 没有城市已证明同一时点、全类型、当前在营；范围证据见coverage-evidence-index.json指向的逐市说明。",
              "- 本轮未修改网站、公开数据、业务、生产配置或部署。"]
    outputs["report.md"] = ("\n".join(lines) + "\n").encode("utf-8")
    outputs["README.md"] = ("# 第十四批统一清洗归档\n\n"
        "先读report.md；人工查看cumulative-roster-candidates.csv和city-cleaning-matrix.csv。"
        "classified-observations含本批可机器定位的分类观察；combined-classified-observations只合并第十三、十四批分类层，不能与累计候选相加。"
        "scan-review独立保留模型转录，combined-scan-review含上批14条及本批转录，均未人工核准。\n\n"
        "目录元数据、范围汇总和失败请求不展开为机构；来源状态不提升为当前状态。所有输入、生成器与输出SHA见manifest。"
        "旧2391行保持原样，原私有逐字段管道仍为2391行；本批详细字段在分区CSV的details及原件定位中。\n\n"
        "项目根目录离线复算：`python -X utf8 scripts/batch14_aggregate_cleaning.py --check`。"
        "检查不访问网络、不写文件；默认生成独立内容版本，不覆盖既有版本。\n").encode("utf-8")
    generator_sha = sha(Path(__file__).read_bytes())
    output_hashes = {name: sha(raw) for name, raw in sorted(outputs.items())}
    version = "v1-" + sha(packed({"generator": generator_sha, "inputs": inputs, "outputs": output_hashes}))[:16]
    outputs["manifest.json"] = packed({"version_id": version, "generator": "scripts/batch14_aggregate_cleaning.py",
        "generator_sha256": generator_sha, "inputs_sha256": inputs, "output_sha256": output_hashes,
        "legacy_rows_preserved_exactly": 2391, "summary": report})
    return outputs, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs, report = build()
    version = json.loads(outputs["manifest.json"])["version_id"]
    destination = PACKAGE / "cleaned/versions" / version
    if args.check or destination.exists():
        if not destination.is_dir() or {p.name for p in destination.iterdir()} != set(outputs):
            raise ValueError("Batch14 archive file set differs")
        for filename, raw in outputs.items():
            if (destination / filename).read_bytes() != raw:
                raise ValueError("Batch14 archive bytes differ: " + filename)
        action = "verified"
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".staging-", dir=destination.parent) as temporary:
            stage = Path(temporary) / "version"
            stage.mkdir()
            for filename, raw in outputs.items():
                (stage / filename).write_bytes(raw)
            stage.rename(destination)
        action = "created"
    print(json.dumps({"action": action, "path": destination.relative_to(ROOT).as_posix(), "summary": report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
