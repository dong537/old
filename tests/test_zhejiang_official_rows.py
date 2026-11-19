"""Boundary tests for the frozen, partial Zhejiang provincial source."""

import hashlib
import unittest
from collections import Counter
from dataclasses import asdict

from scripts.zhejiang_official_rows import (
    CATALOG_DETAIL, CITY_COUNTS, CSV_FILE, CSV_SHA256, DATASET_DETAIL,
    GENERIC_NAME_COUNT, MISSING_ADDRESS_COUNT, MISSING_BED_COUNT, PREVIEW,
    PUBLIC_ROW_COUNT, ROW_COUNT, load_zhejiang_rows, parse_zhejiang_rows,
    project_public_zhejiang_rows, validate_zhejiang_provenance,
)


class ZhejiangOfficialRowsTests(unittest.TestCase):
    def test_actual_rows_are_partial_and_source_order_is_preserved(self):
        rows = load_zhejiang_rows()
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, ROW_COUNT + 1)))
        self.assertEqual(Counter(row.city_name for row in rows), CITY_COUNTS)
        self.assertEqual((rows[0].city_name, rows[0].name, rows[0].beds),
                         ("台州市", "台州市黄岩区银色年华老年公寓", 98))
        self.assertEqual((rows[-1].city_name, rows[-1].beds), ("杭州市", 24))
        self.assertEqual(sum(row.address is None for row in rows), MISSING_ADDRESS_COUNT)
        self.assertEqual(sum(row.beds is None for row in rows), MISSING_BED_COUNT)
        self.assertEqual(sum(row.name == "养老机构" for row in rows), GENERIC_NAME_COUNT)
        self.assertEqual(set(asdict(rows[0])),
                         {"row_number", "name", "city_name", "city_slug", "address", "beds"})
        self.assertEqual(len({(row.city_name, row.name) for row in rows}), 672)
        # Repeated source lines remain separate observations, not entity merges.
        self.assertEqual(len(rows) - len({(row.city_name, row.name, row.address, row.beds)
                                          for row in rows}), 263)

    def test_frozen_agreement_and_download_chain(self):
        validate_zhejiang_provenance(
            CATALOG_DETAIL.read_bytes(), DATASET_DETAIL.read_bytes(), PREVIEW.read_bytes()
        )
        self.assertEqual(hashlib.sha256(CSV_FILE.read_bytes()).hexdigest(), CSV_SHA256)

    def test_public_projection_excludes_exact_duplicates_and_generic_names(self):
        source = load_zhejiang_rows()
        public = project_public_zhejiang_rows(source)
        self.assertEqual(len(source), 1147)
        self.assertEqual(len(public), PUBLIC_ROW_COUNT)
        self.assertEqual([row.row_number for row in public],
                         sorted(row.row_number for row in public))
        self.assertTrue(all(row.name != "养老机构" for row in public))
        keys = [(row.city_name, row.name, row.address, row.beds) for row in public]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertGreater(public[-1].row_number, len(public))
        self.assertEqual(sum(row.address is None for row in public), 49)
        self.assertEqual(sum(row.beds is None for row in public), 0)

    def test_rejects_hash_and_structural_drift(self):
        raw = CSV_FILE.read_bytes()
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_zhejiang_rows(raw + b"drift")
        altered = raw.replace("所属地市".encode(), "城市字段".encode(), 1)
        with self.assertRaisesRegex(ValueError, "header"):
            parse_zhejiang_rows(altered, expected_sha=hashlib.sha256(altered).hexdigest())
        altered = raw.replace(b",-,", b",0,", 1)
        with self.assertRaisesRegex(ValueError, "coverage"):
            parse_zhejiang_rows(altered, expected_sha=hashlib.sha256(altered).hexdigest())
        altered = raw.replace(b",98,", b",0,", 1)
        self.assertEqual(parse_zhejiang_rows(
            altered, expected_sha=hashlib.sha256(altered).hexdigest()
        )[0].beds, 0)

    def test_rejects_contact_in_public_field_and_metadata_change(self):
        raw = CSV_FILE.read_bytes()
        altered = raw.replace("北洋镇小里桥村".encode(), "北洋镇小里桥村13800138000".encode(), 1)
        with self.assertRaisesRegex(ValueError, "contact data"):
            parse_zhejiang_rows(altered, expected_sha=hashlib.sha256(altered).hexdigest())
        with self.assertRaisesRegex(ValueError, "catalog.*SHA-256"):
            validate_zhejiang_provenance(
                CATALOG_DETAIL.read_bytes() + b"drift", DATASET_DETAIL.read_bytes(), PREVIEW.read_bytes()
            )


if __name__ == "__main__":
    unittest.main()
