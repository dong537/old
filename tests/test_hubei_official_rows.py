"""Behavior checks for the frozen Wuhan metropolitan-circle source table."""

import hashlib
import unittest
from collections import Counter
from dataclasses import asdict

from lxml import html

from scripts.hubei_official_rows import (
    HUBEI_HTML, HUBEI_SHA256, CITY_COUNTS, parse_hubei_rows,
)


class HubeiOfficialRowsTests(unittest.TestCase):
    def test_real_source_preserves_all_rows_and_excludes_contacts(self):
        rows = parse_hubei_rows(HUBEI_HTML.read_bytes())
        self.assertEqual(len(rows), 747)
        self.assertEqual([row.row_number for row in rows], list(range(1, 748)))
        self.assertEqual(Counter(row.city_name for row in rows), CITY_COUNTS)
        self.assertEqual(rows[0].name, '武汉市社会福利院')
        self.assertEqual(rows[-1].name, '鄂州市中医医院医养结合中心')
        self.assertTrue(all(row.beds is None for row in rows))
        self.assertTrue(all(row.name and row.address for row in rows))
        self.assertEqual(set(asdict(rows[0])), {
            'row_number', 'name', 'address', 'city_name', 'city_slug', 'beds',
        })

    def test_rejects_source_drift(self):
        raw = HUBEI_HTML.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), HUBEI_SHA256)
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            parse_hubei_rows(raw + b'changed')

    def changed_html(self, mutate):
        document = html.fromstring(HUBEI_HTML.read_bytes().decode('utf-8'))
        mutate(document)
        raw = html.tostring(document, encoding='utf-8')
        return raw, hashlib.sha256(raw).hexdigest()

    def test_rejects_header_serial_and_city_drift_with_updated_hash(self):
        cases = [
            (lambda doc: setattr(doc.xpath('//table//tr')[1].xpath('./th|./td')[2], 'text', '单位名称'), 'headers'),
            (lambda doc: setattr(doc.xpath('//table//tr')[2].xpath('./th|./td')[0], 'text', '2'), 'serial'),
            (lambda doc: setattr(doc.xpath('//table//tr')[2].xpath('./th|./td')[1], 'text', '不存在市'), 'city'),
        ]
        for mutate, expected in cases:
            with self.subTest(expected=expected):
                raw, sha = self.changed_html(mutate)
                with self.assertRaisesRegex(ValueError, expected):
                    parse_hubei_rows(raw, expected_sha=sha)

    def test_rejects_missing_row_and_source_date_drift(self):
        def drop_last(doc):
            last = doc.xpath('//table//tr')[-2]
            last.getparent().remove(last)

        raw, sha = self.changed_html(drop_last)
        with self.assertRaisesRegex(ValueError, 'rows'):
            parse_hubei_rows(raw, expected_sha=sha)
        original = HUBEI_HTML.read_bytes().decode('utf-8')
        changed = original.replace('2026-06-15 16:42', '2026-06-14 16:42').encode('utf-8')
        self.assertNotEqual(changed, HUBEI_HTML.read_bytes())
        with self.assertRaisesRegex(ValueError, 'publication'):
            parse_hubei_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())
        changed = original.replace('截止2026年5月底', '截止2026年4月底', 1).encode('utf-8')
        self.assertNotEqual(changed, HUBEI_HTML.read_bytes())
        with self.assertRaisesRegex(ValueError, 'as-of|remark'):
            parse_hubei_rows(changed, expected_sha=hashlib.sha256(changed).hexdigest())

    def test_excludes_person_and_phone_even_in_rehashed_source(self):
        def replace_contacts(doc):
            first = doc.xpath('//table//tr')[2].xpath('./th|./td')
            first[4].text = 'PRIVATE_PERSON_MARKER'
            first[5].text = '13800000000'

        raw, sha = self.changed_html(replace_contacts)
        rows = parse_hubei_rows(raw, expected_sha=sha)
        self.assertNotIn('PRIVATE_PERSON_MARKER', str(asdict(rows[0])))
        self.assertNotIn('13800000000', str(asdict(rows[0])))


if __name__ == '__main__':
    unittest.main()
