import hashlib
import tempfile
import unittest
from pathlib import Path

from scripts.provenance_name_audit import audit_missing_sha_rows, render_outputs, save_outputs, verify_outputs


class ProvenanceNameAuditTests(unittest.TestCase):
    def test_matches_visible_html_name_without_backfilling_source_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "official.html"
            source.write_text("<table><tr><td>广 州 市 康 宁 院</td></tr></table>", encoding="utf-8")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            rows = [
                {"city": "广州", "institution_name": "广州市康宁院", "source_url": "https://example.gov.cn/list", "details": "{}"},
                {"city": "广州", "institution_name": "广州市另一院", "source_url": "https://example.gov.cn/list", "details": "{}"},
            ]
            groups = [{"group_id": "group-1", "source_url": "https://example.gov.cn/list",
                       "missing_sha_rows": 2, "tier": "existing_url_hash_and_local_bytes",
                       "artifacts": [{"path": "official.html", "sha256": digest}]}]
            result = audit_missing_sha_rows(rows, groups, root)
            self.assertEqual([item["name_match_status"] for item in result], ["matched", "not_found"])
            self.assertEqual(result[0]["matches"][0]["method"], "normalized")
            self.assertEqual(result[0]["matches"][0]["artifact_sha256"], digest)
            self.assertFalse(result[0]["row_content_verified"])
            self.assertEqual(rows[0]["details"], "{}")

    def test_rejects_artifact_hash_mismatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "official.html").write_text("某养老院", encoding="utf-8")
            rows = [{"city": "广州", "institution_name": "某养老院",
                     "source_url": "https://example.gov.cn/list", "details": "{}"}]
            groups = [{"group_id": "group-1", "source_url": "https://example.gov.cn/list",
                       "missing_sha_rows": 1, "tier": "existing_url_hash_and_local_bytes",
                       "artifacts": [{"path": "official.html", "sha256": "0" * 64}]}]
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                audit_missing_sha_rows(rows, groups, root)

    def test_reads_xlsx_cell_with_exact_location(self):
        from openpyxl import Workbook

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "official.xlsx"
            book = Workbook()
            book.active.title = "机构名录"
            book.active["B3"] = "佛山市长者之家"
            book.save(source)
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            rows = [{"city": "佛山", "institution_name": "佛山市长者之家",
                     "source_url": "https://example.gov.cn/list", "details": "{}"}]
            groups = [{"group_id": "group-1", "source_url": "https://example.gov.cn/list",
                       "missing_sha_rows": 1, "tier": "existing_url_hash_and_local_bytes",
                       "artifacts": [{"path": "official.xlsx", "sha256": digest}]}]
            match = audit_missing_sha_rows(rows, groups, root)[0]["matches"][0]
            self.assertEqual(match["location"], "机构名录!B3")
            self.assertEqual(match["method"], "exact")

    def test_rendered_review_files_keep_every_row_and_manual_status(self):
        records = [
            {"export_line": 2, "city": "广州", "institution_name": "甲养老院",
             "source_url": "https://example.gov.cn/list", "source_file": "official.csv",
             "artifact_tier": "existing_url_hash_and_local_bytes", "name_match_status": "matched",
             "matches": [{"artifact_path": "official.html"}], "row_content_verified": False},
            {"export_line": 3, "city": "广州", "institution_name": "乙养老院",
             "source_url": "https://example.gov.cn/list", "source_file": "official.csv",
             "artifact_tier": "existing_url_hash_and_local_bytes", "name_match_status": "not_found",
             "matches": [], "row_content_verified": False},
        ]
        files = render_outputs(records, "a" * 64, "b" * 64)
        import json
        summary = json.loads(files["summary.json"])
        self.assertEqual(summary["missing_sha_rows"], 2)
        self.assertEqual(summary["name_match_status_counts"], {"matched": 1, "not_found": 1})
        self.assertEqual(summary["row_content_verified"], 0)
        self.assertEqual(files["name-matches.jsonl"].count("\n"), 2)
        self.assertIn("manual_review_required", files["name-matches.csv"])

    def test_saved_files_are_exact_utf8_bytes_and_rechecked(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "version"
            files = {"audit.jsonl": '{"name":"甲"}\n'}
            save_outputs(output, files)
            self.assertEqual((output / "audit.jsonl").read_bytes(), files["audit.jsonl"].encode("utf-8"))
            verify_outputs(output, files)
            with self.assertRaises(FileExistsError):
                save_outputs(output, files)


if __name__ == "__main__":
    unittest.main()
