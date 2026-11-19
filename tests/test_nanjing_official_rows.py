"""The dated Nanjing source is a city-level source snapshot, not a live roster."""

from __future__ import annotations

import unittest
from pathlib import Path

from scripts.nanjing_official_rows import (
    SOURCE_BYTES, SOURCE_SHA256, parse_nanjing_rows, validate_nanjing_source,
)


RAW = Path(__file__).resolve().parents[1] / "data/private/national-official-source/raw/nanjing-202602.html"


class NanjingOfficialRowsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.raw = RAW.read_bytes()

    def test_frozen_source_projects_278_rows_without_contact_column(self) -> None:
        self.assertEqual(len(self.raw), SOURCE_BYTES)
        self.assertEqual(SOURCE_SHA256, "ace786a9e7c97e2a5e41f58302fe78e86fdfae43734b4d8ac91ee16900054c8c")
        rows = validate_nanjing_source(self.raw)
        self.assertEqual(len(rows), 278)
        self.assertEqual([item["rowNumber"] for item in rows], list(range(1, 279)))
        self.assertEqual(rows[0]["name"], "南京市点将台社会福利院")
        self.assertEqual(rows[138]["name"], "南京常春藤养老服务有限公司下庙店")
        self.assertEqual(rows[-1]["name"], "南京悦象养老院")
        self.assertEqual(rows[0]["beds"], 1290)
        self.assertEqual(rows[-1]["beds"], 100)
        self.assertTrue(all(set(item) == {"rowNumber", "name", "address", "beds", "citySlug", "cityName"} for item in rows))
        self.assertTrue(all(item["citySlug"] == "nanjing" and item["cityName"] == "南京" for item in rows))
        self.assertNotIn("58498208", str(rows))
        self.assertNotIn("025-69518399", str(rows))

    def test_frozen_hash_rejects_changed_html(self) -> None:
        with self.assertRaisesRegex(ValueError, "SHA-256|length"):
            validate_nanjing_source(self.raw + b" ")

    def test_structure_rejects_changed_header_and_count(self) -> None:
        changed_header = self.raw.replace("全托床位数（张）".encode(), "预计床位数（张）".encode(), 1)
        with self.assertRaisesRegex(ValueError, "header"):
            parse_nanjing_rows(changed_header)
        removed_row = self.raw.replace("南京悦象养老院".encode(), b"", 1)
        with self.assertRaisesRegex(ValueError, "missing name|count"):
            parse_nanjing_rows(removed_row)

    def test_structure_rejects_serial_and_contact_in_published_fields(self) -> None:
        from lxml import html

        document = html.fromstring(self.raw)
        document.xpath("//table//tr")[-1].xpath("./td|./th")[0].text = "279"
        changed_serial = html.tostring(document, encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "serial"):
            parse_nanjing_rows(changed_serial)
        changed_address = self.raw.replace("南京市江北新区点将台路56号".encode(),
                                          "南京市江北新区点将台路56号 025-69518399".encode(), 1)
        with self.assertRaisesRegex(ValueError, "contact"):
            parse_nanjing_rows(changed_address)

    def test_structure_requires_original_publication_and_as_of_precision(self) -> None:
        changed_date = self.raw.replace(b"2026-03-10", b"2025-03-10")
        with self.assertRaisesRegex(ValueError, "published"):
            parse_nanjing_rows(changed_date)
        changed_period = self.raw.replace("截至2026年2月底".encode(), "截至2025年2月底".encode())
        with self.assertRaisesRegex(ValueError, "as-of"):
            parse_nanjing_rows(changed_period)


if __name__ == "__main__":
    unittest.main()
