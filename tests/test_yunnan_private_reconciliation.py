"""Private Yunnan reconciliation preserves source rows and uncertain matches."""

import importlib.util
from pathlib import Path
import tempfile
import unittest


PATH = Path(__file__).resolve().parents[1] / 'scripts/reconcile-yunnan-private.py'
if PATH.exists():
    SPEC = importlib.util.spec_from_file_location('reconcile_yunnan_private', PATH)
    MODULE = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(MODULE)
else:
    MODULE = None


class YunnanPrivateReconciliationTests(unittest.TestCase):
    def setUp(self):
        if MODULE is None and self._testMethodName != 'test_script_exists':
            self.skipTest('implementation not yet present')

    def test_script_exists(self):
        self.assertTrue(PATH.is_file(), 'private reconciliation script not implemented')

    def test_official_rowspans_keep_physical_row_and_exclude_person(self):
        fixture = '''<table>
          <tr><th colspan="5">title</th></tr>
          <tr><th>州市</th><th>区县市</th><th>单位名称</th><th>地址</th><th>法定代表人或负责人姓名</th></tr>
          <tr><td rowspan="3">昆明市</td><td rowspan="2">安宁市</td><td>甲养老院</td><td>甲地址</td><td>甲负责人</td></tr>
          <tr><td>乙养老院</td><td>乙地址</td><td>乙负责人</td></tr>
          <tr><td>五华区</td><td>丙养老院</td><td>丙地址</td><td>丙负责人</td></tr>
        </table>'''.encode('utf-8')
        self.assertEqual(MODULE.parse_official(fixture), [
            (3, '昆明市', '甲养老院'),
            (4, '昆明市', '乙养老院'),
            (5, '昆明市', '丙养老院'),
        ])

    def test_city_uses_code_and_region_not_unreliable_city_column(self):
        self.assertEqual(MODULE.qcc_city('530100000000', '云南省昆明市五华区'), '昆明市')
        self.assertEqual(MODULE.qcc_city('532300000000', '云南省楚雄彝族自治州楚雄市'), '楚雄州')
        self.assertEqual(MODULE.qcc_city('533400000000', '云南省迪庆藏族自治州香格里拉市'), '迪庆州')
        with self.assertRaisesRegex(ValueError, 'province or city disagrees'):
            MODULE.qcc_city('530100000000', '云南省曲靖市')
        self.assertTrue(MODULE.qcc_in_yunnan('530100000000', '云南省昆明市五华区'))
        self.assertFalse(MODULE.qcc_in_yunnan('110100000000', '北京市东城区'))
        with self.assertRaisesRegex(ValueError, 'code and region disagree'):
            MODULE.qcc_in_yunnan('530100000000', '北京市东城区')
        with self.assertRaisesRegex(ValueError, 'code and region disagree'):
            MODULE.qcc_in_yunnan('110100000000', '云南省昆明市五华区')

    def test_statuses_separate_same_city_cross_city_and_unmatched(self):
        official = [(3, '昆明市', '春晖养老院'), (4, '玉溪市', '福乐院'), (5, '曲靖市', '安养院')]
        qcc = [(101, '昆明市', '春晖养老院'), (102, '昆明市', '福乐院'),
               (103, '楚雄州', '仁和院'), (104, '楚雄州', '仁和院')]
        result = MODULE.reconcile_rows(official, qcc)
        self.assertEqual(result['summary']['commonNameKeys'], 2)
        self.assertEqual(result['summary']['crossCityCommonNameKeys'], 1)
        self.assertEqual(result['summary']['officialOnlyNameKeys'], 1)
        self.assertEqual(result['summary']['qccOnlyNameKeys'], 1)
        self.assertEqual(result['summary']['qccDuplicateNameKeys'], 1)
        self.assertEqual([r['matchStatus'] for r in result['officialRows']],
                         ['same_city_name_key', 'cross_city_name_key', 'official_only_name_key'])
        self.assertEqual([r['matchStatus'] for r in result['qccRows']],
                         ['same_city_name_key', 'cross_city_name_key', 'qcc_only_name_key', 'qcc_only_name_key'])
        self.assertEqual(set(result['officialRows'][0]),
                         {'sourceRow', 'name', 'city', 'nameKey', 'matchStatus', 'reviewStatus'})
        self.assertTrue(all(r['reviewStatus'] == 'pending' for r in result['officialRows'] + result['qccRows']))

    def test_source_inputs_have_locked_counts_without_person_fields(self):
        inputs = MODULE.read_sources()
        self.assertEqual(len(inputs['official']), 834)
        self.assertEqual(len(inputs['qcc']), 875)
        self.assertEqual(inputs['official'][0][:2], (3, '昆明市'))
        self.assertEqual(inputs['official'][-1][:2], (836, '迪庆州'))
        self.assertTrue(all(len(row) == 3 for row in inputs['official'] + inputs['qcc']))

    def test_private_file_check_detects_drift(self):
        result = MODULE.reconcile_rows([(3, '昆明市', '甲院')], [(2, '昆明市', '乙院')])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'review.json'
            MODULE.write_output(path, result, check=False)
            MODULE.write_output(path, result, check=True)
            path.write_bytes(path.read_bytes() + b'drift')
            with self.assertRaisesRegex(ValueError, 'differs'):
                MODULE.write_output(path, result, check=True)


if __name__ == '__main__':
    unittest.main()
