import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { getCompanyPreview, getCompanyStatus, privatePreview } from '../lib/companies-public';
import { scanPublicOutput } from '../scripts/check-public-output';
import { QCC_SOURCE_FIELD_NAMES } from '../lib/qcc-types';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';
import { mcaPreviewFields } from '../lib/mca-preview-types';

function qccContactFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-qcc-contact-'));
  const qcc = path.join(dir, 'data', 'qcc');
  mkdirSync(qcc, { recursive: true });
  const record: Record<string, unknown> & { sourceFields: Record<string, string | number | null> } = {
    id: 'qcc-synthetic', rowNumber: 3, name: '示例登记主体', city: '广州', district: null,
    subjectType: '事业单位', registrationStatus: '正常', creditCode: null,
    codeValidity: 'missing', legalRepresentative: null, establishedAt: null,
    registeredCapital: null, organizationCode: null, registrationNo: null, taxId: null,
    businessTerm: null, insuredPersons: null, insuredYear: null, nationalIndustry: null,
    address: null, mailingAddress: null, businessScope: null, formerName: null,
    englishName: null, companySize: null,
    sourceFields: Object.fromEntries(QCC_SOURCE_FIELD_NAMES.map(key => [key, null])),
  };
  const write = () => writeFileSync(path.join(qcc, 'chunk-001.v1.json'), JSON.stringify({
    schemaVersion: 1, snapshotId: 'synthetic-qcc', records: [record],
  }));
  return { dir, record, write };
}

test('public QCC scan rejects numeric and normalized Unicode contacts in free text', async () => {
  const files = qccContactFixture();
  try {
    for (const value of [13800138000, '１３８００１３８０００', '（０２０）１２３４５６７８',
      '02012345678', 'ｏｆｆｉｃｅ＠ｅｘａｍｐｌｅ．ｃｏｍ']) {
      files.record.address = value;
      files.write();
      await assert.rejects(scanPublicOutput(files.dir), /联系信息|遮蔽/, String(value));
      files.record.address = null;
      files.record.sourceFields['注册地址'] = value;
      files.write();
      await assert.rejects(scanPublicOutput(files.dir), /联系信息|遮蔽/, String(value));
      files.record.sourceFields['注册地址'] = null;
    }
  } finally { rmSync(files.dir, { recursive: true, force: true }); }
});

test('public QCC scan requires masking all nonempty direct contact cells', async () => {
  const files = qccContactFixture();
  try {
    for (const key of ['有效手机号', '更多电话', '邮箱']) {
      for (const value of [13800138000, '１３８００１３８０００', 0, 'unknown']) {
        files.record.sourceFields[key] = value;
        files.write();
        await assert.rejects(scanPublicOutput(files.dir), /联系信息|遮蔽/, key);
      }
      files.record.sourceFields[key] = '[已遮蔽]';
    }
    files.write();
    assert.equal((await scanPublicOutput(files.dir)).filesScanned, 1);
  } finally { rmSync(files.dir, { recursive: true, force: true }); }
});

test('public QCC scan keeps source identifiers and quantities but rejects emails in them', async () => {
  const files = qccContactFixture();
  try {
    const keys = ['统一社会信用代码', '纳税人识别号', '注册号', '组织机构代码',
      '注册资本', '参保人数', '参保人数所属年报', '企业规模', '注册地址邮编', '通信地址邮编'];
    for (const key of keys) files.record.sourceFields[key] = '13800138000';
    Object.assign(files.record, {
      registeredCapital: 13800138000, insuredPersons: '13800138000',
      insuredYear: 13800138000, companySize: '13800138000',
    });
    files.write();
    assert.equal((await scanPublicOutput(files.dir)).filesScanned, 1);
    for (const key of keys) {
      files.record.sourceFields[key] = 'ｏｆｆｉｃｅ＠ｅｘａｍｐｌｅ．ｃｏｍ';
      files.write();
      await assert.rejects(scanPublicOutput(files.dir), /联系信息|遮蔽/, key);
      files.record.sourceFields[key] = '13800138000';
    }
    for (const key of ['creditCode', 'taxId', 'organizationCode', 'registrationNo']) {
      files.record[key] = 'office@example.com';
      files.write();
      await assert.rejects(scanPublicOutput(files.dir), /联系信息|遮蔽/, key);
      files.record[key] = null;
    }
  } finally { rmSync(files.dir, { recursive: true, force: true }); }
});

test('public company contract never discloses a local preview', () => {
  assert.equal(privatePreview, false);
  assert.equal(getCompanyPreview('gz-000001'), null);
  assert.equal(getCompanyStatus('gz-000001'), 'not-published');
});

test('public scan rejects private-only schema markers even without private inputs', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-isolation-'));
  try {
    mkdirSync(path.join(dir, '_next'), { recursive: true });
    writeFileSync(path.join(dir, '_next', 'leak.js'), '{"companyCreditCode":"测试字段"}');
    await assert.rejects(scanPublicOutput(dir, []), /私有/);
    writeFileSync(path.join(dir, '_next', 'leak.js'), 'relationshipVerified');
    await assert.rejects(scanPublicOutput(dir, []), /私有/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan permits reviewed policy prose without masking private leaks', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-policy-isolation-'));
  const prose = '非营利性养老服务机构可凭登记机关发给的社会服务机构登记证书申请划拨供地。';
  const data = path.join(dir, 'data', 'policy-content');
  const page = path.join(dir, 'zhengce', 'cbcaff37290a74c97a18247c8d2f81e4');
  const index = path.join(dir, 'zhengce');
  try {
    mkdirSync(data, { recursive: true });
    mkdirSync(page, { recursive: true });
    const json = path.join(data, 'zhengce.v1.json');
    const html = path.join(page, 'index.html');
    const txt = path.join(index, 'index.txt');
    const policy = (content: string) => JSON.stringify({ section: 'zhengce', label: '政策文件', items: [{
      id: 'cbcaff37290a74c97a18247c8d2f81e4', title: '国务院办公厅关于推进养老服务发展的意见',
      section: 'zhengce', content,
    }] });
    writeFileSync(json, policy('<p>' + prose + '</p>'));
    writeFileSync(html, '<article><p>' + prose + '</p></article>');
    writeFileSync(txt, prose);
    assert.equal((await scanPublicOutput(dir)).filesScanned, 3);

    writeFileSync(json, policy('<p>' + prose + ' 登记机关：某公司</p>'));
    await assert.rejects(scanPublicOutput(dir), /私有/);
    writeFileSync(json, policy('<p>' + prose + '</p>'));
    writeFileSync(html, '<article>' + prose + ' 登记机关：某公司</article>');
    await assert.rejects(scanPublicOutput(dir), /私有/);
    writeFileSync(html, '<article><p>' + prose + '</p></article>');

    for (const leaked of ['companyCreditCode', 'private-known-id', '13800000000']) {
      writeFileSync(json, policy('<p>' + prose + leaked + '</p>'));
      await assert.rejects(scanPublicOutput(dir, ['private-known-id'], ['13800000000']), /私有|手机号/, leaked);
    }
    writeFileSync(json, policy('<p>' + prose + '</p>'));
    writeFileSync(path.join(dir, 'other.html'), prose);
    await assert.rejects(scanPublicOutput(dir), /私有/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan blocks MCA raw snapshots and unreviewed detail pages', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-mca-isolation-'));
  try {
    mkdirSync(path.join(dir, '_next'), { recursive: true });
    writeFileSync(path.join(dir, '_next', 'leak.js'), 'private_mca_observed_institutions');
    await assert.rejects(scanPublicOutput(dir, []), /MCA私有/);
    rmSync(path.join(dir, '_next', 'leak.js'));
    const mca = path.join(dir, 'data', 'mca-institutions');
    mkdirSync(mca, { recursive: true });
    writeFileSync(path.join(mca, 'index.json'), '{}');
    await assert.rejects(scanPublicOutput(dir, []), /MCA数据/);
    rmSync(path.join(dir, 'data'), { recursive: true });
    const stage = path.join(dir, 'data', '.mca-observed-stage-orphan');
    mkdirSync(stage, { recursive: true });
    writeFileSync(path.join(stage, 'index.v1.json'), '{}');
    await assert.rejects(scanPublicOutput(dir, []), /MCA数据/);
    rmSync(path.join(dir, 'data'), { recursive: true });
    const detail = path.join(dir, 'quanguo', 'mca-preview', 'sample-id');
    mkdirSync(detail, { recursive: true });
    writeFileSync(path.join(detail, 'index.html'), '<p>sample</p>');
    await assert.rejects(scanPublicOutput(dir, []), /MCA数据或详情页/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan accepts only a complete partial MCA observation projection', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-mca-projection-'));
  const root = path.join(dir, 'data', 'mca-observed');
  const details = path.join(root, 'details');
  const mcaId = 'SYNTHETIC-MCA-1';
  const snapshotId = 'observed-synthetic';
  const detailPath = 'details/' + createHash('sha256').update(mcaId).digest('hex') + '.v1.json';
  const missing = () => ({ state: 'missing', value: null, observationCount: 0 });
  const manifest = {
    schemaVersion: 1, scope: 'partial_observed_mca_institutions', snapshotId,
    sourcePage: 'https://yanglao.mca.gov.cn/?#/index/institutionList',
    snapshotCapturedAtUtc: '2026-11-18T00:00:00Z', generatedAtUtc: '2026-11-21T00:00:00Z',
    recordCount: 1, listObservedCount: 1, withDetailCount: 1, detailOnlyCount: 0,
    nationalComplete: false, currentStatusVerified: false,
    sourceSnapshots: [{ lane: 'synthetic', sha256: 'a'.repeat(64), capturedAtUtc: '2026-11-18T00:00:00Z' }],
  };
  const index = { schemaVersion: 1, snapshotId, records: [{
    mcaId, detailPath, name: '测试养老机构', address: '测试路 1 号', areaCode: '110000',
    conflictFields: [], detailObservationCount: 1, evaluationCount: 0,
    facilityTypeCode: '3', facilityTypeLabel: '养老机构', functionPositioningLabel: null,
    hasDetail: true, listObservationCount: 1, listedBeds: 55, listedMonthlyFeeMax: 15000,
    listedMonthlyFeeMin: 8000, nursingBeds: 55, overallEvaluation: null,
    platformStarCode: '02', platformTagsRaw: null, regionLabel: '北京市', regionPath: '北京市',
    listedContactPhone: missing(), serviceCategoryLabel: missing(), subsidyCode: missing(),
    dayCareBeds: missing(), fullCareBeds: missing(),
    listObservedAtUtc: { earliest: '2026-11-18T00:00:00Z', latest: '2026-11-18T00:00:00Z' },
  }] };
  const detail = { schemaVersion: 1, snapshotId, mcaId,
    sourcePage: 'https://yanglao.mca.gov.cn/?#/index/orgServicesDetail?axbe0001=SYNTHETIC-MCA-1&parentRoute=institutionList&tagValue=3',
    detailObservedAtUtc: { earliest: '2026-11-18T00:00:00Z', latest: '2026-11-18T00:00:00Z' },
    facts: mcaPreviewFields.map(key => ({ key, label: key, text: '未提供', state: 'missing', source: null, warning: null })),
    conflictLabels: [],
    platformDetail: {
      identity: { facilityType: missing(), starCode: missing(), functionPositioning: missing(), region: missing(), address: missing() },
      tags: missing(), subsidyCode: missing(), contactName: missing(), contactPhone: missing(), pointRaw: missing(),
      photoCount: missing(), areaSqm: missing(), introduction: missing(),
      service: { content: missing(), team: missing(), hours: missing(), scope: missing(), explanation: missing() },
      beds: { total: missing(), dayCare: missing(), fullCare: missing(), nursing: missing() },
      feeSummary: ['04', '02', '01', '03'].map(code => ({ code, label: code, range: missing(), description: missing() })),
      charges: missing(),
      subServices: {
        respite: { beds: missing(), nursingBeds: missing(), fee: missing(), unit: '元/天', project: missing(), charges: missing() },
        dayCare: { beds: missing(), nursingBeds: missing(), fee: missing(), unit: '元/天', project: missing(), charges: missing() },
        homeVisit: { beds: missing(), nursingBeds: missing(), fee: missing(), unit: '元/次', project: missing(), charges: missing() },
        assessment: { home: missing(), site: missing() },
      },
      evaluation: { state: 'missing', text: '未提供', count: missing(), score: missing() },
    },
  };
  try {
    mkdirSync(details, { recursive: true });
    const write = () => {
      writeFileSync(path.join(root, 'manifest.v1.json'), JSON.stringify(manifest));
      writeFileSync(path.join(root, 'index.v1.json'), JSON.stringify(index));
      writeFileSync(path.join(root, detailPath), JSON.stringify(detail));
    };
    write();
    assert.equal((await scanPublicOutput(dir)).filesScanned, 3);
    index.records[0].listObservedAtUtc = null as unknown as typeof index.records[0]['listObservedAtUtc'];
    write();
    await assert.rejects(scanPublicOutput(dir), /MCA.*采集时间/);
    index.records[0].listObservedAtUtc = { earliest: '2026-11-18T00:00:00Z', latest: '2026-11-18T00:00:00Z' };
    detail.detailObservedAtUtc = null as unknown as typeof detail.detailObservedAtUtc;
    write();
    await assert.rejects(scanPublicOutput(dir), /MCA.*采集时间/);
    detail.detailObservedAtUtc = { earliest: '2026-11-18T00:00:00Z', latest: '2026-11-18T00:00:00Z' };
    (detail.platformDetail as Record<string, unknown>).rawResponse = { token: 'secret' };
    write();
    await assert.rejects(scanPublicOutput(dir), /MCA.*字段|MCA.*原件|MCA.*结构/);
    delete (detail.platformDetail as Record<string, unknown>).rawResponse;
    index.records[0].detailPath = 'details/' + '0'.repeat(64) + '.v1.json';
    write();
    await assert.rejects(scanPublicOutput(dir), /MCA.*路径|MCA.*详情/);
    index.records[0].detailPath = detailPath;
    detail.sourcePage = 'https://yanglao.mca.gov.cn/?#/index/orgServicesDetail?axbe0001=WRONG&parentRoute=institutionList&tagValue=3';
    write();
    await assert.rejects(scanPublicOutput(dir), /MCA.*身份|MCA.*来源/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan accepts an approved QCC detail projection and rejects contacts', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-qcc-isolation-'));
  try {
    const qcc = path.join(dir, 'data', 'qcc');
    mkdirSync(qcc, { recursive: true });
    const record = {
      id: 'qcc-synthetic', rowNumber: 3, name: '示例登记主体', city: '广州', district: null,
      subjectType: '事业单位', registrationStatus: '正常', creditCode: '12440000SYNTHETIC01',
      codeValidity: 'invalid', legalRepresentative: '示例', establishedAt: null,
      registeredCapital: null, organizationCode: null, registrationNo: null, taxId: null,
      businessTerm: null, insuredPersons: null, insuredYear: null, nationalIndustry: null,
      address: null, mailingAddress: null, businessScope: null, formerName: null,
      englishName: null, companySize: null,
      sourceFields: Object.fromEntries(QCC_SOURCE_FIELD_NAMES.map(key => [key, null])) as Record<string, string | number | null>,
    };
    const file = path.join(qcc, 'chunk-001.v1.json');
    const snapshot = { schemaVersion: 1, snapshotId: 'synthetic-qcc', records: [record] };
    Object.assign(record.sourceFields, { '有效手机号': '[已遮蔽]', '更多电话': '[已遮蔽]', '邮箱': '[已遮蔽]', '注册地址邮编': 0, '英文名': '', '曾用名': '-' });
    writeFileSync(file, JSON.stringify(snapshot));
    assert.equal((await scanPublicOutput(dir, [], ['13800000000'])).filesScanned, 1);
    for (const [key, raw] of [
      ['有效手机号', '13800000000'],
      ['更多电话', '020-12345678'],
      ['邮箱', 'office@example.com'],
      ['邮箱', 'not-an-email'],
      ['企业简介', '咨询 13800000000'],
      ['经营范围', '联系 office@example.com'],
      ['企业简介', '咨询 020-12345678'],
      ['注册地址', '广东省广州市，电话 02012345678'],
    ]) {
      writeFileSync(file, JSON.stringify({ ...snapshot, records: [{ ...record, sourceFields: { ...record.sourceFields, [key]: raw } }] }));
      await assert.rejects(scanPublicOutput(dir, []), /联系信息|遮蔽/);
    }
    writeFileSync(file, JSON.stringify({ ...snapshot, records: [{ ...record, sourceFields: { ...record.sourceFields, '有效手机号': '-', '更多电话': null, '邮箱': '' } }] }));
    assert.equal((await scanPublicOutput(dir, [])).filesScanned, 1);
    writeFileSync(file, JSON.stringify(snapshot));
    for (const sourceFields of [
      { ...record.sourceFields, '额外字段': '不允许' },
      Object.fromEntries(Object.entries(record.sourceFields).filter(([key]) => key !== '邮箱')),
      { ...record.sourceFields, '邮箱': { nested: '不允许' } },
      { ...record.sourceFields, '邮箱': true },
    ]) {
      writeFileSync(file, JSON.stringify({ ...snapshot, records: [{ ...record, sourceFields }] }));
      await assert.rejects(scanPublicOutput(dir, []), /原始|白名单|字段|QCC/);
    }
    writeFileSync(file, JSON.stringify(snapshot).replace('"注册地址邮编":0', '"注册地址邮编":1e400'));
    await assert.rejects(scanPublicOutput(dir, []), /原始|字段|QCC/);
    writeFileSync(file, JSON.stringify(snapshot));
    writeFileSync(path.join(dir, 'leak.html'), '<p>13800000000</p>');
    await assert.rejects(scanPublicOutput(dir, [], ['13800000000']), /手机号/);
    rmSync(path.join(dir, 'leak.html'));
    writeFileSync(file, JSON.stringify({ ...snapshot, records: [{ ...record, email: 'private@example.com' }] }));
    await assert.rejects(scanPublicOutput(dir, []), /联系|邮箱|禁止|白名单|字段/);
    writeFileSync(file, JSON.stringify({ ...snapshot, records: [{ ...record, businessScope: '联系 13800000000' }] }));
    await assert.rejects(scanPublicOutput(dir, []), /联系|手机号|电话|禁止/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan rejects raw contacts in a national QCC detail chunk', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-qcc-national-isolation-'));
  try {
    const city = path.join(dir, 'data', 'qcc-national', 'p-123456abcdef', 'c-123456abcdef');
    mkdirSync(city, { recursive: true });
    const sourceFields = Object.fromEntries(QCC_SOURCE_FIELD_NAMES.map(key => [key, null]));
    const record = {
      id: 'qcc-n-synthetic', rowNumber: 3, sourceId: 'qcc-source-synthetic',
      name: '示例登记主体', province: '广东省', city: '广州', district: null,
      subjectType: '事业单位', registrationStatus: '正常', creditCode: null,
      codeValidity: null, legalRepresentative: null, establishedAt: null,
      registeredCapital: null, organizationCode: null, registrationNo: null, taxId: null,
      businessTerm: null, insuredPersons: null, insuredYear: null, nationalIndustry: null,
      address: null, mailingAddress: null, businessScope: null, formerName: null,
      englishName: null, companySize: null,
      sourceFields: { ...sourceFields, '更多电话': '020-12345678' },
    };
    writeFileSync(path.join(city, 'chunk-001.v1.json'), JSON.stringify({
      schemaVersion: 1, snapshotId: 'synthetic-national', provinceSlug: 'p-123456abcdef',
      citySlug: 'c-123456abcdef', records: [record],
    }));
    await assert.rejects(scanPublicOutput(dir, []), /联系信息|遮蔽/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan rejects contacts hidden in institution reference source fields', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-reference-isolation-'));
  try {
    const city = path.join(dir, 'data', 'qcc-institutions', 'p-123456abcdef', 'c-123456abcdef');
    mkdirSync(city, { recursive: true });
    const sourceFields = Object.fromEntries(REFERENCE_SOURCE_FIELD_NAMES.map(key => [key, null]));
    const file = path.join(city, 'chunk-001.v1.json');
    for (const [key, raw] of [
      ['地址', '广东省广州市，联系 13800000000'],
      ['地址', '广东省广州市，电话 020-12345678'],
      ['机构名称', '咨询 office@example.com'],
    ]) {
      writeFileSync(file, JSON.stringify({
        schemaVersion: 1, snapshotId: 'synthetic-reference',
        provinceSlug: 'p-123456abcdef', citySlug: 'c-123456abcdef',
        records: [{ sourceFields: { ...sourceFields, [key]: raw } }],
      }));
      await assert.rejects(scanPublicOutput(dir, []), /联系信息|遮蔽/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan refuses an unapproved file inside the QCC projection directory', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-qcc-isolation-'));
  try {
    const qcc = path.join(dir, 'data', 'qcc');
    mkdirSync(qcc, { recursive: true });
    writeFileSync(path.join(qcc, 'source.xlsx'), 'raw source');
    await assert.rejects(scanPublicOutput(dir, []), /QCC|投影|禁止|白名单|CSV|XLSX/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan refuses an unchecked registry-link projection', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-registry-link-isolation-'));
  try {
    const links = path.join(dir, 'data', 'qcc-institution-registry-links');
    mkdirSync(links, { recursive: true });
    writeFileSync(path.join(links, 'manifest.v1.json'), JSON.stringify({ schemaVersion: 1 }));
    await assert.rejects(scanPublicOutput(dir, []), /登记主体|关联|manifest|白名单/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan catches known private identifiers and permits official fields', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-isolation-'));
  try {
    writeFileSync(path.join(dir, 'index.html'), '<p>institution address 备案床位</p>');
    assert.equal((await scanPublicOutput(dir, [])).filesScanned, 1);
    writeFileSync(path.join(dir, 'index.html'), '<p>SYNTHETIC-PRIVATE-CODE</p>');
    await assert.rejects(scanPublicOutput(dir, ['SYNTHETIC-PRIVATE-CODE']), /私有/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan rejects source mobile numbers withheld from the public catalog', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eldercare-isolation-'));
  try {
    writeFileSync(path.join(dir, 'index.html'), '<a href="tel:13800000000">联系</a>');
    await assert.rejects(scanPublicOutput(dir, [], ['13800000000']), /手机号/);
    writeFileSync(path.join(dir, 'index.html'), '<p>138-0000-0000</p>');
    await assert.rejects(scanPublicOutput(dir, [], ['13800000000']), /手机号/);
    writeFileSync(path.join(dir, 'index.html'), '<p>电话号码暂不公开</p>');
    assert.equal((await scanPublicOutput(dir, [], ['13800000000'])).filesScanned, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing output is a build failure rather than a successful zero-file scan', async () => {
  await assert.rejects(scanPublicOutput(path.join(tmpdir(), 'eldercare-does-not-exist-output'), []), /不存在|ENOENT/);
});

test('private company module refuses production imports without exposing company data', async () => {
  const { execFileSync } = await import('node:child_process');
  assert.throws(() => execFileSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', '--eval', 'import("./lib/companies-local.ts")'], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', ELDERCARE_PRIVATE_PREVIEW: '1' }, stdio: 'pipe',
  }), /仅允许|production|development/);
});
