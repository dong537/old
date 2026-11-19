"""Behaviour checks for additive, evidence-bound batch14 cleaning."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/batch14_aggregate_cleaning.py"


def module():
    if not SCRIPT.exists():
        raise AssertionError("Batch14 aggregate cleaner is not implemented")
    spec = importlib.util.spec_from_file_location("batch14_aggregate_cleaning", SCRIPT)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class AggregateTests(unittest.TestCase):
    def observation(self, root, classification="current_roster_candidate"):
        path = root / "research-batch14/pearl/raw/source.html"
        path.parent.mkdir(parents=True)
        path.write_bytes(b"original source bytes")
        return {"city": "广州", "institution_name": "同名服务点", "source_url": "https://example.test/list",
                "source_published_at": "2026-10-16", "source_as_of": "",
                "source_file": path.relative_to(root).as_posix(), "evidence_type": "官方备案表",
                "details": json.dumps({"classification": classification,
                    "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "source_locator": "table[1]/tr[3]", "source_period_label": "2026年10月16日（表题）",
                    "raw_fields": [{"header_raw": "是否运营", "value_raw": "否", "cell_xpath": "table[1]/tr[3]/td[6]"}]}, ensure_ascii=False)}

    def test_source_status_does_not_become_current_status(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            row = self.observation(root)
            result = cleaner.normalize_observation(row, "pearl", root)
            self.assertEqual(result["current_operating_status"], "unknown")
            self.assertFalse(result["institution_identity_verified"])
            self.assertEqual(result["details"]["raw_fields"][0]["value_raw"], "否")
            self.assertEqual(result["source_as_of"], "")
            self.assertEqual(result["date_label_as_published"], "2026年10月16日（表题）")

    def test_rejects_changed_raw_sha_and_missing_locator(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            row = self.observation(root)
            detail = json.loads(row["details"])
            detail["source_sha256"] = "0" * 64
            row["details"] = json.dumps(detail)
            with self.assertRaisesRegex(ValueError, "SHA"):
                cleaner.normalize_observation(row, "pearl", root)
            detail["source_sha256"] = hashlib.sha256((root / row["source_file"]).read_bytes()).hexdigest()
            del detail["source_locator"]
            row["details"] = json.dumps(detail)
            with self.assertRaisesRegex(ValueError, "locator"):
                cleaner.normalize_observation(row, "pearl", root)

    def test_period_label_cannot_become_as_of(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            row = self.observation(root)
            row["source_as_of"] = "2026-10-16"
            with self.assertRaisesRegex(ValueError, "source_as_of"):
                cleaner.normalize_observation(row, "pearl", root)

    def test_only_roster_candidates_are_appended_and_legacy_is_unchanged(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.observation(root)
            roster = cleaner.normalize_observation(source, "pearl", root)
            event = {**roster, "classification": "status_event"}
            legacy = [{key: "legacy " + key for key in cleaner.FIELDS}]
            before = json.dumps(legacy)
            result = cleaner.append_roster_candidates(legacy, [roster, event])
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0], legacy[0])
            self.assertEqual(json.dumps(legacy), before)
            self.assertEqual(tuple(result[1]), cleaner.FIELDS)

    def test_retained_field_ledger_preserves_false_and_zero_values(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.observation(root)
            row = cleaner.normalize_observation(source, "pearl", root)
            claims = cleaner.retained_field_rows([row])
            self.assertEqual(len(claims), 1)
            self.assertEqual(claims[0]["value_as_published"], "否")
            self.assertEqual(claims[0]["cell_locator"], "table[1]/tr[3]/td[6]")
            row["details"]["raw_fields"] = [{"header_raw": "床位", "value_raw": 0, "cell": "B4"}]
            claims = cleaner.retained_field_rows([row])
            self.assertEqual(claims[0]["value_as_published"], 0)
            self.assertEqual(claims[0]["cell_locator"], "B4")

    def test_rejects_unrecognised_class_and_escaping_source(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            row = self.observation(root, "verified_institution")
            with self.assertRaisesRegex(ValueError, "classification"):
                cleaner.normalize_observation(row, "pearl", root)
            detail = json.loads(row["details"])
            detail["classification"] = "current_roster_candidate"
            row["details"] = json.dumps(detail)
            row["source_file"] = "../raw.html"
            with self.assertRaisesRegex(ValueError, "path"):
                cleaner.normalize_observation(row, "pearl", root)

    def test_rejects_original_source_from_another_batch(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            row = self.observation(root)
            original = root / row["source_file"]
            wrong = root / "research-batch13/pearl/raw/source.html"
            wrong.parent.mkdir(parents=True)
            wrong.write_bytes(original.read_bytes())
            row["source_file"] = wrong.relative_to(root).as_posix()
            with self.assertRaisesRegex(ValueError, "batch/family"):
                cleaner.normalize_observation(row, "pearl", root)

    def test_rejects_referenced_package_input_without_sha_pin(self):
        cleaner = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            package = root / "research-batch14"
            relative = "research-batch14/pearl/observations.csv"
            path = root / relative
            path.parent.mkdir(parents=True)
            path.write_text("data", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not pinned"):
                cleaner.verified_package_input(relative, {}, {}, data_root=root, package_root=package)


if __name__ == "__main__":
    unittest.main()
