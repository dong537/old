import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QccNationalDirectoryContent } from '../components/QccNationalDirectoryView';
import { safeQccReturnPath } from '../lib/qcc-search';
import { guangdongCityOptions } from '../lib/qcc-unified-search';
import type { QccIndex } from '../lib/qcc-types';
import type { QccNationalManifest } from '../lib/qcc-national-types';

Object.assign(globalThis, { React });

const manifest: QccNationalManifest = {
  schemaVersion: 1,
  snapshotId: 'national-fixture',
  exportedAt: '2026-11-16',
  rowCount: 1,
  sourceFiles: [{ id: 'source-fixture', filename: '北京.xlsx', sha256: 'a'.repeat(64), rowCount: 1 }],
  provinces: [{ slug: 'beijing', name: '北京市', count: 1, cities: [{ slug: 'beijing-city', name: '北京', count: 1, indexPath: 'p-aabbccddeeff/c-112233445566/index.v1.json' }] }],
};

const guangdongIndex: QccIndex = {
  schemaVersion: 1,
  snapshotId: 'guangdong-fixture',
  exportedAt: '2026-11-16',
  sourceSha256: 'b'.repeat(64),
  records: [
    { id: 'gd-qcc-1', rowNumber: 2, name: '广州乐龄养老服务有限公司', city: '广州', district: '越秀区', subjectType: '有限责任公司', registrationStatus: '存续', chunk: 'chunk-001.v1.json' },
    { id: 'gd-qcc-2', rowNumber: 3, name: '佛山安养服务有限公司', city: '佛山', district: null, subjectType: '有限责任公司', registrationStatus: '注销', chunk: 'chunk-001.v1.json' },
  ],
};

test('national registry directory selects Guangdong and preserves its filters in detail links', () => {
  const html = renderToStaticMarkup(React.createElement(QccNationalDirectoryContent, {
    manifest, index: null, guangdongIndex,
    query: { province: 'guangdong', city: '广州', q: '乐龄', type: '', status: '', page: '1' },
  }));
  assert.match(html, /广东省/);
  assert.match(html, /广州乐龄养老服务有限公司/);
  assert.doesNotMatch(html, /佛山安养服务有限公司/);
  assert.match(html, /\/guangdong\/zhuti\/detail\/\?id=gd-qcc-1[^" ]*from=/);
  assert.match(html, /province%3Dguangdong/);
  const invalid = renderToStaticMarkup(React.createElement(QccNationalDirectoryContent, {
    manifest, index: null, guangdongIndex,
    query: { province: 'guangdong', city: '不存在的城市' },
  }));
  assert.match(invalid, /省市参数无效/);
  assert.doesNotMatch(invalid, /广州乐龄养老服务有限公司/);
});

test('Guangdong subject detail accepts a filtered nationwide return path without opening external paths', () => {
  const from = '/quanguo/zhuti/?province=guangdong&city=%E5%B9%BF%E5%B7%9E&q=%E4%B9%90%E9%BE%84&page=2';
  assert.equal(safeQccReturnPath(from), from);
  for (const unsafe of [
    '/quanguo/zhuti/?province=beijing&city=广州',
    '/quanguo/zhuti/?province=guangdong&next=https://evil.test/',
    '/quanguo/zhuti/?province=guangdong&city=广州&city=佛山',
    '//evil.test/',
  ]) assert.equal(safeQccReturnPath(unsafe), '/guangdong/zhuti/');
});

test('frozen Guangdong snapshot is selectable from nationwide search without copying its rows', () => {
  const actual = JSON.parse(readFileSync(join(process.cwd(), 'public/data/qcc/index.v1.json'), 'utf8')) as QccIndex;
  assert.equal(actual.records.length, 6777);
  const cities = guangdongCityOptions(actual);
  assert.equal(cities.length, 21);
  assert.equal(cities.reduce((total, city) => total + city.count, 0), actual.records.length);
  const first = actual.records[0];
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const html = renderToStaticMarkup(React.createElement(QccNationalDirectoryContent, {
      manifest, index: null, guangdongIndex: actual,
      query: { province: 'guangdong', city: first.city, q: first.name, page: '1' },
    }));
    assert.match(html, /广东省/);
    assert.ok(html.includes(first.name));
    assert.ok(html.includes('/eldercare/guangdong/zhuti/detail/?id=' + first.id));
    assert.ok(html.includes('province%3Dguangdong'));
    assert.ok(!html.includes('href="/eldercare/guangdong/zhuti/"'));
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});
