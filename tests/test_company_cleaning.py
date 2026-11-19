import csv
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from company_cleaning import CLEANED_COLUMNS, REGISTRATION_FIELDS, build_dataset, read_inputs


def sample_row(code="91440101MA00000001"):
    row = {field: "" for field in CLEANED_COLUMNS}
    row.update({
        "数据批次": "测试批次", "查询关键词": "测试养老服务有限公司", "来源类别": "官方机构名单",
        "企业名称": "测试养老服务有限公司", "统一社会信用代码": code,
        "登记状态": "存续", "成立日期": "2020-01-01", "核准日期": "2025-01-01",
        "所属地区": "广东省广州市", "来源URL": "https://example.org/source",
        "工商采集时间": "2026-11-14", "原始回包SHA256": "a" * 64,
    })
    return row


class CompanyCleaningTests(unittest.TestCase):
    def test_real_source_keeps_every_unique_company_and_scoped_subset(self):
        all_rows, scoped_rows = read_inputs()
        companies, review, audit = build_dataset(all_rows, scoped_rows)
        self.assertEqual(len(companies), 583)
        self.assertEqual(audit["scope_counts"]["institution_or_direct_care"], 564)
        self.assertEqual(len({row["id"] for row in companies}), 583)
        self.assertEqual(sum(row["registration"]["登记状态"] == "注销" for row in companies if row["scope"] == "institution_or_direct_care"), 5)
        self.assertEqual(sum("registered_outside_guangdong" in row["reviewFlags"] for row in companies if row["scope"] == "institution_or_direct_care"), 6)
        self.assertTrue(review)
        self.assertTrue(all(len(row["registration"]) == len(REGISTRATION_FIELDS) for row in companies))
        self.assertTrue(all(row["provenance"]["sourceUrls"] and row["provenance"]["rawResponseSha256"] for row in companies))
        by_code = {row["registration"]["统一社会信用代码"]: row for row in companies}
        for original in all_rows:
            company = by_code[original["统一社会信用代码"]]
            for field in REGISTRATION_FIELDS:
                self.assertEqual(company["registration"][field], original[field].strip() or None)

    def test_duplicate_identity_and_missing_source_stop_cleaning(self):
        row = sample_row()
        with self.assertRaisesRegex(ValueError, "重复"):
            build_dataset([row, row.copy()], [row])
        without_url = sample_row()
        without_url["来源URL"] = ""
        with self.assertRaisesRegex(ValueError, "来源"):
            build_dataset([without_url], [without_url])

    def test_empty_fields_stay_unknown_and_source_status_is_only_a_review_flag(self):
        row = sample_row()
        row["注册资本"] = ""
        row["证据状态限制"] = "官方机构表标为停业"
        companies, review, audit = build_dataset([row], [row])
        company = companies[0]
        self.assertIsNone(company["registration"]["注册资本"])
        self.assertEqual(company["registration"]["登记状态"], "存续")
        self.assertIn("source_status_conflict_candidate", company["reviewFlags"])
        self.assertEqual(company["scope"], "institution_or_direct_care")
        self.assertGreater(len(review), 0)

    def test_scoped_row_must_match_full_registration(self):
        row = sample_row()
        mismatch = row.copy()
        mismatch["登记状态"] = "注销"
        with self.assertRaisesRegex(ValueError, "范围"):
            build_dataset([row], [mismatch])


if __name__ == "__main__":
    unittest.main()
