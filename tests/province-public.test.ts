import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import type { ProvinceCatalog } from '../lib/province-types';
import { APPROVED_PROVINCE_SOURCES, buildProvinceCatalog, projectProvinceRows } from '../lib/province-catalog';

const SOURCE_PATH = 'data/private/guangdong-eldercare-source/research-batch15/cleaned/versions/v1-aa3bf6d7cd70aaae/cumulative-roster-candidates.csv';
const PUBLIC_PATH = 'public/data/guangdong-source-records.v1.json';
const SOURCE_SHA256 = '487c4d1ae1760c8561edb2fbb033541f27b3796e4a949b3ad8461b49b6f9d5b6';
const HEADER = 'city,institution_name,source_url,source_published_at,source_as_of,source_file,evidence_type,details';

function csvRow(values: string[]): string {
  return values.map((value) => '"' + value.replaceAll('"', '""') + '"').join(',');
}

function sampleCsv(rows: string[][]): string {
  return [HEADER, ...rows.map(csvRow), ''].join('\n');
}

const EXPECTED_CITY_COUNTS = {
  潮州: 14, 东莞: 43, 佛山: 69, 广州: 30, 河源: 39, 惠州: 35, 江门: 89,
  揭阳: 4, 茂名: 26, 梅州: 5, 清远: 15, 汕头: 42, 汕尾: 11, 韶关: 29,
  深圳: 95, 阳江: 28, 云浮: 27, 湛江: 51, 肇庆: 75, 中山: 29, 珠海: 25,
};

test('frozen source selects only 21 approved official source triples', () => {
  const catalog = JSON.parse(readFileSync(PUBLIC_PATH, 'utf8')) as ProvinceCatalog;
  if (existsSync(SOURCE_PATH)) {
    const source = readFileSync(SOURCE_PATH);
    assert.equal(createHash('sha256').update(source).digest('hex'), SOURCE_SHA256);
    assert.deepEqual(buildProvinceCatalog(source.toString('utf8')), catalog);
  }
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.snapshotId, 'v1-aa3bf6d7cd70aaae');
  assert.equal(catalog.archivedAt, '2026-11-15');
  assert.equal(catalog.records.length, 781);
  assert.equal(new Set(catalog.records.map((record) => record.city)).size, 21);
  assert.equal(new Set(catalog.records.map((record) => record.id)).size, 781);
  assert.equal(catalog.records[0].id, 'gd-src-000001');
  assert.equal(catalog.records[780].id, 'gd-src-000781');
  assert.deepEqual(Object.fromEntries(Object.keys(EXPECTED_CITY_COUNTS).sort().map((city) => [
    city, catalog.records.filter((record) => record.city === city).length,
  ])), Object.fromEntries(Object.entries(EXPECTED_CITY_COUNTS).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))));
  assert.equal(APPROVED_PROVINCE_SOURCES.length, 21);
  for (const record of catalog.records) {
    assert.ok(APPROVED_PROVINCE_SOURCES.some((source) =>
      source.city === record.city && source.sourceUrl === record.sourceUrl && source.evidenceType === record.evidenceType,
    ));
  }
  assert.equal(catalog.records.filter((record) => record.city === '佛山' && record.evidenceType === '官方名单明确企业').length, 0);
  assert.equal(catalog.records.filter((record) => record.city === '佛山' && record.evidenceType === '佛山市民政局养老机构名录附件').length, 69);
  assert.deepEqual(Object.keys(catalog.records[0]), [
    'id', 'city', 'name', 'evidenceType', 'sourceUrl', 'sourcePublishedAt', 'sourceAsOf', 'sourceStatusNote',
  ]);
  assert.equal(catalog.records.filter((record) => record.sourceStatusNote !== null).length, 1);
  assert.equal(catalog.records.find((record) => record.name === '佛山市高明区社会福利院')?.sourceStatusNote, '来源当时标注：暂停营业');
  assert.ok(catalog.records.every((record) => record.sourcePublishedAt !== null));
  assert.ok(catalog.records.some((record) => record.sourceAsOf === null));
  const names = new Map<string, number>();
  for (const record of catalog.records) {
    const key = record.city + ':' + record.name;
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  assert.ok([...names.values()].some((count) => count > 1));
  assert.doesNotMatch(JSON.stringify(catalog), /source_file|details|电话号码|联系电话|统一社会信用代码|法定代表人|注册地址/);
});

test('projection keeps missing dates null and never copies private source fields', () => {
  const csv = sampleCsv([
    ['广州', '测试养老院', 'https://example.gov.cn/roster', '', '', 'private/source.csv', '官方名录', JSON.stringify({ phone: '13800000000', status_as_published: '暂停营业' })],
    ['广州', '测试养老院', 'https://example.gov.cn/roster', '2025-01-02', '2024年', 'private/source.csv', '官方名录', JSON.stringify({ legalRepresentative: '私有姓名' })],
    ['广州', '另一条', 'https://example.gov.cn/roster', '2025-01-02', '未注明；页面仅标注发布日期', 'private/source.csv', '官方名录', '{}'],
    ['广州', '企业主体', 'https://example.gov.cn/roster', '2025-01-02', '', 'private/source.csv', '官方名单明确企业', '{}'],
  ]);
  const records = projectProvinceRows(csv, [{ city: '广州', sourceUrl: 'https://example.gov.cn/roster', evidenceType: '官方名录', expectedCount: 3 }]);
  assert.equal(records.length, 3);
  assert.equal(records[0].sourcePublishedAt, null);
  assert.equal(records[0].sourceAsOf, null);
  assert.equal(records[0].sourceStatusNote, '来源当时标注：暂停营业');
  assert.equal(records[1].sourceAsOf, '2024年');
  assert.equal(records[1].sourceStatusNote, null);
  assert.equal(records[2].sourceAsOf, null);
  assert.notEqual(records[0].id, records[1].id);
  assert.doesNotMatch(JSON.stringify(records), /13800000000|私有姓名|private\/source\.csv|legalRepresentative|phone/);
});

test('projection rejects malformed source rows and unsafe links', () => {
  const row = ['广州', '测试养老院', 'https://example.gov.cn/roster', '', '', 'private/source.csv', '官方名录', '{}'];
  const approved = [{ city: '广州', sourceUrl: row[2], evidenceType: '官方名录', expectedCount: 1 }];
  assert.throws(() => projectProvinceRows(sampleCsv([[...row.slice(0, 2), 'javascript:alert(1)', ...row.slice(3)]]), [{ ...approved[0], sourceUrl: 'javascript:alert(1)' }]), /URL|链接/);
  assert.throws(() => projectProvinceRows(sampleCsv([[...row.slice(0, 2), 'https://name:pass@example.gov.cn/roster', ...row.slice(3)]]), [{ ...approved[0], sourceUrl: 'https://name:pass@example.gov.cn/roster' }]), /URL|链接/);
  assert.throws(() => projectProvinceRows(sampleCsv([['', ...row.slice(1)]]), approved), /城市|city|行数/);
  assert.throws(() => projectProvinceRows(sampleCsv([[row[0], '', ...row.slice(2)]]), approved), /名称|name/);
  assert.throws(() => projectProvinceRows(sampleCsv([row]).replace('source_url', 'secret_url'), approved), /字段|表头/);
  assert.throws(() => projectProvinceRows(sampleCsv([row]), [{ ...approved[0], evidenceType: '官方名单明确企业' }]), /行数|来源类型/);
  assert.throws(() => buildProvinceCatalog(sampleCsv([row])), /781|来源记录|行数/);
});
