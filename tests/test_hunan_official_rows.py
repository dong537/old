"""Checks for the frozen Hunan provincial official-source workbook."""

import hashlib
import io
import unittest
from collections import Counter
from dataclasses import asdict

from openpyxl import load_workbook

from scripts.hunan_official_rows import (
    HUNAN_SHA256, HUNAN_XLSX, CITY_COUNTS, parse_hunan_rows,
)


class HunanOfficialRowsTests(unittest.TestCase):
    def test_real_source_keeps_every_row_and_excludes_person(self):
        rows = parse_hunan_rows(HUNAN_XLSX.read_bytes())
        self.assertEqual(len(rows), 1768)
        self.assertEqual(rows[0].row_number, 1)
        self.assertEqual(rows[0].excel_row, 3)
        self.assertEqual(rows[-1].row_number, 1768)
        self.assertEqual(rows[-1].excel_row, 1770)
        self.assertEqual(sum(row.address is None for row in rows), 3)
        self.assertEqual(sum(row.beds == 0 for row in rows), 6)
        self.assertEqual(rows[710 - 3].address, '169')  # Numeric source cell, not a guessed street address.
        self.assertTrue(all(isinstance(row.beds, int) and row.beds >= 0 for row in rows))
        self.assertEqual(Counter(row.city_name for row in rows), CITY_COUNTS)
        self.assertEqual(len({row.row_number for row in rows}), 1768)
        self.assertEqual(set(asdict(rows[0])), {
            'row_number', 'excel_row', 'name', 'city_name', 'city_slug', 'address', 'beds',
        })
        self.assertEqual(rows[1669 - 3].name, ':涟源正弘健康养老服务有限公司')

    def test_rejects_changed_source_sha(self):
        raw = HUNAN_XLSX.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), HUNAN_SHA256)
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            parse_hunan_rows(raw + b'changed')

    def changed_workbook(self, mutate):
        workbook = load_workbook(io.BytesIO(HUNAN_XLSX.read_bytes()))
        mutate(workbook.active)
        output = io.BytesIO()
        workbook.save(output)
        raw = output.getvalue()
        return raw, hashlib.sha256(raw).hexdigest()

    def test_rejects_changed_header_even_when_sha_is_updated(self):
        raw, sha = self.changed_workbook(lambda ws: setattr(ws['A2'], 'value', '机构名称'))
        with self.assertRaisesRegex(ValueError, 'headers'):
            parse_hunan_rows(raw, expected_sha=sha)

    def test_rejects_missing_row_and_unknown_city(self):
        for mutate, expected in [
            (lambda ws: setattr(ws['A3'], 'value', None), 'missing name'),
            (lambda ws: setattr(ws['B3'], 'value', '湖南省/不存在市/甲区'), 'city'),
        ]:
            with self.subTest(expected=expected):
                raw, sha = self.changed_workbook(mutate)
                with self.assertRaisesRegex(ValueError, expected):
                    parse_hunan_rows(raw, expected_sha=sha)

    def test_rejects_negative_or_noninteger_beds(self):
        for beds in (-1, 1.5):
            with self.subTest(beds=beds):
                raw, sha = self.changed_workbook(lambda ws: setattr(ws['E3'], 'value', beds))
                with self.assertRaisesRegex(ValueError, 'beds'):
                    parse_hunan_rows(raw, expected_sha=sha)


if __name__ == '__main__':
    unittest.main()
