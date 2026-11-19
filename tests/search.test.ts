import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseOfficialCsv } from '../lib/import';
import { searchInstitutions } from '../lib/search';

const rows = parseOfficialCsv(readFileSync('data/raw/family_fields_official.csv', 'utf8'), JSON.parse(readFileSync('data/raw/id-map.json', 'utf8')));

test('default search is source-ordered and paginates at 20', () => {
  const result = searchInstitutions(rows, {});
  assert.equal(result.total, 235);
  assert.equal(result.items.length, 20);
  assert.equal(result.pageCount, 12);
  assert.equal(result.page, 1);
  assert.deepEqual(result.items.map((item) => item.sourceRow), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(searchInstitutions(rows, { page: '12' }).items.length, 15);
});

test('search removes whitespace and matches institution name, district and address', () => {
  assert.deepEqual(searchInstitutions(rows, { q: ' 广州 颐福居 ' }).items.map((item) => item.id), ['gz-000001']);
  assert.ok(searchInstitutions(rows, { q: '黄麻路885号' }).items.some((item) => item.id === 'gz-000020'));
  assert.equal(searchInstitutions(rows, { q: '南沙区' }).total, rows.filter((item) => item.name.includes('南沙区') || item.district === '南沙区' || item.address.includes('南沙区')).length);
  assert.ok(searchInstitutions(rows, { district: '荔湾区', q: '白云区西槎路' }).items.some((item) => item.id === 'gz-000089'));
});

test('space-separated clues match across name, district and address', () => {
  const result = searchInstitutions(rows, { q: '颐福居 横枝岗' });
  assert.deepEqual(result.items.map((item) => item.id), ['gz-000001']);
  assert.equal(result.q, '颐福居 横枝岗');
  assert.equal(searchInstitutions(rows, { q: '颐福居 不存在的街道' }).total, 0);
});

test('invalid district, query and page parameters report corrections explicitly', () => {
  const invalid = searchInstitutions(rows, { district: '广州市', q: '院'.repeat(81), page: '-1' });
  assert.equal(invalid.q.length, 80);
  assert.equal(invalid.district, '');
  assert.equal(invalid.page, 1);
  assert.equal(invalid.issues.length, 3);
  for (const page of ['0', 'NaN', '1.5', '1e2', 'Infinity', '01', '9007199254740993']) {
    assert.equal(searchInstitutions(rows, { page }).page, 1);
    assert.ok(searchInstitutions(rows, { page }).issues.length);
  }
  const last = searchInstitutions(rows, { page: '999' });
  assert.equal(last.page, 12);
  assert.ok(last.issues.length);
});

test('no results keeps a usable first page and stable empty result', () => {
  const result = searchInstitutions(rows, { q: '不存在的机构检索测试', page: '8' });
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(result.pageCount, 1);
  assert.equal(result.page, 1);
});

test('official prepayment flags filter yes, no and missing values without treating missing as no', () => {
  for (const field of ['advanceFee', 'deposit', 'membershipFee'] as const) {
    for (const [option, expected] of [['yes', true], ['no', false], ['unknown', null]] as const) {
      const result = searchInstitutions(rows, { [field]: option });
      assert.equal(result.total, rows.filter(row => row[field] === expected).length);
      assert.ok(result.items.every(row => row[field] === expected));
      assert.equal(result.feeFilters[field], option);
    }
  }
  const combined = searchInstitutions(rows, { district: '越秀区', deposit: 'yes', membershipFee: 'no' });
  assert.equal(combined.total, rows.filter(row => row.district === '越秀区' && row.deposit === true && row.membershipFee === false).length);
});

test('invalid prepayment filters are visibly reset rather than silently interpreted', () => {
  const result = searchInstitutions(rows, { deposit: 'free', membershipFee: '0', advanceFee: 'unknown' });
  assert.equal(result.feeFilters.deposit, '');
  assert.equal(result.feeFilters.membershipFee, '');
  assert.equal(result.feeFilters.advanceFee, 'unknown');
  assert.equal(result.issues.length, 2);
  assert.equal(result.total, rows.filter(row => row.advanceFee === null).length);
});
