"""Frozen Wenzhou portal historical ZIP: audit before any public projection."""

import hashlib
import io
import unittest
import zipfile
from collections import Counter
from dataclasses import asdict

from scripts.wenzhou_official_rows import (
    ARCHIVE, ARCHIVE_SHA256, METADATA, LICENSE,
    parse_wenzhou_historical_rows, validate_wenzhou_source_pages,
)


class WenzhouOfficialRowsTests(unittest.TestCase):
    def test_frozen_pages_and_historical_rows(self):
        validate_wenzhou_source_pages(METADATA.read_bytes(), LICENSE.read_bytes())
        rows = parse_wenzhou_historical_rows(ARCHIVE.read_bytes())
        self.assertEqual(len(rows), 1574)
        self.assertEqual((rows[0].source_row, rows[0].name), (2, '龙泉市安仁镇养老服务中心'))
        self.assertEqual((rows[-1].source_row, rows[-1].name), (1575, '龙湾区综合福利院'))
        self.assertEqual(sum(row.address is None for row in rows), 1564)
        self.assertEqual(sum(row.kind == '养老机构' for row in rows), 1564)
        self.assertEqual(sum(count - 1 for count in Counter(row.name for row in rows).values()), 4)
        self.assertEqual(set(asdict(rows[0])), {
            'source_row', 'name', 'kind', 'beds', 'nursing_beds', 'address',
        })
        self.assertTrue(all(isinstance(row.beds, int) and row.beds >= 0 for row in rows))

    def test_archive_hash_is_locked(self):
        raw = ARCHIVE.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), ARCHIVE_SHA256)
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            parse_wenzhou_historical_rows(raw + b'drift')

    def test_rejects_missing_workbook_even_if_zip_hash_is_updated(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('wrong.xls', b'not a workbook')
        raw = buffer.getvalue()
        with self.assertRaisesRegex(ValueError, 'member'):
            parse_wenzhou_historical_rows(raw, expected_sha=hashlib.sha256(raw).hexdigest())

    def test_pages_reject_changed_licence_or_metadata(self):
        with self.assertRaisesRegex(ValueError, 'source page'):
            validate_wenzhou_source_pages(METADATA.read_bytes() + b'x', LICENSE.read_bytes())
        with self.assertRaisesRegex(ValueError, 'licen[sc]e'):
            validate_wenzhou_source_pages(METADATA.read_bytes(), LICENSE.read_bytes() + b'x')


if __name__ == '__main__':
    unittest.main()
