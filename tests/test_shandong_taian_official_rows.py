"""Historical Tai'an source rows retain file version and suppress unrelated fields."""

import csv
import hashlib
import io
import unittest

from scripts.shandong_taian_official_rows import (
    CATALOG, NEWER, OLDER, ROW_COUNT, parse_taian_rows, validate_taian_catalog,
)


def changed_csv(raw: bytes, mutate) -> bytes:
    reader = csv.DictReader(io.StringIO(raw.decode("gb18030")))
    fields = reader.fieldnames
    rows = list(reader)
    mutate(rows)
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("gb18030")


class TaianOfficialRowsTests(unittest.TestCase):
    def test_frozen_files_and_public_field_allowlist(self):
        validate_taian_catalog(CATALOG.read_bytes())
        rows = parse_taian_rows(OLDER.read_bytes(), NEWER.read_bytes())
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, 94)))
        self.assertEqual(rows[0].name, "山东和圣园康养医疗有限公司")
        self.assertEqual(rows[-1].name, "新泰市放城镇敬老院")
        self.assertEqual(set(vars(rows[0])), {"row_number", "name", "address"})
        self.assertEqual(len({row.name for row in rows}), ROW_COUNT)

    def test_hash_license_header_and_count_drift_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_taian_rows(OLDER.read_bytes() + b"changed", NEWER.read_bytes())
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_taian_catalog(CATALOG.read_bytes() + b"changed")
        altered = CATALOG.read_bytes().replace("在成果中注明数据来源".encode(), b"")
        with self.assertRaisesRegex(ValueError, "licence|许可"):
            validate_taian_catalog(altered, expected_sha=hashlib.sha256(altered).hexdigest())
        older = OLDER.read_bytes()
        bad_header = older.replace("机构名称".encode("gb18030"), "随意名称".encode("gb18030"), 1)
        with self.assertRaisesRegex(ValueError, "header|表头"):
            parse_taian_rows(bad_header, NEWER.read_bytes(), expected_older_sha=hashlib.sha256(bad_header).hexdigest())
        missing = changed_csv(older, lambda rows: rows.pop())
        with self.assertRaisesRegex(ValueError, "row count|行数"):
            parse_taian_rows(missing, NEWER.read_bytes(), expected_older_sha=hashlib.sha256(missing).hexdigest())

    def test_newer_subset_and_contact_exclusion(self):
        newer = changed_csv(NEWER.read_bytes(), lambda rows: rows[0].__setitem__("机构详细地址", "山东省泰安市别处"))
        with self.assertRaisesRegex(ValueError, "subset|子集"):
            parse_taian_rows(OLDER.read_bytes(), newer, expected_newer_sha=hashlib.sha256(newer).hexdigest())
        contact = changed_csv(OLDER.read_bytes(), lambda rows: rows[0].__setitem__("机构详细地址", rows[0]["机构详细地址"] + " 13800000000"))
        with self.assertRaisesRegex(ValueError, "contact|联系信息"):
            parse_taian_rows(contact, NEWER.read_bytes(), expected_older_sha=hashlib.sha256(contact).hexdigest())


if __name__ == "__main__":
    unittest.main()
