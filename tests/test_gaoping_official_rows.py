"""Behavior checks for the dated Gaoping district source list."""

import hashlib
import io
import unittest

from openpyxl import load_workbook

from scripts.gaoping_official_rows import (
    PAGE, ROW_COUNT, WORKBOOK, load_gaoping_rows, parse_gaoping_rows,
    validate_gaoping_page,
)


class GaopingOfficialRowsTests(unittest.TestCase):
    def test_frozen_page_and_workbook_yield_36_name_only_rows(self):
        validate_gaoping_page(PAGE.read_bytes())
        rows = load_gaoping_rows()
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, ROW_COUNT + 1)))
        self.assertEqual(rows[0].name, "南充市高坪区鹤鸣山老年养护健康管理有限公司（中央厨房）")
        self.assertEqual(rows[17].name, "四川孝心壹号养老服务有限公司")
        self.assertEqual(rows[-1].name, "南充沐之爱养老服务有限公司")
        self.assertEqual(set(vars(rows[0])), {"row_number", "name"})

    def test_rejects_changed_hash_and_page(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_gaoping_rows(WORKBOOK.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_gaoping_page(PAGE.read_bytes() + b"changed")

    def test_rejects_changed_header_and_missing_row_even_with_new_hash(self):
        def alter(header=False, missing=False):
            workbook = load_workbook(io.BytesIO(WORKBOOK.read_bytes()))
            sheet = workbook.active
            if header:
                sheet.cell(1, 1).value = "名称"
            if missing:
                sheet.delete_rows(sheet.max_row)
            output = io.BytesIO()
            workbook.save(output)
            workbook.close()
            return output.getvalue()

        for changed, error in ((alter(header=True), "header"), (alter(missing=True), "row count")):
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                parse_gaoping_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())

    def test_rejects_contact_like_name_even_with_new_hash(self):
        workbook = load_workbook(io.BytesIO(WORKBOOK.read_bytes()))
        workbook.active.cell(2, 1).value = "测试院 13800000000"
        output = io.BytesIO()
        workbook.save(output)
        workbook.close()
        changed = output.getvalue()
        with self.assertRaisesRegex(ValueError, "contact data"):
            parse_gaoping_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())


if __name__ == "__main__":
    unittest.main()
