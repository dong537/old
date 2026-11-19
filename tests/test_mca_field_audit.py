"""Behavioral checks for contact-free MCA field inventory."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'audit-mca-fields.py'


class McaFieldAuditTests(unittest.TestCase):
    def run_audit(self, root):
        output = root / 'inventory.json'
        result = subprocess.run(
            [sys.executable, str(SCRIPT), '--root', str(root), '--output', str(output)],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(output.read_text(encoding='utf-8'))

    def test_detail_inventory_counts_nested_fields_without_leaking_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'area-440000000000' / 'details'
            folder.mkdir(parents=True)
            record = {'endpoints': {
                'orgBaseDetail': {'response': {'data': {
                    'axbe0003': '示例养老院', 'ahae2573': '13812345678',
                    'orgServiceInfo': {'serviceTime': None, 'hae15': [{'kind': 'care'}, {'kind': 'meal'}]},
                }}},
                'yangLaoOrgDetail': {'response': {'data': {'ahae2347': 0}}},
            }}
            (folder / 'id-1.json').write_text(json.dumps(record, ensure_ascii=False), encoding='utf-8')
            report = self.run_audit(root)
            self.assertEqual(report['detailFiles'], 1)
            self.assertEqual(report['fields']['orgBaseDetail.axbe0003']['nonNullCount'], 1)
            self.assertEqual(report['fields']['orgBaseDetail.orgServiceInfo.serviceTime']['nonNullCount'], 0)
            self.assertEqual(report['fields']['orgBaseDetail.orgServiceInfo.hae15[].kind']['presentCount'], 1)
            self.assertEqual(report['fields']['yangLaoOrgDetail.ahae2347']['types'], ['int'])
            self.assertNotIn('13812345678', json.dumps(report, ensure_ascii=False))
            self.assertNotIn('示例养老院', json.dumps(report, ensure_ascii=False))

    def test_list_inventory_distinguishes_missing_null_and_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'area-440000000000' / 'pages'
            folder.mkdir(parents=True)
            page = {'response': {'data': {'records': [
                {'axbe0001': 'a', 'ahae2347': 0, 'axbe0013': None},
                {'axbe0001': 'b', 'ahae2347': None},
            ]}}}
            (folder / '00001.json').write_text(json.dumps(page), encoding='utf-8')
            report = self.run_audit(root)
            self.assertEqual(report['listRows'], 2)
            self.assertEqual(report['fields']['list.ahae2347']['presentCount'], 2)
            self.assertEqual(report['fields']['list.ahae2347']['nonNullCount'], 1)
            self.assertEqual(report['fields']['list.axbe0013']['presentCount'], 1)
            self.assertEqual(report['fields']['list.axbe0013']['nonNullCount'], 0)


if __name__ == '__main__':
    unittest.main()
