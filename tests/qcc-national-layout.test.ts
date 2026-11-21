import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QccNationalDirectoryContent } from '../components/QccNationalDirectoryView';
import type { QccNationalIndex, QccNationalManifest } from '../lib/qcc-national-types';

Object.assign(globalThis, { React });

const manifest: QccNationalManifest = {
  schemaVersion: 1, snapshotId: 'layout-test', exportedAt: '2026-11-16', rowCount: 1,
  sourceFiles: [{ id: 'beijing-source', filename: '北京.xlsx', sha256: 'a'.repeat(64), rowCount: 1 }],
  provinces: [{ slug: 'beijing', name: '北京市', count: 1, cities: [{ slug: 'beijing-city', name: '北京市', count: 1, indexPath: 'p-aabbccddeeff/c-112233445566/index.v1.json' }] }],
};
const index: QccNationalIndex = {
  schemaVersion: 1, snapshotId: 'layout-test', provinceSlug: 'beijing', citySlug: 'beijing-city',
  records: [{ id: 'subject-2', rowNumber: 2, name: '甲养老服务有限公司', province: '北京市', city: '北京市', district: '朝阳区', subjectType: '企业', registrationStatus: '存续', sourceId: 'beijing-source', chunk: 'chunk-001.v1.json' }],
};

test('national subject directory shows conditions before results and source evidence beside each record', () => {
  const html = renderToStaticMarkup(React.createElement(QccNationalDirectoryContent, {
    manifest, index, query: { province: 'beijing', city: 'beijing-city' },
  }));
  assert.match(html, /class="[^"]*directory-workspace/);
  assert.match(html, /<aside[^>]*aria-label="查找条件"/);
  assert.ok(html.indexOf('aria-label="查找条件"') < html.indexOf('aria-label="全国登记主体候选列表"'));
  assert.match(html, /<footer[^>]*aria-label="来源与核对"/);
  assert.match(html, /北京.xlsx/);
  assert.match(html, /原始文件第 2 行/);
  assert.match(html, /导出时间/);
  assert.match(html, /朝阳区/);
});
