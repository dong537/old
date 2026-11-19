import csv
import copy
import importlib.util
import io
import json
import unittest

SCRIPT = __import__("pathlib").Path(__file__).resolve().parents[1] / "scripts/batch13_aggregate_cleaning.py"


class Batch13AggregateCleaningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not SCRIPT.is_file():
            raise AssertionError("Batch13 aggregate cleaner has not been implemented")
        spec = importlib.util.spec_from_file_location("batch13_aggregate_cleaning", SCRIPT)
        cls.cleaner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.cleaner)

    def test_sources_are_partitioned_and_no_status_or_identity_is_invented(self):
        files, report = self.cleaner.build()
        rows = [json.loads(line) for line in files["classified-observations.jsonl"].decode().splitlines()]
        self.assertEqual(len(rows), 463)
        self.assertEqual(report["class_counts"], {
            "current_roster_candidate": 43,
            "historical_roster": 174,
            "special_subset": 120,
            "republication_candidate": 121,
            "status_event": 5,
        })
        self.assertEqual(report["approved_institution_identities"], 0)
        self.assertFalse(report["current_operating_status_verified"])
        self.assertEqual(report["legacy_baseline_rows"], 2348)
        self.assertEqual(report["legacy_rows_missing_source_sha"], 821)
        self.assertTrue(all(not row["institution_identity_verified"] for row in rows))
        self.assertTrue(all(row["current_operating_status"] == "unknown" for row in rows))
        for row in rows:
            if row["classification"] != "status_event":
                self.assertEqual(row["source_as_of"], "")

    def test_date_labels_are_preserved_without_becoming_statistical_cutoffs(self):
        files, _ = self.cleaner.build()
        rows = [json.loads(line) for line in files["classified-observations.jsonl"].decode().splitlines()]
        stars = [r for r in rows if r["source_family"] == "province" and r["classification"] == "special_subset"]
        self.assertEqual(len(stars), 92)
        self.assertTrue(all(r["source_as_of"] == "" for r in stars))
        self.assertTrue(all(r["date_label_as_published"] == "2023年度（星级评定期，非统计截止日）" for r in stars))
        events = [json.loads(line) for line in files["events.jsonl"].decode().splitlines()]
        merger = next(e for e in events if e["event_type"] == "aggregate_roster_merger_report")
        self.assertEqual(merger["effective_period_as_published"], "2024年12月")
        self.assertEqual(merger["individual_institution_closures"], [])
        periods = [r for r in rows if r["source_family"] == "west-north" and
                   r["details"].get("source_period_as_published") == "2024年"]
        self.assertTrue(periods)
        self.assertTrue(all(r["date_label_as_published"] == "2024年" for r in periods))
        dates = list(csv.DictReader(io.StringIO(files["date-label-register.csv"].decode("utf-8-sig"))))
        period_ids = {r["observation_id"] for r in periods}
        carried = [r for r in dates if r["observation_id"] in period_ids]
        self.assertEqual(len(carried), len(periods))
        self.assertTrue(all(r["subpackage_source_as_of"] == "" and
                            r["normalization_action"] == "carried_as_source_period_label" for r in carried))
        inspection = next(r for r in rows if r["classification"] == "status_event" and r["source_family"] == "east")
        self.assertEqual(inspection["date_label_as_published"], "2026-06-18")
        self.assertEqual(inspection["details"]["details"]["source_as_of_as_supplied_by_subpackage"], "2026-06-18检查事件")
        self.assertEqual(inspection["details"]["details"]["event_effective_date_as_published"], "2026-06-18")

    def test_city_matrix_covers_all_21_cities_without_claiming_completeness(self):
        files, report = self.cleaner.build()
        cities = list(csv.DictReader(io.StringIO(files["city-cleaning-matrix.csv"].decode("utf-8-sig"))))
        self.assertEqual(len(cities), 21)
        self.assertEqual(report["cities_proven_complete_current_roster"], 0)
        self.assertTrue(all(row["same_time_full_current_roster_proven"] == "false" for row in cities))
        self.assertEqual(sum(int(row["batch13_cleaned_observations"]) for row in cities), 473)
        self.assertEqual(report["batch13_city_unknown_rows"], 4)
        self.assertEqual(len(report["batch13_city_unknown_observations"]), 4)
        for row in cities:
            self.assertTrue(row["source_scope"] and row["specific_gaps"] and row["known_source_periods"])
            self.assertTrue(json.loads(row["coverage_evidence_paths"]))

    def test_scan_transcriptions_remain_separate_and_do_not_claim_text_verification(self):
        files, report = self.cleaner.build()
        scans = [json.loads(line) for line in files["scan-review-observations.jsonl"].decode().splitlines()]
        main = [json.loads(line) for line in files["classified-observations.jsonl"].decode().splitlines()]
        self.assertEqual(len(scans), 14)
        self.assertEqual(len(main), 463)
        self.assertTrue(all(r["source_as_of"] == "" and not r["institution_identity_verified"] for r in scans))
        self.assertTrue(all(r["details"]["human_reviewed"] is False and
                            r["details"]["machine_text_verified"] is False for r in scans))
        self.assertEqual(report["cumulative_source_observations_including_candidate_roster"], 2391)
        self.assertIn("旧2348条", report["date_label_scope"])
        inspections = [r for r in scans if r["classification"] == "scan_inspection_event"]
        self.assertEqual(len(inspections), 4)
        self.assertTrue(all("推定" in r["date_label_as_published"] for r in inspections))
        self.assertTrue(all(r["details"]["date_label_includes_inferred_year"] for r in inspections))
        for row in scans:
            for location in row["details"]["source_locations"]:
                for key in ("original_source_path", "visual_reference_source_path", "crop_source_path"):
                    self.assertTrue((self.cleaner.DATA / location[key]).is_file())

    def test_company_response_audit_is_separate_from_institution_identity(self):
        files, report = self.cleaner.build()
        companies = json.loads(files["company-raw-audit-summary.json"])
        self.assertEqual(companies["entities_checked"], 583)
        self.assertEqual(companies["registration_field_checks"], 14575)
        self.assertEqual(companies["raw_responses_sha256_matched"], 583)
        self.assertEqual(companies["binding_methods"]["legacy-126-snapshot-path+sha"], 126)
        self.assertEqual(companies["mismatches"], 0)
        self.assertEqual(report["approved_institution_identities"], 0)

    def test_unmatched_source_hash_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            self.cleaner.require_sha(b"changed", "0" * 64)

    def test_province_name_and_rating_must_match_their_exact_paragraph(self):
        rows = self.cleaner.read_csv(self.cleaner.PROVINCE / "official-stars-2023-subset.csv")
        bad_name = copy.deepcopy(rows)
        bad_name[0]["institution_name"] = "任意改写的机构"
        with self.assertRaisesRegex(ValueError, "Province published row mismatch"):
            self.cleaner.validate_province_rows(bad_name)
        bad_rating = copy.deepcopy(rows)
        detail = json.loads(bad_rating[0]["details"])
        detail["star_rating_as_published"] = 1
        bad_rating[0]["details"] = json.dumps(detail)
        with self.assertRaisesRegex(ValueError, "Province published row mismatch"):
            self.cleaner.validate_province_rows(bad_rating)
        bad_evidence = copy.deepcopy(rows)
        bad_evidence[0]["evidence_type"] = "当前全量在营名录"
        with self.assertRaisesRegex(ValueError, "Province date/source binding mismatch"):
            self.cleaner.validate_province_rows(bad_evidence)


if __name__ == "__main__":
    unittest.main()
