"""The public Darzhou projection excludes personal fields and overclaimed catalog counts."""

import hashlib
import json
import unittest

from scripts.dazhou_official_rows import (
    CATALOG, PREVIEW, ROW_COUNT, parse_dazhou_rows, validate_dazhou_catalog,
)


class DazhouOfficialRowsTests(unittest.TestCase):
    def test_frozen_open_data_preview_has_30_usable_rows(self):
        validate_dazhou_catalog(CATALOG.read_bytes())
        rows = parse_dazhou_rows(PREVIEW.read_bytes())
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, ROW_COUNT + 1)))
        self.assertEqual((rows[0].name, rows[0].beds), ("达州德源养老服务有限公司", 200))
        self.assertEqual(rows[14].name, "达州市通川区磐石敬老院")
        self.assertIsNone(rows[19].beds)
        self.assertEqual(rows[-1].name, "达州市达川区赵家镇敬老院")
        self.assertEqual(set(vars(rows[0])), {"row_number", "name", "address", "beds"})

    def test_hash_and_catalog_license_are_locked(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_dazhou_rows(PREVIEW.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_dazhou_catalog(CATALOG.read_bytes() + b"changed")
        altered = CATALOG.read_bytes().replace("可以自由利用、自由传播与分享".encode(), b"", 1)
        with self.assertRaisesRegex(ValueError, "open-data licence"):
            validate_dazhou_catalog(altered, expected_sha=hashlib.sha256(altered).hexdigest())

    def test_rejects_missing_row_or_contact_in_public_field_even_if_rehashed(self):
        payload = json.loads(PREVIEW.read_text(encoding="utf-8"))
        payload["data"].pop()
        changed = json.dumps(payload, ensure_ascii=False).encode()
        with self.assertRaisesRegex(ValueError, "row count"):
            parse_dazhou_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())
        payload = json.loads(PREVIEW.read_text(encoding="utf-8"))
        payload["data"][0]["dwmc"] += " 13800000000"
        changed = json.dumps(payload, ensure_ascii=False).encode()
        with self.assertRaisesRegex(ValueError, "contact data"):
            parse_dazhou_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())

    def test_zero_beds_is_not_missing(self):
        payload = json.loads(PREVIEW.read_text(encoding="utf-8"))
        payload["data"][0]["cwzsl"] = "0"
        changed = json.dumps(payload, ensure_ascii=False).encode()
        rows = parse_dazhou_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())
        self.assertEqual(rows[0].beds, 0)


if __name__ == "__main__":
    unittest.main()
