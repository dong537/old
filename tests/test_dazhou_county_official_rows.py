"""Four county previews add source rows without exposing personal fields."""

import hashlib
import json
import unittest

from scripts.dazhou_county_official_rows import (
    SOURCES, parse_dazhou_county_rows, validate_dazhou_county_catalog,
)
from scripts.dazhou_official_rows import PREVIEW as CITY_PREVIEW, parse_dazhou_rows


def changed_preview(source, mutate):
    payload = json.loads(source.preview.read_text(encoding="utf-8"))
    mutate(payload)
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return raw, hashlib.sha256(raw).hexdigest()


class DazhouCountyOfficialRowsTests(unittest.TestCase):
    def test_four_frozen_county_previews_have_83_rows(self):
        counts = {"xuanhan": 27, "wanyuan": 21, "dazhu": 21, "kaijiang": 14}
        self.assertEqual(set(SOURCES), set(counts))
        for key, source in SOURCES.items():
            with self.subTest(source=key):
                validate_dazhou_county_catalog(source, source.catalog.read_bytes())
                rows = parse_dazhou_county_rows(source, source.preview.read_bytes())
                self.assertEqual(len(rows), counts[key])
                self.assertEqual([row.row_number for row in rows], list(range(1, counts[key] + 1)))
                self.assertEqual({row.county for row in rows}, {source.county})
                self.assertEqual(set(vars(rows[0])), {"row_number", "name", "address", "county"})
                self.assertTrue(all(row.name and row.address for row in rows))

    def test_frozen_hash_and_license_are_locked(self):
        for key, source in SOURCES.items():
            with self.subTest(source=key):
                with self.assertRaisesRegex(ValueError, "SHA-256"):
                    parse_dazhou_county_rows(source, source.preview.read_bytes() + b"changed")
                with self.assertRaisesRegex(ValueError, "SHA-256"):
                    validate_dazhou_county_catalog(source, source.catalog.read_bytes() + b"changed")
                altered = source.catalog.read_bytes().replace(
                    "可以自由利用、自由传播与分享".encode(), b"", 1,
                )
                with self.assertRaisesRegex(ValueError, "licence|license|许可"):
                    validate_dazhou_county_catalog(
                        source, altered, expected_sha=hashlib.sha256(altered).hexdigest(),
                    )

    def test_rejects_schema_row_count_and_contact_drift(self):
        source = SOURCES["xuanhan"]
        missing, sha = changed_preview(source, lambda p: p["data"].pop())
        with self.assertRaisesRegex(ValueError, "row count|行数"):
            parse_dazhou_county_rows(source, missing, expected_sha=sha)
        extra, sha = changed_preview(
            source, lambda p: p["data"][0].__setitem__("extra", "value"),
        )
        with self.assertRaisesRegex(ValueError, "fields|字段"):
            parse_dazhou_county_rows(source, extra, expected_sha=sha)
        phone, sha = changed_preview(
            source, lambda p: p["data"][0].__setitem__(
                "jgadd", p["data"][0]["jgadd"] + " 13800000000",
            ),
        )
        with self.assertRaisesRegex(ValueError, "contact|联系"):
            parse_dazhou_county_rows(source, phone, expected_sha=sha)

    def test_rejects_wrong_county_and_repeated_name(self):
        source = SOURCES["wanyuan"]
        wrong, sha = changed_preview(
            source, lambda p: p["data"][0].__setitem__("QY", "达川区"),
        )
        with self.assertRaisesRegex(ValueError, "county|区县"):
            parse_dazhou_county_rows(source, wrong, expected_sha=sha)
        source = SOURCES["kaijiang"]
        repeated, sha = changed_preview(
            source, lambda p: p["data"][0].__setitem__(
                "yljgmc", p["data"][1]["yljgmc"],
            ),
        )
        with self.assertRaisesRegex(ValueError, "duplicate|重复"):
            parse_dazhou_county_rows(source, repeated, expected_sha=sha)

    def test_no_exact_name_or_address_overlap_with_city_preview(self):
        city = parse_dazhou_rows(CITY_PREVIEW.read_bytes())
        county = [row for source in SOURCES.values()
                  for row in parse_dazhou_county_rows(source, source.preview.read_bytes())]
        self.assertEqual(len(county), 83)
        self.assertEqual(len({row.name for row in county}), 83)
        self.assertFalse({row.name for row in county} & {row.name for row in city})
        self.assertFalse({row.address for row in county} & {row.address for row in city})
        # One same-address pair in Wanyuan remains two source observations,
        # pending a manual entity check; it is not counted as two proven homes.
        shared = [row.name for row in county if row.address == "旧院镇龙潭河村1组"]
        self.assertEqual(set(shared), {"龙潭河养生养老保健基地", "鑫盛养老服务中心"})


if __name__ == "__main__":
    unittest.main()
