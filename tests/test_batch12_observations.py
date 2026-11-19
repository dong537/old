import csv
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/build-batch12-observations.py"
SPEC = importlib.util.spec_from_file_location("build_batch12_observations", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
missing_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(missing_module)


class Batch12ObservationTests(unittest.TestCase):
    def test_tampered_archived_audit_manifest_stops_merge(self):
        manifest = json.loads(missing_module.WEST_AUDIT_MANIFEST.read_text(encoding="utf-8"))
        manifest["outputs"]["per-row-location-audit.jsonl"]["sha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as temporary:
            altered = Path(temporary) / "manifest.json"
            altered.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            with patch.object(missing_module, "WEST_AUDIT_MANIFEST", altered):
                with self.assertRaisesRegex(ValueError, "audit archive manifest differs"):
                    missing_module.build()

    def test_west_location_audit_requires_an_exact_unique_key_set(self):
        west = [{"source_file": "source.html", "source_locator": "table[1]/tr[2]",
                 "institution_name": "机构甲", "source_sha256": "a" * 64}]
        audit = [{**west[0], "status": "verified_at_locator"}]
        missing_module.validate_west_location_audit(west, audit)

        with self.assertRaisesRegex(ValueError, "Duplicate west/north location audit key"):
            missing_module.validate_west_location_audit(west, [*audit, *audit])
        with self.assertRaisesRegex(ValueError, "key set differs"):
            missing_module.validate_west_location_audit(west, [])
        with self.assertRaisesRegex(ValueError, "failed or unreviewed"):
            missing_module.validate_west_location_audit(west, [{**west[0], "status": "manual_review_required"}])

    def test_real_batch_retains_baseline_and_only_appends_roster_observations(self):
        content, manifest = missing_module.build()
        rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))
        self.assertEqual(len(rows), 2348)
        self.assertEqual(manifest["appended_by_package"], {"east": 62, "prd": 53, "west_north": 104})
        self.assertEqual(manifest["city_count"], 21)
        self.assertEqual(manifest["west_north_location_audit_version"],
                         missing_module.WEST_AUDIT_VERSION.relative_to(missing_module.ROOT).as_posix())
        self.assertIn("west_north_location_audit_manifest", manifest["inputs_sha256"])
        appended = rows[2129:]
        self.assertEqual(len({(r["source_url"], r["source_file"],
                               json.loads(r["details"])["source_row"]) for r in appended}), 219)
        west = [json.loads(r["details"])["original_package_record"] for r in appended
                if json.loads(r["details"])["source_package"] == "west-north-cities"]
        self.assertTrue(all(r["observation_class"] in missing_module.WEST_ROSTER_CLASSES for r in west))
        self.assertNotIn(missing_module.WEST_EXCLUDED_NAME, {r["institution_name"] for r in west})

    def test_hk_split_preserves_original_and_clears_misfiled_as_of(self):
        content, manifest = missing_module.build()
        rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))
        hk = [(r, json.loads(r["details"])) for r in rows
              if "hk_swd_facility_label_as_published" in json.loads(r["details"])]
        self.assertEqual(len(hk), 14)
        self.assertEqual(manifest["hk_swd_candidate_names_split"], 14)
        for row, detail in hk:
            self.assertEqual(row["source_as_of"], "")
            self.assertEqual(detail["source_as_of_original"], "2026-11-13采集")
            self.assertEqual(detail["retrieved_at"], "2026-11-13")
            self.assertTrue(detail["institution_name_original"])
            self.assertTrue(detail["hk_swd_split_candidate_not_identity_review"])
            self.assertNotIn("source_sha256", detail)

    def test_source_path_rejects_hash_mismatch_and_traversal(self):
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            missing_module.source_path("hk-swd-cleaning", "raw/香港社署广东认可养老院.html", "0" * 64)
        with self.assertRaisesRegex(ValueError, "outside package"):
            missing_module.source_path("hk-swd-cleaning", "../../exports/20261114_batch10/机构名录_逐条来源.csv", "0" * 64)


if __name__ == "__main__":
    unittest.main()
