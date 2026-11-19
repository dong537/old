"""The private national reference must use location codes, not the unreliable province label."""

import importlib.util
from pathlib import Path
import unittest


path = Path(__file__).resolve().parents[1] / 'scripts/audit-national-reference.py'
spec = importlib.util.spec_from_file_location('audit_national_reference', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NationalReferenceAuditTests(unittest.TestCase):
    def test_uses_twelve_digit_code_and_flags_mislabeled_province(self):
        rows = [
            ('id-a', None, '440106000000', '甲养老院', '广东省广州市', 0, '河南省', None, None, None, None),
            ('id-a', '地址', 110101000000, '乙养老院', '北京市东城区', 12, None, None, None, None, None),
            ('id-b', '地址', '660100000000', '丙养老院', '新疆生产建设兵团第一师', None, '新疆生产建设兵团', None, None, None, None),
        ]
        report = module.audit_rows(rows)
        self.assertEqual(report['rowCount'], 3)
        self.assertEqual(report['provinceRows'], {'广东省': 1, '北京市': 1, '新疆生产建设兵团': 1})
        self.assertEqual(report['statedProvinceMismatch'], {'广东省': 1, '北京市': 1})
        self.assertEqual(report['regionPrefixMismatch'], {})
        self.assertEqual(report['missingFields'], {'address': 1, 'beds': 1})
        self.assertEqual(report['duplicateUSCCGroups'], 1)

    def test_rejects_invalid_geography_instead_of_guessing(self):
        with self.assertRaisesRegex(ValueError, 'row 2: invalid 12-digit administrative code'):
            module.audit_rows([('id', '地址', '44', '甲', '广东省', 1, '广东省', None, None, None, None)])


if __name__ == '__main__':
    unittest.main()
