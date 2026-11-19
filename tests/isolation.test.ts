import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getCompanyPreview, getCompanyStatus, privatePreview } from '../lib/companies-public';
import { scanPublicOutput } from '../scripts/check-public-output';
import { QCC_SOURCE_FIELD_NAMES } from '../lib/qcc-types';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';

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
