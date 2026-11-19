"""Tests for the private, provenance-preserving XLSX candidate index."""

import runpy
import shutil
import tempfile
import unittest
from pathlib import Path
import hashlib
import json


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/reconcile-official-downloads.py'


class OfficialDownloadsReconciliationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = runpy.run_path(str(SCRIPT))

    def test_real_official_rows_keep_source_location_and_all_original_fields(self):
        read = self.module['read_official_sources']
        records, sources = read()
        self.assertEqual(len(records), 42)
        self.assertEqual([r['sourceKey'] for r in records].count('dalian-hightech'), 9)
        self.assertEqual([r['sourceKey'] for r in records].count('qixian'), 33)
        first = records[0]
        self.assertEqual(first['excelRow'], 3)
        self.assertEqual(first['rawFields']['序号'], 1)
        self.assertEqual(first['rawFields']['名称'], first['name'])
        self.assertIn('对外电话', first['rawFields'])
        self.assertEqual(first['dateLabel'], {'value': '2026-07-16', 'meaning': 'attachment_update_date'})
        self.assertEqual(records[9]['dateLabel'], {'value': '2025-12', 'meaning': 'filename_reference_month'})
        self.assertEqual(records[9]['rawFields']['县区'], '杞县')
        self.assertTrue(all(r['sourcePage'].startswith('https://') for r in records))
        self.assertTrue(all(r['operatingStatus'] is None for r in records))
        self.assertEqual(sources['dalian-hightech']['rowCount'], 9)
        self.assertEqual(sources['qixian']['rowCount'], 33)

    def test_changed_official_bytes_fail_before_any_candidate_index_is_built(self):
        source_dir = ROOT / 'data/private/official-downloads/2026-11-19'
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)
            for path in source_dir.iterdir():
                shutil.copy2(path, target / path.name)
            changed = target / 'qixian-202512.xlsx'
            changed.write_bytes(changed.read_bytes() + b'changed')
            with self.assertRaisesRegex(ValueError, 'SHA-256 differs'):
                self.module['read_official_sources'](target)

    def test_name_matches_are_only_review_candidates_and_do_not_collapse_duplicates(self):
        index = self.module['build_candidate_index']
        self.assertEqual(self.module['name_key']('甲 乙（丙）-院'), '甲乙丙院')
        official = [
            {'sourceKey': 'qixian', 'excelRow': 3, 'name': '甲（乙）养老院'},
            {'sourceKey': 'qixian', 'excelRow': 4, 'name': '甲乙养老院'},
            {'sourceKey': 'dalian-hightech', 'excelRow': 3, 'name': '甲乙养老院'},
            {'sourceKey': 'qixian', 'excelRow': 5, 'name': '无匹配机构'},
        ]
        qcc = [
            {'excelRow': 10, 'name': '甲乙养老院', 'divisionCode': '410221000000', 'region': '河南省开封市杞县'},
            {'excelRow': 11, 'name': '甲乙养老院', 'divisionCode': '410222000000', 'region': '河南省开封市通许县'},
            {'excelRow': 12, 'name': '甲乙养老院', 'divisionCode': '210211000000', 'region': '辽宁省大连市甘井子区'},
        ]
        result = index(official, qcc)
        self.assertEqual(len(result['candidates']), 9)
        self.assertEqual(result['audit']['officialDuplicateNameKeys']['qixian'], 1)
        self.assertEqual(result['audit']['unmatchedOfficialRows'], 1)
        self.assertEqual({r['matchScope'] for r in result['candidates']},
                         {'same_county', 'same_city_scope_unverified',
                          'same_province_other_area', 'other_province'})
        self.assertEqual(result['audit']['sameLocalityMatchedRows'], 2)
        self.assertEqual(result['audit']['scopeUnverifiedMatchedRows'], 1)
        self.assertTrue(all(r['reviewStatus'] == 'pending' for r in result['candidates']))
        self.assertNotIn('identityConfirmed', result['candidates'][0])

    def test_v2_keeps_v1_and_identifies_qcc_source_as_undated(self):
        folder = ROOT / 'data/private/national-reconciliation/official-downloads-20261119'
        first = folder / 'candidate-index.json'
        second = folder / 'candidate-index.v2.json'
        self.assertEqual(hashlib.sha256(first.read_bytes()).hexdigest(),
                         '384459ffc9f61d374cca33534ee939126d696ab48a2705a200af2bf1c8b072f1')
        self.assertTrue(second.is_file())
        result = json.loads(second.read_text(encoding='utf-8'))
        self.assertEqual(result['schemaVersion'], 2)
        self.assertEqual(result['qccSource']['filename'], '养老机构信息.xlsx')
        self.assertEqual(result['qccSource']['publisher'], '企查查')
        self.assertIsNone(result['qccSource']['asOf'])
        self.assertEqual(result['qccAudit']['candidatePairsByScope']['same_city_scope_unverified'], 7)
        self.assertEqual(result['qccAudit']['sameLocalityMatchedRows'], 5)

    def test_real_qcc_snapshot_is_locked_and_fully_scanned(self):
        qcc, digest = self.module['read_qcc_rows']()
        self.assertEqual(len(qcc), 41955)
        self.assertEqual(digest, '6bc157e2695965ed8b1c85e82f6f8b7fa7d13102149f9f1512e9863b2489fd81')
        self.assertEqual(qcc[0]['excelRow'], 2)

    def test_qixian_mca_cache_is_an_incomplete_offline_name_candidate_source(self):
        official, _ = self.module['read_official_sources']()
        mca_rows, cache = self.module['read_mca_saved_rows']()
        self.assertEqual(len(mca_rows), 19)
        self.assertEqual(cache['savedPages'], 2)
        self.assertFalse(cache['snapshotVerified'])
        result = self.module['build_mca_candidates'](
            [row for row in official if row['sourceKey'] == 'qixian'], mca_rows
        )
        audit = result['audit']
        self.assertEqual(audit['officialRows'], 33)
        self.assertEqual(audit['exactOfficialRows'] + audit['normalizedOnlyOfficialRows']
                         + audit['unmatchedOfficialRows'], 33)
        self.assertGreaterEqual(audit['exactOfficialRows'], 1)
        self.assertGreater(audit['unmatchedOfficialRows'], 0)
        self.assertTrue(all(candidate['reviewStatus'] == 'pending'
                            for candidate in result['candidates']))


if __name__ == '__main__':
    unittest.main()
