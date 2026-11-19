"""Guard the frozen Panzhihua open-data source and its public projection."""

import hashlib
import json
import unittest

from scripts.panzhihua_official_rows import (
    CATALOG, FULL_PREVIEW, ROW_COUNT, parse_panzhihua_rows,
    validate_panzhihua_catalog,
)


def changed_preview(mutate):
    payload = json.loads(FULL_PREVIEW.read_text(encoding="utf-8"))
    mutate(payload)
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return raw, hashlib.sha256(raw).hexdigest()


class PanzhihuaOfficialRowsTests(unittest.TestCase):
    def test_frozen_source_has_21_named_rows_in_six_regions(self):
        validate_panzhihua_catalog(CATALOG.read_bytes())
        rows = parse_panzhihua_rows(FULL_PREVIEW.read_bytes())
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, 22)))
        self.assertEqual(rows[0].name, "攀枝花市社会福利院")
        self.assertEqual(rows[-1].name, "盐边县永兴镇敬老院")
        self.assertEqual(rows[0].beds, 170)
        self.assertEqual({row.district for row in rows}, {
            "市级", "东区", "西区", "仁和区", "米易县", "盐边县",
        })
        self.assertEqual(set(vars(rows[0])), {
            "row_number", "name", "district", "nature", "beds",
        })
        self.assertTrue(all(row.beds >= 100 for row in rows))

    def test_hash_and_open_data_license_are_locked(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_panzhihua_rows(FULL_PREVIEW.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_panzhihua_catalog(CATALOG.read_bytes() + b"changed")
        altered = CATALOG.read_bytes().replace(
            "可以自由利用、自由传播与分享".encode(), b"", 1,
        )
        with self.assertRaisesRegex(ValueError, "license|licence|许可"):
            validate_panzhihua_catalog(
                altered, expected_sha=hashlib.sha256(altered).hexdigest(),
            )

    def test_rejects_missing_rows_schema_drift_and_unapproved_regions(self):
        missing, sha = changed_preview(lambda payload: payload["data"].pop())
        with self.assertRaisesRegex(ValueError, "row count|行数"):
            parse_panzhihua_rows(missing, expected_sha=sha)
        extra, sha = changed_preview(
            lambda payload: payload["data"][0].__setitem__("phone", "13800000000"),
        )
        with self.assertRaisesRegex(ValueError, "fields|字段"):
            parse_panzhihua_rows(extra, expected_sha=sha)
        wrong_region, sha = changed_preview(
            lambda payload: payload["data"][0].__setitem__("ssqy", "云南省"),
        )
        with self.assertRaisesRegex(ValueError, "region|地区"):
            parse_panzhihua_rows(wrong_region, expected_sha=sha)

    def test_rejects_below_threshold_and_contact_in_public_name(self):
        low_beds, sha = changed_preview(
            lambda payload: payload["data"][0].__setitem__("cws", "99"),
        )
        with self.assertRaisesRegex(ValueError, "beds|床位"):
            parse_panzhihua_rows(low_beds, expected_sha=sha)
        contact, sha = changed_preview(
            lambda payload: payload["data"][0].__setitem__(
                "jgmc", payload["data"][0]["jgmc"] + " 13800000000",
            ),
        )
        with self.assertRaisesRegex(ValueError, "contact|联系"):
            parse_panzhihua_rows(contact, expected_sha=sha)


if __name__ == "__main__":
    unittest.main()
