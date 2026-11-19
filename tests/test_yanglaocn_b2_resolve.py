"""B2 local alias candidates remain review leads, never identity assertions."""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/resolve-yanglaocn-b2-private.py"


def module():
    spec = importlib.util.spec_from_file_location("yanglaocn_b2_resolve", SCRIPT)
    assert spec and spec.loader
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def candidate(name="北京福提园养老院", province="北京市", city="北京", *,
              status="no-same-province-exact-name", address=None, evidence="search-snippet"):
    raw = {"address": address} if address else {}
    return {"candidateId": "lead-1", "urlKey": "https://www.yanglaocn.com/ylyxx/y22913.html",
            "institutionName": name, "province": province, "city": city,
            "matchStatus": status, "evidenceLevel": evidence,
            "observations": [{"sourceRecordId": "source-1", "institutionName": name,
                              "province": province, "city": city,
                              "provinceEvidence": "search-result-title" if province else None,
                              "cityEvidence": "search-result-title" if city else None,
                              "evidenceType": evidence, "rawObservation": raw}]}


def row(name, province="北京市", city="北京", *, kind="reference", row_id="record-1",
        address=None):
    return {"kind": kind, "id": row_id, "name": name, "province": province,
            "city": city, "address": address, "sourceRow": 430 if kind == "reference" else None,
            "sourceId": "bj-mzj-20260210" if kind == "official" else None}


class YanglaocnB2ResolveTests(unittest.TestCase):
    def test_jurisdiction_prefix_match_retains_each_source_id_without_confirming_identity(self):
        m = module()
        result = m.resolve_candidate(candidate(), [
            row("北京市大兴区福提园养老院"),
            row("北京市大兴区福提园养老院", kind="official", row_id="official-1")])
        self.assertEqual({hit["sourceId"] for hit in result["matches"]},
                         {"record-1", "official-1"})
        self.assertEqual({hit["matchRule"] for hit in result["matches"]},
                         {"shared-distinctive-suffix"})
        self.assertTrue(all(0 < hit["score"] < 100 and
                            not hit["identityConfirmed"] for hit in result["matches"]))
        self.assertTrue(all(hit["supportingObservationIds"] == ["source-1"]
                            for hit in result["matches"]))

    def test_explicit_parenthetical_alias_is_a_candidate_but_generic_suffix_is_not(self):
        m = module()
        result = m.resolve_candidate(
            candidate("北京市某养老院（原北京福提园养老院）"),
            [row("北京福提园养老院"), row("北京市大兴区老年公寓", row_id="generic")])
        self.assertEqual([hit["sourceId"] for hit in result["matches"]], ["record-1"])
        self.assertEqual(result["matches"][0]["matchRule"], "explicit-parenthetical-alias")

    def test_exact_observed_address_can_suggest_a_differently_named_row(self):
        m = module()
        source = candidate("广州鹏瑞利康养护社区", "广东省", "广州",
                           address="广州市黄埔区开创大道77号", evidence="page-body")
        result = m.resolve_candidate(source, [
            row("黄埔区康养服务中心", "广东省", "广州市", row_id="address-hit",
                address="广州黄埔区开创大道77号"),
            row("黄埔区康养服务中心", "广西壮族自治区", "广州市", row_id="wrong-province",
                address="广州黄埔区开创大道77号")])
        self.assertEqual([hit["sourceId"] for hit in result["matches"]], ["address-hit"])
        self.assertEqual(result["matches"][0]["matchRule"], "observed-address")

    def test_region_unresolved_cannot_borrow_region_from_name_or_catalog(self):
        m = module()
        source = candidate("北京市大兴区福提园养老院", None, None,
                           status="region-unresolved", evidence="link-only")
        result = m.resolve_candidate(source, [row("北京市大兴区福提园养老院")])
        self.assertEqual(result["reviewStatus"], "region-unresolved-no-same-province-match")
        self.assertEqual(result["matches"], [])

    def test_external_result_display_region_supports_same_observation_matching(self):
        m = module()
        source = candidate("天津市南开区康颐缘养老服务中心", "天津市", "天津")
        region = {"excerpt": "天津 ▪ 天津 ▪ 南开区", "location": "search-result-display",
                  "reference": "search-1"}
        source["observations"][0].update(
            evidenceType="search-index-region", provinceEvidence=region, cityEvidence=region)
        result = m.resolve_candidate(source, [
            row("南开区康颐缘养老服务中心", "天津市", "天津市")])
        self.assertEqual([hit["sourceId"] for hit in result["matches"]], ["record-1"])

    def test_city_conflict_and_observation_name_province_pairing_survive(self):
        m = module()
        source = candidate("泉和养老康复中心", "天津市", "天津")
        source["observations"].append({"sourceRecordId": "link-2",
                                       "institutionName": "广州市荔湾区中南街综合养老服务中心",
                                       "province": None, "city": None,
                                       "provinceEvidence": None, "cityEvidence": None,
                                       "evidenceType": "link-only", "rawObservation": {}})
        result = m.resolve_candidate(source, [
            row("天津泉和养老康复中心", "天津市", "滨海新区", row_id="other-city"),
            row("广州市荔湾区中南街综合养老服务中心", "天津市", "天津", row_id="borrowed")])
        self.assertEqual([hit["sourceId"] for hit in result["matches"]], ["other-city"])
        self.assertEqual(result["matches"][0]["conflicts"], ["city-mismatch"])

    def test_district_conflict_from_existing_address_is_preserved(self):
        m = module()
        source = candidate("山东省济南市槐荫区济南华森老年公寓", "山东省", "济南市")
        result = m.resolve_candidate(source, [
            row("济南华森老年公寓", "山东省", "济南市",
                address="历下区长岭山东侧")])
        self.assertEqual(result["matches"][0]["conflicts"], ["district-mismatch"])
        source = candidate("江苏省泰州市海陵区黄桥镇敬老院", "江苏省", "泰州市")
        result = m.resolve_candidate(source, [
            row("黄桥镇敬老院", "江苏省", "泰州市",
                address="江苏省泰州市泰兴市黄桥镇致富北路48号")])
        self.assertEqual(result["matches"][0]["conflicts"], ["district-mismatch"])

    def test_generic_name_similarity_does_not_make_a_candidate(self):
        m = module()
        source = candidate("山东省青岛市市南区八大湖街道老年公寓", "山东省", "青岛市")
        result = m.resolve_candidate(source, [
            row("山东省青岛市市南区八大关老年公寓", "山东省", "青岛市", row_id="different-street"),
            row("老年公寓", "山东省", "青岛市", row_id="generic")])
        self.assertEqual(result["matches"], [])

    def test_equal_length_different_names_are_not_containment_matches(self):
        m = module()
        source = candidate("中南颐养院", "广东省", "汕头")
        result = m.resolve_candidate(source, [
            row("康宁颐养院", "广东省", "汕头", row_id="unrelated")])
        self.assertEqual(result["matches"], [])

    def test_shared_generic_legal_suffix_and_conflicting_name_prefix_do_not_match(self):
        m = module()
        source = candidate("湖北省宜昌市夷陵区乐天溪镇农村福利院", "湖北省", "宜昌市")
        result = m.resolve_candidate(source, [
            row("太平溪镇农村福利院", "湖北省", "宜昌市", row_id="other-town"),
            row("宜昌市夷陵区三斗坪镇农村福利院", "湖北省", "宜昌市", row_id="other-town-2")])
        self.assertEqual(result["matches"], [])
        company = candidate("河南省中原豫资颐园养老服务有限公司", "河南省", "信阳")
        self.assertEqual(m.resolve_candidate(company, [
            row("信阳市安寿康养老服务有限公司", "河南省", "信阳")])["matches"], [])

    def test_same_city_prefix_variant_with_distinctive_suffix_is_a_review_lead(self):
        m = module()
        source = candidate("广东汕头中南颐养院", "广东省", "汕头")
        result = m.resolve_candidate(source, [
            row("汕头市中南颐养院", "广东省", "汕头市")])
        self.assertEqual([hit["sourceId"] for hit in result["matches"]], ["record-1"])

    def test_autonomous_region_short_prefix_is_recognized_as_geography(self):
        m = module()
        source = candidate("广西梧州市社会福利院", "广西壮族自治区", "梧州")
        result = m.resolve_candidate(source, [
            row("梧州市社会福利院", "广西壮族自治区", "梧州市")])
        self.assertEqual([hit["sourceId"] for hit in result["matches"]], ["record-1"])

    def test_equal_length_unrelated_prefixes_cannot_share_a_generic_tail(self):
        m = module()
        source = candidate("湖南省长沙市长沙县凯雅山庄老年公寓", "湖南省", "长沙市")
        result = m.resolve_candidate(source, [
            row("长沙市望城区安华山庄老年公寓", "湖南省", "长沙市")])
        self.assertEqual(result["matches"], [])

    def test_only_prior_unmatched_candidates_receive_b2_matching(self):
        m = module()
        source = candidate(status="same-province-exact-name-candidate")
        result = m.resolve_candidate(source, [row("北京市大兴区福提园养老院")])
        self.assertEqual(result["reviewStatus"], "prior-exact-candidate-out-of-scope")
        self.assertEqual(result["matches"], [])

    def test_b2_output_keeps_170_urls_and_never_confirms_identity(self):
        m = module()
        files = m.build_output()
        self.assertIn("summary.json", files)
        summary = json.loads(files["summary.json"])
        rows = json.loads(files["review-candidates.json"])["candidates"]
        self.assertEqual(summary["inputCandidateCount"], 170)
        self.assertEqual(summary["priorStatuses"]["no-same-province-exact-name"], 115)
        self.assertEqual(summary["reviewStatuses"]["region-unresolved-no-same-province-match"], 50)
        self.assertEqual(summary["reviewStatuses"]["prior-exact-candidate-out-of-scope"], 5)
        self.assertEqual(len(rows), 170)
        self.assertTrue(all(not row["identityConfirmed"] for row in rows))
        self.assertTrue(all(not hit["identityConfirmed"] for row in rows
                            for hit in row["matches"]))
        self.assertTrue(files["review-candidates.csv"].startswith(b"\xef\xbb\xbf"))


    def test_priority_list_filters_city_conflicts_and_caps_three_per_url(self):
        m = module()
        results = [{"candidateId": "one", "matches": [
            {"score": 92, "conflicts": [], "sourceId": "a"},
            {"score": 88, "conflicts": ["city-mismatch"], "sourceId": "b"},
            {"score": 88, "conflicts": ["district-mismatch"], "sourceId": "district"},
            {"score": 84, "conflicts": [], "sourceId": "c"},
            {"score": 84, "conflicts": [], "sourceId": "d"},
            {"score": 80, "conflicts": [], "sourceId": "e"},
            {"score": 78, "conflicts": [], "sourceId": "f"},
        ]}]
        self.assertEqual([hit["sourceId"] for item in m.priority_review(results)
                          for hit in item["matches"]], ["a", "c", "d"])


if __name__ == "__main__":
    unittest.main()
