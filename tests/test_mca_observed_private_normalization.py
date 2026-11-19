"""Offline, end-to-end tests for modern MCA private evidence projection."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/normalize-mca-observed-private.py'
_FIXTURE_MODULE = runpy.run_path(str(ROOT / 'tests/test_mca_field_production_gate.py'))
OUTPUT = 'national-observed-normalized-private.v1.json'


class ModernPrivateNormalizationTests(unittest.TestCase):
    def setUp(self):
        self.source = _FIXTURE_MODULE['FieldProductionGateTests'](
            'test_complete_modern_provenance_can_pass_without_publication')
        self.source.setUp()
        self.addCleanup(self.source.doCleanups)
        self.root = self.source.root
        original_page = self.source.page
        original_details = self.source.details

        def page(rows, folder='area-110000000000'):
            enriched = [{**row, 'axbe0003': '甲养老院' if row['axbe0001'] == 'ENTITY001' else '乙养老院',
                         'axbe0004': '3', 'axbe0004Name': '养老机构',
                         'areaCode': '110000000000', 'areaCodeName': '北京市',
                         'areaCodeNameFiveLevel': '北京市', 'axbe0013': '测试路 1 号',
                         'ahae2347': 0, 'ahae2323': None,
                         'ahae0012': 'PRIVATE-CONTACT-NEVER-EXPORT'} for row in rows]
            original_page(enriched, folder=folder)
            path = self.root / folder / 'pages/00001.json'
            wrapper = json.loads(path.read_text(encoding='utf-8'))
            wrapper['requestedAtUtc'] = '2026-11-19T00:00:00+00:00'
            self.source.save(f'{folder}/pages/00001.json', wrapper)

        def details(identifier='ENTITY001', base=None, care=None):
            original_details(identifier, base={
                'axbe0003': '详情中的名称', 'axbe0013': '测试路 1 号',
                'areaCode': '110000000000',
                'ahae2572': 'PRIVATE-PERSON-NEVER-EXPORT',
            }, care={'ahae2347': 0, 'ahae2323': None})

        self.source.page = page
        self.source.details = details

    def build(self):
        return runpy.run_path(str(SCRIPT))['build_private_snapshot'](self.root)

    def read_output(self):
        return json.loads((self.root / OUTPUT).read_text(encoding='utf-8'))

    def reattest_base_queue(self, queue):
        inventory = json.dumps(queue['items'], ensure_ascii=False, sort_keys=True,
                               separators=(',', ':')).encode('utf-8')
        digest = hashlib.sha256(inventory).hexdigest()
        queue['sourceInventorySha256'] = digest
        queue['sourceObservationCount'] = sum(
            len(item['sourcePages']) for item in queue['items'])
        owner = 'national-observed-details-20261119'
        self.source.save(owner + '/queue.json', queue)
        for relative in ('manifest.json',
                         'batch-runs/detail-20261119-auto-0001.status.json'):
            path = self.root / owner / relative
            value = json.loads(path.read_text(encoding='utf-8'))
            value['sourceInventorySha256'] = digest
            self.source.save(owner + '/' + relative, value)

    def replace_detail_response(self, endpoint, data):
        owner = 'national-observed-details-20261119'
        relative = owner + '/details/ENTITY001.json'
        combined = json.loads((self.root / relative).read_text(encoding='utf-8'))
        original = combined['endpoints'][endpoint]
        rebuilt = _FIXTURE_MODULE['HELPERS']['wrapper'](
            {'code': 0, 'data': data}, request=original['request'])
        rebuilt['requestedAtUtc'] = original['requestedAtUtc']
        rebuilt['fetchedAtUtc'] = original['fetchedAtUtc']
        combined['endpoints'][endpoint] = rebuilt
        self.source.save(owner + f'/detail-checkpoints/ENTITY001/{endpoint}.json', rebuilt)
        self.source.save(relative, combined)

    def test_verified_base_chain_preserves_values_states_and_each_source(self):
        self.source.modern_batch()
        summary = self.build()
        document = self.read_output()
        self.assertEqual(summary['recordCount'], 1)
        self.assertFalse(document['publishable'])
        self.assertFalse(document['nationalComplete'])
        self.assertFalse(document['snapshotVerified'])
        self.assertEqual(document['recordCount'], 1)
        record = document['records'][0]
        self.assertEqual(record['mcaId'], 'ENTITY001')
        names = record['fields']['facilityName']
        self.assertEqual([entry['value'] for entry in names], ['甲养老院', '详情中的名称'])
        self.assertEqual([entry['source']['endpoint'] for entry in names],
                         ['queryOrganizationDataList', 'orgBaseDetail'])
        self.assertEqual(names[0]['source']['requestedAtUtc'], '2026-11-19T00:00:00+00:00')
        for entry in names:
            self.assertEqual(len(entry['source']['fileSha256']), 64)
            self.assertEqual(len(entry['source']['responseSha256']), 64)
            self.assertTrue(entry['source']['file'].startswith('national-'))
        beds = record['fields']['listedBeds']
        self.assertEqual([entry['state'] for entry in beds], ['numeric_zero', 'numeric_zero'])
        self.assertTrue(all(type(entry['value']) is int and entry['value'] == 0 for entry in beds))
        self.assertEqual([entry['state'] for entry in record['fields']['nursingBeds']],
                         ['null', 'null'])
        self.assertTrue(all(entry['value'] is None for entry in record['fields']['nursingBeds']))
        self.assertEqual(record['fields']['facilityTypeLabel'][1]['state'], 'missing')
        self.assertNotIn('value', record['fields']['facilityTypeLabel'][1])
        raw = (self.root / OUTPUT).read_text(encoding='utf-8')
        self.assertNotIn('PRIVATE-CONTACT-NEVER-EXPORT', raw)
        self.assertNotIn('PRIVATE-PERSON-NEVER-EXPORT', raw)

    def test_care_detail_without_response_id_uses_verified_request_id(self):
        self.source.modern_batch()
        path = (self.root / 'national-observed-details-20261119/'
                'details/ENTITY001.json')
        combined = json.loads(path.read_text(encoding='utf-8'))
        care = dict(combined['endpoints']['yangLaoOrgDetail']['response']['data'])
        care.pop('axbe0001')
        self.replace_detail_response('yangLaoOrgDetail', care)
        report = self.source.audit()
        self.assertTrue(report['sourceBatchVerification'][
            'national-observed-details-20261119']['verified'])
        self.build()
        record = self.read_output()['records'][0]
        self.assertEqual(record['fields']['listedBeds'][1]['value'], 0)
        self.assertEqual(record['fields']['listedBeds'][1]['source']['responseIdState'],
                         'absent')

    def test_care_detail_with_conflicting_response_id_is_rejected(self):
        self.source.modern_batch()
        self.replace_detail_response('yangLaoOrgDetail', {
            'axbe0001': 'OTHER-ENTITY', 'ahae2347': 0})
        report = self.source.audit()
        self.assertFalse(report['sourceBatchVerification'][
            'national-observed-details-20261119']['verified'])
        with self.assertRaisesRegex(ValueError, 'source_chain_unverified'):
            self.build()
        self.assertFalse((self.root / OUTPUT).exists())

    def test_unverified_or_mutated_source_cannot_create_or_replace_output(self):
        self.source.modern_batch()
        manifest = self.root / 'national-observed-details-20261119/manifest.json'
        saved_manifest = manifest.read_bytes()
        manifest.unlink()
        with self.assertRaises(ValueError):
            self.build()
        self.assertFalse((self.root / OUTPUT).exists())
        manifest.write_bytes(saved_manifest)
        self.build()
        original = (self.root / OUTPUT).read_bytes()
        page = self.root / 'national-area-first-pages-20261119/area-110000000000/pages/00001.json'
        wrapper = json.loads(page.read_text(encoding='utf-8'))
        wrapper['responseSha256'] = '0' * 64
        page.write_text(json.dumps(wrapper), encoding='utf-8')
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual((self.root / OUTPUT).read_bytes(), original)

    def test_attested_coverage_anomaly_keeps_repeated_observations_private(self):
        queue = self.source.modern_batch()
        page_name = ('national-area-first-pages-20261119/'
                     'area-110000000000/pages/00001.json')
        self.source.page([{'axbe0001': 'ENTITY001'},
                          {'axbe0001': 'ENTITY001'}],
                         folder='national-area-first-pages-20261119/area-110000000000')
        page_path = self.root / page_name
        page = json.loads(page_path.read_text(encoding='utf-8'))
        item = queue['items'][0]
        reference = item['sourcePages'][0]
        reference['storedFileSha256'] = hashlib.sha256(page_path.read_bytes()).hexdigest()
        reference['responseSha256'] = page['responseSha256']
        reference['listCoverageVerified'] = False
        reference['areaIssues'] = ['duplicateIds']
        item['sourcePages'].append(dict(reference))
        item['listCoverageVerified'] = False
        item['listCoverageIssues'] = ['duplicateIds']
        self.reattest_base_queue(queue)

        report = self.source.audit()
        self.assertTrue(report['sourceBatchVerification'][
            'national-observed-details-20261119']['verified'])
        self.build()
        document = self.read_output()
        self.assertFalse(document['publishable'])
        self.assertFalse(document['nationalComplete'])
        record = document['records'][0]
        self.assertEqual(record['listCoverage'],
                         {'verified': False, 'issues': ['duplicateIds']})
        observations = record['fields']['facilityName']
        self.assertEqual(len([entry for entry in observations if
                              entry['source']['endpoint'] == 'queryOrganizationDataList']), 2)
        self.assertTrue(all(entry['source']['areaIssues'] == ['duplicateIds']
                            for entry in observations[:2]))

    def test_total_drift_flag_is_retained_and_inconsistent_flags_rejected(self):
        queue = self.source.modern_batch()
        item = queue['items'][0]
        item['listCoverageVerified'] = False
        item['listCoverageIssues'] = ['totalDrift']
        item['sourcePages'][0]['listCoverageVerified'] = False
        item['sourcePages'][0]['areaIssues'] = ['totalDrift']
        self.reattest_base_queue(queue)
        self.build()
        record = self.read_output()['records'][0]
        self.assertEqual(record['listCoverage']['issues'], ['totalDrift'])
        self.assertFalse(record['listCoverage']['verified'])

        original = (self.root / OUTPUT).read_bytes()
        item['listCoverageVerified'] = True
        self.reattest_base_queue(queue)
        with self.assertRaisesRegex(ValueError, 'source_list_coverage_invalid'):
            self.build()
        self.assertEqual((self.root / OUTPUT).read_bytes(), original)

    def test_cli_rejects_external_root_even_with_a_valid_source_chain(self):
        self.source.modern_batch()
        result = subprocess.run(
            [sys.executable, str(SCRIPT), '--root', str(self.root)],
            cwd=ROOT, text=True, capture_output=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / OUTPUT).exists())

    def test_level4_queue_projects_base_and_incremental_details_once(self):
        base = self.source.modern_batch(descendants=True)
        self.source.modern_batch(True, base)
        self.build()
        document = self.read_output()
        self.assertEqual(document['recordCount'], 2)
        self.assertEqual([row['mcaId'] for row in document['records']],
                         ['ENTITY001', 'ENTITY002'])
        for row in document['records']:
            self.assertEqual(len([entry for entry in row['fields']['facilityName']
                                  if entry['source']['endpoint'] == 'orgBaseDetail']), 1)
        self.assertEqual(len(document['sourceBatches']), 2)


if __name__ == '__main__':
    unittest.main()
