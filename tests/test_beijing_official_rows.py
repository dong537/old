"""Tests for the frozen Beijing starred-institution source."""

import hashlib
import io
import unittest
from collections import Counter
from pathlib import Path

from docx import Document

from scripts.beijing_official_rows import (
    DOCUMENT_BYTES, DOCUMENT_SHA256, PAGE_BYTES, PAGE_SHA256,
    parse_beijing_rows, validate_beijing_page,
)


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/private/national-official-source/raw"
DOCUMENT = RAW / "beijing-stars-20251231.docx"
PAGE = RAW / "beijing-stars-20260210.html"


class BeijingOfficialRowsTests(unittest.TestCase):
    def test_frozen_page_and_document_match_459_named_rows(self):
        page = PAGE.read_bytes()
        document = DOCUMENT.read_bytes()
        self.assertEqual((len(page), hashlib.sha256(page).hexdigest()), (PAGE_BYTES, PAGE_SHA256))
        self.assertEqual((len(document), hashlib.sha256(document).hexdigest()),
                         (DOCUMENT_BYTES, DOCUMENT_SHA256))
        validate_beijing_page(page)
        rows = parse_beijing_rows(document)
        self.assertEqual(len(rows), 459)
        self.assertEqual([row.row_number for row in rows], list(range(1, 460)))
        self.assertEqual(Counter(row.star_level for row in rows),
                         {5: 11, 4: 19, 3: 92, 2: 326, 1: 11})
        self.assertEqual(len({row.name for row in rows}), 459)
        self.assertEqual((rows[0].name, rows[0].star_level), ("北京市第一社会福利院", 5))
        self.assertEqual(rows[228].name, "北京市西城区广内善果养老照料中心")
        self.assertEqual((rows[-1].name, rows[-1].star_level),
                         ("北京市平谷区古槐之家老年公寓", 1))
        self.assertTrue(all(row.city_name == "北京" and row.city_slug == "beijing"
                            and row.address is None and row.beds is None for row in rows))

    def test_byte_drift_rejected(self):
        with self.assertRaisesRegex(ValueError, "SHA-256|size"):
            parse_beijing_rows(DOCUMENT.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "SHA-256|size"):
            validate_beijing_page(PAGE.read_bytes() + b"changed")

    def test_rehashed_heading_and_row_count_drift_rejected(self):
        document = Document(DOCUMENT)
        document.paragraphs[4].text = "一、五星级养老机构（12家）"
        buffer = io.BytesIO()
        document.save(buffer)
        raw = buffer.getvalue()
        with self.assertRaisesRegex(ValueError, "heading|count"):
            parse_beijing_rows(raw, expected_sha=hashlib.sha256(raw).hexdigest())

        document = Document(DOCUMENT)
        paragraph = document.paragraphs[5]
        paragraph._element.getparent().remove(paragraph._element)
        buffer = io.BytesIO()
        document.save(buffer)
        raw = buffer.getvalue()
        with self.assertRaisesRegex(ValueError, "count"):
            parse_beijing_rows(raw, expected_sha=hashlib.sha256(raw).hexdigest())

    def test_rehashed_contact_in_name_rejected(self):
        document = Document(DOCUMENT)
        document.paragraphs[5].text = "北京市第一社会福利院 13800000000"
        buffer = io.BytesIO()
        document.save(buffer)
        raw = buffer.getvalue()
        with self.assertRaisesRegex(ValueError, "contact"):
            parse_beijing_rows(raw, expected_sha=hashlib.sha256(raw).hexdigest())


if __name__ == "__main__":
    unittest.main()
