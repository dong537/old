"""Find conservative same-province name/address review leads without source requests."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import io
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_SCRIPT = ROOT / "scripts/reconcile-yanglaocn-private.py"
INPUT = ROOT / "data/private/yanglaocn-20261118/combined-b2-final/reconciled-candidates.json"
DEFAULT_OUTPUT = ROOT / "data/private/yanglaocn-20261118/b2-resolve-b2-final"
GENERIC_NAMES = {"养老院", "敬老院", "老年公寓", "社会福利院", "福利院", "护理院",
                 "养老服务中心", "养老康复中心", "老年服务中心", "老年福利中心", "颐养院"}
GENERIC_TAILS = GENERIC_NAMES | {"农村福利院", "养老服务有限公司", "家政服务有限公司",
                                 "服务有限公司", "管理有限公司", "有限公司", "颐养园",
                                 "中心敬老院", "服务中心"}
ALIAS = re.compile(r"[（(](?:原|曾用名|又名|别名)[：:]?([^）)]+)[）)]")


def base_module():
    spec = importlib.util.spec_from_file_location("yanglaocn_base", BASE_SCRIPT)
    assert spec and spec.loader
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def compact(value: str) -> str:
    """Normalize punctuation/spacing, keeping the original strings in output."""
    return re.sub(r"[^一-鿿A-Za-z0-9]", "", unicodedata.normalize("NFKC", value))


def distinctive(value: str) -> bool:
    if len(value) < 5 or value in GENERIC_NAMES:
        return False
    return not any(value.endswith(generic) and len(value) - len(generic) < 2
                   for generic in GENERIC_TAILS)


def common_suffix(left: str, right: str) -> str:
    end = 0
    while end < min(len(left), len(right)) and left[-end - 1] == right[-end - 1]:
        end += 1
    return left[-end:] if end else ""


def geographic_prefix(prefix: str) -> bool:
    return not prefix or bool(re.fullmatch(r"(?:[一-鿿]{2,8}(?:省|市|区|县|镇|乡|旗|盟|州|街道))+", prefix))


def prefix_compatible(left: str, right: str, province: str) -> bool:
    short_province = {"广西壮族自治区": "广西", "内蒙古自治区": "内蒙古",
                      "新疆维吾尔自治区": "新疆", "宁夏回族自治区": "宁夏",
                      "西藏自治区": "西藏"}.get(
        province, province.removesuffix("省").removesuffix("市"))
    for province_label in (province, short_province):
        if left.startswith(province_label):
            left = left[len(province_label):]
        if right.startswith(province_label):
            right = right[len(province_label):]
    left, right = left.removeprefix("市").removesuffix("市"), right.removeprefix("市").removesuffix("市")
    if not left or not right:
        return geographic_prefix(left or right)
    if left == right:
        return True
    shorter, longer = (left, right) if len(left) < len(right) else (right, left)
    return len(left) != len(right) and len(shorter) >= 2 and longer.startswith(shorter)


def name_rule(observed: str, source: str, province: str):
    left, right = compact(observed), compact(source)
    for alias in ALIAS.findall(observed):
        alias_key = compact(alias)
        if distinctive(alias_key) and alias_key == right:
            return "explicit-parenthetical-alias", 92, alias_key
    if left == right:
        # Exact-name candidates belong to the prior reconciliation, not this B2 pass.
        return None
    suffix = common_suffix(left, right)
    if (distinctive(suffix) and len(suffix) >= 5 and
            prefix_compatible(left[:-len(suffix)], right[:-len(suffix)], province)):
        return "shared-distinctive-suffix", 84 if len(suffix) >= 6 else 78, suffix
    shorter, longer = (left, right) if len(left) < len(right) else (right, left)
    trailing = longer[len(shorter):] if longer.startswith(shorter) else ""
    if (len(left) != len(right) and distinctive(shorter) and trailing and
            any(trailing.endswith(tail) for tail in GENERIC_TAILS)):
        return "distinctive-name-containment", 78, shorter
    return None


def address_rule(observed: str | None, source: str | None):
    if not observed or not source:
        return None
    left, right = compact(observed), compact(source)
    # A bare street or district is not an address match; require a numbered location.
    if not re.search(r"[0-9]+号", left) or not re.search(r"[0-9]+号", right):
        return None
    left, right = left.replace("市", ""), right.replace("市", "")
    shorter = min((left, right), key=len)
    if len(shorter) >= 10 and (left == right or shorter in max((left, right), key=len)):
        return "observed-address", 88, shorter
    return None


def normalize_city(value: str | None) -> str | None:
    return value.removesuffix("市") if value else None


def observed_district(observation: dict, city: str | None) -> str | None:
    raw = (observation.get("rawObservation") or {}).get("district")
    if raw and re.fullmatch(r"[一-鿿]{2,8}(?:区|县)", raw):
        return raw
    name = observation["institutionName"]
    if city and normalize_city(city) in name:
        name = name.split(normalize_city(city), 1)[1].removeprefix("市")
    else:
        name = re.split(r"[省市]", name, maxsplit=2)[-1]
    match = re.match(r"([一-鿿]{2,8}?(?:区|县))", name)
    return match.group(1) if match else None


def district_conflict(district: str | None, source_name: str, source_address: str | None) -> bool:
    if not district:
        return False
    source = " ".join(filter(None, (source_name, source_address)))
    if district in source:
        return False
    return bool(re.search(r"(?:^|省|市|\s)[一-鿿]{2,8}?(?:区|县)", source) or
                re.search(r"市[一-鿿]{2,8}?市", source))


def resolve_candidate(candidate: dict, catalog_rows: list[dict], *, base=None) -> dict:
    """Return review leads only; each name and province must share one observation."""
    result = {"candidateId": candidate["candidateId"], "urlKey": candidate["urlKey"],
              "institutionName": candidate.get("institutionName"),
              "province": candidate.get("province"), "city": candidate.get("city"),
              "priorMatchStatus": candidate["matchStatus"],
              "evidenceLevel": candidate.get("evidenceLevel"),
              "reviewStatus": None, "identityConfirmed": False,
              "currentlyOperating": None, "matches": []}
    if candidate["matchStatus"] == "region-unresolved" or not candidate.get("province"):
        result["reviewStatus"] = "region-unresolved-no-same-province-match"
        return result
    if candidate["matchStatus"] != "no-same-province-exact-name":
        result["reviewStatus"] = "prior-exact-candidate-out-of-scope"
        return result
    base = base or base_module()
    hits = {}
    for observation in candidate["observations"]:
        if not (observation.get("institutionName") and
                base.explicit(observation.get("provinceEvidence")) and
                base.province_name(observation.get("province")) == candidate["province"]):
            continue
        name = observation["institutionName"]
        observed_city = (observation.get("city") if
                         base.explicit(observation.get("cityEvidence")) else None)
        raw = observation.get("rawObservation") or {}
        district = observed_district(observation, observed_city)
        observed_address = (raw.get("address") if observation.get("evidenceType") == "page-body"
                            else None)
        for row in catalog_rows:
            if row["province"] != candidate["province"]:
                continue
            rule = name_rule(name, row["name"], candidate["province"])
            address = address_rule(observed_address, row.get("address"))
            if address and (not rule or address[1] > rule[1]):
                rule = address
            if not rule:
                continue
            conflicts = []
            if (observed_city and row.get("city") and
                    normalize_city(observed_city) != normalize_city(row["city"])):
                conflicts.append("city-mismatch")
            if district_conflict(district, row["name"], row.get("address")):
                conflicts.append("district-mismatch")
            key = (row["kind"], row["id"])
            existing = hits.get(key)
            supporting = sorted(set((existing or {}).get("supportingObservationIds", []) +
                                    [observation["sourceRecordId"]]))
            hit = {"sourceKind": row["kind"], "sourceId": row["id"],
                   "catalogSourceId": row.get("sourceId"), "sourceRow": row.get("sourceRow"),
                   "sourceName": row["name"], "sourceProvince": row["province"],
                   "sourceCity": row.get("city"), "sourceAddress": row.get("address"),
                   "observedName": name, "observedProvince": observation["province"],
                   "observedCity": observed_city, "observedDistrict": district,
                   "observedAddress": observed_address,
                   "matchRule": rule[0], "score": rule[1], "sharedText": rule[2],
                   "supportingObservationIds": supporting,
                   "conflicts": sorted(set(conflicts + (existing or {}).get("conflicts", []))),
                   "identityConfirmed": False, "currentlyOperating": None}
            if not existing or hit["score"] > existing["score"]:
                hits[key] = hit
            else:
                existing["supportingObservationIds"] = supporting
                existing["conflicts"] = hit["conflicts"]
    result["matches"] = sorted(hits.values(), key=lambda hit: (-hit["score"],
                             bool(hit["conflicts"]), hit["sourceKind"], hit["sourceId"]))
    result["reviewStatus"] = ("local-review-leads" if hits else "no-conservative-local-lead")
    return result


def priority_review(results: list[dict]) -> list[dict]:
    priority = []
    for result in results:
        eligible = [hit for hit in result["matches"]
                    if hit["score"] >= 80 and not hit["conflicts"]]
        if eligible:
            priority.append({"candidateId": result["candidateId"],
                             "institutionName": result.get("institutionName"),
                             "province": result.get("province"), "city": result.get("city"),
                             "urlKey": result.get("urlKey"), "matches": eligible[:3]})
    return priority


def build_output(input_path: Path = INPUT) -> dict[str, bytes]:
    base = base_module()
    source = json.loads(input_path.read_text(encoding="utf-8"))
    candidates = source["candidates"]
    if len(candidates) != 170 or len({item["candidateId"] for item in candidates}) != 170:
        raise ValueError("expected the frozen 170-URL B2 candidate set")
    reference, reference_meta = base.load_catalog(ROOT / "public/data/qcc-institutions", "institutionReference")
    official, official_meta = base.load_catalog(ROOT / "public/data/national-official", "nationalOfficial")
    guangdong = json.loads((ROOT / "public/data/guangdong-source-records.v1.json").read_text(encoding="utf-8"))
    gd_rows = [{"kind": "guangdongOfficial", "id": row["id"], "name": row["name"],
                "province": "广东省", "city": row["city"], "address": None,
                "sourceRow": None, "sourceId": row.get("sourceId")}
               for row in guangdong["records"]]
    by_province = {}
    for row in reference + official + gd_rows:
        by_province.setdefault(row["province"], []).append(row)
    results = [resolve_candidate(candidate, by_province.get(candidate.get("province"), []), base=base)
               for candidate in candidates]
    statuses = Counter(result["reviewStatus"] for result in results)
    prior = Counter(result["priorMatchStatus"] for result in results)
    if prior != {"no-same-province-exact-name": 115,
                 "region-unresolved": 50, "same-province-exact-name-candidate": 5}:
        raise ValueError(f"frozen input status count changed: {prior}")
    matches = [hit for result in results for hit in result["matches"]]
    priority = priority_review(results)
    summary = {"schemaVersion": 1, "producedOn": "2026-11-18",
               "inputPath": input_path.resolve().relative_to(ROOT).as_posix(),
               "inputSha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
               "inputCandidateCount": len(candidates), "priorStatuses": dict(sorted(prior.items())),
               "reviewStatuses": dict(sorted(statuses.items())),
               "candidatesWithLocalLeads": statuses["local-review-leads"],
               "localSourceRowPairs": len(matches),
               "priorityReviewCandidateCount": len(priority),
               "priorityReviewSourceRowPairs": sum(len(item["matches"]) for item in priority),
               "cityConflictPairs": sum("city-mismatch" in hit["conflicts"] for hit in matches),
               "districtConflictPairs": sum("district-mismatch" in hit["conflicts"] for hit in matches),
               "byMatchRule": dict(sorted(Counter(hit["matchRule"] for hit in matches).items())),
               "catalogs": {"institutionReference": reference_meta, "nationalOfficial": official_meta,
                            "guangdongOfficial": {"snapshotId": guangdong["snapshotId"],
                                                  "rowCount": len(gd_rows)}},
               "confirmedIdentityCount": 0, "newPublicRows": 0,
               "limitations": ["Only frozen same-province source observations were compared.",
                               "Names from link-only observations were never paired with a different observation's region.",
                               "No address was inferred from a search snippet; only observed page-body addresses were used.",
                               "Scores rank manual review leads, not probabilities or proof of identity.",
                               "No source website request or commercial publication was performed."]}
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["候选ID", "已有地区", "观察名称", "详情URL", "复核状态", "来源类别", "来源ID",
                     "来源名称", "来源城市", "来源地址", "匹配规则", "分数", "冲突", "观察ID"])
    for result in results:
        for hit in result["matches"] or [None]:
            writer.writerow([result["candidateId"], result["province"], result["institutionName"],
                             result["urlKey"], result["reviewStatus"], hit["sourceKind"] if hit else None,
                             hit["sourceId"] if hit else None, hit["sourceName"] if hit else None,
                             hit["sourceCity"] if hit else None, hit["sourceAddress"] if hit else None,
                             hit["matchRule"] if hit else None, hit["score"] if hit else None,
                             " | ".join(hit["conflicts"]) if hit else None,
                             " | ".join(hit["supportingObservationIds"]) if hit else None])
    priority_stream = io.StringIO(newline="")
    priority_writer = csv.writer(priority_stream)
    priority_writer.writerow(["候选ID", "观察名称", "省份", "城市", "详情URL", "来源类别",
                              "来源ID", "来源名称", "来源城市", "匹配规则", "分数", "观察ID"])
    for result in priority:
        for hit in result["matches"]:
            priority_writer.writerow([result["candidateId"], result["institutionName"],
                                      result["province"], result["city"], result["urlKey"],
                                      hit["sourceKind"], hit["sourceId"], hit["sourceName"],
                                      hit["sourceCity"], hit["matchRule"], hit["score"],
                                      " | ".join(hit["supportingObservationIds"])])
    return {"summary.json": base.json_bytes(summary),
            "review-candidates.json": base.json_bytes({"schemaVersion": 1, "summary": summary,
                                                       "candidates": results}),
            "review-candidates.csv": stream.getvalue().encode("utf-8-sig"),
            "priority-review.json": base.json_bytes({"schemaVersion": 1, "scoreThreshold": 80,
                                                       "maxSourceRowsPerCandidate": 3,
                                                       "candidates": priority}),
            "priority-review.csv": priority_stream.getvalue().encode("utf-8-sig")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    files = build_output(args.input)
    base_module().write_outputs(files, args.output, check=args.check)
    print(json.dumps(json.loads(files["summary.json"]), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
