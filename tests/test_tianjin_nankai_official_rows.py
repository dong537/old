"""Behavior checks for the frozen Tianjin Nankai public preview."""

import hashlib
import json
import unittest

from scripts.tianjin_nankai_official_rows import (
    LICENSE, PREVIEW, ROW_COUNT, parse_tianjin_rows, validate_tianjin_license,
)


def changed_preview(mutator):
    source = PREVIEW.read_bytes().decode('utf-8')
    start = source.index('var data ={') + len('var data =')
    payload, consumed = json.JSONDecoder().raw_decode(source[start:])
    mutator(payload)
    updated = source[:start] + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + source[start + consumed:]
    return updated.encode('utf-8')


class TianjinNankaiOfficialRowsTests(unittest.TestCase):
    def test_frozen_open_preview_projects_only_twenty_rows_without_phone(self):
        validate_tianjin_license(LICENSE.read_bytes())
        rows = parse_tianjin_rows(PREVIEW.read_bytes())
        self.assertEqual(len(rows), ROW_COUNT)
        self.assertEqual([row.row_number for row in rows], list(range(1, ROW_COUNT + 1)))
        self.assertEqual((rows[0].source_serial, rows[0].name, rows[0].address),
                         ('1', '天津市南开区福源养老院', '二纬路三马路交口8号'))
        self.assertEqual((rows[9].source_serial, rows[9].name), ('18', '天津市退休职工养老院'))
        self.assertEqual((rows[-1].source_serial, rows[-1].name), ('27', '天津市南开区康泰养老院'))
        self.assertEqual(set(vars(rows[0])), {'row_number', 'source_serial', 'name', 'address'})
        self.assertEqual(len({row.name for row in rows}), ROW_COUNT)

    def test_hash_license_and_dataset_metadata_are_required(self):
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            parse_tianjin_rows(PREVIEW.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            validate_tianjin_license(LICENSE.read_bytes() + b'changed')
        altered = LICENSE.read_bytes().replace('自由传播'.encode(), b'', 1)
        self.assertNotEqual(altered, LICENSE.read_bytes())
        with self.assertRaisesRegex(ValueError, 'licence'):
            validate_tianjin_license(altered, expected_sha=hashlib.sha256(altered).hexdigest())
        altered = PREVIEW.read_bytes().replace('南开区人民政府'.encode(), b'', 1)
        self.assertNotEqual(altered, PREVIEW.read_bytes())
        with self.assertRaisesRegex(ValueError, 'metadata'):
            parse_tianjin_rows(altered, expected_sha=hashlib.sha256(altered).hexdigest())

    def test_rejects_missing_preview_row_and_contact_in_public_text(self):
        altered = changed_preview(lambda payload: payload['list'].pop())
        with self.assertRaisesRegex(ValueError, 'preview row count'):
            parse_tianjin_rows(altered, expected_sha=hashlib.sha256(altered).hexdigest())
        def inject_contact(payload):
            payload['list'][0][3] += ' 13800000000'
        altered = changed_preview(inject_contact)
        with self.assertRaisesRegex(ValueError, 'contact data'):
            parse_tianjin_rows(altered, expected_sha=hashlib.sha256(altered).hexdigest())

    def test_metadata_total_does_not_become_public_row_count(self):
        altered = changed_preview(lambda payload: payload.update(totalCount=43))
        with self.assertRaisesRegex(ValueError, 'preview metadata'):
            parse_tianjin_rows(altered, expected_sha=hashlib.sha256(altered).hexdigest())


if __name__ == '__main__':
    unittest.main()
