"""The Luxi District projection only exposes names and addresses from a frozen local source."""

import csv
import hashlib
import io
import unittest

from scripts.shandong_luxi_official_rows import (
    CATALOG, NEWER, OLDER, ROW_COUNT, parse_luxi_rows, validate_luxi_catalog,
)


def changed_csv(raw: bytes, mutate) -> bytes:
    reader = csv.DictReader(io.StringIO(raw.decode("gb18030")))
    fieldnames = reader.fieldnames
    rows = list(reader)
    mutate(rows)
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("gb18030")


class LuxiOfficialRowsTests(unittest.TestCase):
    def test_frozen_23_rows_and_five_row_revision(self):
        validate_luxi_catalog(CATALOG.read_bytes())
        rows = parse_luxi_rows(OLDER.read_bytes(), NEWER.read_bytes())
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, 24)))
        self.assertEqual(rows[0].name, "菏泽华升养老服务有限公司")
        self.assertEqual(rows[-1].name, "菏泽中智养老护理有限公司")
        self.assertEqual(set(vars(rows[0])), {"row_number", "name", "address"})
        self.assertTrue(all(row.name and row.address for row in rows))

    def test_source_hash_and_catalog_licence_are_locked(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_luxi_rows(OLDER.read_bytes() + b"changed", NEWER.read_bytes())
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_luxi_rows(OLDER.read_bytes(), NEWER.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_luxi_catalog(CATALOG.read_bytes() + b"changed")
        altered = CATALOG.read_bytes().replace("在成果中注明数据来源".encode(), b"")
        with self.assertRaisesRegex(ValueError, "licence|许可"):
            validate_luxi_catalog(altered, expected_sha=hashlib.sha256(altered).hexdigest())

    def test_rejects_header_row_count_and_contact_drift(self):
        older = OLDER.read_bytes()
        newer = NEWER.read_bytes()
        bad_header = older.replace("机构名称".encode("gb18030"), "随意名称".encode("gb18030"), 1)
        with self.assertRaisesRegex(ValueError, "header|表头"):
            parse_luxi_rows(bad_header, newer, expected_older_sha=hashlib.sha256(bad_header).hexdigest())
        missing = changed_csv(older, lambda rows: rows.pop())
        with self.assertRaisesRegex(ValueError, "row count|行数"):
            parse_luxi_rows(missing, newer, expected_older_sha=hashlib.sha256(missing).hexdigest())
        contact = changed_csv(older, lambda rows: rows[0].__setitem__("机构地址", rows[0]["机构地址"] + " 13800000000"))
        with self.assertRaisesRegex(ValueError, "contact|联系信息"):
            parse_luxi_rows(contact, newer, expected_older_sha=hashlib.sha256(contact).hexdigest())

    def test_rejects_new_version_that_is_not_an_exact_subset(self):
        newer = changed_csv(NEWER.read_bytes(), lambda rows: rows[0].__setitem__("机构地址", "山东省菏泽市别处"))
        with self.assertRaisesRegex(ValueError, "subset|子集"):
            parse_luxi_rows(OLDER.read_bytes(), newer, expected_newer_sha=hashlib.sha256(newer).hexdigest())


if __name__ == "__main__":
    unittest.main()
