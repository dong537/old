"""Behaviour tests for pinned, private batch15 evidence archives."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/batch15_aggregate_cleaning.py'

def module():
    if not SCRIPT.exists():
        raise AssertionError('Batch15 aggregate cleaner is not implemented')
    spec = importlib.util.spec_from_file_location('batch15_aggregate_cleaning', SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

class AggregateTests(unittest.TestCase):
    def fixture(self, root):
        c = module()
        relative = 'research-batch15/pearl/raw/table.html'
        raw = '<html><head><meta name="PubDate" content="2024-05-08 16:03:13"></head><body><table><tr><th>机构名称</th><th>床位</th></tr><tr><td> 历史机构 </td><td>0</td></tr></table></body></html>'.encode('utf-8')
        p = root / relative
        p.parent.mkdir(parents=True)
        p.write_bytes(raw)
        digest = hashlib.sha256(raw).hexdigest()
        reader = c.PinnedInputs(root, root, {relative: digest})
        d = {'classification':'historical_roster','source_sha256':digest,'source_locator':'/html/body/table/tr[2]/td[1]',
             'name_xpath':'/html/body/table/tr[2]/td[1]','name_raw':' 历史机构 ','source_period_label':'2024年5月（标题月份）',
             'identity_merge_approved':False,'current_operation_on_check_date_confirmed':False,
             'raw_fields':[{'header_raw':'床位','header_text_raw':['床位'],'header_xpaths':['/html/body/table/tr[1]/th[2]'],
                            'value_raw':'0','cell_xpath':'/html/body/table/tr[2]/td[2]'}]}
        row = dict(zip(c.FIELDS,['东莞','历史机构','https://official.test/table','2024-05-08 16:03:13','',relative,'官方历史机构名录',json.dumps(d,ensure_ascii=False)]))
        return c, reader, row, p

    def change(self,row,**changes):
        d=json.loads(row['details']);d.update(changes);return {**row,'details':json.dumps(d,ensure_ascii=False)}

    def test_historical_source_preserves_zero_period_and_unknown_state(self):
        with tempfile.TemporaryDirectory() as temp:
            c,r,row,p=self.fixture(Path(temp));result=c.normalize_observation(row,r)
            self.assertEqual(result['classification'],'historical_roster')
            self.assertEqual(result['details']['raw_fields'][0]['value_raw'],'0')
            self.assertEqual(result['source_as_of'],'')
            self.assertEqual(result['current_operating_status'],'unknown')
            self.assertFalse(result['institution_identity_verified'])

    def test_raw_tampering_fails_before_export(self):
        with tempfile.TemporaryDirectory() as temp:
            c,r,row,p=self.fixture(Path(temp));p.write_bytes(p.read_bytes()+b'changed')
            with self.assertRaisesRegex(ValueError,'SHA'):
                c.normalize_observation(row,r)

    def test_rejects_escaping_other_batch_and_unpinned_source(self):
        with tempfile.TemporaryDirectory() as temp:
            c,r,row,p=self.fixture(Path(temp))
            for path in ['../source.html','research-batch14/pearl/raw/table.html','research-batch15/east/raw/table.html','C:/table.html','research-batch15/pearl/../table.html']:
                with self.subTest(path=path),self.assertRaisesRegex(ValueError,'path|scope'):
                    c.normalize_observation({**row,'source_file':path},r)
            with self.assertRaisesRegex(ValueError,'not pinned'):
                r.read('research-batch15/pearl/raw/unlisted.html')

    def test_rejects_nonhistorical_and_false_approval(self):
        with tempfile.TemporaryDirectory() as temp:
            c,r,row,p=self.fixture(Path(temp))
            for changes in [{'classification':'current_roster_candidate'},{'identity_merge_approved':True},{'current_operation_on_check_date_confirmed':True}]:
                with self.subTest(changes=changes),self.assertRaisesRegex(ValueError,'historical|approval|verified'):
                    c.normalize_observation(self.change(row,**changes),r)

    def test_rejects_as_of_and_publication_date_fabrication(self):
        with tempfile.TemporaryDirectory() as temp:
            c,r,row,p=self.fixture(Path(temp))
            with self.assertRaisesRegex(ValueError,'source_as_of'):
                c.normalize_observation({**row,'source_as_of':'2024-05-31'},r)
            with self.assertRaisesRegex(ValueError,'publication'):
                c.normalize_observation({**row,'source_published_at':'2026-11-15'},r)

    def test_rejects_wrong_name_field_and_header_locations(self):
        with tempfile.TemporaryDirectory() as temp:
            c,r,row,p=self.fixture(Path(temp))
            for changes in [{'name_raw':'改名'},{'source_locator':'/html/body/missing'},{'raw_fields':[{'header_raw':'床位','header_text_raw':['床位'],'header_xpaths':['/html/body/missing'],'value_raw':'0','cell_xpath':'/html/body/table/tr[2]/td[2]'}]}, {'raw_fields':[{'header_raw':'床位','header_text_raw':['床位'],'header_xpaths':['/html/body/table/tr[1]/th[2]'],'value_raw':'9','cell_xpath':'/html/body/table/tr[2]/td[2]'}]}]:
                with self.subTest(changes=changes),self.assertRaisesRegex(ValueError,'name|locator|field|header'):
                    c.normalize_observation(self.change(row,**changes),r)

    def test_rejects_malformed_field_arrays_before_comparing_values(self):
        with tempfile.TemporaryDirectory() as temp:
            c,r,row,p=self.fixture(Path(temp))
            for fields in [None,{},[],[None],[{'value_raw':'0','header_raw':'床位','header_text_raw':{'x':'床位'},'header_xpaths':[]}],[{'value_raw':'0','header_raw':'床位','header_text_raw':['床位'],'header_xpaths':[]}]]:
                with self.subTest(fields=fields),self.assertRaisesRegex(ValueError,'field|header'):
                    c.normalize_observation(self.change(row,raw_fields=fields),r)

    def test_manifest_checks_generator_input_and_output_bytes(self):
        c=module()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=root/'evidence/v1';folder.mkdir(parents=True)
            (root/'source.txt').write_bytes(b'source');(root/'generator.py').write_bytes(b'code');(folder/'result.txt').write_bytes(b'result')
            manifest={'generator_sha256':c.sha(b'code'),'source_sha256':{'source.txt':c.sha(b'source')},'output_sha256':{'result.txt':c.sha(b'result')}}
            raw=c.packed(manifest);(folder/'manifest.json').write_bytes(raw)
            pins={'evidence/v1/manifest.json':c.sha(raw)}
            r=c.PinnedInputs(root,root,pins)
            c.validate_manifest(r,'evidence/v1/manifest.json','project:generator.py')
            for path in [root/'source.txt',root/'generator.py',folder/'result.txt']:
                old=path.read_bytes();path.write_bytes(b'changed')
                with self.subTest(path=str(path)),self.assertRaisesRegex(ValueError,'SHA'):
                    c.validate_manifest(c.PinnedInputs(root,root,pins),'evidence/v1/manifest.json','project:generator.py')
                path.write_bytes(old)

    def test_real_archive_conserves_baseline_rows_and_separates_supplements(self):
        c=module();outputs,report=c.build()
        self.assertEqual(outputs['cumulative-roster-candidates.csv'],(c.DATA/c.BASELINE/'cumulative-roster-candidates.csv').read_bytes())
        self.assertEqual(report['cumulative_roster_candidate_observations'],2429)
        self.assertEqual(report['batch15_class_counts'],{'historical_roster':123})
        self.assertEqual(report['combined_machine_classified_observations'],692)
        self.assertEqual(report['combined_classification_counts'],{'historical_roster':310,'special_subset':155,'current_roster_candidate':81,'republication_candidate':129,'status_event':17})
        self.assertEqual(report['combined_scan_transcriptions_pending_human_review'],19)
        self.assertEqual(report['cities_proven_complete_current_roster'],0)
        self.assertEqual(len(c.parse_csv(outputs['combined-classified-observations.csv'])),692)
        self.assertEqual(len(c.parse_csv(outputs['city-cleaning-matrix.csv'])),21)
        self.assertEqual(report['unassigned_city_classified_observations'],4)
        self.assertEqual(sum(int(r['combined_machine_classified_observations']) for r in c.parse_csv(outputs['city-cleaning-matrix.csv']))+report['unassigned_city_classified_observations'],692)
        self.assertEqual(outputs['combined-scan-review-observations.csv'],(c.DATA/c.BASELINE/'combined-scan-review-observations.csv').read_bytes())
        index=json.loads(outputs['supplemental-evidence-index.json'])
        self.assertTrue(all(x['new_observations']==0 for x in index))

if __name__=='__main__':unittest.main()
