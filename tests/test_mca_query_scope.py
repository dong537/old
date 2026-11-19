"""Offline request-contract checks; never infer all records from API totals."""
import base64
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[1]
CODE = '440113000000'


class QueryScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'page.json'
        self.first = runpy.run_path(str(PROJECT / 'scripts/collect-mca-area-first-pages.py'))
        self.followup = runpy.run_path(str(PROJECT / 'scripts/collect-mca-area-followup-pages.py'))

    def wrapper(self, number):
        body = {'code': 0, 'data': {
            'current': number, 'size': 10, 'total': 2 if number == 1 else 12,
            'records': [{'axbe0001': 'private-0', 'areaCode': CODE, 'ahae0635': '0'},
                        {'axbe0001': 'private-1', 'areaCode': CODE, 'ahae0635': '1'}]}}
        raw = json.dumps(body).encode()
        return {'request': {
                    'url': self.first['FETCHER']['API_BASE'] + self.first['FETCHER']['LIST_PATH'],
                    'method': 'POST', 'params': self.first['FETCHER']['page_params'](number, CODE, True)},
                'requestedAtUtc': '2026-11-19T00:00:00+00:00',
                'fetchedAtUtc': '2026-11-19T00:00:01+00:00', 'httpStatus': 200,
                'response': body, 'rawBodyBase64': base64.b64encode(raw).decode(),
                'responseSha256': hashlib.sha256(raw).hexdigest()}

    def check(self, number, wrapper):
        self.path.write_text(json.dumps(wrapper), encoding='utf-8')
        if number == 1:
            return self.first['checked_cached_page'](self.path, CODE)
        return self.followup['checked_followup_page'](self.path, number, CODE)

    def test_contract_is_area_plus_pagination_and_explicit_sort_only(self):
        for number in (1, 2):
            self.assertEqual(self.wrapper(number)['request']['params'], {
                'current': number, 'size': 10, 'areaCode': CODE, 'checkSort': 1})

    def test_both_subsidy_values_survive_the_same_unfiltered_query(self):
        self.assertEqual(self.check(1, self.wrapper(1))['firstPageRows'], 2)
        records = self.check(2, self.wrapper(2))['records']
        self.assertEqual({row['ahae0635'] for row in records}, {'0', '1'})
        self.assertEqual(len(records), 2)

    def test_first_and_followup_reject_extra_subset_or_sort_parameters(self):
        extras = [('ahae0635', 1), ('ahae0635', 0), ('ahae0635', None),
                  ('emptyBed', 1), ('axbe0003', 'keyword'), ('axbe0004', 1),
                  ('levelSort', 1), ('priceSort', 1)]
        for number in (1, 2):
            for key, value in extras:
                with self.subTest(page=number, key=key, value=value):
                    wrapper = self.wrapper(number)
                    wrapper['request']['params'][key] = value
                    with self.assertRaisesRegex(RuntimeError, 'saved query differs'):
                        self.check(number, wrapper)


if __name__ == '__main__':
    unittest.main()
