"""Checks for the Wenzhou open-data portal's 2022 care-home snapshot."""

import hashlib
import io
import unittest
import zipfile
from collections import Counter
from dataclasses import asdict

from scripts.wenzhou_6724_official_rows import (
    ARCHIVE, ARCHIVE_SHA256, LICENSE, METADATA,
    BED_COMPONENT_MISMATCH_COUNT, REGION_COUNTS,
    parse_wenzhou_6724_rows, validate_wenzhou_6724_pages,
)


class Wenzhou6724OfficialRowsTests(unittest.TestCase):
    def test_frozen_source_has_196_traceable_privacy_minimal_rows(self):
        validate_wenzhou_6724_pages(METADATA.read_bytes(), LICENSE.read_bytes())
        rows = parse_wenzhou_6724_rows(ARCHIVE.read_bytes())
        self.assertEqual(len(rows), 196)
        self.assertEqual((rows[0].source_row, rows[0].name, rows[0].region), (
            2, '乐清市颐养老年公寓', '温州市乐清市',
        ))
        self.assertEqual((rows[-1].source_row, rows[-1].name, rows[-1].region), (
            197, '瑞安市场桥乐如养老院', '温州市瑞安市',
        ))
        self.assertEqual(Counter(row.region for row in rows), REGION_COUNTS)
        self.assertEqual(len({row.name for row in rows}), 186)
        self.assertEqual(len({row.source_row for row in rows}), 196)
        self.assertEqual(set(asdict(rows[0])), {'source_row', 'name', 'region', 'beds'})
        self.assertTrue(all(isinstance(row.beds, int) and row.beds >= 0 for row in rows))
        self.assertEqual(BED_COMPONENT_MISMATCH_COUNT, 10)

    def test_rejects_drift_or_missing_xls_member(self):
        raw = ARCHIVE.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), ARCHIVE_SHA256)
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            parse_wenzhou_6724_rows(raw + b'drift')
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('wrong.xls', b'not a workbook')
        changed = buffer.getvalue()
        with self.assertRaisesRegex(ValueError, 'member'):
            parse_wenzhou_6724_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())

    def test_rejects_changed_metadata_or_license(self):
        with self.assertRaisesRegex(ValueError, 'metadata'):
            validate_wenzhou_6724_pages(METADATA.read_bytes() + b'x', LICENSE.read_bytes())
        with self.assertRaisesRegex(ValueError, 'license'):
            validate_wenzhou_6724_pages(METADATA.read_bytes(), LICENSE.read_bytes() + b'x')


if __name__ == '__main__':
    unittest.main()
