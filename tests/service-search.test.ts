import assert from 'node:assert/strict';
import test from 'node:test';
import { searchServices, serviceListHref, serviceReturnHref } from '../lib/service-search';
import type { ServiceRecord } from '../lib/service-types';

const record = (id: string, patch: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id, sourceId: 'assessment', sourceRow: 1, name: '广州护理机构', address: '广州市越秀区东风路',
  district: '越秀区', districtBasis: 'address-text', recordType: 'annual-assessment', providerType: '护理机构',
  assessmentGrade: '优秀', serviceCategory: null, serviceItems: null, ...patch,
});
const rows = [
  record('a'),
  record('b', { sourceRow: 2, name: '广州护理机构', address: '番禺区南村镇', district: '番禺区', assessmentGrade: '无等次' }),
  record('c', { sourceId: 'notice', name: '善雅养老', address: '番禺区', district: '番禺区', districtBasis: 'source', recordType: 'designation-notice', assessmentGrade: null, serviceCategory: '居家护理', serviceItems: '生活照料' }),
  record('d', { sourceRow: 3, district: null, districtBasis: null, address: null, assessmentGrade: '不合格' }),
];

test('service search combines name, address and disclosed service clues without merging source rows', () => {
  assert.equal(searchServices(rows, { q: '广州 护理' }).total, 3);
  assert.deepEqual(searchServices(rows, { q: '  广州   东风  ' }).items.map(r => r.id), ['a']);
  assert.deepEqual(searchServices(rows, { district: '番禺区', recordType: 'annual-assessment', grade: '无等次' }).items.map(r => r.id), ['b']);
  const noticeWithGrade = searchServices(rows, { recordType: 'designation-notice', grade: '优秀' });
  assert.equal(noticeWithGrade.total, 1);
  assert.equal(noticeWithGrade.filters.grade, '');
  assert.match(noticeWithGrade.issues[0], /未列考核等次/u);
});

test('unknown geography stays unknown and an annual result never implies home nursing', () => {
  assert.equal(searchServices(rows, { district: '越秀区' }).total, 1);
  assert.deepEqual(searchServices(rows, { q: '居家护理' }).items.map(r => r.id), ['c']);
  assert.deepEqual(searchServices(rows, { q: '生活照料' }).items.map(r => r.id), ['c']);
  assert.equal(searchServices(rows, { recordType: 'annual-assessment' }).items[2].district, null);
  assert.ok(searchServices(rows, { recordType: 'annual-assessment' }).items.every(r => r.serviceCategory === null && r.serviceItems === null));
});

test('invalid service filters and page numbers are visibly corrected', () => {
  const result = searchServices(rows, { district: '北京', recordType: 'current', grade: '最好', page: '-1' });
  assert.equal(result.total, 4);
  assert.equal(result.issues.length, 4);
  assert.equal(result.page, 1);
  assert.equal(result.filters.district, '');
  assert.equal(searchServices(rows, { page: '9007199254740992' }).page, 1);
  assert.equal([...searchServices(rows, { q: '养'.repeat(81) }).filters.q].length, 80);
});

test('pagination preserves input source order and clamps out-of-range pages', () => {
  const records = Array.from({ length: 43 }, (_, i) => record(`record-${i}`, { sourceRow: i + 1 }));
  const result = searchServices(records, { page: '2' });
  assert.equal(result.total, 43);
  assert.equal(result.pageCount, 3);
  assert.equal(result.items.length, 20);
  assert.equal(result.items[0].id, 'record-20');
  assert.equal(searchServices(records, { page: '99' }).items.length, 3);
  assert.equal(searchServices([], {}).pageCount, 1);
});

test('service list URLs encode only accepted filters and safe return links keep query and pagination', () => {
  const href = serviceListHref({ q: '善雅 番禺', district: '番禺区', recordType: 'designation-notice', page: 2 });
  const parsed = new URL(href, 'https://example.test');
  assert.equal(parsed.pathname, '/guangzhou/shangmen/');
  assert.equal(parsed.searchParams.get('q'), '善雅 番禺');
  assert.equal(parsed.searchParams.get('page'), '2');
  assert.equal(serviceReturnHref(href), href);
  for (const invalid of ['https://evil.test', '//evil.test/guangzhou/shangmen/', '/rules/', '/guangzhou/shangmen/../jigou/', '/guangzhou/shangmen/?x=secret']) {
    assert.equal(serviceReturnHref(invalid), '/guangzhou/shangmen/');
  }
  assert.equal(serviceReturnHref('/guangzhou/shangmen/?grade=最好'), '/guangzhou/shangmen/');
});
