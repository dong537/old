import assert from 'node:assert/strict';
import test from 'node:test';
import { MCA_UNKNOWN_FILTER_VALUE, filterMcaRecords, type McaFacetCatalog, type McaFilterRecord } from '../lib/mca-filters';

const catalog: McaFacetCatalog = {
  type: [{ value: '1', label: '养老机构' }, { value: '2', label: '其他设施' }, { value: '3', label: '未采得的类别' }],
  operation: [{ value: '01', label: '公办' }, { value: '04', label: '民办' }],
  care: [{ value: '01', label: '能力完好' }, { value: '02', label: '完全失能' }, { value: '03', label: '部分失能' }],
  network: [{ value: '0', label: '来源代码零' }, { value: '1', label: '综合养老服务管理平台' }],
  grade: [{ value: '01', label: '一级' }],
  medical: [{ value: '01', label: '内设医疗机构' }],
};

const records: McaFilterRecord[] = [
  { mcaId: 'a', name: '春晖养老院', address: '广州市甲区', provinceCode: '440000000000', cityCode: '440100000000', facets: { type: '1', operation: '01', care: ['01', '03'], network: '0', grade: null } },
  { mcaId: 'b', name: '春晖养老院', address: '深圳市乙区', provinceCode: '440000000000', cityCode: '440300000000', facets: { type: '1', operation: '04', care: null, network: '1' } },
  { mcaId: 'c', name: '松园照护站', address: null, provinceCode: '110000000000', cityCode: '110100000000', facets: { type: '2', care: ['02'] } },
];

test('only observed codes become filter options, and unknown stays separate from absent data', () => {
  const result = filterMcaRecords(records, catalog, new URLSearchParams());
  assert.deepEqual(result.facets.type?.options.map(option => option.value), ['1', '2']);
  assert.equal(result.facets.type?.options.find(option => option.value === '1')?.count, 2);
  assert.equal(result.facets.type?.options.find(option => option.value === '3'), undefined);
  assert.deepEqual(result.facets.network?.options.map(option => option.value), ['0', '1']);
  assert.equal(result.facets.care?.unknownCount, 1);
  assert.equal(result.facets.grade, undefined);
  assert.equal(result.facets.medical, undefined);
});

test('combines verified region, keyword and multi-value facets without merging same-name places', () => {
  const params = new URLSearchParams('province=440000000000&q=%E6%98%A5%E6%99%96&type=1&care=03');
  const result = filterMcaRecords(records, catalog, params);
  assert.deepEqual(result.items.map(item => item.mcaId), ['a']);
  assert.equal(result.total, 1);
  assert.equal(result.page, 1);
  assert.equal(result.selected.province, '440000000000');
  assert.equal(result.selected.filters.care, '03');
  const both = filterMcaRecords(records, catalog, new URLSearchParams('province=440000000000&q=%E6%98%A5%E6%99%96&type=1'));
  assert.deepEqual(both.items.map(item => item.mcaId), ['a', 'b']);
});

test('explicit unknown is filterable; uncollected fields are not silently treated as unknown', () => {
  const unknown = filterMcaRecords(records, catalog, new URLSearchParams('care=' + MCA_UNKNOWN_FILTER_VALUE));
  assert.deepEqual(unknown.items.map(item => item.mcaId), ['b']);
  const unavailable = filterMcaRecords(records, catalog, new URLSearchParams('medical=01&grade=01'));
  assert.equal(unavailable.total, 3);
  assert.equal(unavailable.selected.filters.medical, undefined);
  assert.ok(unavailable.issues.some(issue => issue.includes('medical')));
});

test('invalid geography, duplicate filters and malformed pagination recover visibly', () => {
  const invalid = filterMcaRecords(records, catalog, new URLSearchParams('city=440100000000&type=3&type=1&page=0'));
  assert.equal(invalid.total, 3);
  assert.equal(invalid.page, 1);
  assert.equal(invalid.selected.city, undefined);
  assert.equal(invalid.selected.filters.type, undefined);
  assert.ok(invalid.issues.length >= 3);
  const otherCity = filterMcaRecords(records, catalog, new URLSearchParams('province=440000000000&city=440300000000'));
  assert.deepEqual(otherCity.items.map(item => item.mcaId), ['b']);
});
