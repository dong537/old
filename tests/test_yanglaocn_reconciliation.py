"""Offline commercial discovery never becomes an institution identity assertion."""

from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/reconcile-yanglaocn-private.py"


def module():
    assert SCRIPT.is_file(), "offline reconciliation implementation is missing"
    spec = importlib.util.spec_from_file_location("yanglaocn_reconciliation", SCRIPT)
    assert spec and spec.loader
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def observation(url="https://www.yanglaocn.com/ylyxx/y30396.html", **extra):
    return {
        "url": url, "institutionName": "广州测试养老院", "province": "广东",
        "provinceEvidence": "search-result-snippet", "city": "广州",
        "cityEvidence": "search-result-snippet", "evidenceType": "search-snippet",
        "sourceFile": "fixture.json", "sourceRecordId": "lead-1", **extra,
    }


class YanglaocnReconciliationTests(unittest.TestCase):
    def test_index_url_candidate_file_is_not_misclassified_as_search_snippet(self):
        m = module()
        lead = {"candidateId": "b2r-test",
                "originalUrl": "https://www.yanglaocn.com/ylyxx/y30396.html",
                "institutionName": "", "province": None, "city": "韶关",
                "provinceEvidence": None,
                "cityEvidence": {"location": "search-result-title-fragment",
                                 "excerpt": "韶关爱民"},
                "searchTitle": None, "searchSnippet": None,
                "searchResultReference": "turn123search0",
                "directSourceFetched": False,
                "verificationStatus": "search-index-url-only-unverified"}
        with tempfile.TemporaryDirectory(dir=ROOT / "data/private") as temp:
            path = Path(temp) / "candidates.json"
            path.write_text(json.dumps({"schemaVersion": 1, "count": 1,
                                        "candidates": [lead]}), encoding="utf-8")
            observations = m.read_observations(path)
        self.assertEqual(observations[0]["evidenceType"], "search-index-url-only")
        candidate = m.merge_observations(observations)[0]
        self.assertEqual(candidate["evidenceLevel"], "search-index-url-only")
        self.assertIsNone(candidate["institutionName"])
        self.assertIsNone(candidate["province"])

    def test_index_url_lead_without_archived_title_keeps_name_and_region_unknown(self):
        m = module()
        lead = {"leadId": "b2r-test", "originalUrl": "https://www.yanglaocn.com/ylyxx/y30396.html",
                "searchResultReference": "turn123search0", "observedTitleFragment": "韶关爱民",
                "city": "韶关", "province": None, "searchTitle": None,
                "searchSnippet": None, "sourceDate": None, "sourcePageFetched": False,
                "institutionIdentityVerified": False, "currentlyOperating": None,
                "publicationEligible": False}
        with tempfile.TemporaryDirectory(dir=ROOT / "data/private") as temp:
            path = Path(temp) / "leads.json"
            path.write_text(json.dumps({"schemaVersion": 1,
                                        "scope": "external-search-index-only; source requests zero",
                                        "leadCount": 1, "records": [lead]}), encoding="utf-8")
            try:
                observations = m.read_observations(path)
            except (KeyError, ValueError) as error:
                self.fail(f"index URL lead was not accepted: {error}")
        self.assertEqual(observations[0]["evidenceType"], "search-index-url-only")
        self.assertEqual(observations[0]["rawObservation"]["observedTitleFragment"], "韶关爱民")
        candidate = m.match_candidates(m.merge_observations(observations), [])[0]
        self.assertEqual(candidate["evidenceLevel"], "search-index-url-only")
        self.assertIsNone(candidate["institutionName"])
        self.assertIsNone(candidate["province"])
        self.assertIsNone(candidate["city"])
        self.assertEqual(candidate["matchStatus"], "region-unresolved")
        self.assertFalse(candidate["publicationEligible"])

    def test_same_url_search_region_stays_index_only_with_traceable_excerpt(self):
        m = module()
        url = "https://www.yanglaocn.com/ylyxx/y30396.html"
        record = {"candidateId": "ylcn-" + hashlib.sha256(url.encode()).hexdigest()[:16],
                  "institutionName": "广州测试养老院", "url": url,
                  "province": "广东省", "city": "广州",
                  "regionText": "广东 ▪ 广州 ▪ 越秀区",
                  "resultRef": "turn123search0", "query": "site:yanglaocn.com/ylyxx/y30396.html",
                  "evidenceType": "external-search-index-result",
                  "directSourceFetched": False, "sourceDate": None,
                  "retrievedOn": "2026-11-18", "publicationEligible": False}
        with tempfile.TemporaryDirectory(dir=ROOT / "data/private") as temp:
            path = Path(temp) / "search-evidence.json"
            path.write_text(json.dumps({"schemaVersion": 1, "count": 1, "records": [record]}),
                            encoding="utf-8")
            observations = m.read_observations(path)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0]["evidenceType"], "search-index-region")
        self.assertEqual(observations[0]["provinceEvidence"]["excerpt"], record["regionText"])
        self.assertEqual(observations[0]["rawObservation"]["resultRef"], "turn123search0")
        candidate = m.merge_observations(observations)[0]
        self.assertEqual(candidate["evidenceLevel"], "search-index-region-only")
        self.assertEqual(candidate["province"], "广东省")
        self.assertIsNone(candidate["sourceDate"])
        self.assertFalse(candidate["identityConfirmed"])
        self.assertIsNone(candidate["currentlyOperating"])

    def test_same_url_region_evidence_rejects_count_and_url_identity_errors(self):
        m = module()
        url = "https://www.yanglaocn.com/ylyxx/y30396.html"
        record = {"candidateId": "ylcn-wrong", "institutionName": "广州测试养老院",
                  "url": url, "province": "广东省", "city": "广州",
                  "regionText": "广东 ▪ 广州", "resultRef": "turn123search0",
                  "query": "site:yanglaocn.com/ylyxx/y30396.html",
                  "evidenceType": "external-search-index-result",
                  "directSourceFetched": False, "sourceDate": None,
                  "retrievedOn": "2026-11-18", "publicationEligible": False}
        with tempfile.TemporaryDirectory(dir=ROOT / "data/private") as temp:
            path = Path(temp) / "search-evidence.json"
            for count, message in ((2, "count mismatch"),
                                   (1, "candidate identity mismatch")):
                path.write_text(json.dumps({"schemaVersion": 1, "count": count,
                                            "records": [record]}), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, message):
                    m.read_observations(path)

    def test_only_observed_institution_detail_urls_are_accepted(self):
        m = module()
        self.assertEqual(m.detail_url("https://yanglaocn.com/ylyxx/y12.html?utm_source=x#top"),
                         "https://www.yanglaocn.com/ylyxx/y12.html")
        self.assertEqual(m.detail_url("https://www.yanglaocn.com/shtml/ylyxx/2021-11/yly163573623027025.html"),
                         "https://www.yanglaocn.com/shtml/ylyxx/2021-11/yly163573623027025.html")
        for url in ("https://evil.com/ylyxx/y12.html", "https://www.yanglaocn.com/yanglaoyuan/",
                    "https://www.yanglaocn.com/news/2026.html", "javascript:alert(1)"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                m.detail_url(url)

    def test_duplicate_urls_keep_all_observations_without_inventing_page_dates(self):
        m = module()
        merged = m.merge_observations([
            observation(), observation("https://yanglaocn.com/ylyxx/y30396.html?from=search",
                                       sourceRecordId="lead-2", sourceFile="other.json"),
        ])
        self.assertEqual(len(merged), 1)
        self.assertEqual(len(merged[0]["observations"]), 2)
        self.assertEqual(merged[0]["evidenceLevel"], "search-snippet-only")
        self.assertIsNone(merged[0]["sourceDate"])

    def test_query_only_region_cannot_create_same_province_match(self):
        m = module()
        candidate = m.merge_observations([observation(provinceEvidence="query-only")])[0]
        matched = m.match_candidates([candidate], [
            {"kind": "institutionReference", "id": "r1", "name": "广州测试养老院",
             "province": "广东省", "city": "广州市", "address": None},
        ])[0]
        self.assertIsNone(candidate["province"])
        self.assertEqual(matched["matches"], [])
        self.assertEqual(matched["matchStatus"], "region-unresolved")

    def test_same_name_in_other_province_is_not_a_candidate_match(self):
        m = module()
        candidate = m.merge_observations([observation()])[0]
        matched = m.match_candidates([candidate], [
            {"kind": "institutionReference", "id": "r2", "name": "广州测试养老院",
             "province": "广西壮族自治区", "city": "南宁市", "address": None},
        ])[0]
        self.assertEqual(matched["matches"], [])
        self.assertEqual(matched["matchStatus"], "no-same-province-exact-name")

    def test_same_province_exact_name_is_only_candidate_and_city_conflict_survives(self):
        m = module()
        candidate = m.merge_observations([observation(institutionName="广州 测试养老院")])[0]
        matched = m.match_candidates([candidate], [
            {"kind": "institutionReference", "id": "r3", "name": "广州测试养老院",
             "province": "广东省", "city": "深圳市", "address": None},
        ])[0]
        self.assertEqual(matched["matches"][0]["id"], "r3")
        self.assertTrue(matched["matches"][0]["cityConflict"])
        self.assertEqual(matched["matches"][0]["identityConfirmed"], False)

    def test_conflicting_name_and_province_for_one_url_are_not_silently_collapsed(self):
        m = module()
        candidate = m.merge_observations([
            observation(), observation(institutionName="异名养老院", province="广西",
                                       sourceRecordId="lead-2"),
        ])[0]
        self.assertIsNone(candidate["province"])
        self.assertIn("province-conflict", candidate["issues"])
        self.assertIn("name-conflict", candidate["issues"])

    def test_link_label_cannot_borrow_another_names_region_or_evidence_level(self):
        m = module()
        candidate = m.merge_observations([
            observation(institutionName="广州市荔湾区中南街综合养老服务中心（颐康中心）",
                        province=None, city=None, provinceEvidence=None, cityEvidence=None,
                        evidenceType="link-only"),
            observation(institutionName="泉和养老康复中心", province="天津", city="天津",
                        sourceRecordId="lead-2"),
        ])[0]
        self.assertEqual(candidate["institutionName"], "泉和养老康复中心")
        self.assertEqual(candidate["province"], "天津市")
        matched = m.match_candidates([candidate], [
            {"kind": "institutionReference", "id": "wrong", "province": "天津市", "city": "天津市",
             "name": "广州市荔湾区中南街综合养老服务中心（颐康中心）", "address": None},
        ])[0]
        self.assertEqual(matched["matches"], [])

    def test_catalog_matches_retain_the_observation_that_supplied_the_name_and_region(self):
        m = module()
        candidate = m.merge_observations([observation(sourceRecordId="evidence-123")])[0]
        matched = m.match_candidates([candidate], [
            {"kind": "institutionReference", "id": "right", "province": "广东省", "city": "广州市",
             "name": "广州测试养老院", "address": None},
        ])[0]
        self.assertEqual(matched["matches"][0]["supportingObservationIds"], ["evidence-123"])

    def test_city_conflict_cannot_be_erased_by_a_later_matching_observation(self):
        m = module()
        observations = [observation(city="深圳", sourceRecordId="conflicting"),
                        observation(city="广州", sourceRecordId="matching")]
        catalog = [{"kind": "institutionReference", "id": "r1", "province": "广东省",
                    "city": "广州市", "name": "广州测试养老院", "address": None}]
        for items in (observations, list(reversed(observations))):
            candidate = m.merge_observations(items)[0]
            matched = m.match_candidates([candidate], catalog)[0]
            self.assertTrue(matched["matches"][0]["cityConflict"])

    def test_unmatched_name_count_cannot_borrow_a_link_only_names_region(self):
        m = module()
        candidate = m.merge_observations([
            observation(institutionName="广州某养老中心", province=None, city=None,
                        provinceEvidence=None, cityEvidence=None, evidenceType="link-only"),
            observation(institutionName="泉和养老康复中心", province="天津", city="天津",
                        sourceRecordId="search"),
        ])[0]
        candidates = m.match_candidates([candidate], [])
        self.assertEqual(m.unmatched_name_keys(candidates), {("天津市", "泉和养老康复中心")})

    def test_body_evidence_needs_artifact_hash_and_is_not_current_operation_proof(self):
        m = module()
        with self.assertRaises(ValueError):
            m.merge_observations([observation(evidenceType="page-body")])
        candidate = m.merge_observations([observation(
            evidenceType="page-body", artifactSha256="a" * 64,
            artifactPath="access/page.response.bin")])[0]
        self.assertEqual(candidate["evidenceLevel"], "page-body-observed")
        self.assertFalse(candidate["identityConfirmed"])
        self.assertIsNone(candidate["currentlyOperating"])

    def test_catalog_count_mismatch_and_escaping_index_path_fail_closed(self):
        m = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest = {"schemaVersion": 1, "snapshotId": "v1-test", "rowCount": 1,
                        "provinces": [{"name": "广东省", "slug": "gd", "count": 1,
                                       "cities": [{"name": "广州市", "slug": "gz", "count": 1,
                                                   "indexPath": "../private.json"}]}]}
            (root / "manifest.v1.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "index path"):
                m.load_catalog(root, "institutionReference")
            manifest["provinces"][0]["cities"][0]["indexPath"] = "gd/gz/index.v1.json"
            (root / "manifest.v1.json").write_text(json.dumps(manifest), encoding="utf-8")
            index = root / "gd/gz/index.v1.json"
            index.parent.mkdir(parents=True)
            index.write_text(json.dumps({"schemaVersion": 1, "snapshotId": "v1-test",
                                         "provinceSlug": "gd", "citySlug": "gz", "records": []}),
                             encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "count"):
                m.load_catalog(root, "institutionReference")

    def test_output_writer_cannot_overwrite_existing_files_or_follow_hardlinks(self):
        m = module()
        with tempfile.TemporaryDirectory(dir=ROOT / "data/private") as temp:
            root = Path(temp)
            output = root / "combined"
            output.mkdir()
            original = root / "original.json"
            original.write_bytes(b"protected original")
            os.link(original, output / "summary.json")
            with self.assertRaisesRegex(ValueError, "empty"):
                m.write_outputs({"summary.json": b"replacement"}, output, check=False)
            self.assertEqual(original.read_bytes(), b"protected original")
            self.assertEqual((output / "summary.json").read_bytes(), b"protected original")

    def test_output_check_is_read_only_and_new_output_has_exact_bytes(self):
        m = module()
        with tempfile.TemporaryDirectory(dir=ROOT / "data/private") as temp:
            output = Path(temp) / "new"
            m.write_outputs({"summary.json": b"verified"}, output, check=False)
            m.write_outputs({"summary.json": b"verified"}, output, check=True)
            with self.assertRaisesRegex(ValueError, "differs"):
                m.write_outputs({"summary.json": b"changed"}, output, check=True)
            self.assertEqual((output / "summary.json").read_bytes(), b"verified")


if __name__ == "__main__":
    unittest.main()
