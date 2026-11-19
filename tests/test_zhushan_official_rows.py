"""Private intake checks for the Zhushan 2025 official institution attachment."""

import hashlib
import io
import re
import unittest
import zipfile
from dataclasses import asdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/private/national-official-source/raw"
WORKBOOK = SOURCE / "jiangxi-jingdezhen-zhushan-eldercare-20251204.xlsx"
PAGE = WORKBOOK.with_suffix(".html")
WORKBOOK_SHA256 = "cf5b6e271c80826dfc6846268e900f7f7c1573e8c043d90ede07e9488861e75f"
PAGE_SHA256 = "d3df4e46d95ff7bb832f0d4996a80dba38951105d99ff4a4340b4ea60e20c03c"


def changed_sheet_cell(raw: bytes, reference: str, value: int) -> bytes:
    """Change one frozen XLSX cell without loading its heavily formatted grid."""
    source = io.BytesIO(raw)
    result = io.BytesIO()
    cell_pattern = re.compile(rb'(<c r="' + reference.encode("ascii") + rb'"[^>]*>)(.*?)(</c>)')
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(result, "w") as changed:
        for item in original.infolist():
            body = original.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                def replace_cell(match: re.Match[bytes]) -> bytes:
                    contents, count = re.subn(rb"<v>[^<]*</v>", f"<v>{value}</v>".encode(), match[2], count=1)
                    if count == 0:
                        contents = f"<v>{value}</v>".encode() + contents
                    return match[1] + contents + match[3]
                body, count = cell_pattern.subn(replace_cell, body, count=1)
                if count == 0 and reference == "A12":
                    body, count = re.subn(
                        rb'<row r="12"([^>]*)/>',
                        lambda match: b'<row r="12"' + match[1]
                        + f'><c r="A12"><v>{value}</v></c></row>'.encode(),
                        body,
                        count=1,
                    )
                if count != 1:
                    raise AssertionError(f"Missing frozen cell {reference}")
            changed.writestr(item, body)
    return result.getvalue()


class ZhushanOfficialRowsTests(unittest.TestCase):
    def test_frozen_source_has_exactly_seven_sequenced_public_fields(self):
        from scripts.zhushan_official_rows import parse_zhushan_rows

        raw = WORKBOOK.read_bytes()
        self.assertEqual(len(raw), 108556)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), WORKBOOK_SHA256)
        rows = parse_zhushan_rows(raw)
        self.assertEqual(len(rows), 7)
        self.assertEqual([row.row_number for row in rows], list(range(1, 8)))
        self.assertEqual([row.excel_row for row in rows], list(range(5, 12)))
        self.assertEqual([row.total_beds for row in rows], [77, 120, 122, 37, 37, 30, 48])
        self.assertEqual(rows[0].name, "景德镇市珠山区竟成敬老院")
        self.assertEqual(rows[-1].name, "景德镇市梦园养老服务有限公司")
        self.assertEqual(
            set(asdict(rows[0])),
            {"row_number", "excel_row", "name", "province", "city", "district", "address", "total_beds"},
        )
        self.assertEqual({(row.province, row.city, row.district) for row in rows},
                         {("江西省", "景德镇市", "珠山区")})
        for row in rows:
            self.assertTrue(row.address)
            self.assertIsInstance(row.total_beds, int)
            self.assertGreaterEqual(row.total_beds, 0)
            self.assertNotIn("负责人", str(asdict(row)))
            self.assertNotIn("联系方式", str(asdict(row)))

    def test_frozen_page_metadata_and_attachment_match(self):
        from scripts.zhushan_official_rows import parse_zhushan_page

        raw = PAGE.read_bytes()
        self.assertEqual(len(raw), 43455)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), PAGE_SHA256)
        page = parse_zhushan_page(raw)
        self.assertEqual(page.title, "2025年养老服务领域公开养老机构信息名单")
        self.assertEqual(page.published_at, "2025-12-04 10:56")
        self.assertEqual(page.content_source, "珠山区民政局珠山区人民政府")
        self.assertEqual(page.attachment_href, "./P020251204394048702723.xlsx")

    def test_rejects_changed_workbook_hash_header_location_serial_or_extra_row(self):
        from scripts.zhushan_official_rows import parse_zhushan_rows

        raw = WORKBOOK.read_bytes()
        with self.assertRaisesRegex(ValueError, "size|SHA-256"):
            parse_zhushan_rows(raw + b"changed")
        for cell, value, error in (
            ("C3", 5, "header"),
            ("E5", 0, "province|location"),
            ("A5", 2, "serial"),
            ("R5", -1, "total beds"),
            ("A12", 8, "extra|row count|unexpected"),
        ):
            with self.subTest(cell=cell):
                changed = changed_sheet_cell(raw, cell, value)
                with self.assertRaisesRegex(ValueError, error):
                    parse_zhushan_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())

    def test_rejects_changed_page_metadata_even_with_rebaselined_hash(self):
        from scripts.zhushan_official_rows import parse_zhushan_page

        raw = PAGE.read_bytes()
        old = b"2025-12-04 10:56"
        self.assertIn(old, raw)
        changed = raw.replace(old, b"2024-12-04 10:56", 1)
        with self.assertRaisesRegex(ValueError, "published|metadata"):
            parse_zhushan_page(changed, expected_sha=hashlib.sha256(changed).hexdigest())
        old_link = b"./P020251204394048702723.xlsx"
        self.assertIn(old_link, raw)
        changed_link = raw.replace(old_link, b"./Q020251204394048702723.xlsx", 1)
        with self.assertRaisesRegex(ValueError, "attachment"):
            parse_zhushan_page(changed_link, expected_sha=hashlib.sha256(changed_link).hexdigest())


if __name__ == "__main__":
    unittest.main()
