"""Audit private MCA shard caches offline; stdout contains counts only.

Usage: python scripts/audit-mca-shards.py
The JSON report remains under the private cache root. Matching pages or rounds
are observations, never proof of a frozen national snapshot.
"""

from __future__ import annotations

import argparse
import base64
from collections import Counter, defaultdict
import hashlib
from itertools import combinations
import json
import math
import os
from pathlib import Path
import re


PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = PROJECT / "data/private/mca-institutions-2026-11-18"
DEFAULT_SEEDS = DEFAULT_ROOT / "national-shard-seeds-20261119.json"
DEFAULT_AREA_SOURCE = PROJECT / "data/private/mca-filter-retry-20261118.json"
AREA_PATH = "/console/area/childs/"
AREA_URL = "https://yanglao.mca.gov.cn/ylxxptapi" + AREA_PATH
CODE = re.compile(r"[0-9]{12}\Z")
IDENTIFIER = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
FOLDER = re.compile(r"area-([0-9]{12})(?:-|$)")
PAGE_FILE = re.compile(r"[0-9]{5}\.json\Z")
DETAIL_ENDPOINTS = ("orgBaseDetail", "yangLaoOrgDetail")


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def checked_tree_wrapper(wrapper, parent_id, seed_hash):
    if (not isinstance(wrapper, dict) or wrapper.get("parentId") != parent_id
            or wrapper.get("httpStatus") != 200 or wrapper.get("method") != "GET"
            or wrapper.get("sourceUrl") != AREA_URL + parent_id):
        raise ValueError("invalid cached area-tree wrapper provenance")
    body = wrapper.get("response")
    encoded = wrapper.get("rawBodyBase64")
    if encoded is None:
        provenance = wrapper.get("provenance", {})
        if (not isinstance(provenance, dict)
                or provenance.get("kind") != "cached-json-payload"
                or provenance.get("originalHttpBodyAvailable") is not False
                or (seed_hash and provenance.get("sourceSnapshotSha256") != seed_hash)):
            raise ValueError("invalid cached area-tree seed provenance")
        raw = json.dumps(body, ensure_ascii=False, sort_keys=True,
                         separators=(",", ":"), allow_nan=False).encode("utf-8")
    else:
        try:
            raw = base64.b64decode(encoded, validate=True)
            if json.loads(raw) != body:
                raise ValueError("raw response differs")
        except (ValueError, TypeError) as error:
            raise ValueError("cached area-tree raw response differs") from error
    if hashlib.sha256(raw).hexdigest() != wrapper.get("responseSha256"):
        raise ValueError("cached area-tree response SHA-256 differs")
    return body


def official_tree(seed_file, area_seed_file, area_tree_dir=None):
    """Validate official province seeds against cached node-ID responses."""
    seed_document = read_json(seed_file)
    seeds = seed_document.get("seeds")
    if (not isinstance(seeds, list) or type(seed_document.get("seedCount")) is not int
            or seed_document["seedCount"] != len(seeds)):
        raise ValueError("invalid official province seed count")
    source_hash = seed_document.get("source", {}).get("sha256")
    if source_hash and hashlib.sha256(Path(area_seed_file).read_bytes()).hexdigest() != source_hash:
        raise ValueError("official area seed SHA-256 differs")
    snapshot = read_json(area_seed_file)
    if not isinstance(snapshot.get("requests"), list):
        raise ValueError("official area seed has no requests")
    responses = {}
    for item in snapshot["requests"]:
        path = item.get("path", "") if isinstance(item, dict) else ""
        if path.startswith(AREA_PATH):
            parent_id = path[len(AREA_PATH):]
            if not parent_id or item.get("httpStatus") != 200:
                raise ValueError("invalid official area response provenance")
            responses[parent_id] = item.get("body")
    if area_tree_dir is not None and Path(area_tree_dir).is_dir():
        for path in sorted(Path(area_tree_dir).glob("*.json")):
            wrapper = read_json(path)
            body = checked_tree_wrapper(wrapper, path.stem, source_hash)
            if path.stem in responses and responses[path.stem] != body:
                raise ValueError("conflicting official area-tree captures")
            responses[path.stem] = body
    by_id, by_code, children_by_parent = {}, {}, {}
    for parent_id, body in responses.items():
        if not isinstance(body, dict) or body.get("code") != 0 or not isinstance(body.get("data"), list):
            raise ValueError("invalid official area-tree payload")
        children = []
        for node in body["data"]:
            if not isinstance(node, dict) or node.get("pid") != parent_id:
                raise ValueError("official area-tree parent mismatch")
            node_id, code = node.get("id"), node.get("sbcode")
            if not isinstance(node_id, str) or not IDENTIFIER.fullmatch(node_id):
                raise ValueError("invalid official area node ID")
            if code is not None and (not isinstance(code, str) or not CODE.fullmatch(code)):
                raise ValueError("invalid official area code")
            if node_id in by_id and by_id[node_id] != node:
                raise ValueError("conflicting official area node ID")
            if code is not None and code in by_code and by_code[code]["id"] != node_id:
                raise ValueError("conflicting official area code")
            by_id[node_id] = node
            if code is not None:
                by_code[code] = node
            children.append(node)
        if len({node["id"] for node in children}) != len(children):
            raise ValueError("duplicate official child node")
        children_by_parent[parent_id] = children
    if "-1" not in children_by_parent:
        raise ValueError("official root area response missing")
    seen = set()
    for seed in seeds:
        code = seed.get("sbcode") if isinstance(seed, dict) else None
        if not isinstance(code, str) or not CODE.fullmatch(code) or code in seen:
            raise ValueError("duplicate or invalid official province sbcode")
        node = by_code.get(code)
        if node is None or node["id"] != seed.get("sourceNodeId") or node["pid"] != "-1":
            raise ValueError("province seed differs from official root tree")
        seen.add(code)
    return by_id, by_code, children_by_parent, len(seeds)


def detail_coverage(folder, identifiers, list_complete):
    valid, missing, invalid, partial = 0, [], [], []
    for identifier in sorted(identifiers):
        path = folder / "details" / f"{identifier}.json"
        if not path.is_file():
            missing.append(identifier)
            if (folder / "detail-checkpoints" / identifier).is_dir():
                partial.append(identifier)
            continue
        try:
            detail = read_json(path)
            if not isinstance(detail, dict) or detail.get("institutionId") != identifier:
                raise ValueError("detail ID mismatch")
            endpoints = detail.get("endpoints")
            if not isinstance(endpoints, dict):
                raise ValueError("detail endpoints missing")
            for name in DETAIL_ENDPOINTS:
                wrapper = endpoints.get(name)
                if (not isinstance(wrapper, dict) or wrapper.get("httpStatus") != 200
                        or wrapper.get("request", {}).get("params") != {"axbe0001": identifier}):
                    raise ValueError("detail endpoint invalid")
                response = wrapper.get("response")
                if (not isinstance(response, dict) or type(response.get("code")) is not int
                        or response["code"] != 0 or not isinstance(response.get("data"), dict)
                        or response["data"].get("axbe0001", identifier) != identifier):
                    raise ValueError("detail response invalid")
        except (OSError, ValueError, TypeError, AttributeError, KeyError):
            invalid.append(identifier)
        else:
            valid += 1
    return {
        "observedListIds": len(identifiers), "validDetails": valid,
        "missingDetailIds": missing, "invalidDetailIds": invalid,
        "partialCheckpointIds": partial,
        "completeForObservedIds": bool(identifiers) and not missing and not invalid,
        "completeForAllListIds": bool(list_complete and identifiers and not missing and not invalid),
    }


def audit_capture(folder):
    manifest = read_json(folder / "manifest.json")
    filters = manifest.get("filters", {})
    code = filters.get("areaCode") if isinstance(filters, dict) else None
    match = FOLDER.match(folder.name)
    if not isinstance(code, str) or not CODE.fullmatch(code) or match is None or match.group(1) != code:
        raise ValueError(f"{folder.name}: manifest area code differs from folder")
    total, size, expected = (manifest.get(key) for key in
                             ("total", "serverPageSize", "expectedPages"))
    if (type(total) is not int or total < 0 or type(size) is not int or size < 1
            or type(expected) is not int or expected != math.ceil(total / size)):
        raise ValueError(f"{folder.name}: invalid manifest pagination")
    if filters.get("checkSort") not in (None, 1):
        raise ValueError(f"{folder.name}: unsupported checkSort")
    variant = (filters.get("checkSort"), filters.get("ahae0635"))
    params = {"size": size, "areaCode": code}
    if variant[0] == 1:
        params["checkSort"] = 1
    if variant[1] is not None:
        params["ahae0635"] = variant[1]
    page_ids, invalid_pages = {}, {}
    drift, size_drift, wrong_length, extra_pages = [], [], [], []
    for path in sorted((folder / "pages").glob("*.json")):
        if not PAGE_FILE.fullmatch(path.name):
            invalid_pages[path.name] = "invalid_filename"
            continue
        page = int(path.stem)
        if not 1 <= page <= expected:
            extra_pages.append(page)
            continue
        try:
            wrapper = read_json(path)
            if (not isinstance(wrapper, dict) or wrapper.get("httpStatus") != 200
                    or wrapper.get("request", {}).get("params") != {**params, "current": page}):
                raise ValueError("request or HTTP mismatch")
            response = wrapper.get("response")
            if (not isinstance(response, dict) or type(response.get("code")) is not int
                    or response["code"] != 0 or not isinstance(response.get("data"), dict)):
                raise ValueError("response invalid")
            data = response["data"]
            if type(data.get("current")) is not int or data["current"] != page:
                raise ValueError("page number mismatch")
            if type(data.get("total")) is not int or type(data.get("size")) is not int:
                raise ValueError("pagination missing")
            records = data.get("records")
            if not isinstance(records, list):
                raise ValueError("records missing")
            ids = []
            for record in records:
                identifier = record.get("axbe0001") if isinstance(record, dict) else None
                if not isinstance(identifier, str) or not IDENTIFIER.fullmatch(identifier):
                    raise ValueError("institution ID invalid")
                ids.append(identifier)
            page_ids[page] = ids
            if data["total"] != total:
                drift.append(page)
            if data["size"] != size:
                size_drift.append(page)
            if len(ids) != min(size, max(0, total - (page - 1) * size)):
                wrong_length.append(page)
        except (OSError, ValueError, TypeError, AttributeError):
            invalid_pages[path.name] = "invalid_saved_page"
    missing = sorted(set(range(1, expected + 1)) - set(page_ids))
    flat = [identifier for page in sorted(page_ids) for identifier in page_ids[page]]
    identifiers = set(flat)
    duplicates = sorted(identifier for identifier, count in Counter(flat).items() if count > 1)
    page_complete = bool(
        not (missing or invalid_pages or extra_pages or drift or size_drift or wrong_length or duplicates)
        and len(flat) == total and len(identifiers) == total
    )
    summary = {
        "areaCode": code, "queryVariant": {"checkSort": variant[0], "ahae0635": variant[1]},
        "reportedTotal": total, "serverPageSize": size, "expectedPages": expected,
        "savedValidPages": len(page_ids), "missingPages": missing, "extraPages": sorted(extra_pages),
        "invalidPages": invalid_pages, "totalDriftPages": drift, "sizeDriftPages": size_drift,
        "invalidPageLengthPages": wrong_length, "recordRows": len(flat),
        "uniqueIds": len(identifiers), "duplicateIds": duplicates,
        "pageCoverageComplete": page_complete,
        "detailCoverage": detail_coverage(folder, identifiers, page_complete),
        "complete": False, "snapshotVerified": False,
    }
    return {"folder": folder.name, "code": code, "variant": variant, "summary": summary,
            "ids": identifiers, "pages": page_ids,
            "firstFetchedAtUtc": manifest.get("firstFetchedAtUtc", "")}


def ancestry(parent_code, child_code, by_id, by_code):
    parent, child = by_code.get(parent_code), by_code.get(child_code)
    if parent is not None and child is not None:
        direct = child.get("pid") == parent["id"]
        node, visited = child, set()
        while node is not None and node["id"] not in visited:
            if node.get("pid") == parent["id"]:
                return "official_tree", direct
            visited.add(node["id"])
            node = by_id.get(node.get("pid"))
        return None
    prefix = parent_code.rstrip("0")
    if len(prefix) >= 2 and child_code != parent_code and child_code.startswith(prefix):
        return "code_prefix_inferred", False
    return None


def audit_cache(cache_root, seed_file, area_seed_file, area_tree_dir=None):
    """Return a private, machine-readable report using filesystem data only."""
    by_id, by_code, children_by_parent, seed_count = official_tree(
        seed_file, area_seed_file, area_tree_dir)
    captures = [audit_capture(folder) for folder in sorted(Path(cache_root).iterdir())
                if folder.is_dir() and (folder / "manifest.json").is_file() and FOLDER.match(folder.name)]
    groups = defaultdict(list)
    for item in captures:
        groups[(item["code"], item["variant"])].append(item)
    rounds, selected = [], {}
    for key, group in groups.items():
        group.sort(key=lambda item: (item["firstFetchedAtUtc"], item["folder"]))
        selected[key] = max(group, key=lambda item: (
            item["summary"]["pageCoverageComplete"], item["firstFetchedAtUtc"], item["folder"]))
        for first, second in zip(group, group[1:]):
            same_total = first["summary"]["reportedTotal"] == second["summary"]["reportedTotal"]
            same_ids = first["ids"] == second["ids"]
            same_page_sets = (first["pages"].keys() == second["pages"].keys()
                              and all(set(first["pages"][p]) == set(second["pages"][p])
                                      for p in first["pages"]))
            same_order = first["pages"] == second["pages"]
            rounds.append({
                "areaCode": key[0], "queryVariant": first["summary"]["queryVariant"],
                "captureNames": [first["folder"], second["folder"]],
                "bothPageCoverageComplete": bool(first["summary"]["pageCoverageComplete"]
                                                 and second["summary"]["pageCoverageComplete"]),
                "sameTotal": same_total, "sameIdSet": same_ids,
                "samePageIdSets": same_page_sets, "samePageOrder": same_order,
                "removedIds": sorted(first["ids"] - second["ids"]),
                "addedIds": sorted(second["ids"] - first["ids"]),
                "twoRoundAgreement": bool(first["summary"]["pageCoverageComplete"]
                                          and second["summary"]["pageCoverageComplete"]
                                          and same_total and same_ids and same_page_sets),
            })
    parent_child = []
    for (parent_code, variant), parent in selected.items():
        for (child_code, child_variant), child in selected.items():
            if parent_code == child_code or variant != child_variant:
                continue
            relation = ancestry(parent_code, child_code, by_id, by_code)
            if relation is None:
                continue
            outside = sorted(child["ids"] - parent["ids"])
            status = ("parent_incomplete" if not parent["summary"]["pageCoverageComplete"] else
                      "outside_parent_observed" if outside else
                      "child_incomplete" if not child["summary"]["pageCoverageComplete"] else
                      "observed_subset")
            parent_child.append({
                "parentCode": parent_code, "childCode": child_code,
                "queryVariant": parent["summary"]["queryVariant"],
                "parentCapture": parent["folder"], "childCapture": child["folder"],
                "relationshipEvidence": relation[0], "directChild": relation[1],
                "overlapCount": len(parent["ids"] & child["ids"]),
                "childOutsideObservedIds": outside, "status": status,
                "snapshotVerified": False,
            })
    sibling_groups = defaultdict(list)
    for (code, variant), item in selected.items():
        node = by_code.get(code)
        if node is not None:
            sibling_groups[(node["pid"], node.get("level"), variant)].append(item)
    siblings = []
    for group in sibling_groups.values():
        for first, second in combinations(sorted(group, key=lambda item: item["code"]), 2):
            overlap = sorted(first["ids"] & second["ids"])
            both_full = bool(first["summary"]["pageCoverageComplete"]
                             and second["summary"]["pageCoverageComplete"])
            siblings.append({
                "firstCode": first["code"], "secondCode": second["code"],
                "queryVariant": first["summary"]["queryVariant"],
                "captureNames": [first["folder"], second["folder"]],
                "overlapIds": overlap, "bothPageCoverageComplete": both_full,
                "status": ("overlap_observed" if overlap else
                           "disjoint_in_cached_pages" if both_full else "no_overlap_observed"),
                "snapshotVerified": False,
            })
    residuals = []
    for (code, variant), parent in selected.items():
        node = by_code.get(code)
        tree_known = node is not None and node["id"] in children_by_parent
        expected_children = children_by_parent[node["id"]] if tree_known else []
        child_codes = sorted(child["sbcode"] for child in expected_children
                             if child.get("sbcode") is not None)
        missing = [child_code for child_code in child_codes if (child_code, variant) not in selected]
        children = [selected[(child_code, variant)] for child_code in child_codes
                    if (child_code, variant) in selected]
        child_ids = set().union(*(child["ids"] for child in children)) if children else set()
        partition_full = bool(tree_known and parent["summary"]["pageCoverageComplete"]
                              and not missing and all(child["summary"]["pageCoverageComplete"]
                                                  for child in children)
                              and all(child.get("sbcode") is not None for child in expected_children))
        residuals.append({
            "parentCode": code, "parentCapture": parent["folder"],
            "queryVariant": parent["summary"]["queryVariant"],
            "treeChildrenKnown": bool(tree_known), "expectedDirectChildCodes": child_codes,
            "missingChildShards": missing,
            "observedResidualIds": sorted(parent["ids"] - child_ids) if tree_known else [],
            "partitionPageCoverageComplete": partition_full,
            "status": ("tree_children_unknown" if not tree_known else
                       "missing_child_shards" if missing else
                       "requires_same_time_snapshot" if partition_full else "incomplete_cached_pages"),
            "conclusive": False,
        })
    return {
        "schemaVersion": 1, "auditKind": "offline-cross-shard",
        "publishable": False, "complete": False, "snapshotVerified": False,
        "tree": {"provinceSeeds": seed_count, "officialNodesCached": len(by_id),
                 "cachedParentResponses": len(children_by_parent),
                 "rootChildrenKnown": "-1" in children_by_parent},
        "captures": {item["folder"]: item["summary"] for item in captures},
        "comparisons": {"rounds": rounds, "parentChild": parent_child,
                        "siblings": siblings, "directResidual": residuals},
        "summary": {
            "captureCount": len(captures), "distinctAreaQueryVariants": len(groups),
            "pageCompleteCaptures": sum(item["summary"]["pageCoverageComplete"] for item in captures),
            "missingPageCount": sum(len(item["summary"]["missingPages"]) for item in captures),
            "twoRoundAgreementCount": sum(item["twoRoundAgreement"] for item in rounds),
            "observedSiblingOverlapCount": sum(bool(item["overlapIds"]) for item in siblings),
            "childOutsideCachedParentComparisons": sum(
                bool(item["childOutsideObservedIds"]) for item in parent_child),
            "parentPageCompleteOutsideComparisons": sum(
                bool(item["childOutsideObservedIds"]) and item["status"] == "outside_parent_observed"
                for item in parent_child),
        },
    }


def save_private_report(path, root, report):
    root, path = Path(root).resolve(), Path(path).resolve()
    if path == root or root not in path.parents or any(part.lower() == "public" for part in path.parts):
        raise ValueError("audit output must stay under its private cache root")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--seed-file", type=Path, default=DEFAULT_SEEDS)
    parser.add_argument("--area-seed-file", type=Path, default=DEFAULT_AREA_SOURCE)
    parser.add_argument("--area-tree-dir", type=Path, default=None,
                        help="optional cached response directory; no HTTP")
    parser.add_argument("--output", type=Path, default=None,
                        help="JSON path inside the private cache root")
    args = parser.parse_args()
    report = audit_cache(args.cache_root, args.seed_file, args.area_seed_file, args.area_tree_dir)
    save_private_report(args.output or args.cache_root / "cross-shard-audit.json", args.cache_root, report)
    print(json.dumps({"schemaVersion": report["schemaVersion"],
                      "publishable": report["publishable"], "complete": report["complete"],
                      "snapshotVerified": report["snapshotVerified"],
                      "summary": report["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
