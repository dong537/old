import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanPublicOutput } from '../scripts/check-public-output';
import { QCC_SOURCE_FIELD_NAMES } from '../lib/qcc-types';

const provinceSlug = 'p-aaaaaaaaaaaa';
const citySlug = 'c-bbbbbbbbbbbb';
const prefix = path.join('data', 'qcc-national');
const relativeIndex = path.join(provinceSlug, citySlug, 'index.v1.json').replaceAll('\\', '/');

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'eldercare-national-output-'));
  const folder = path.join(root, prefix, provinceSlug, citySlug);
  mkdirSync(folder, { recursive: true });
  const source = { id: 'source-1', filename: 'source.xlsx', sha256: 'a'.repeat(64), rowCount: 1 };
  const manifest = {
    schemaVersion: 1, snapshotId: 'snapshot-1', exportedAt: '2026-11-16', rowCount: 1,
    sourceFiles: [source], provinces: [{ slug: provinceSlug, name: '浙江省', count: 1,
      cities: [{ slug: citySlug, name: '杭州市', count: 1, indexPath: relativeIndex }] }],
  };
  const indexRecord = {
    id: 'cn-qcc-1', rowNumber: 3, sourceId: source.id, name: '示例养老服务企业',
    province: '浙江省', city: '杭州市', district: '西湖区', subjectType: '有限责任公司',
    registrationStatus: '存续', chunk: 'chunk-001.v1.json',
  };
  const detailRecord = {
    ...indexRecord, creditCode: '91330100MA0000000X', codeValidity: 'invalid_checksum',
    legalRepresentative: '张某', establishedAt: null, registeredCapital: null,
    organizationCode: null, registrationNo: null, taxId: null, businessTerm: null,
    insuredPersons: null, insuredYear: null, nationalIndustry: null, address: null,
    mailingAddress: null, businessScope: null, formerName: null, englishName: null,
    companySize: null,
    sourceFields: Object.fromEntries(QCC_SOURCE_FIELD_NAMES.map(key => [key, null])) as Record<string, string | number | null>,
  };
  delete (detailRecord as Partial<typeof detailRecord>).chunk;
  const index = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug, citySlug, records: [indexRecord] };
  const chunk = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug, citySlug, records: [detailRecord] };
  const write = () => {
    writeFileSync(path.join(root, prefix, 'manifest.v1.json'), JSON.stringify(manifest));
    writeFileSync(path.join(folder, 'index.v1.json'), JSON.stringify(index));
    writeFileSync(path.join(folder, 'chunk-001.v1.json'), JSON.stringify(chunk));
  };
  write();
  return { root, folder, manifest, index, chunk, write };
}

test('national projection accepts only linked manifest, city index and detail chunk', async () => {
  const files = fixture();
  try { assert.equal((await scanPublicOutput(files.root)).filesScanned, 3); }
  finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national source hash identifier is not mistaken for a phone number', async () => {
  const files = fixture();
  try {
    const sourceId = 'qcc-source-13800138000abcde';
    files.manifest.sourceFiles[0].id = sourceId;
    files.index.records[0].sourceId = sourceId;
    files.chunk.records[0].sourceId = sourceId;
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection rejects fullwidth and landline contacts in normalized text', async () => {
  const files = fixture();
  try {
    for (const value of ['１３８００１３８０００', '（０２０）１２３４５６７８', '02012345678', 'ｏｆｆｉｃｅ＠ｅｘａｍｐｌｅ．ｃｏｍ']) {
      Object.assign(files.chunk.records[0], { mailingAddress: value });
      files.write();
      await assert.rejects(scanPublicOutput(files.root), /联系信息|遮蔽/, value);
    }
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national raw fields preserve phone-like identifiers and quantitative values', async () => {
  const files = fixture();
  try {
    Object.assign(files.chunk.records[0], {
      registeredCapital: 13800138000, insuredPersons: '13800138000',
      insuredYear: 13800138000, companySize: '13800138000',
    });
    for (const key of ['统一社会信用代码', '纳税人识别号', '注册号', '组织机构代码',
      '注册资本', '参保人数', '参保人数所属年报', '企业规模', '注册地址邮编', '通信地址邮编']) {
      files.chunk.records[0].sourceFields[key] = 13800138000;
    }
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
    files.chunk.records[0].sourceFields['统一社会信用代码'] = '91A13800138000B122';
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
    files.chunk.records[0].sourceFields['统一社会信用代码'] = 'ｏｆｆｉｃｅ＠ｅｘａｍｐｌｅ．ｃｏｍ';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|遮蔽/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national raw projection preserves scalar source fields but masks contact cells', async () => {
  const files = fixture();
  try {
    Object.assign(files.chunk.records[0].sourceFields, {
      '有效手机号': '[已遮蔽]', '更多电话': '[已遮蔽]', '邮箱': '[已遮蔽]',
      '英文名': '', '曾用名': '-', '注册地址邮编': 0,
    });
    files.write();
    assert.equal((await scanPublicOutput(files.root, [], ['13800000000'])).filesScanned, 3);
    for (const [key, raw] of [
      ['有效手机号', '13800000000'],
      ['更多电话', '020-12345678'],
      ['邮箱', 'office@example.com'],
      ['邮箱', 'not-an-email'],
      ['企业简介', '联系 010-12345678'],
      ['注册地址', '联系 13800000000'],
      ['通信地址', '联系 office@example.com'],
    ]) {
      const sourceFields = { ...files.chunk.records[0].sourceFields, [key]: raw };
      writeFileSync(path.join(files.folder, 'chunk-001.v1.json'), JSON.stringify({
        ...files.chunk, records: [{ ...files.chunk.records[0], sourceFields }],
      }));
      await assert.rejects(scanPublicOutput(files.root), /联系信息|遮蔽/);
    }
    Object.assign(files.chunk.records[0].sourceFields, { '有效手机号': '-', '更多电话': null, '邮箱': '' });
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
    Object.assign(files.chunk.records[0].sourceFields, { '有效手机号': '[已遮蔽]', '更多电话': '[已遮蔽]', '邮箱': '[已遮蔽]' });
    files.write();
    for (const sourceFields of [
      { ...files.chunk.records[0].sourceFields, 'extra': 'unexpected' },
      Object.fromEntries(Object.entries(files.chunk.records[0].sourceFields).filter(([key]) => key !== '邮箱')),
      { ...files.chunk.records[0].sourceFields, '邮箱': ['nested'] },
      { ...files.chunk.records[0].sourceFields, '邮箱': false },
    ]) {
      writeFileSync(path.join(files.folder, 'chunk-001.v1.json'), JSON.stringify({ ...files.chunk, records: [{ ...files.chunk.records[0], sourceFields }] }));
      await assert.rejects(scanPublicOutput(files.root), /原始|白名单|字段|QCC/);
    }
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection rejects unapproved fields and contact data', async () => {
  const files = fixture();
  try {
    Object.assign(files.chunk.records[0], { email: 'private@example.com' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /白名单|联系信息|QCC/);
    delete (files.chunk.records[0] as typeof files.chunk.records[0] & { email?: string }).email;
    Object.assign(files.chunk.records[0], { businessScope: '联系 13800000000' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|手机号|QCC/);
    Object.assign(files.chunk.records[0], { businessScope: '联系 +86 138-0000-0000' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|手机号|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection rejects raw files and mismatched snapshot IDs', async () => {
  const files = fixture();
  try {
    writeFileSync(path.join(files.folder, 'source.xlsx'), 'private workbook');
    await assert.rejects(scanPublicOutput(files.root), /未经批准|投影|QCC/);
    rmSync(path.join(files.folder, 'source.xlsx'));
    writeFileSync(path.join(files.root, 'data', 'raw-export.csv'), 'private export');
    await assert.rejects(scanPublicOutput(files.root), /原件|未经批准|CSV|XLSX/);
    rmSync(path.join(files.root, 'data', 'raw-export.csv'));
    files.chunk.snapshotId = 'other-snapshot';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /快照|不一致|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection refuses missing referenced detail chunks', async () => {
  const files = fixture();
  try {
    rmSync(path.join(files.folder, 'chunk-001.v1.json'));
    await assert.rejects(scanPublicOutput(files.root), /缺失|分块|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection verifies city and source row across list and detail', async () => {
  const files = fixture();
  try {
    files.index.records[0].city = '南京市';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /城市|不一致|QCC/);
    files.index.records[0].city = '杭州市';
    files.chunk.records[0].rowNumber = 4;
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /行号|不一致|QCC/);
    files.chunk.records[0].rowNumber = 3;
    files.chunk.records[0].name = '另一家公司';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /名称|不一致|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection refuses duplicate detail IDs hiding a missing record', async () => {
  const files = fixture();
  try {
    files.manifest.rowCount = 2;
    files.manifest.sourceFiles[0].rowCount = 2;
    files.manifest.provinces[0].count = 2;
    files.manifest.provinces[0].cities[0].count = 2;
    files.index.records.push({ ...files.index.records[0], id: 'cn-qcc-2', rowNumber: 4 });
    files.chunk.records.push({ ...files.chunk.records[0], id: 'cn-qcc-1', rowNumber: 4 });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /重复|不一致|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection rejects contact-like numeric fields and misplaced registration data', async () => {
  const files = fixture();
  try {
    Object.assign(files.chunk.records[0], { address: 13800000000 });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|字段类型|QCC/);
    Object.assign(files.chunk.records[0], { address: null, taxId: '13800000000' });
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
    Object.assign(files.chunk.records[0], { taxId: 'office@example.com' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|字段类型|QCC/);
    Object.assign(files.chunk.records[0], { taxId: null });
    files.write();
    writeFileSync(path.join(files.root, 'data', 'registration-leak.json'), JSON.stringify({ creditCode: '9133', businessScope: '秘密' }));
    await assert.rejects(scanPublicOutput(files.root), /私有|未经批准|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('national projection rejects contact data placed in a credit code field', async () => {
  const files = fixture();
  try {
    files.chunk.records[0].creditCode = '13800000000';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|手机号|QCC/);
    files.chunk.records[0].creditCode = 'help@example.com';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|邮箱|QCC/);
    Object.assign(files.chunk.records[0], { creditCode: 13800000000 });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|字段类型|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('release scan requires the national manifest even if other output exists', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eldercare-required-national-'));
  try {
    writeFileSync(path.join(root, 'index.html'), '<h1>existing site</h1>');
    await assert.rejects(scanPublicOutput(root, [], [], true), /缺失|manifest|QCC/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('national projection covers each original source row exactly once', async () => {
  const files = fixture();
  try {
    files.manifest.rowCount = 2;
    files.manifest.sourceFiles[0].rowCount = 2;
    files.manifest.provinces[0].count = 2;
    files.manifest.provinces[0].cities[0].count = 2;
    files.index.records.push({ ...files.index.records[0], id: 'cn-qcc-2' });
    files.chunk.records.push({ ...files.chunk.records[0], id: 'cn-qcc-2' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /来源行|重复|QCC/);
    files.index.records[1].rowNumber = 999;
    files.chunk.records[1].rowNumber = 999;
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /来源行|范围|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('release scan rejects a snapshot that differs from the pinned source manifest', async () => {
  const files = fixture();
  try {
    const locked = {
      schemaVersion: 1 as const, exportedAt: '2026-11-16', rowCount: 2,
      sourceFiles: [{ ...files.manifest.sourceFiles[0], rowCount: 2 }],
    };
    await assert.rejects(scanPublicOutput(files.root, [], [], true, locked), /锁定|来源|不一致|QCC/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});
