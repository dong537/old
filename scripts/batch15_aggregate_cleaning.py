"""Build a pinned, offline, private batch15 archive without changing published data."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import tempfile
from collections import Counter
from pathlib import Path, PurePosixPath
from lxml import html, etree

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/private/guangdong-eldercare-source'
PACKAGE = 'research-batch15'
BASELINE = 'research-batch14/cleaned/versions/v1-077e201ad7d5b04d'
BASELINE_MANIFEST_SHA = 'ef5bd3cdf3e3d79f5b25c0d79e1900d6c29d8d83cbc38a58c44e91bb28f0afb4'
GZ = PACKAGE+'/guangzhou/versions/v1-4844e38848091fa8'
LEGACY = PACKAGE+'/guangzhou-legacy-provenance/versions/v1-253f9064c01cd836'
FIELDS = ('city','institution_name','source_url','source_published_at','source_as_of','source_file','evidence_type','details')
CLASSIFIED_FIELDS = ('observation_id','source_family','classification','institution_identity_verified','current_operating_status','date_label_as_published',*FIELDS)
CITIES = ('广州','深圳','珠海','汕头','佛山','韶关','河源','梅州','惠州','东莞','中山','江门','阳江','湛江','茂名','肇庆','清远','潮州','揭阳','汕尾','云浮')
CLASSES = ('current_roster_candidate','historical_roster','special_subset','republication_candidate','status_event')
# This reviewed root contract is code-owned. Only a verified manifest/register may
# declare its explicit dependencies; directory contents are never implicit inputs.
PINNED_ROOTS = {
 BASELINE+'/manifest.json':BASELINE_MANIFEST_SHA,
 GZ+'/manifest.json':'661d4001684e100a2bba8471fd77bdc06b70ec92608b078e9ae8c9b0a5f91822',
 LEGACY+'/manifest.json':'e5aa7b321eee5ba1f0b86bbc54d7b2be98c9cad216e1f185c7e3c1d9d6166cd6',
 PACKAGE+'/pearl/observations.csv':'0e68036c39ee5487ddcffec6f01c45c52225c289f1e163b1db70c1cc2d9bbd91',
 PACKAGE+'/pearl/source-register.json':'5e5dee13a8b97de13ca61e35b2034149094803d8542fc9316b3ea22ada81ba3c',
 PACKAGE+'/pearl/coverage.json':'1b5cd2729e344b209f9e1043169c4d8fbfea4a2c8f59bb9a30233e4748529f31',
 PACKAGE+'/pearl/verification.json':'7739f69d4a6660f2343a676f867fb2da5f2ef9883e9474205f9a39edbe839507',
 PACKAGE+'/pearl/navigation-evidence.json':'06829a2c3b27061350a64a291e5934deb081706f2df90bb2e9489e498f9ebb57',
 PACKAGE+'/pearl/existing-2022-crosscheck.json':'eabe8ceb6f66f518e73e3ebd71b0b866a9467446870a1825f676b092a25b5b4e',
 PACKAGE+'/pearl/README.md':'04cb7891ce58585ebcef417abac9686c05a99b73f24c21a41cd672e58335bb8f',
 PACKAGE+'/east/source-register.json':'720a9a3eda99dd542ac1120fc026a248b6128ff335587d5d2f6170f33bc5beeb',
 PACKAGE+'/east/verification.json':'a88b145f5a581f54142d191cb9f222e89402952b3ca213d2476555636a103aa8',
 PACKAGE+'/east/review.md':'c6e1515775e7809a80962a94aaccf0a56a485b44974aa205f17255c9b84c668f',
 PACKAGE+'/west-north/zhaoqing-catalog-register.json':'b66f1dd611d528e7cb013127bd6856749a5bf223244c03710eb2fe4f39a2491d',
 PACKAGE+'/west-north/xinxing-scan-visual-review.json':'4c0b92399f95f6b3f3856d13c9a9a32705d36c0ca9d6c27a4c4500641ad38dfc',
 PACKAGE+'/west-north/README.md':'cfe06b8447dd56aa92ef48a38b078e409c5b9d96b5fa6a5f4dd2ef6834d31b08',
}

def sha(raw): return hashlib.sha256(raw).hexdigest()
def packed(value): return (json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf-8')
def compact(text): return ' '.join(text.split())
def parse_csv(raw): return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'),newline='')))
def csv_bytes(rows,fields):
    stream=io.StringIO(newline='');w=csv.DictWriter(stream,fieldnames=fields,lineterminator='\n',extrasaction='raise');w.writeheader()
    for row in rows:
        w.writerow({k:json.dumps(v,ensure_ascii=False,separators=(',',':')) if isinstance(v,(dict,list)) else v for k,v in row.items()})
    return stream.getvalue().encode('utf-8-sig')
def jsonl_bytes(rows): return ''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows).encode('utf-8')

class PinnedInputs:
    """Permit only explicit relative inputs and recheck their content on each read."""
    def __init__(self,data_root,project_root,declared):
        self.data_root=Path(data_root).resolve();self.project_root=Path(project_root).resolve();self.declared={};self.used={}
        for key,digest in declared.items(): self.declare(key,digest)
    def path(self,key):
        if not isinstance(key,str):raise ValueError('Input path must be text')
        project=key.startswith('project:');relative=key[8:] if project else key
        p=PurePosixPath(relative);base=self.project_root if project else self.data_root
        if not relative or '\\' in relative or ':' in relative or p.is_absolute() or '..' in p.parts or p.as_posix()!=relative:
            raise ValueError('Invalid input path: '+key)
        target=(base/relative).resolve()
        if not target.is_relative_to(base):raise ValueError('Input path escapes root: '+key)
        return target
    def declare(self,key,digest):
        self.path(key)
        if not isinstance(digest,str) or not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('Invalid input SHA: '+key)
        if key in self.declared and self.declared[key]!=digest:raise ValueError('Conflicting input SHA: '+key)
        self.declared[key]=digest
    def read(self,key):
        path=self.path(key)
        if key not in self.declared:raise ValueError('Input not pinned: '+key)
        raw=path.read_bytes()
        if sha(raw)!=self.declared[key]:raise ValueError('Pinned input SHA mismatch: '+key)
        self.used[key]=self.declared[key]
        return raw

def validate_manifest(reader,relative,generator):
    """Expand dependencies only after the manifest itself has passed a root pin."""
    manifest=json.loads(reader.read(relative));parent=PurePosixPath(relative).parent
    if not isinstance(manifest,dict):raise ValueError('Manifest must be an object')
    outputs=manifest.get('output_sha256');sources=manifest.get('inputs_sha256',manifest.get('source_sha256'))
    if not isinstance(outputs,dict) or not outputs or not isinstance(sources,dict):raise ValueError('Manifest hash maps are missing')
    reader.declare(generator,manifest.get('generator_sha256'));reader.read(generator)
    if 'version_id' in manifest and manifest['version_id']!=parent.name:raise ValueError('Manifest version path mismatch')
    for key,digest in sources.items():reader.declare(key,digest);reader.read(key)
    for name,digest in outputs.items():
        if not isinstance(name,str) or PurePosixPath(name).name!=name or name in ('.','..'):raise ValueError('Invalid manifest output path')
        key=(parent/name).as_posix();reader.declare(key,digest);reader.read(key)
    return manifest

def text_at(tree,locator,label):
    if not isinstance(locator,str) or not locator.startswith('/'):raise ValueError(label+' locator is invalid')
    try:nodes=tree.xpath(locator)
    except etree.XPathError as error:raise ValueError(label+' locator is invalid') from error
    if len(nodes)!=1 or not isinstance(nodes[0],etree._Element):raise ValueError(label+' locator must select one element')
    return nodes[0].text_content()

def normalize_observation(row,reader):
    if tuple(row)!=FIELDS:raise ValueError('Unexpected eight-column observation schema')
    detail=json.loads(row['details'])
    if not isinstance(detail,dict) or detail.get('classification')!='historical_roster':raise ValueError('Only historical_roster observations are approved')
    if detail.get('identity_merge_approved') is not False or detail.get('current_operation_on_check_date_confirmed') is not False:
        raise ValueError('Historical observations cannot contain identity or current-status approval')
    source=row['source_file'];path=reader.path(source)
    if not source.startswith(PACKAGE+'/pearl/') or not path.is_relative_to((reader.data_root/PACKAGE/'pearl').resolve()):raise ValueError('Observation source path outside batch15/pearl scope')
    if row['source_as_of']!='':raise ValueError('source_as_of has no independent cutoff evidence')
    if row['city']!='东莞' or not isinstance(row['institution_name'],str) or not row['institution_name'].strip():raise ValueError('Historical city/name outside reviewed scope')
    raw=reader.read(source)
    if detail.get('source_sha256')!=sha(raw):raise ValueError('Observation raw source SHA mismatch')
    t=html.fromstring(raw,parser=html.HTMLParser(encoding='utf-8',no_network=True))
    if t.xpath('string(//meta[@name="PubDate"]/@content)')!=row['source_published_at']:raise ValueError('Source publication date differs from original meta')
    name=detail.get('name_raw')
    if not isinstance(name,str) or compact(name)!=row['institution_name']:raise ValueError('Institution name differs from retained raw name')
    for key in ('source_locator','name_xpath'):
        if text_at(t,detail.get(key),'name')!=name:raise ValueError('Institution name locator differs from original')
    fields=detail.get('raw_fields')
    if not isinstance(fields,list) or not fields:raise ValueError('raw_fields must be a nonempty field array')
    for field in fields:
        if not isinstance(field,dict) or not isinstance(field.get('value_raw'),str):raise ValueError('Raw field schema requires text values')
        headers=field.get('header_text_raw');paths=field.get('header_xpaths')
        if not isinstance(field.get('header_raw'),str) or not isinstance(headers,list) or not headers or not all(isinstance(h,str) for h in headers) or not isinstance(paths,list) or len(headers)!=len(paths):
            raise ValueError('Raw header arrays are missing or malformed')
        if text_at(t,field.get('cell_xpath'),'field')!=field['value_raw']:raise ValueError('Raw field value differs from original')
        for header,locator in zip(headers,paths):
            if text_at(t,locator,'header')!=header:raise ValueError('Raw header value differs from original')
        if ' / '.join(compact(h) for h in headers)!=field['header_raw']:raise ValueError('Raw header composition differs from original')
    label=detail.get('source_period_label')
    if not isinstance(label,str) or not label:raise ValueError('Source period label missing')
    stable='\0'.join(('batch15/pearl',source,detail['source_sha256'],detail['source_locator'],row['institution_name'],'historical_roster'))
    return {'observation_id':'obs-'+sha(stable.encode('utf-8'))[:24],'source_family':'pearl','classification':'historical_roster',
       'institution_identity_verified':False,'current_operating_status':'unknown','date_label_as_published':label,**row,
       'details':{**detail,'source_package':PACKAGE+'/pearl','evidence_type_as_supplied':row['evidence_type'],
                  'institution_identity_verified':False,'current_operating_status_verified':False}}

def verify_response(reader,record,prefix,relative_to=None):
    if not isinstance(record,dict):raise ValueError('Response register item is not an object')
    key=record.get('source_file')
    if not isinstance(key,str):raise ValueError('Response source path is missing')
    if relative_to:key=relative_to+'/'+key
    if not key.startswith(prefix):raise ValueError('Response source path outside registered scope')
    reader.declare(key,record.get('sha256'));raw=reader.read(key)
    if not isinstance(record.get('bytes'),int) or len(raw)!=record['bytes']:raise ValueError('Response bytes differ from register')
    return raw

def supplemental_evidence(reader):
    entries=[]
    for label,base,generator in [('广州天河跨期文字对照',GZ,'project:scripts/batch15_guangzhou_crosswalk.py'),('广州旧候选逐行来源补证',LEGACY,'project:scripts/batch15_guangzhou_legacy_provenance.py')]:
        m=validate_manifest(reader,base+'/manifest.json',generator)
        entries.append({'label':label,'manifest':base+'/manifest.json','manifest_sha256':reader.used[base+'/manifest.json'],'generator':generator,
                        'source_and_output_hashes_verified':True,'summary':m['summary'],'new_observations':0,'identity_or_current_status_approved':False})
    east_key=PACKAGE+'/east/source-register.json';east=json.loads(reader.read(east_key))
    if not isinstance(east,list) or len(east)!=13:raise ValueError('East response count changed')
    for r in east:verify_response(reader,r,PACKAGE+'/east/')
    ev=json.loads(reader.read(PACKAGE+'/east/verification.json'))
    if ev.get('new_observations')!=0:raise ValueError('East evidence cannot add observations')
    entries.append({'label':'粤东来源复查','register':east_key,'register_sha256':reader.used[east_key],'registered_responses_verified':13,
                    'review':PACKAGE+'/east/review.md','verification':PACKAGE+'/east/verification.json','manifest_available':False,'new_observations':0})
    key=PACKAGE+'/west-north/zhaoqing-catalog-register.json';catalog=json.loads(reader.read(key))
    response=json.loads(verify_response(reader,catalog,PACKAGE+'/west-north/',PACKAGE+'/west-north'))
    if response.get('total')!=52 or len(response.get('articles',[]))!=52 or response.get('classify',{}).get('id')!=20793:raise ValueError('Zhaoqing catalog scope/count changed')
    entries.append({'label':'肇庆栏目发现响应','register':key,'register_sha256':reader.used[key],'articles':52,'manifest_available':False,
                    'interpretation':'栏目文章标题不是机构观察。','new_observations':0})
    key=PACKAGE+'/west-north/xinxing-scan-visual-review.json';review=json.loads(reader.read(key))
    reader.declare(review['source_file'],review['source_sha256']);reader.read(review['source_file'])
    if len(review.get('rows',[]))!=5 or not review.get('promotion_decision','').startswith('remain_in_pending'):raise ValueError('Scan evidence must remain pending')
    entries.append({'label':'新兴扫描转录第二轮目视复核','register':key,'register_sha256':reader.used[key],'rows':5,'promotion_decision':review['promotion_decision'],
                    'manifest_available':False,'human_blinded_review':False,'new_observations':0})
    return entries

def build():
    reader=PinnedInputs(DATA,ROOT,PINNED_ROOTS)
    baseline=validate_manifest(reader,BASELINE+'/manifest.json','project:scripts/batch14_aggregate_cleaning.py')
    supplements=supplemental_evidence(reader)
    # Pin and consume every supporting register/report in the reviewed contract.
    for key in PINNED_ROOTS:reader.read(key)
    source_register=json.loads(reader.read(PACKAGE+'/pearl/source-register.json'))
    sources=source_register.get('sources')
    if not isinstance(sources,list) or len(sources)!=11:raise ValueError('Pearl source register count changed')
    registered={}
    for source in sources:
        verify_response(reader,source,PACKAGE+'/pearl/');verify_response(reader,source.get('robots'),PACKAGE+'/pearl/')
        registered[source['source_file']]=source
    raw_observations=reader.read(PACKAGE+'/pearl/observations.csv');supplied=parse_csv(raw_observations)
    observations=[normalize_observation(row,reader) for row in supplied]
    if len(observations)!=123 or Counter(r['classification'] for r in observations)!={'historical_roster':123}:raise ValueError('Reviewed historical observation count changed')
    counts=Counter(r['source_file'] for r in observations)
    if sorted(counts.values())!=[37,43,43]:raise ValueError('Reviewed historical source row counts changed')
    for row in observations:
        src=registered[row['source_file']]
        if src['url']!=row['source_url'] or src['observation_rows']!=counts[row['source_file']]:raise ValueError('Observation differs from source register')
    candidate_bytes=reader.read(BASELINE+'/cumulative-roster-candidates.csv');candidates=parse_csv(candidate_bytes)
    old_classified_bytes=reader.read(BASELINE+'/combined-classified-observations.csv');old=parse_csv(old_classified_bytes)
    scan_bytes=reader.read(BASELINE+'/combined-scan-review-observations.csv');scans=parse_csv(scan_bytes)
    if len(candidates)!=2429 or any(tuple(r)!=FIELDS for r in candidates) or len(old)!=569 or len(scans)!=19:raise ValueError('Reviewed baseline counts/schema changed')
    if any(tuple(r)!=CLASSIFIED_FIELDS for r in old):raise ValueError('Baseline classified schema changed')
    ids=[r['observation_id'] for r in old+observations+scans]
    if len(set(ids))!=len(ids):raise ValueError('Duplicate observation IDs across baseline/new/scans')
    combined=old_classified_bytes+csv_bytes(observations,CLASSIFIED_FIELDS).decode('utf-8-sig').split('\n',1)[1].encode('utf-8')
    if not old_classified_bytes.endswith(b'\n') or len(parse_csv(combined))!=692:raise ValueError('Classified CSV append failed')
    claims=[]
    for row in observations:
        for field in row['details']['raw_fields']:
            claims.append({'observation_id':row['observation_id'],'city':row['city'],'institution_name_as_published':row['institution_name'],
               'classification':row['classification'],'source_file':row['source_file'],'source_sha256':row['details']['source_sha256'],
               'source_url':row['source_url'],'source_published_at':row['source_published_at'],'source_as_of':'',
               'field_as_published':field['header_raw'],'header_text_raw':field['header_text_raw'],'header_locators':field['header_xpaths'],
               'value_as_published':field['value_raw'],'cell_locator':field['cell_xpath']})
    if len(claims)!=1629:raise ValueError('Reviewed field evidence count changed')
    matrix=[]
    for city in CITIES:
        batch=[r for r in observations if r['city']==city]
        matrix.append({'city':city,'cumulative_roster_candidate_observations':sum(r['city']==city for r in candidates),
          'prior_machine_classified_observations':sum(r['city']==city for r in old),'batch15_machine_observations':len(batch),
          **{kind:sum(r['classification']==kind for r in batch) for kind in CLASSES},
          'combined_machine_classified_observations':sum(r['city']==city for r in old)+len(batch),
          'scan_transcriptions_pending_human_review':sum(r['city']==city for r in scans),'citywide_complete_current_roster_proven':False})
    unassigned=[r for r in old if r['city'] not in CITIES]
    if len(unassigned)!=4 or any(r['city']!='' for r in unassigned):raise ValueError('Reviewed baseline unassigned-city rows changed')
    if sum(r['combined_machine_classified_observations'] for r in matrix)+len(unassigned)!=692:raise ValueError('City counts do not conserve observations')
    combined_classification_counts=dict(Counter(r['classification'] for r in old+observations))
    if combined_classification_counts!={'historical_roster':310,'special_subset':155,'current_roster_candidate':81,'republication_candidate':129,'status_event':17}:raise ValueError('Reviewed combined classifications changed')
    report={'archive_date_local':'2026-11-15','timezone':'Asia/Shanghai','batch15_machine_observations':123,'batch15_class_counts':{'historical_roster':123},
      'batch15_new_roster_candidate_observations':0,'cumulative_roster_candidate_observations':2429,'combined_machine_classified_observations':692,
      'combined_classification_counts':combined_classification_counts,
      'combined_scan_transcriptions_pending_human_review':19,'retained_new_field_evidence':1629,'city_count':21,'approved_institution_identities':0,
      'unassigned_city_classified_observations':len(unassigned),'city_assigned_classified_observations':688,
      'cities_proven_complete_current_roster':0,'current_operating_status_verified':False,'baseline_candidate_file_preserved_byte_for_byte':True,
      'baseline_scan_file_preserved_byte_for_byte':True,'supplemental_links_are_new_observations':False,
      'inherited_batch14_audit_context':{k:baseline['summary'][k] for k in ['legacy_missing_row_source_sha','company_unique_entities_retained','company_snapshots_without_original_per_request_ledger']},
      'supplemental_guangzhou_legacy_links':235,'supplemental_public_snapshot_field_evidence':2115,
      'limits':['123条是2017年及2024年5/6月历史来源观察，不是123家新机构，不追加累计名录候选。','2429是跨期资料的名录候选来源行，692是第13—15批可定位分类观察；两者存在重叠，不能相加为机构数。',
                '全部新source_as_of为空，来源发布日期、表题月份与核查日在营状态分别保留。','广州235条来源补证及2115字段文字复核、天河跨期17对文字对照均不批准实体身份、当前在营或11区完整性。',
                '19条扫描转录继续独立待复核；新兴5条第二轮目视对照不冒充独立盲审。','旧分类层4条city为空，逐字节保留并另列，未推断城市；21市已归属688条加未归属4条等于692条。','821条旧SHA缺口及583企业/126历史账本缺口仅继承batch14审计口径；本包没有重新查询工商或复制企业回包。',
                '未修改网站、公开目录、业务功能、生产配置或部署；广东21市同一时点全量当前在营目录仍有缺口。']}
    dates=[{'observation_id':r['observation_id'],'city':r['city'],'institution_name':r['institution_name'],'source_period_label':r['date_label_as_published'],'source_published_at':r['source_published_at'],'source_as_of':'','source_file':r['source_file']} for r in observations]
    source_rows=[{'source_file':key,'sha256':reader.used[key],'bytes':len(reader.read(key)),'historical_observations':count} for key,count in sorted(counts.items())]
    outputs={'observations.csv':raw_observations,'classified-observations.csv':csv_bytes(observations,CLASSIFIED_FIELDS),'classified-observations.jsonl':jsonl_bytes(observations),
      'combined-classified-observations.csv':combined,'cumulative-roster-candidates.csv':candidate_bytes,'combined-scan-review-observations.csv':scan_bytes,
      'retained-field-evidence.jsonl':jsonl_bytes(claims),'date-label-register.csv':csv_bytes(dates,tuple(dates[0])),
      'observation-source-files.csv':csv_bytes(source_rows,tuple(source_rows[0])),'city-cleaning-matrix.csv':csv_bytes(matrix,tuple(matrix[0])),
      'supplemental-evidence-index.json':packed(supplements),'unassigned-city-classified-observations.csv':csv_bytes(unassigned,CLASSIFIED_FIELDS),'report.json':packed(report)}
    lines=['# 第十五批养老来源清洗私有归档','','归档日期：2026-11-15（Asia/Shanghai）。仅用于本机离线审核。','',
      '本批123条全部为历史名录观察：2024年5月43条、6月43条、2017年37条。逐格原值及定位1629条。',
      '累计名录候选文件逐字节保持2429条；第13—15批分类观察692条；19条扫描转录独立待复核。','',
      '补证索引只连接固定版本及已哈希登记，不增加机构观察。广州旧候选235条补证与2115格文字复核不修改canonical旧CSV。',
      '广州天河19行与市表17行作跨期文字对照；17对名称/地址文字一致，来源运营列17个是、2个否，均不外推当前状态。','']
    lines+=['- '+v for v in report['limits']]
    lines+=['','## 21市来源观察计数','','| 城市 | 累计候选来源行 | 本批历史观察 | 第13—15批分类观察 | 扫描待复核 |','| --- | ---: | ---: | ---: | ---: |']
    lines += [f"| {m['city']} | {m['cumulative_roster_candidate_observations']} | {m['batch15_machine_observations']} | {m['combined_machine_classified_observations']} | {m['scan_transcriptions_pending_human_review']} |" for m in matrix]
    outputs['report.md']=('\n'.join(lines)+'\n').encode('utf-8')
    outputs['README.md']=('# 第十五批统一私有清洗包\n\n先读report.md；目录候选、分类来源观察、扫描转录与补证索引分开计数。\n'
      'cumulative-roster-candidates.csv与上批逐字节相同；combined-classified-observations.csv的旧569行原字节前缀保持，仅追加123条历史观察。\n'
      '本批逐字段证据见retained-field-evidence.jsonl；固定来源、输入、生成器和输出哈希见input-contract.json及manifest.json。\n'
      '项目根目录离线复算：python -X utf8 scripts/batch15_aggregate_cleaning.py --check。检查不联网、不写文件。\n').encode('utf-8')
    outputs['input-contract.json']=packed({'schema_version':1,'reviewed_root_inputs_sha256':PINNED_ROOTS,'effective_inputs_sha256':reader.used,
      'expansion_rule':'只展开已通过固定哈希的manifest输入/输出/生成器及登记中的显式原件路径；未列入输入拒绝读取。',
      'expected_new_classification_counts':{'historical_roster':123},'expected_candidate_rows':2429,'expected_combined_classified_rows':692,'expected_scan_rows':19})
    generator_sha=sha(Path(__file__).read_bytes());hashes={name:sha(raw) for name,raw in sorted(outputs.items())}
    version='v1-'+sha(packed({'generator':generator_sha,'inputs':reader.used,'outputs':hashes}))[:16]
    outputs['manifest.json']=packed({'version_id':version,'generator':'scripts/batch15_aggregate_cleaning.py','generator_sha256':generator_sha,
      'inputs_sha256':reader.used,'output_sha256':hashes,'baseline_manifest_sha256':BASELINE_MANIFEST_SHA,'summary':report})
    return outputs,report

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    outputs,report=build();version=json.loads(outputs['manifest.json'])['version_id'];destination=DATA/PACKAGE/'cleaned/versions'/version
    if args.check or destination.exists():
        if not destination.is_dir() or {p.name for p in destination.iterdir()}!=set(outputs):raise ValueError('Batch15 archive file set differs')
        for name,raw in outputs.items():
            if (destination/name).read_bytes()!=raw:raise ValueError('Batch15 archive bytes differ: '+name)
        action='verified'
    else:
        destination.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.staging-',dir=destination.parent) as temporary:
            stage=Path(temporary)/'version';stage.mkdir()
            for name,raw in outputs.items():(stage/name).write_bytes(raw)
            stage.rename(destination)
        action='created'
    print(json.dumps({'action':action,'path':destination.relative_to(ROOT).as_posix(),'summary':report},ensure_ascii=False))

if __name__=='__main__':main()
