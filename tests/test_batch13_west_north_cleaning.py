import csv
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/batch13_west_north_cleaning.py"


class Batch13WestNorthTests(unittest.TestCase):
    def cleaner(self):
        if not SCRIPT.is_file():
            self.fail("Batch13 raw-source cleaner is not implemented yet")
        spec = importlib.util.spec_from_file_location("batch13_west_north_cleaning", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_real_raw_rows_are_separated_from_appendable_and_event_data(self):
        cleaner = self.cleaner()
        files, report = cleaner.build()
        table = lambda name: list(csv.DictReader(io.StringIO(files[name].decode("utf-8-sig"))))
        self.assertEqual(report["roster_rows"], 165)
        self.assertEqual(len(table("roster-observations.csv")), 165)
        self.assertEqual(len(table("historical-roster-observations.csv")), 44)
        self.assertEqual(len(table("republication-observations.csv")), 121)
        self.assertEqual(len(table("observations.csv")), 0)
        self.assertEqual(report["field_audit_rows"], 165)
        self.assertEqual(report["aggregate_status_events"], 1)
        self.assertFalse(report["current_operating_status_verified"])
        for row in table("roster-observations.csv"):
            detail = json.loads(row["details"])
            self.assertEqual(row["source_as_of"], "")
            self.assertTrue(detail["source_row"].startswith("/html/"))
            self.assertNotIn("机构负责人", [v["column_label"] for v in detail["retained_source_cells"].values()])
            self.assertTrue(all("电话" not in v["column_label"] for v in detail["retained_source_cells"].values()))

    def test_source_hash_mismatch_fails_closed(self):
        cleaner = self.cleaner()
        with tempfile.TemporaryDirectory() as temp:
            raw = Path(temp) / "changed.html"
            raw.write_text("<html><body>changed source</body></html>", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                cleaner.verified_document(raw, "0" * 64)

    def test_wrong_cell_locator_cannot_pass_field_verification(self):
        cleaner = self.cleaner()
        files, _ = cleaner.build()
        rows = list(csv.DictReader(io.StringIO(files["roster-observations.csv"].decode("utf-8-sig"))))
        first = rows[0]
        detail = json.loads(first["details"])
        doc = cleaner.verified_document(cleaner.DATA / first["source_file"], detail["source_sha256"])
        altered = json.loads(first["details"])
        altered["retained_source_cells"]["institution_name"]["xpath"] = altered["retained_source_cells"]["address_as_published"]["xpath"]
        with self.assertRaisesRegex(ValueError, "Field value mismatch"):
            cleaner.verify_fields(doc, altered)

    def test_event_preserves_aggregate_scope_without_invented_closures(self):
        cleaner = self.cleaner()
        files, _ = cleaner.build()
        events = [json.loads(line) for line in files["event-observations.jsonl"].decode().splitlines()]
        self.assertEqual(events[0]["effective_period_as_published"], "2024年12月")
        self.assertEqual(events[0]["retained_towns_as_published"], ["合山", "塘坪", "东平", "北惯", "大沟"])
        self.assertEqual(events[0]["individual_institution_closures"], [])
        self.assertFalse(events[0]["institution_identity_verified"])


if __name__ == "__main__":
    unittest.main()
