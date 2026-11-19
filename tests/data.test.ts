import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'csv-parse/sync';
import { parseOfficialCsv, parsePrivateCsv } from '../lib/import';
import type { IdMapEntry } from '../lib/types';

const officialCsv = readFileSync('data/raw/family_fields_official.csv', 'utf8');
const idMap = JSON.parse(readFileSync('data/raw/id-map.json', 'utf8')) as IdMapEntry[];
const official = () => parseOfficialCsv(officialCsv, idMap);

test('committed official CSV contains no mobile-format source numbers', () => {
  const rows = parse(officialCsv, { bom: true, skip_empty_lines: true }) as string[][];
  assert.ok(rows.slice(1).every((row) => !/^1\d{10}$/.test(row[4].replace(/[\s-]/g, ''))));
});

test('actual official CSV imports 235 source-ordered institutions with permanent IDs', () => {
  const rows = official();
  assert.equal(rows.length, 235);
  assert.equal(new Set(rows.map((row) => row.id)).size, 235);
  assert.equal(new Set(rows.map((row) => row.district)).size, 11);
  assert.deepEqual(rows.map((row) => row.sourceRow), Array.from({ length: 235 }, (_, index) => index + 1));
  assert.equal(rows[0].id, 'gz-000001');
  assert.equal(rows[234].id, 'gz-000235');
  assert.equal(rows.filter((row) => row.advanceFee).length, 17);
  assert.equal(rows.filter((row) => row.deposit).length, 144);
  assert.equal(rows.filter((row) => row.membershipFee).length, 5);
});

test('official anomalies preserve source text and suppress the placeholder telephone link', () => {
  const rows = official();
  assert.equal(rows[19].district, '越秀区');
  assert.equal(rows[19].address, '广州市黄埔区黄麻路885号');
  assert.ok(rows[19].qualityNotes.some((note) => note.includes('黄埔区')));
  assert.equal(rows[88].district, '荔湾区');
  assert.equal(rows[88].address, '白云区西槎路上步三街9号');
  assert.ok(rows[88].qualityNotes.some((note) => note.includes('白云区')));
  assert.equal(rows[126].phone, '020-00000000');
  assert.equal(rows[126].phoneHref, null);
  assert.ok(rows[126].qualityNotes.some((note) => note.includes('占位')));
  assert.equal(rows[0].phoneHref, 'tel:02083586999');
});

test('public official import withholds a mobile-format source number without mistaking it for missing data', () => {
  const synthetic = officialCsv.replace('020-83586999,54,', '13800000000,54,');
  assert.notEqual(synthetic, officialCsv);
  const item = parseOfficialCsv(synthetic, idMap)[0];
  assert.equal(item.phone, null);
  assert.equal(item.phoneHref, null);
  assert.equal(item.phoneWithheld, true);
  assert.doesNotMatch(JSON.stringify(item), /13800000000/);
  assert.equal(official()[0].phoneWithheld, false);
  const withheld = official().filter((row) => row.phoneWithheld);
  assert.deepEqual(withheld.map((row) => row.sourceRow), [55, 67, 102, 223, 226, 228]);
  assert.ok(withheld.every((row) => row.phone === null && row.phoneHref === null));
});

test('explicit name mapping preserves permanent IDs if official source rows are reordered', () => {
  const lines = officialCsv.trimEnd().split(/\r?\n/);
  const first = lines[1].replace(/^1,/, '2,');
  const second = lines[2].replace(/^2,/, '1,');
  lines[1] = second;
  lines[2] = first;
  const reorderedMap = idMap.map((entry, index) => index === 0
    ? { ...entry, sourceRow: 2 }
    : index === 1 ? { ...entry, sourceRow: 1 } : entry);
  const rows = parseOfficialCsv(lines.join('\n'), reorderedMap);
  assert.equal(rows[0].sourceRow, 1);
  assert.equal(rows[0].id, 'gz-000002');
  assert.equal(rows[1].sourceRow, 2);
  assert.equal(rows[1].id, 'gz-000001');
  assert.equal(rows[1].name, idMap[0].name);
});

test('official import rejects a snapshot that silently drops an entire district', () => {
  const missingDistrict = officialCsv.replace(/,从化区,/g, ',增城区,');
  assert.throws(() => parseOfficialCsv(missingDistrict, idMap), /11区/);
});

test('CSV schema, invalid flag, missing rows and identity changes stop import', () => {
  assert.throws(() => parseOfficialCsv(officialCsv.replace('备案床位数', '空床数'), idMap), /字段/);
  assert.throws(() => parseOfficialCsv(officialCsv.replace(',是,是,否', ',可能,是,否'), idMap), /预收养老服务费/);
  assert.throws(() => parseOfficialCsv(officialCsv.split(/\r?\n/).slice(0, 235).join('\n'), idMap), /235/);
  assert.throws(() => parseOfficialCsv(officialCsv.replace('广州颐福居养老院有限公司', '名称被替换'), idMap), /映射|名称/);
  assert.throws(() => parseOfficialCsv(officialCsv, idMap.map((entry, index) => index === 1 ? { ...entry, id: idMap[0].id } : entry)), /ID/);
  assert.throws(() => parseOfficialCsv(officialCsv, idMap.slice(0, -1)), /235/);
  assert.throws(() => parseOfficialCsv(officialCsv.replace(',54,是,是,否', ',54,?,是,否'), idMap), /预收养老服务费/);
});

test('unknown optional official values remain null rather than zero or false', () => {
  const altered = officialCsv.replace(',54,是,是,否', ',,,,');
  const first = parseOfficialCsv(altered, idMap)[0];
  assert.equal(first.registeredBeds, null);
  assert.equal(first.advanceFee, null);
  assert.equal(first.deposit, null);
  assert.equal(first.membershipFee, null);
});

test('existing private CSV deduplicates 126 companies and keeps 144 explicit unverified links', { skip: !existsSync('data/private/registration_status_all235.csv') }, () => {
  const csv = readFileSync('data/private/registration_status_all235.csv', 'utf8');
  const snapshot = parsePrivateCsv(csv, official());
  assert.equal(snapshot.companies.length, 126);
  assert.equal(snapshot.links.length, 144);
  assert.equal(snapshot.links.filter((link) => link.matchType === 'exact').length, 126);
  assert.equal(snapshot.links.filter((link) => link.matchType === 'parentheses').length, 18);
  assert.ok(snapshot.links.every((link) => link.relationshipVerified === false && link.queriedAt === '2026-11-13'));
  assert.equal(Object.values(snapshot.institutionStatuses).filter((status) => status === 'unidentified').length, 86);
  assert.equal(Object.values(snapshot.institutionStatuses).filter((status) => status === 'review').length, 5);
  assert.throws(() => parsePrivateCsv(csv.replace('广州颐福居养老院有限公司', '错误机构名'), official()), /机构名称|原名/);
  assert.throws(() => parsePrivateCsv(csv.replace('统一社会信用代码', '信用编号'), official()), /字段/);
  assert.throws(() => parsePrivateCsv(csv.replace('已查_名称一致', '已查_仅括号标点差异'), official()), /企业名称|匹配/);
  assert.throws(() => parsePrivateCsv(csv.replace('已查_名称一致', '未知状态'), official()), /状态/);
});
