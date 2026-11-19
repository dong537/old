import json
from pathlib import Path
import runpy
import tempfile
import unittest
from tests.test_mca_production_readiness import setup_capture

ROOT = Path(__file__).resolve().parents[1]
MODULE = runpy.run_path(str(ROOT / 'scripts/audit-mca-field-dictionary-followup.py'))
SUMMARY = MODULE['summary']
AUDIT = MODULE['audit']
BASELINE = runpy.run_path(str(ROOT / 'scripts/audit-mca-production-readiness.py'))['audit']


class FieldDictionarySummaryTests(unittest.TestCase):
    def test_missing_empty_zero_and_false_are_distinct(self):
        result = SUMMARY([None, '', '  ', [], {}, 0, 0.0, '0', False])
        self.assertEqual(result['present'], 9)
        self.assertEqual(result['null'], 1)
        self.assertEqual(result['blankString'], 2)
        self.assertEqual(result['emptyString'], 1)
        self.assertEqual(result['whitespaceOnlyString'], 1)
        self.assertEqual(result['emptyContainer'], 2)
        self.assertEqual(result['numericZero'], 2)
        self.assertEqual(result['stringZero'], 1)
        self.assertEqual(result['populated'], 4)

    def test_summary_never_emits_values(self):
        secrets = ['PRIVATE-PERSON', 'PRIVATE-PHONE', 'PRIVATE-ID']
        result = json.dumps(SUMMARY(secrets + [{'contact': secrets[0]}]))
        for secret in secrets:
            self.assertNotIn(secret, result)
        self.assertNotIn('contact', result)


class FieldDictionaryBaselineTests(unittest.TestCase):
    def make_cache(self, root):
        folder = setup_capture(root, raw_page=False, raw_details=False)
        static = root / 'static-js/chunk-3d5896b7.22ca4f71.js'
        static.parent.mkdir()
        static.write_text('// synthetic public code', encoding='utf-8')
        baseline = root / 'production-readiness-audit.json'
        baseline.write_text(json.dumps(BASELINE(root)), encoding='utf-8')
        return folder, baseline

    def test_unchanged_cache_passes_without_writing_or_exporting_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_cache(root)
            before = {p: p.read_bytes() for p in root.rglob('*') if p.is_file()}
            result = AUDIT(root)
            self.assertEqual(result['targetPathCount'], 1)
            self.assertEqual(result['fields']['list.unexpectedField']['present'], 1)
            self.assertNotIn('private-marker', json.dumps(result))
            self.assertEqual(before, {p: p.read_bytes() for p in root.rglob('*') if p.is_file()})

    def test_stale_baseline_rejects_prior_value_field_or_manifest_change(self):
        for mutation in ('value', 'field', 'manifest'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                folder, _ = self.make_cache(root)
                path = folder / ('manifest.json' if mutation == 'manifest' else 'pages/00001.json')
                data = json.loads(path.read_text(encoding='utf-8'))
                if mutation == 'manifest':
                    data['complete'] = True
                else:
                    row = data['response']['data']['records'][0]
                    row['unexpectedField' if mutation == 'value' else 'newUnknownField'] = 'changed-private'
                path.write_text(json.dumps(data), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'baseline'):
                    AUDIT(root)

    def test_modified_baseline_path_set_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _, baseline = self.make_cache(root)
            data = json.loads(baseline.read_text(encoding='utf-8'))
            data['fields']['unreviewedNonNullPaths'] = []
            baseline.write_text(json.dumps(data), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'baseline'):
                AUDIT(root)


if __name__ == '__main__':
    unittest.main()
