"""Offline cross-shard reconciliation; fixtures contain no real contact data."""

import base64
import json
import runpy
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "audit-mca-shards.py"
PROVINCE = "110000000000"
EAST = "110101000000"
WEST = "110102000000"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def fixture_sources(root):
    seeds = root / "seeds.json"
    snapshot = root / "area-source.json"
    write_json(seeds, {"seedCount": 1, "seeds": [
        {"sbcode": PROVINCE, "sourceNodeId": "p", "sourceParentId": "-1",
         "name": "province"},
    ]})
    write_json(snapshot, {"requests": [
        {"path": "/console/area/childs/-1", "httpStatus": 200,
         "body": {"code": 0, "data": [
             {"id": "p", "pid": "-1", "sbcode": PROVINCE, "level": 1, "name": "province"},
         ]}},
        {"path": "/console/area/childs/p", "httpStatus": 200,
         "body": {"code": 0, "data": [
             {"id": "e", "pid": "p", "sbcode": EAST, "level": 2, "name": "east"},
             {"id": "w", "pid": "p", "sbcode": WEST, "level": 2, "name": "west"},
         ]}},
    ]})
    return seeds, snapshot


def capture(root, code, label, ids_by_page, total, *, sorted_query=True, details=None):
    suffix = "-check-sort-1" if sorted_query else ""
    folder = root / f"area-{code}{suffix}-capture-{label}"
    params = {"size": 2, "areaCode": code}
    if sorted_query:
        params["checkSort"] = 1
    for page, ids in ids_by_page.items():
        write_json(folder / "pages" / f"{page:05d}.json", {
            "httpStatus": 200, "request": {"params": {**params, "current": page}},
            "response": {"code": 0, "data": {
                "current": page, "size": 2, "total": total,
                "records": [{"axbe0001": identifier, "ahae0012": "PRIVATE-CONTACT"}
                            for identifier in ids],
            }},
        })
    write_json(folder / "manifest.json", {
        "schemaVersion": 1, "scope": folder.name, "total": total,
        "serverPageSize": 2, "expectedPages": (total + 1) // 2,
        "filters": {"areaCode": code, "ahae0635": None,
                    **({"checkSort": 1} if sorted_query else {})},
        "complete": False,
    })
    for identifier, endpoints in (details or {}).items():
        write_json(folder / "details" / f"{identifier}.json", {
            "institutionId": identifier, "endpoints": {
                name: {"httpStatus": 200, "request": {"params": {"axbe0001": identifier}},
                       "response": {"code": 0, "data": {"axbe0001": identifier}}}
                for name in endpoints
            },
        })
    return folder


class McaShardAuditTests(unittest.TestCase):
    def setUp(self):
        self.audit = runpy.run_path(str(SCRIPT))["audit_cache"]
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.cache = self.base / "private-cache"
        self.cache.mkdir()
        self.seeds, self.snapshot = fixture_sources(self.base)

    def report(self):
        return self.audit(self.cache, self.seeds, self.snapshot)

    def test_partial_parent_marks_missing_page_and_only_observed_child_noninclusion(self):
        parent = capture(self.cache, PROVINCE, "one", {1: ["a", "b"], 2: ["c", "d"]}, 5)
        capture(self.cache, EAST, "one", {1: ["a", "x"]}, 2)
        report = self.report()
        self.assertEqual(report["captures"][parent.name]["missingPages"], [3])
        self.assertFalse(report["captures"][parent.name]["pageCoverageComplete"])
        pair = next(item for item in report["comparisons"]["parentChild"]
                    if item["parentCode"] == PROVINCE and item["childCode"] == EAST)
        self.assertEqual(pair["childOutsideObservedIds"], ["x"])
        self.assertEqual(pair["status"], "parent_incomplete")
        self.assertEqual(report["summary"]["childOutsideCachedParentComparisons"], 1)
        self.assertEqual(report["summary"]["parentPageCompleteOutsideComparisons"], 0)
        self.assertFalse(report["complete"])
        self.assertFalse(report["snapshotVerified"])
        self.assertNotIn("PRIVATE-CONTACT", json.dumps(report))

    def test_sibling_overlap_and_direct_residual_are_audited_without_snapshot_claim(self):
        capture(self.cache, PROVINCE, "one", {1: ["a", "b"], 2: ["c"]}, 3)
        capture(self.cache, EAST, "one", {1: ["a", "x"]}, 2)
        capture(self.cache, WEST, "one", {1: ["a"]}, 1)
        report = self.report()
        sibling = report["comparisons"]["siblings"][0]
        self.assertEqual(sibling["overlapIds"], ["a"])
        self.assertEqual(sibling["status"], "overlap_observed")
        residual = next(item for item in report["comparisons"]["directResidual"]
                        if item["parentCode"] == PROVINCE)
        self.assertEqual(residual["observedResidualIds"], ["b", "c"])
        self.assertFalse(residual["conclusive"])
        self.assertEqual(residual["missingChildShards"], [])
        pair = next(item for item in report["comparisons"]["parentChild"]
                    if item["childCode"] == EAST)
        self.assertEqual(pair["childOutsideObservedIds"], ["x"])
        self.assertEqual(pair["status"], "outside_parent_observed")

    def test_two_round_drift_detects_changed_ids_despite_equal_totals(self):
        capture(self.cache, EAST, "one", {1: ["a", "b"]}, 2)
        capture(self.cache, EAST, "two", {1: ["a", "c"]}, 2)
        rounds = self.report()["comparisons"]["rounds"]
        self.assertEqual(len(rounds), 1)
        self.assertTrue(rounds[0]["sameTotal"])
        self.assertFalse(rounds[0]["sameIdSet"])
        self.assertFalse(rounds[0]["twoRoundAgreement"])

    def test_detail_coverage_requires_both_valid_endpoints_for_every_observed_id(self):
        folder = capture(self.cache, EAST, "one", {1: ["a", "b"]}, 2,
                         details={"a": ["orgBaseDetail", "yangLaoOrgDetail"],
                                  "b": ["orgBaseDetail"]})
        coverage = self.report()["captures"][folder.name]["detailCoverage"]
        self.assertEqual(coverage["validDetails"], 1)
        self.assertEqual(coverage["invalidDetailIds"], ["b"])
        self.assertFalse(coverage["completeForObservedIds"])

    def test_partial_capture_never_becomes_complete_from_manifest_flag(self):
        folder = capture(self.cache, EAST, "one", {1: ["a", "b"]}, 3)
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        manifest["complete"] = True
        write_json(folder / "manifest.json", manifest)
        result = self.report()["captures"][folder.name]
        self.assertFalse(result["pageCoverageComplete"])
        self.assertEqual(result["missingPages"], [2])

    def test_duplicate_ids_block_page_reconciliation_even_with_all_pages_saved(self):
        folder = capture(self.cache, EAST, "one", {1: ["a", "b"], 2: ["a"]}, 3)
        result = self.report()["captures"][folder.name]
        self.assertEqual(result["missingPages"], [])
        self.assertEqual(result["duplicateIds"], ["a"])
        self.assertFalse(result["pageCoverageComplete"])

    def test_different_sort_queries_are_not_mistaken_for_two_rounds(self):
        capture(self.cache, EAST, "one", {1: ["a", "b"]}, 2)
        capture(self.cache, EAST, "two", {1: ["a", "b"]}, 2, sorted_query=False)
        self.assertEqual(self.report()["comparisons"]["rounds"], [])

    def test_private_output_rejects_public_folder_with_case_variation(self):
        save = runpy.run_path(str(SCRIPT))["save_private_report"]
        public_root = self.base / "Public" / "cache"
        public_root.mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, "private cache root"):
            save(public_root / "audit.json", public_root, {"complete": False})
        self.assertFalse((public_root / "audit.json").exists())

    def test_rejects_tampered_area_tree_response_hash(self):
        responses = self.base / "area-tree" / "responses"
        body = {"code": 0, "data": []}
        write_json(responses / "e.json", {
            "parentId": "e", "httpStatus": 200, "response": body,
            "method": "GET",
            "sourceUrl": "https://yanglao.mca.gov.cn/ylxxptapi/console/area/childs/e",
            "rawBodyBase64": base64.b64encode(json.dumps(body).encode()).decode(),
            "responseSha256": "0" * 64,
            "provenance": {"kind": "live-http", "originalHttpBodyAvailable": True},
        })
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.audit(self.cache, self.seeds, self.snapshot, responses)


if __name__ == "__main__":
    unittest.main()
