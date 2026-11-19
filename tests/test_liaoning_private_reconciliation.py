"""Private Liaoning name-key reconciliation keeps source rows and exposes uncertainty."""

import importlib.util
from pathlib import Path
import tempfile
import unittest


PATH = Path(__file__).resolve().parents[1] / 'scripts/reconcile-liaoning-private.py'
if PATH.exists():
    SPEC = importlib.util.spec_from_file_location('reconcile_liaoning_private', PATH)
    MODULE = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(MODULE)
else:
    MODULE = None


class LiaoningPrivateReconciliationTests(unittest.TestCase):
    def setUp(self):
        if MODULE is None and self._testMethodName != "test_script_exists":
            self.skipTest("implementation not yet present")

    def test_script_exists(self):
        self.assertTrue(PATH.is_file(), "private reconciliation script not implemented")

    def test_conservative_key_keeps_words_and_removes_only_separators(self):
        self.assertEqual(MODULE.name_key(' 沈阳（南院）－ 养老院 '), '沈阳南院养老院')
        self.assertNotEqual(MODULE.name_key('仁爱养老院'), MODULE.name_key('仁安养老院'))

    def test_city_from_code_uses_administrative_code_not_unreliable_city_column(self):
        self.assertEqual(MODULE.qcc_city('210100000000', '辽宁省沈阳市和平区'), '沈阳市')
        self.assertEqual(MODULE.qcc_city('219900000000', '辽宁省沈抚示范区'), '沈抚示范区')
        with self.assertRaisesRegex(ValueError, 'province or city disagrees'):
            MODULE.qcc_city('210100000000', '辽宁省大连市')

    def test_same_city_cross_city_and_unmatched_names_remain_distinct(self):
        official = [
            (3, '沈阳市', '沈阳市仁和养老院'),
            (4, '抚顺市', '春晖院'),
            (5, '沈阳市', '安养园'),
        ]
        qcc = [
            (100, '沈阳市', '沈阳市仁和养老院'),
            (101, '沈阳市', '春晖院'),
            (102, '大连市', '青松园'),
            (103, '大连市', '青松园'),
        ]
        result = MODULE.reconcile_rows(official, qcc)
        self.assertEqual(result['summary'], {
            'officialRows': 3, 'qccRows': 4, 'officialKeys': 3, 'qccKeys': 3,
            'commonNameKeys': 2, 'officialOnlyNameKeys': 1, 'qccOnlyNameKeys': 1,
            'qccDuplicateNameKeys': 1, 'crossCityCommonNameKeys': 1,
            'officialMatchStatusRows': {'same_city_name_key': 1, 'cross_city_name_key': 1, 'official_only_name_key': 1},
            'qccMatchStatusRows': {'same_city_name_key': 1, 'cross_city_name_key': 1, 'qcc_only_name_key': 2},
        })
        self.assertEqual([r['matchStatus'] for r in result['officialRows']],
                         ['same_city_name_key', 'cross_city_name_key', 'official_only_name_key'])
        self.assertEqual([r['matchStatus'] for r in result['qccRows']],
                         ['same_city_name_key', 'cross_city_name_key', 'qcc_only_name_key', 'qcc_only_name_key'])
        self.assertEqual(set(result['officialRows'][0]), {'sourceRow', 'name', 'city', 'nameKey', 'matchStatus', 'reviewStatus'})
        self.assertTrue(all(r['reviewStatus'] == 'pending' for r in result['officialRows'] + result['qccRows']))
        self.assertEqual(set(result['qccRows'][0]), {'sourceRow', 'name', 'city', 'nameKey', 'matchStatus', 'reviewStatus'})

    def test_private_file_check_detects_drift(self):
        result = MODULE.reconcile_rows([(3, '沈阳市', '甲院')], [(2, '沈阳市', '乙院')])
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'review.json'
            MODULE.write_output(target, result, check=False)
            MODULE.write_output(target, result, check=True)
            target.write_bytes(target.read_bytes() + b'changed')
            with self.assertRaisesRegex(ValueError, 'differs'):
                MODULE.write_output(target, result, check=True)


if __name__ == '__main__':
    unittest.main()
