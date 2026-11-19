"""Checks for the frozen Shijiazhuang city PDF and contact-free projection."""

from __future__ import annotations

import copy
import unittest
from dataclasses import asdict

from scripts.shijiazhuang_official_rows import (
    PDF_BYTES, PDF_PATH, PDF_SHA256, extract_shijiazhuang_tables,
    parse_shijiazhuang_rows, project_shijiazhuang_tables,
)


class ShijiazhuangOfficialRowsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.raw = PDF_PATH.read_bytes()
        cls.tables = extract_shijiazhuang_tables(cls.raw)

    def test_frozen_source_preserves_265_serials_and_268_physical_rows(self) -> None:
        self.assertEqual(len(self.raw), PDF_BYTES)
        self.assertEqual(PDF_SHA256, "af8ee7ef6bece727da874a5ef04dbbc0ea0956f2f98d51931e61bb454ed15bab")
        rows = parse_shijiazhuang_rows(self.raw)
        self.assertEqual(len(rows), 268)
        self.assertEqual([row.row_number for row in rows], list(range(1, 269)))
        self.assertEqual([row.source_serial for row in rows if not row.is_unnumbered_site], list(range(1, 266)))
        self.assertEqual([row.row_number for row in rows if row.is_unnumbered_site], [2, 155, 156])
        self.assertEqual([row.source_serial for row in rows if row.is_unnumbered_site], [1, 153, 153])
        self.assertEqual(rows[0].name, "石家庄市养老院（一区）")
        self.assertEqual(rows[0].address, "长安区高营镇体育北大街蓝月路6号")
        self.assertEqual(rows[1].name, "石家庄市养老院（ 二 区）")
        self.assertEqual(rows[154].name, "井陉县中心敬老院（养护院区）")
        self.assertEqual(rows[154].address, "井陉县微水镇微水村翠微街18号")
        self.assertEqual(rows[155].name, "井陉县中心敬老院（富达院区）")
        self.assertEqual(rows[-1].name, "新乐市第一老年公寓")
        self.assertEqual(rows[-1].address, "新乐市长寿街道伏羲大街18号")
        self.assertTrue(all(row.city_slug == "shijiazhuang" and row.city_name == "石家庄" for row in rows))
        self.assertTrue(all(row.name and row.address for row in rows))
        self.assertTrue(all(row.beds is None for row in rows))
        self.assertEqual(set(asdict(rows[0])), {
            "row_number", "source_serial", "is_unnumbered_site",
            "district", "name", "address", "city_name", "city_slug", "beds",
        })

    def test_rejects_pdf_byte_drift(self) -> None:
        with self.assertRaisesRegex(ValueError, "size|SHA-256"):
            parse_shijiazhuang_rows(self.raw + b"changed")

    def test_rejects_structure_serial_and_alignment_drift(self) -> None:
        changed = copy.deepcopy(self.tables)
        changed[0][0][2] = "机构简称"
        with self.assertRaisesRegex(ValueError, "header"):
            project_shijiazhuang_tables(changed)

        changed = copy.deepcopy(self.tables)
        changed[2][0][0] = "84"
        with self.assertRaisesRegex(ValueError, "serial"):
            project_shijiazhuang_tables(changed)

        changed = copy.deepcopy(self.tables)
        changed[9].pop()
        with self.assertRaisesRegex(ValueError, "row count|alignment"):
            project_shijiazhuang_tables(changed)

    def test_excludes_contact_column_and_rejects_contact_in_public_fields(self) -> None:
        changed = copy.deepcopy(self.tables)
        changed[7][1][1] = "PRIVATE_CONTACT_MARKER 13800000000"
        self.assertNotIn("PRIVATE_CONTACT_MARKER", str(asdict(project_shijiazhuang_tables(changed)[0])))
        changed[7][1][0] += " 13800000000"
        with self.assertRaisesRegex(ValueError, "contact"):
            project_shijiazhuang_tables(changed)


if __name__ == "__main__":
    unittest.main()
