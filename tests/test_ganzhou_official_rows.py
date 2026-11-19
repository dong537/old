"""Private intake checks for the Ganzhou 2026 official institution attachment."""

import hashlib
import unittest
from pathlib import Path

import xlrd


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "data/private/national-official-source/raw/jiangxi-ganzhou-eldercare-directory-20260605.xls"


class GanzhouOfficialRowsTests(unittest.TestCase):
    def test_frozen_source_has_exactly_292_sequenced_rows(self):
        from scripts.ganzhou_official_rows import parse_ganzhou_rows

        rows = parse_ganzhou_rows(WORKBOOK.read_bytes())
        self.assertEqual(len(rows), 292)
        self.assertEqual([row.row_number for row in rows], list(range(1, 293)))
        self.assertEqual(
            (rows[0].district, rows[0].name, rows[0].address),
            ("章贡区", "章贡区老龄与养老服务中心", "赣州市章贡区东外街道官园里路3号"),
        )
        self.assertEqual(
            (rows[145].district, rows[145].name, rows[145].address),
            ("宁都县", "宁都县黄陂镇医养结合中心", "黄陂镇圩镇"),
        )
        self.assertEqual(
            (rows[-1].district, rows[-1].name, rows[-1].address),
            ("蓉江新区", "赣州蓉江新区颐养中心", "赣州蓉江新区潭口镇上元村村委会旁"),
        )

    def test_rejects_source_drift_and_changed_headers(self):
        from scripts.ganzhou_official_rows import parse_ganzhou_rows

        raw = WORKBOOK.read_bytes()
        with self.assertRaisesRegex(ValueError, "SHA-256|size"):
            parse_ganzhou_rows(raw + b"changed")

        old = "机构名称".encode("utf-16-le")
        new = "机构地址".encode("utf-16-le")
        self.assertEqual(raw.count(old), 1)
        changed = raw.replace(old, new, 1)
        with self.assertRaisesRegex(ValueError, "header|表头"):
            parse_ganzhou_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())

    def test_rejects_missing_address_in_a_real_source_row(self):
        from scripts.ganzhou_official_rows import parse_ganzhou_rows

        raw = WORKBOOK.read_bytes()
        old = "赣州市章贡区东外街道官园里路3号".encode("utf-16-le")
        self.assertEqual(raw.count(old), 1)
        changed = raw.replace(old, " ".encode("utf-16-le") * (len(old) // 2), 1)
        with self.assertRaisesRegex(ValueError, "address|地址"):
            parse_ganzhou_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())

    def test_rejects_missing_and_repeated_serial_rows(self):
        import scripts.ganzhou_official_rows as parser

        self.assertTrue(hasattr(parser, "parse_ganzhou_table"))
        parse_ganzhou_table = parser.parse_ganzhou_table

        workbook = xlrd.open_workbook(file_contents=WORKBOOK.read_bytes(), on_demand=True)
        try:
            sheet = workbook.sheet_by_index(0)
            source_rows = [sheet.row_values(index) for index in range(sheet.nrows)]
        finally:
            workbook.release_resources()
        self.assertEqual(len(parse_ganzhou_table(source_rows)), 292)

        missing = source_rows[:-1]
        with self.assertRaisesRegex(ValueError, "row count|dimensions"):
            parse_ganzhou_table(missing)

        repeated = [row.copy() for row in source_rows]
        repeated[2][0] = 2.0
        with self.assertRaisesRegex(ValueError, "serial"):
            parse_ganzhou_table(repeated)


if __name__ == "__main__":
    unittest.main()
