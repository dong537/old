"""The Weifang open-data source is historical and needs a narrow projection."""

import csv
import hashlib
import io
import unittest

from scripts.shandong_weifang_official_rows import (
    CATALOG, LATEST, PRIOR, ROW_COUNT, parse_weifang_rows, validate_weifang_catalog,
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


class WeifangOfficialRowsTests(unittest.TestCase):
    def test_frozen_187_rows_and_2025_statistics_only(self):
        validate_weifang_catalog(CATALOG.read_bytes())
        rows = parse_weifang_rows(LATEST.read_bytes(), PRIOR.read_bytes())
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, 188)))
        self.assertEqual((rows[0].name, rows[0].beds), ("潍坊市潍城区康华老年会所", 50))
        self.assertEqual((rows[-1].name, rows[-1].beds), ("潍坊峡山生态经济开发区绿康源养老康复中心", 322))
        self.assertEqual(sum(row.beds for row in rows), 31748)
        self.assertEqual(len({row.name for row in rows}), ROW_COUNT)
        self.assertEqual(set(vars(rows[0])), {"row_number", "name", "address", "beds"})

    def test_fails_on_source_or_license_drift(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            parse_weifang_rows(LATEST.read_bytes() + b"changed", PRIOR.read_bytes())
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_weifang_catalog(CATALOG.read_bytes() + b"changed")
        altered = CATALOG.read_bytes().replace(
            "全市各县市区养老机构地址及设施等信息。".encode(),
            "仅限公益性使用，禁止商业使用。".encode(), 1,
        )
        with self.assertRaisesRegex(ValueError, "许可|restriction|license"):
            validate_weifang_catalog(altered, expected_sha=hashlib.sha256(altered).hexdigest())

    def test_fails_on_header_row_count_time_content_and_contacts(self):
        raw = LATEST.read_bytes()
        bad_header = raw.replace("机构名称".encode("gb18030"), "随意名称".encode("gb18030"), 1)
        with self.assertRaisesRegex(ValueError, "header|表头"):
            parse_weifang_rows(bad_header, PRIOR.read_bytes(), expected_latest_sha=hashlib.sha256(bad_header).hexdigest())
        missing = changed_csv(raw, lambda rows: rows.pop())
        with self.assertRaisesRegex(ValueError, "row count|行数"):
            parse_weifang_rows(missing, PRIOR.read_bytes(), expected_latest_sha=hashlib.sha256(missing).hexdigest())
        date = changed_csv(raw, lambda rows: rows[0].__setitem__("统计时间", "2026-11-10 00:00:00"))
        with self.assertRaisesRegex(ValueError, "statistics|统计时间"):
            parse_weifang_rows(date, PRIOR.read_bytes(), expected_latest_sha=hashlib.sha256(date).hexdigest())
        contact = changed_csv(raw, lambda rows: rows[0].__setitem__("地址", rows[0]["地址"] + " 13800000000"))
        with self.assertRaisesRegex(ValueError, "contact|联系信息"):
            parse_weifang_rows(contact, PRIOR.read_bytes(), expected_latest_sha=hashlib.sha256(contact).hexdigest())
        changed = changed_csv(raw, lambda rows: rows[0].__setitem__("床位总数", "51"))
        with self.assertRaisesRegex(ValueError, "version|版本"):
            parse_weifang_rows(changed, PRIOR.read_bytes(), expected_latest_sha=hashlib.sha256(changed).hexdigest())


if __name__ == "__main__":
    unittest.main()
