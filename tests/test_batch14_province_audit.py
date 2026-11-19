"""Offline evidence and access-boundary checks for the batch14 catalogue audit."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/batch14_province_audit.py"


def module():
    if not SCRIPT.exists():
        raise AssertionError("Batch14 province evidence auditor is not implemented")
    spec = importlib.util.spec_from_file_location("batch14_province_audit", SCRIPT)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class ProvinceAuditTests(unittest.TestCase):
    def capture(self, root):
        raw = b'{"status":"1000","data":{}}'
        (root / "raw").mkdir()
        (root / "raw/response.bin").write_bytes(raw)
        return {"key": "test", "http_status": 200, "business_status": "1000",
                "raw_file": "raw/response.bin", "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(), "authorization": "none"}

    def test_original_bytes_are_bound_to_capture(self):
        audit = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            capture = self.capture(root)
            result = audit.validate_capture(root, capture)
            self.assertEqual(result["raw_sha256_verified"], True)
            (root / capture["raw_file"]).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "SHA|size"):
                audit.validate_capture(root, capture)

    def test_missing_response_requires_real_error(self):
        audit = module()
        with tempfile.TemporaryDirectory() as temp:
            record = {"key": "timeout", "authorization": "none"}
            with self.assertRaisesRegex(ValueError, "error"):
                audit.validate_capture(Path(temp), record)
            record.update(error_type="ReadTimeout", error="read timed out")
            result = audit.validate_capture(Path(temp), record)
            self.assertEqual(result["capture_result"], "request_failed")
            self.assertEqual(result["raw_sha256_verified"], False)
            self.assertNotIn("institution_count", result)

    def test_raw_path_cannot_escape_package(self):
        audit = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            capture = self.capture(root)
            capture["raw_file"] = "../response.bin"
            with self.assertRaisesRegex(ValueError, "path"):
                audit.validate_capture(root, capture)

    def test_http_error_body_is_not_labelled_a_successful_response(self):
        audit = module()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            capture = self.capture(root)
            capture["http_status"] = 503
            result = audit.validate_capture(root, capture)
            self.assertEqual(result["capture_result"], "http_error_response_saved")
            self.assertTrue(result["raw_sha256_verified"])

    def test_conditional_label_wins_over_ordinary_enum(self):
        audit = module()
        self.assertEqual(audit.access_decision({"openLevel": "1", "openMode": "有条件开放"}),
                         "conditional_do_not_preview")
        self.assertEqual(audit.access_decision({"openLevel": "3", "openMode": "有条件开放"}),
                         "review_required_do_not_preview")
        self.assertEqual(audit.access_decision({"openLevel": "1", "openMode": "无条件开放"}),
                         "ordinary_preview_eligible_no_data_obtained")
        self.assertEqual(audit.access_decision({}), "unknown_do_not_preview")


if __name__ == "__main__":
    unittest.main()
