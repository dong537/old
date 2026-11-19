"""Reconcile saved Yanglaocn observations offline; never writes public datasets."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / "data/private"
PROVINCES = {
    "北京": "北京市", "天津": "天津市", "上海": "上海市", "重庆": "重庆市",
    "广西": "广西壮族自治区", "内蒙古": "内蒙古自治区", "西藏": "西藏自治区",
    "宁夏": "宁夏回族自治区", "新疆": "新疆维吾尔自治区",
    **{name: name + "省" for name in (
        "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建",
        "江西", "山东", "河南", "湖北", "湖南", "广东", "海南", "四川", "贵州",
        "云南", "陕西", "甘肃", "青海", "台湾")},
    "香港": "香港特别行政区", "澳门": "澳门特别行政区",
}
VALID_PROVINCES = set(PROVINCES.values())
DETAIL = re.compile(r"/(?:ylyxx/y\d+|shtml/ylyxx/\d{4}-\d{2}/yly\d+)\.html\Z")
SLUG = re.compile(r"[a-z][a-z0-9-]*\Z")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2,
                       allow_nan=False) + "\n").encode("utf-8")


def name_key(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value))


def province_name(value):
    if value is None:
        return None
    if value in VALID_PROVINCES:
        return value
    if value in PROVINCES:
        return PROVINCES[value]
    raise ValueError(f"unrecognized province: {value}")


def explicit(evidence) -> bool:
    if isinstance(evidence, dict):
        return bool(evidence.get("excerpt") and evidence.get("location") in (
            "result-title", "result-snippet", "search-result-display", "page-body"))
    return evidence in ("search-result-title", "search-result-snippet", "page-body")


def detail_url(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme not in ("http", "https") or parsed.hostname not in (
            "yanglaocn.com", "www.yanglaocn.com") or parsed.port is not None or
            parsed.username or parsed.password or not DETAIL.fullmatch(parsed.path)):
        raise ValueError(f"not an observed institution detail URL: {value}")
    # A syntactic lookup key only. This does not assert a redirect or HTML canonical.
    return f"{parsed.scheme}://www.yanglaocn.com{parsed.path}"


def merge_observations(observations: list[dict]) -> list[dict]:
    groups = defaultdict(list)
    for observation in observations:
        kind = observation["evidenceType"]
        if kind not in ("search-snippet", "search-index-region", "page-body",
                        "link-only", "search-index-url-only"):
            raise ValueError(f"unsupported evidence type: {kind}")
        if kind == "page-body" and not (
                re.fullmatch(r"[0-9a-f]{64}", observation.get("artifactSha256", "")) and
                observation.get("artifactPath")):
            raise ValueError("page body requires an archived artifact and SHA-256")
        groups[detail_url(observation["url"])].append(observation)
    result = []
    for url, items in sorted(groups.items()):
        names = sorted({item["institutionName"].strip() for item in items
                        if item.get("institutionName", "").strip()})
        provinces = {province_name(item["province"]) for item in items
                     if item.get("province") and explicit(item.get("provinceEvidence"))}
        cities = {item["city"].strip() for item in items
                  if item.get("city") and explicit(item.get("cityEvidence"))}
        issues = []
        if len({name_key(name) for name in names}) > 1:
            issues.append("name-conflict")
        if len(provinces) > 1:
            issues.append("province-conflict")
        if len({city.removesuffix("市") for city in cities}) > 1:
            issues.append("city-conflict")
        body_items = [item for item in items if item["evidenceType"] == "page-body"]
        representative = min(items, key=lambda item: (
            {"page-body": 0, "search-snippet": 1, "search-index-region": 2,
             "link-only": 3, "search-index-url-only": 4}[item["evidenceType"]],
            not explicit(item.get("provinceEvidence")), not explicit(item.get("cityEvidence")),
            item["sourceFile"], item["sourceRecordId"]))
        dates = sorted({item["sourceDate"] for item in body_items if item.get("sourceDate")})
        if len(dates) > 1:
            issues.append("source-date-conflict")
        result.append({
            "candidateId": "ylcn-" + hashlib.sha256(url.encode()).hexdigest()[:16],
            "urlKey": url, "urlKeyMethod": "syntactic-only-no-http-canonical-check",
            "institutionName": representative.get("institutionName") or None, "observedNames": names,
            "province": (province_name(representative.get("province")) if len(provinces) <= 1 and
                         explicit(representative.get("provinceEvidence")) else None),
            "city": (representative.get("city") if len(provinces) <= 1 and
                     len({c.removesuffix("市") for c in cities}) <= 1 and
                     explicit(representative.get("cityEvidence")) else None),
            "representativeObservationId": representative["sourceRecordId"],
            "representativeSourceFile": representative["sourceFile"],
            "sourceDate": dates[0] if len(dates) == 1 else None,
            "evidenceLevel": ("page-body-observed" if body_items else
                              "search-snippet-only" if any(item["evidenceType"] == "search-snippet"
                                                           for item in items) else
                              "search-index-region-only" if any(item["evidenceType"] == "search-index-region"
                                                                for item in items) else
                              "link-only" if any(item["evidenceType"] == "link-only"
                                                 for item in items) else "search-index-url-only"),
            "identityConfirmed": False, "currentlyOperating": None,
            "publicationEligible": False, "issues": issues, "observations": items,
        })
    return result


def match_candidates(candidates: list[dict], catalog: list[dict]) -> list[dict]:
    index = defaultdict(list)
    for row in catalog:
        index[(province_name(row["province"]), name_key(row["name"]))].append(row)
    result = []
    for candidate in candidates:
        hits = {}
        if candidate["province"] is not None:
            for observation in candidate["observations"]:
                if (not observation.get("institutionName") or
                        not explicit(observation.get("provinceEvidence")) or
                        province_name(observation.get("province")) != candidate["province"]):
                    continue
                observed_name = observation["institutionName"]
                observed_city = (observation.get("city") if explicit(observation.get("cityEvidence")) else None)
                for row in index.get((candidate["province"], name_key(observed_name)), []):
                    city_conflict = bool(observed_city and row.get("city") and
                                         observed_city.removesuffix("市") !=
                                         row["city"].removesuffix("市"))
                    key = (row["kind"], row["id"])
                    supporting = sorted(set(hits.get(key, {}).get("supportingObservationIds", []) +
                                            [observation["sourceRecordId"]]))
                    hits[key] = {
                        **row, "matchedObservedName": observed_name,
                        "matchRule": "same-province-NFKC-whitespace-exact-name",
                        "cityConflict": city_conflict or hits.get(key, {}).get("cityConflict", False),
                        "identityConfirmed": False,
                        "supportingObservationIds": supporting,
                    }
        result.append({**candidate,
                       "matchStatus": ("region-unresolved" if candidate["province"] is None else
                                       "same-province-exact-name-candidate" if hits else
                                       "no-same-province-exact-name"),
                       "matches": [hits[key] for key in sorted(hits)]})
    return result


def unmatched_name_keys(candidates: list[dict]) -> set[tuple[str, str]]:
    return {(province_name(observation["province"]), name_key(observation["institutionName"]))
            for candidate in candidates if candidate["matchStatus"] == "no-same-province-exact-name"
            for observation in candidate["observations"] if observation.get("institutionName") and
            observation.get("province") and explicit(observation.get("provinceEvidence"))}


def load_catalog(base: Path, kind: str) -> tuple[list[dict], dict]:
    manifest = read_json(base / "manifest.v1.json")
    snapshot = manifest["snapshotId"]
    if manifest["schemaVersion"] != 1:
        raise ValueError("unsupported catalog version")
    rows, seen_ids = [], set()
    for province in manifest["provinces"]:
        province_count = 0
        for city in province["cities"]:
            if not SLUG.fullmatch(province["slug"]) or not SLUG.fullmatch(city["slug"]):
                raise ValueError("unsafe catalog slug")
            expected_path = f"{province['slug']}/{city['slug']}/index.v1.json"
            if city["indexPath"] != expected_path:
                raise ValueError("unsafe catalog index path")
            index = read_json(base / expected_path)
            if (index["schemaVersion"] != 1 or index["snapshotId"] != snapshot or
                    index["provinceSlug"] != province["slug"] or index["citySlug"] != city["slug"]):
                raise ValueError("catalog index snapshot or location mismatch")
            if len(index["records"]) != city["count"]:
                raise ValueError("catalog city count mismatch")
            province_count += city["count"]
            for record in index["records"]:
                if record["id"] in seen_ids or not record["name"].strip():
                    raise ValueError("catalog duplicate ID or empty name")
                seen_ids.add(record["id"])
                rows.append({"kind": kind, "id": record["id"], "name": record["name"],
                             "province": province["name"], "city": city["name"],
                             "address": record.get("address"), "sourceRow": record.get("sourceRow"),
                             "sourceId": record.get("sourceId")})
        if province_count != province["count"]:
            raise ValueError("catalog province count mismatch")
    if len(rows) != manifest["rowCount"]:
        raise ValueError("catalog total count mismatch")
    return rows, {"snapshotId": snapshot, "rowCount": len(rows),
                  "rowsSha256": hashlib.sha256(json_bytes(rows)).hexdigest()}


def read_observations(path: Path) -> list[dict]:
    data = read_json(path)
    source_file = path.resolve().relative_to(ROOT).as_posix()
    if (path.name == "search-evidence.json" and data.get("schemaVersion") == 1 and
            "count" in data and "records" in data):
        records = data["records"]
        if data["count"] != len(records):
            raise ValueError("same-URL search region count mismatch")
        observations, seen_urls = [], set()
        for item in records:
            url = detail_url(item["url"])
            expected_id = "ylcn-" + hashlib.sha256(url.encode()).hexdigest()[:16]
            if item["candidateId"] != expected_id or url in seen_urls:
                raise ValueError("same-URL search region candidate identity mismatch")
            seen_urls.add(url)
            if (item["evidenceType"] != "external-search-index-result" or
                    item["directSourceFetched"] is not False or
                    item["publicationEligible"] is not False or
                    item.get("sourceDate") is not None):
                raise ValueError("search index evidence cannot assert source body, date, or publication")
            province = province_name(item["province"])
            city, region = item["city"].strip(), item["regionText"].strip()
            province_aliases = {province, *(alias for alias, full in PROVINCES.items()
                                            if full == province)}
            if (not item["institutionName"].strip() or not city or not region or
                    not item["resultRef"].strip() or not item["query"].strip() or
                    not item["retrievedOn"].strip() or
                    not any(alias in region for alias in province_aliases) or
                    city.removesuffix("市") not in region):
                raise ValueError("search index region lacks same-result location evidence")
            evidence = {"location": "search-result-display", "excerpt": region,
                        "reference": item["resultRef"]}
            observations.append({"url": url, "institutionName": item["institutionName"],
                                 "province": province, "city": city,
                                 "provinceEvidence": evidence, "cityEvidence": evidence,
                                 "evidenceType": "search-index-region", "sourceDate": None,
                                 "sourceFile": source_file,
                                 "sourceRecordId": item["candidateId"] + ":" + item["resultRef"],
                                 "rawObservation": item})
        return observations
    if path.name == "detail-observation.json":
        artifact = path.parent / data["htmlFile"]
        if hashlib.sha256(artifact.read_bytes()).hexdigest() != data["htmlSha256"]:
            raise ValueError("page body artifact hash mismatch")
        return [{"url": data["sourceUrl"], "institutionName": data["name"],
                 "province": data["province"], "city": data["city"],
                 "provinceEvidence": "page-body", "cityEvidence": "page-body",
                 "evidenceType": "page-body", "sourceDate": data["sourceDate"],
                 "artifactPath": artifact.resolve().relative_to(ROOT).as_posix(),
                 "artifactSha256": data["htmlSha256"], "sourceFile": source_file,
                 "sourceRecordId": data["sourceUrl"], "rawObservation": data}]
    if path.name == "discovered-links.json":
        if data["count"] != len(data["items"]):
            raise ValueError("discovered link count mismatch")
        return [{"url": item["url"], "institutionName": name,
                 "province": None, "city": None, "provinceEvidence": None, "cityEvidence": None,
                 "evidenceType": "link-only", "sourceFile": source_file,
                 "sourceRecordId": item["url"], "rawObservation": item}
                for item in data["items"] for name in (item["namesAsLinked"] or [""])]
    if path.name == "candidates.json":
        if data["count"] != len(data["candidates"]):
            raise ValueError("search candidate count mismatch")
        records = data["candidates"]
        if any(item.get("verificationStatus") == "search-index-url-only-unverified"
               for item in records):
            if not all(item.get("verificationStatus") == "search-index-url-only-unverified"
                       for item in records):
                raise ValueError("mixed index URL and snippet candidate evidence")
            observations, seen_urls = [], set()
            for item in records:
                url = detail_url(item["originalUrl"])
                if (url in seen_urls or not item["candidateId"] or
                        not item["searchResultReference"]):
                    raise ValueError("duplicate or untraceable index URL candidate")
                seen_urls.add(url)
                if (item["institutionName"].strip() or item.get("province") is not None or
                        item.get("provinceEvidence") is not None or
                        item.get("searchTitle") is not None or
                        item.get("searchSnippet") is not None or
                        item["directSourceFetched"] is not False):
                    raise ValueError("index URL candidate cannot assert name, region, or source content")
                observations.append({"url": url, "institutionName": "",
                                     "province": None, "city": None,
                                     "provinceEvidence": None, "cityEvidence": None,
                                     "evidenceType": "search-index-url-only",
                                     "sourceFile": source_file,
                                     "sourceRecordId": item["candidateId"],
                                     "rawObservation": item})
            return observations
        return [{"url": item["originalUrl"], "institutionName": item["institutionName"],
                 "province": item["province"], "city": item["city"],
                 "provinceEvidence": item["provinceEvidence"], "cityEvidence": item["cityEvidence"],
                 "evidenceType": "search-snippet", "sourceFile": source_file,
                 "sourceRecordId": item["candidateId"], "rawObservation": item} for item in records]
    if (path.name == "leads.json" and data.get("scope") ==
            "external-search-index-only; source requests zero"):
        records = data["records"]
        if data.get("schemaVersion") != 1 or data["leadCount"] != len(records):
            raise ValueError("index URL lead count or schema mismatch")
        observations, seen_urls = [], set()
        for item in records:
            url = detail_url(item["originalUrl"])
            if url in seen_urls or not item["leadId"] or not item["searchResultReference"]:
                raise ValueError("duplicate or untraceable index URL lead")
            seen_urls.add(url)
            if (item["sourcePageFetched"] is not False or
                    item["institutionIdentityVerified"] is not False or
                    item["publicationEligible"] is not False or
                    item.get("sourceDate") is not None or item.get("province") is not None or
                    item.get("searchTitle") is not None or item.get("searchSnippet") is not None):
                raise ValueError("index URL lead cannot assert page, title, region, or identity")
            observations.append({"url": url, "institutionName": "", "province": None,
                                 "city": None, "provinceEvidence": None, "cityEvidence": None,
                                 "evidenceType": "search-index-url-only",
                                 "sourceFile": source_file, "sourceRecordId": item["leadId"],
                                 "rawObservation": item})
        return observations
    if path.name == "leads.json":
        records = data["records"]
        if data["meta"]["counts"]["uniqueDetailUrls"] != len(records):
            raise ValueError("search lead count mismatch")
        return [{"url": item["originalUrl"], "institutionName": item["institutionName"],
                 "province": item["province"], "city": item["city"],
                 "provinceEvidence": item["provinceEvidence"], "cityEvidence": item["cityEvidence"],
                 "evidenceType": "search-snippet", "sourceFile": source_file,
                 "sourceRecordId": item["leadId"], "rawObservation": item} for item in records]
    raise ValueError(f"unsupported saved observation file: {path}")


def write_outputs(files: dict[str, bytes], output: Path, *, check: bool):
    output = output.resolve()
    if not output.is_relative_to(PRIVATE.resolve()) or output == PRIVATE.resolve():
        raise ValueError("output must be a dedicated private subdirectory")
    if any(Path(filename).name != filename for filename in files):
        raise ValueError("output filenames must be flat")
    if check:
        actual = {path.name for path in output.iterdir()} if output.is_dir() else set()
        if actual != set(files):
            raise ValueError("offline reconciliation output file set differs")
        for filename, content in files.items():
            if (output / filename).read_bytes() != content:
                raise ValueError(f"offline reconciliation output differs: {filename}")
        return
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("write requires a new or empty output directory; existing files are preserved")
    output.mkdir(parents=True, exist_ok=True)
    for filename, content in files.items():
        with (output / filename).open("xb") as handle:
            handle.write(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    if not output.is_relative_to(PRIVATE.resolve()) or output == PRIVATE.resolve():
        raise ValueError("output must be a dedicated private subdirectory")
    observations, inputs = [], []
    for path in args.input:
        observations.extend(read_observations(path))
        inputs.append({"path": path.resolve().relative_to(ROOT).as_posix(),
                       "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    reference_rows, reference_meta = load_catalog(ROOT / "public/data/qcc-institutions", "institutionReference")
    official_rows, official_meta = load_catalog(ROOT / "public/data/national-official", "nationalOfficial")
    guangdong = read_json(ROOT / "public/data/guangdong-source-records.v1.json")
    gd_rows = [{"kind": "guangdongOfficial", "id": r["id"], "name": r["name"],
                "province": "广东省", "city": r["city"], "address": None,
                "sourceUrl": r["sourceUrl"]} for r in guangdong["records"]]
    candidates = match_candidates(merge_observations(observations), reference_rows + official_rows + gd_rows)
    summary = {
        "schemaVersion": 1, "collectedOn": "2026-11-18", "inputs": inputs,
        "catalogs": {"institutionReference": reference_meta, "nationalOfficial": official_meta,
                     "guangdongOfficial": {"snapshotId": guangdong["snapshotId"], "rowCount": len(gd_rows),
                                           "rowsSha256": hashlib.sha256(json_bytes(gd_rows)).hexdigest()}},
        "observationCount": len(observations), "uniqueDetailUrlCount": len(candidates),
        "observationsByType": dict(sorted(Counter(o["evidenceType"] for o in observations).items())),
        "urlsByEvidenceLevel": dict(sorted(Counter(c["evidenceLevel"] for c in candidates).items())),
        "urlsByKnownProvince": dict(sorted(Counter(c["province"] or "地域待核" for c in candidates).items())),
        "urlsByMatchStatus": dict(sorted(Counter(c["matchStatus"] for c in candidates).items())),
        "urlsWithReferenceCandidate": sum(any(m["kind"] == "institutionReference" for m in c["matches"])
                                          for c in candidates),
        "urlsWithOfficialCandidate": sum(any(m["kind"] != "institutionReference" for m in c["matches"])
                                         for c in candidates),
        "candidatePairs": sum(len(c["matches"]) for c in candidates),
        "cityConflictPairs": sum(m["cityConflict"] for c in candidates for m in c["matches"]),
        "urlsWithNameConflict": sum("name-conflict" in c["issues"] for c in candidates),
        "unmatchedKnownProvinceNameKeys": len(unmatched_name_keys(candidates)),
        "confirmedNewInstitutions": 0, "newPublicRows": 0,
        "limitations": ["URLs and names are discovery evidence, not deduplicated institutions.",
                        "No republication authorization or current operating status was established.",
                        "Same-province exact names are candidate links only; no entity was auto-merged.",
                        "Published robots rules disallow the named client; further source requests stopped.",
                        "No source date was inferred from a URL or search crawl indicator."],
    }
    csv_stream = io.StringIO(newline="")
    writer = csv.writer(csv_stream)
    writer.writerow(["候选ID", "代表观察名称", "同URL曾出现名称（不同来源，待核）", "代表观察省份", "代表观察城市",
                     "证据层级", "资料日期", "详情URL", "匹配状态", "机构线索同名候选数",
                     "官方来源同名候选数", "城市冲突候选数", "其他问题", "机构身份已确认"])
    for c in candidates:
        writer.writerow([c["candidateId"], c["institutionName"], " | ".join(c["observedNames"]), c["province"], c["city"],
                         c["evidenceLevel"], c["sourceDate"], c["urlKey"], c["matchStatus"],
                         sum(m["kind"] == "institutionReference" for m in c["matches"]),
                         sum(m["kind"] != "institutionReference" for m in c["matches"]),
                         sum(m["cityConflict"] for m in c["matches"]), " | ".join(c["issues"]), "否"])
    files = {"summary.json": json_bytes(summary),
             "reconciled-candidates.json": json_bytes({"schemaVersion": 1, "summary": summary,
                                                       "candidates": candidates}),
             "reconciled-candidates.csv": csv_stream.getvalue().encode("utf-8-sig")}
    write_outputs(files, output, check=args.check)
    print(json.dumps({key: value for key, value in summary.items() if key not in ("inputs", "catalogs")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
