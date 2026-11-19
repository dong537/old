"""The municipal/district comparison retains source-period boundaries."""
import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/batch15_guangzhou_crosswalk.py"


def cleaner():
    if not SCRIPT.exists():
        raise AssertionError("Guangzhou cross-period cleaner is missing")
    spec = importlib.util.spec_from_file_location("batch15_guangzhou_crosswalk", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CrosswalkTests(unittest.TestCase):
    def test_real_sources_link_exact_name_and_address_without_current_status_claim(self):
        module = cleaner()
        outputs, report = module.build()
        self.assertEqual(report["municipal_tianhe_rows"], 17)
        self.assertEqual(report["district_tianhe_rows"], 19)
        self.assertEqual(report["exact_name_and_address_pairs"], 17)
        self.assertEqual(report["district_only_rows"], 2)
        self.assertEqual(report["district_status_as_published"], {"是": 17, "否": 2})
        self.assertFalse(report["current_operating_status_verified"])
        self.assertFalse(report["same_period_citywide_completeness_proven"])
        self.assertIn("未证实同一资料期", report["limits"][0])
        self.assertIn("crosswalk.csv", outputs)

    def test_reconcile_rejects_ambiguous_municipal_key(self):
        module = cleaner()
        municipal = [
            {"serial": "1", "name": "甲养老院", "address": "甲路1号"},
            {"serial": "2", "name": "甲养老院", "address": "甲路1号"},
        ]
        district = [{"serial": "1", "name": "甲养老院", "address": "甲路1号", "status": "是"}]
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            module.reconcile(municipal, district)

    def test_tampered_original_is_rejected(self):
        module = cleaner()
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "original.html"
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "SHA"):
                module.read_verified(path, "0" * 64)


if __name__ == "__main__":
    unittest.main()
