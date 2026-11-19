"""Supplemental provenance must not be mistaken for entity or full-field verification."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/batch15_guangzhou_legacy_provenance.py"


def cleaner():
    spec = importlib.util.spec_from_file_location("batch15_guangzhou_legacy_provenance", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GuangzhouLegacyProvenanceTests(unittest.TestCase):
    def test_real_rows_bind_to_source_cells_without_entity_claim(self):
        module = cleaner()
        outputs, report = module.build()
        self.assertEqual(report["legacy_rows_with_supplemental_source_link"], 235)
        self.assertEqual(report["literal_equal_names"], 169)
        self.assertEqual(report["nfkc_whitespace_name_variants"], 66)
        self.assertFalse(report["all_fields_verified"])
        self.assertFalse(report["institution_identity_verified"])
        self.assertFalse(report["current_operating_status_verified"])
        self.assertEqual(report["public_snapshot_fields_compared"], 2115)
        self.assertEqual(report["public_snapshot_literal_equal_cells"], 2031)
        self.assertEqual(report["public_snapshot_nfkc_whitespace_equal_cells"], 84)
        self.assertIn("links.csv", outputs)

    def test_wrong_bed_count_is_not_normalized_away(self):
        module = cleaner()
        official = module.source_rows(module.verified(module.SOURCE, module.SOURCE_SHA))
        raw = module.verified(module.PUBLIC_CSV, module.PUBLIC_SHA)
        changed = raw.replace(b",54,", b",999,", 1)
        with self.assertRaisesRegex(ValueError, "serial 1"):
            module.compare_public_fields(changed, official)

    def test_wrong_legacy_name_is_not_silently_accepted(self):
        module = cleaner()
        official = module.source_rows(module.verified(module.SOURCE, module.SOURCE_SHA))
        legacy = module.legacy_rows(module.verified(module.LEGACY, module.LEGACY_SHA))
        legacy[0]["name"] += "误写"
        with self.assertRaisesRegex(ValueError, "serial 1"):
            module.link(legacy, official)

    def test_duplicate_or_missing_legacy_row_is_rejected_at_link_boundary(self):
        module = cleaner()
        official = module.source_rows(module.verified(module.SOURCE, module.SOURCE_SHA))
        legacy = module.legacy_rows(module.verified(module.LEGACY, module.LEGACY_SHA))
        for changed in (legacy + [legacy[0]], legacy[:-1], legacy[:-1] + [legacy[0]]):
            with self.subTest(length=len(changed)):
                with self.assertRaisesRegex(ValueError, "Legacy serial mapping"):
                    module.link(changed, official)

    def test_changed_source_bytes_are_rejected(self):
        module = cleaner()
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "source.html"
            path.write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "SHA mismatch"):
                module.verified(path, module.SOURCE_SHA)


if __name__ == "__main__":
    unittest.main()
