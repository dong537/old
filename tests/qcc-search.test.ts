import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { QccDetailRecord, QccIndex, QccIndexRecord } from '../lib/qcc-types';
import { QCC_SOURCE_FIELD_NAMES } from '../lib/qcc-types';
import { QccDirectoryResults } from '../components/QccDirectoryView';
import { QccDetailContent } from '../components/QccDetailView';
import { QccNationalDetailContent } from '../components/QccNationalDetailView';
import type { QccNationalManifest } from '../lib/qcc-national-types';
import { findQccRecord, isQccStatusCaution, loadQccChunk, qccListHref, qccStatusCategory, safeQccReturnPath, searchQccRecords } from '../lib/qcc-search';

const records: QccIndexRecord[] = Array.from({ length: 25 }, (_, index) => ({
  id: 'qcc-' + String(index + 1).padStart(4, '0'),
  rowNumber: index + 2,
  name: '养老服务主体' + (index + 1),
  city: '广州',
  district: null,
  subjectType: '企业',
  registrationStatus: '存续',
  chunk: 'chunk-001.v1.json',
}));
records[5] = { ...records[5], name: '福康养老服务中心', city: '茂名', subjectType: '个体工商户', registrationStatus: '注销（2020-01-01）' };
records[20] = { ...records[20], name: '福康护理院', city: '茂名', subjectType: '企业', registrationStatus: '存续', chunk: 'chunk-002.v1.json' };

test('combined name, city, type and registration status filters keep export order', () => {
  const result = searchQccRecords(records, { q: '  福康 养老 ', city: '茂名', type: '个体工商户', status: '注销' });
  assert.deepEqual(result.items.map(item => item.id), ['qcc-0006']);
  assert.equal(result.total, 1);
  assert.equal(searchQccRecords(records, { city: '广州', status: '注销' }).total, 0);
});

test('directory paginates twenty subjects and preserves filter URL state', () => {
  const first = searchQccRecords(records, {});
  assert.equal(first.total, 25);
  assert.equal(first.pageCount, 2);
  assert.deepEqual(first.items.map(item => item.id), records.slice(0, 20).map(item => item.id));
  assert.deepEqual(searchQccRecords(records, { page: '2' }).items.map(item => item.id), records.slice(20).map(item => item.id));
  assert.equal(qccListHref({ q: '福康', city: '茂名', type: '企业', status: '存续', page: 2 }), '/guangdong/zhuti/?q=%E7%A6%8F%E5%BA%B7&city=%E8%8C%82%E5%90%8D&type=%E4%BC%81%E4%B8%9A&status=%E5%AD%98%E7%BB%AD&page=2');
});

test('invalid filters and pages are corrected visibly', () => {
  const result = searchQccRecords(records, { q: '长'.repeat(81), city: '不存在', type: '未知', status: '未知', page: '-1' });
  assert.equal([...result.q].length, 80);
  assert.equal(result.city, '');
  assert.equal(result.type, '');
  assert.equal(result.status, '');
  assert.equal(result.page, 1);
  assert.equal(result.issues.length, 5);
  for (const page of ['0', '01', '1.5', '1e2', 'Infinity', '9007199254740993']) {
    assert.equal(searchQccRecords(records, { page }).page, 1);
  }
  assert.equal(searchQccRecords(records, { page: '99' }).page, 2);
});

test('empty results return a recoverable first page', () => {
  const result = searchQccRecords(records, { q: '查无此名', page: '9' });
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(result.page, 1);
  assert.equal(result.pageCount, 1);
  assert.ok(result.issues.length > 0);
});

test('detail lookup only returns listed IDs with safe chunk names', () => {
  assert.equal(findQccRecord(records, 'qcc-0021')?.chunk, 'chunk-002.v1.json');
  assert.equal(findQccRecord(records, 'not-listed'), null);
  assert.equal(findQccRecord([{ ...records[0], chunk: '../private.xlsx' }], records[0].id), null);
});

test('return link accepts only the subject directory with known filters', () => {
  const from = '/guangdong/zhuti/?q=福康&city=茂名&page=2';
  assert.equal(safeQccReturnPath(from), from);
  for (const unsafe of ['https://evil.test/', '//evil.test/', '/rules/', '/guangdong/zhuti/?next=https://evil.test/', '/guangdong/zhuti/?q=x&q=y']) {
    assert.equal(safeQccReturnPath(unsafe), '/guangdong/zhuti/');
  }
});


test('status filter groups dated raw values while warning for non-active categories', () => {
  assert.equal(qccStatusCategory('注销（2020-01-01）'), '注销');
  assert.equal(qccStatusCategory('存续（在营、开业、在册）'), '存续');
  assert.equal(searchQccRecords(records, { status: '注销' }).total, 1);
  for (const status of ['注销', '强制注销', '吊销', '撤销', '责令关闭', '废止', '另册管理', '迁出']) {
    assert.equal(isQccStatusCaution(status), true, status);
  }
  assert.equal(isQccStatusCaution('存续'), false);
  assert.equal(isQccStatusCaution('在业'), false);
  assert.equal(isQccStatusCaution('正常'), false);
});


test('frozen dataset navigates from filtered list to chunked detail and back under base path', () => {
  Object.assign(globalThis, { React });
  const root = join(process.cwd(), 'public', 'data', 'qcc');
  const index = JSON.parse(readFileSync(join(root, 'index.v1.json'), 'utf8')) as QccIndex;
  const query = { q: '高州市福康养老服务中心', city: '茂名', type: '个体工商户', status: '注销', page: '1' };
  const result = searchQccRecords(index.records, query);
  assert.equal(result.total, 2);
  const first = findQccRecord(index.records, result.items[0].id);
  const middle = findQccRecord(index.records, index.records[Math.floor(index.records.length / 2)].id);
  const last = findQccRecord(index.records, index.records[index.records.length - 1].id);
  assert.ok(first && middle && last);
  for (const location of [first, middle, last]) {
    const chunk = JSON.parse(readFileSync(join(root, location.chunk), 'utf8')) as { snapshotId: string; records: QccDetailRecord[] };
    assert.equal(chunk.snapshotId, index.snapshotId);
    assert.ok(chunk.records.some(item => item.id === location.id && item.rowNumber === location.rowNumber));
  }
  const record = (JSON.parse(readFileSync(join(root, first.chunk), 'utf8')) as { records: QccDetailRecord[] }).records.find(item => item.id === first.id);
  assert.ok(record);
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const listHtml = renderToStaticMarkup(React.createElement(QccDirectoryResults, { index, query }));
    assert.match(listHtml, /action="\/eldercare\/guangdong\/zhuti\/"/);
    assert.match(listHtml, /href="\/eldercare\/guangdong\/zhuti\/detail\/\?id=gd-qcc-/);
    assert.match(listHtml, /登记主体不等于养老机构/);
    assert.match(listHtml, /注销（2019-09-23）/);
    const statusOptions = listHtml.match(/<select[^>]*name="status"[^>]*>(.*?)<\/select>/s)?.[1];
    assert.ok(statusOptions);
    assert.ok((statusOptions.match(/<option/g) ?? []).length <= 15);
    const detailHtml = renderToStaticMarkup(React.createElement(QccDetailContent, {
      index, record, from: qccListHref(query), verifiedSource: 'gd-src-000765',
    }));
    assert.match(detailHtml, /统一社会信用代码/);
    assert.match(detailHtml, /代码校验状态/);
    assert.match(detailHtml, /原始文件唯一工作表第 6644 行/);
    assert.match(detailHtml, /href="\/eldercare\/guangdong\/zhuti\/\?q=/);
    assert.match(detailHtml, /href="\/eldercare\/guangdong\/jigou\/gd-src-000765\/"/);
    assert.match(detailHtml, /aria-label="本页目录"/);
    for (const id of ['overview', 'fields', 'industry', 'original', 'identifiers', 'official', 'sources', 'checklist']) {
      assert.ok(detailHtml.includes('id="' + id + '"'), id);
    }
    assert.match(detailHtml, /核对这条登记主体候选/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});


test('redacted address is not described as absent from the source export', () => {
  Object.assign(globalThis, { React });
  const root = join(process.cwd(), 'public', 'data', 'qcc');
  const index = JSON.parse(readFileSync(join(root, 'index.v1.json'), 'utf8')) as QccIndex;
  const location = index.records.find(item => item.rowNumber === 3678);
  assert.ok(location);
  const record = (JSON.parse(readFileSync(join(root, location.chunk), 'utf8')) as { records: QccDetailRecord[] }).records.find(item => item.id === location.id);
  assert.ok(record);
  assert.equal(record.address, null);
  const html = renderToStaticMarkup(React.createElement(QccDetailContent, { index, record, from: null, verifiedSource: null }));
  assert.match(html, /登记地址<\/dt><dd[^>]*>公开版未提供/);
  const basePath = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH === '/eldercare' ? '/eldercare' : '';
  assert.ok(html.includes('href="' + basePath + '/quanguo/zhuti/"'));
  const failedLink = renderToStaticMarkup(React.createElement(QccDetailContent, {
    index, record, from: null, verifiedSource: null, sourceError: '关联读取失败',
  }));
  assert.match(failedLink, /role="alert"[^>]*>关联读取失败/);
  assert.doesNotMatch(failedLink, /当前没有可展示的官方来源候选关联/);
});

test('both detail pages render every QCC column without public contact values', () => {
  Object.assign(globalThis, { React });
  const headers = ['企业名称', '登记状态', '法定代表人', '注册资本', '成立日期', '统一社会信用代码',
    '注册地址', '注册地址邮编', '所属省份', '所属城市', '所属区县', '有效手机号', '更多电话', '邮箱',
    '企业(机构)类型', '纳税人识别号', '注册号', '组织机构代码', '参保人数', '参保人数所属年报',
    '营业期限', '国标行业门类', '国标行业大类', '国标行业中类', '国标行业小类', '企查查行业门类',
    '企查查行业大类', '企查查行业中类', '企查查行业小类', '企业规模', '曾用名', '英文名',
    '官网网址', '通信地址', '通信地址邮编', '企业简介', '经营范围'];
  const sourceFields: Record<string, string | number | null> = Object.fromEntries(headers.map((header, index) => [header, '原值' + index]));
  assert.deepEqual(QCC_SOURCE_FIELD_NAMES, headers);
  Object.assign(sourceFields, { 有效手机号: '[已遮蔽]', 更多电话: '[已遮蔽]', 邮箱: '[已遮蔽]',
    官网网址: 'https://example.com/path', 参保人数: 0, 注册资本: '-', 注册地址: '', 通信地址: null });
  const root = join(process.cwd(), 'public', 'data', 'qcc');
  const index = JSON.parse(readFileSync(join(root, 'index.v1.json'), 'utf8')) as QccIndex;
  const location = index.records[0];
  const base = (JSON.parse(readFileSync(join(root, location.chunk), 'utf8')) as { records: QccDetailRecord[] }).records[0];
  const record = { ...base, sourceFields };
  const manifest: QccNationalManifest = { schemaVersion: 1, snapshotId: index.snapshotId, exportedAt: index.exportedAt,
    rowCount: 1, sourceFiles: [{ id: 'source-test', filename: '测试.xlsx', sha256: 'a'.repeat(64), rowCount: 1 }], provinces: [] };
  const pages = [
    React.createElement(QccDetailContent, { index, record, from: null, verifiedSource: null }),
    React.createElement(QccNationalDetailContent, { manifest, record: { ...record, province: '广东省', sourceId: 'source-test' }, from: null }),
  ];
  for (const page of pages) {
    const html = renderToStaticMarkup(page);
    const section = html.match(/<section[^>]*>(?:(?!<section).)*企查查导出字段.*?<\/section>/s)?.[0];
    assert.ok(section, 'original fields section must be present');
    assert.equal((section.match(/<dt\b/g) ?? []).length, 37);
    for (const label of headers) assert.ok(section.includes('>' + label + '</dt>'), label);
    for (const value of ['[已遮蔽]', 'https://example.com/path', '>0</dd>', '>-</dd>']) assert.ok(section.includes(value), value);
    assert.doesNotMatch(section, /13800138000|020-12345678|care@example\.com/);
    assert.doesNotMatch(section, /<a\b|href=|tel:|mailto:/);
  }
});

test('Guangdong chunk loader rejects incomplete or nonprimitive source fields', async () => {
  const sourceFields = Object.fromEntries(QCC_SOURCE_FIELD_NAMES.map(header => [header, null]));
  const { 企业名称: _removed, ...missing } = sourceFields;
  const previousFetch = globalThis.fetch;
  try {
    for (const fields of [undefined, null, [], missing, { ...sourceFields, 额外字段: null },
      { ...sourceFields, 企业名称: true }, { ...sourceFields, 企业名称: {} }]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ schemaVersion: 1, snapshotId: 'test',
        records: [{ id: 'test', rowNumber: 3, sourceFields: fields }] }));
      await assert.rejects(loadQccChunk('chunk-001.v1.json', 'test', new AbortController().signal), /详情与索引不一致/);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ schemaVersion: 1, snapshotId: 'test',
      records: [{ id: 'test', rowNumber: 3, sourceFields }] }));
    assert.deepEqual((await loadQccChunk('chunk-001.v1.json', 'test', new AbortController().signal)).records[0].sourceFields, sourceFields);
  } finally { globalThis.fetch = previousFetch; }
});

