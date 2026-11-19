"""Jinan historical file versions and public projection must stay auditable."""

import csv
import hashlib
import io
import unittest

from scripts.shandong_jinan_official_rows import (
    CATALOG, LATEST, OLDER, PRIOR, ROW_COUNT, parse_jinan_rows, validate_jinan_catalog,
)


def changed_csv(raw: bytes, mutate) -> bytes:
    reader = csv.DictReader(io.StringIO(raw.decode('gb18030')))
    fields = reader.fieldnames
    rows = list(reader)
    mutate(rows)
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode('gb18030')


class JinanOfficialRowsTests(unittest.TestCase):
    def test_frozen_files_and_public_field_allowlist(self):
        validate_jinan_catalog(CATALOG.read_bytes())
        self.assertEqual(PRIOR.read_bytes(), OLDER.read_bytes())
        rows = parse_jinan_rows(OLDER.read_bytes(), LATEST.read_bytes())
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([item.row_number for item in rows], list(range(1, 136)))
        self.assertEqual([rows[i].name for i in (0, 67, 134)], [
            '济南市社会福利院', '济南市长清区归德街道敬老院', '济阳县孙耿街道敬老院',
        ])
        self.assertEqual(set(vars(rows[0])), {'row_number', 'name', 'address', 'beds'})
        self.assertEqual(len({item.name for item in rows}), ROW_COUNT)

    def test_hash_header_count_and_license_drift_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            parse_jinan_rows(OLDER.read_bytes() + b'drift', LATEST.read_bytes())
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            validate_jinan_catalog(CATALOG.read_bytes() + b'drift')
        altered = CATALOG.read_bytes().replace('在成果中注明数据来源'.encode(), b'')
        with self.assertRaisesRegex(ValueError, 'license|许可'):
            validate_jinan_catalog(altered, expected_sha=hashlib.sha256(altered).hexdigest())
        broken = changed_csv(OLDER.read_bytes(), lambda rows: rows.pop())
        with self.assertRaisesRegex(ValueError, 'row count|行数'):
            parse_jinan_rows(broken, LATEST.read_bytes(), expected_older_sha=hashlib.sha256(broken).hexdigest())
        broken = OLDER.read_bytes().replace('机构名称'.encode('gb18030'), '机构别称'.encode('gb18030'), 1)
        with self.assertRaisesRegex(ValueError, 'header|表头'):
            parse_jinan_rows(broken, LATEST.read_bytes(), expected_older_sha=hashlib.sha256(broken).hexdigest())

    def test_newer_subset_and_contact_exclusion(self):
        changed = changed_csv(LATEST.read_bytes(), lambda rows: rows[0].__setitem__('机构地址', '山东省济南市未知地址'))
        with self.assertRaisesRegex(ValueError, 'subset|子集'):
            parse_jinan_rows(OLDER.read_bytes(), changed, expected_latest_sha=hashlib.sha256(changed).hexdigest())
        changed = changed_csv(OLDER.read_bytes(), lambda rows: rows[0].__setitem__('机构地址', rows[0]['机构地址'] + ' 13800000000'))
        with self.assertRaisesRegex(ValueError, 'contact|联系信息'):
            parse_jinan_rows(changed, LATEST.read_bytes(), expected_older_sha=hashlib.sha256(changed).hexdigest())


if __name__ == '__main__':
    unittest.main()
