import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstitutionReferenceDirectoryContent } from '../components/InstitutionReferenceDirectoryView';
import { InstitutionReferenceProvincePage } from '../components/InstitutionReferenceProvincePage';
import { InstitutionReferenceDetailContent } from '../components/InstitutionReferenceDetailView';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';
import type { ReferenceDetailRecord, ReferenceIndex, ReferenceManifest } from '../lib/institution-reference-types';

Object.assign(globalThis, { React });

const manifest: ReferenceManifest = {
  schemaVersion: 1, snapshotId: 'layout-test', receivedAt: '2026-11-17', rowCount: 1,
  source: { title: '企查查来源表', sha256: 'a'.repeat(64), asOf: null },
  provinces: [{ slug: 'hebei', name: '河北省', count: 1, cities: [{ slug: 'shijiazhuang', name: '石家庄市', count: 1, indexPath: 'hebei/shijiazhuang/index.v1.json' }] }],
};
const index: ReferenceIndex = {
  schemaVersion: 1, snapshotId: 'layout-test', provinceSlug: 'hebei', citySlug: 'shijiazhuang',
  records: [{ id: 'row-2', sourceRow: 2, name: '甲养老院', region: '河北省石家庄市', address: '甲路1号', beds: 0, chunk: 'chunk-001.v1.json' }],
};

test('reference directory places visible conditions before results and keeps evidence in each card', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, {
    manifest, index, query: { province: 'hebei', city: 'shijiazhuang' },
  }));
  assert.match(html, /class="[^"]*directory-workspace/);
  assert.match(html, /<aside[^>]*aria-label="查找条件"/);
  assert.ok(html.indexOf('aria-label="查找条件"') < html.indexOf('aria-label="全国养老机构来源线索列表"'));
  assert.match(html, /<summary[^>]*>[^]*查找条件/);
  assert.match(html, /<footer[^>]*aria-label="来源与核对"/);
  assert.match(html, /资料时点未知/);
  assert.match(html, /原表床位数[\s\S]{0,80}?0 张/);
  // 缺失字段合并成一行说明，但仍逐项列出字段名（见 DirectoryUi.RecordFacts）
  assert.match(html, /本来源未提供：护理型床位、月费用、机构星级/);
});

test('reference search leads into left-side region filters and right-side results', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, {
    manifest, index, query: { province: 'hebei', city: 'shijiazhuang' },
  }));
  assert.match(html, /class="directory-workspace"/);
  assert.match(html, /<aside class="directory-sidebar" aria-label="查找条件"/);
  assert.match(html, /aria-label="选择线索省份和可选城市" class="flex flex-col gap-3"/);
  assert.ok(html.indexOf('aria-label="检索养老机构来源线索"') < html.indexOf('aria-label="查找条件"'));
  assert.ok(html.indexOf('aria-label="查找条件"') < html.indexOf('aria-label="全国养老机构来源线索列表"'));
});

test('static province page keeps city selection beside source rows and the original return route', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceProvincePage, {
    data: { manifest, province: manifest.provinces[0], page: 1, pageCount: 1, records: [{ ...index.records[0], citySlug: 'shijiazhuang' }] },
  }));
  assert.match(html, /class="[^"]*directory-workspace/);
  assert.match(html, /<aside[^>]*aria-label="地区分组"/);
  assert.ok(html.indexOf('aria-label="地区分组"') < html.indexOf('aria-label="河北省来源线索列表"'));
  assert.match(html, /<footer[^>]*aria-label="来源与核对"/);
  assert.match(html, /from=%2Fquanguo%2Fcankao%2Fsheng%2Fhebei%2F/);
  assert.match(html, /aria-label="检索本省养老机构来源线索"/);
  assert.ok(html.indexOf('aria-label="检索本省养老机构来源线索"') < html.indexOf('aria-label="地区分组"'));
  assert.match(html, /本来源未提供：护理型床位、月费用、机构星级/);
});

test('QCC source detail offers an explicitly unverified MCA name search', () => {
  const record: ReferenceDetailRecord = {
    id: 'row-2', sourceRow: 2, name: '甲养老院', region: '河北省石家庄市',
    address: '甲路1号', beds: 0, creditCode: null, codeStatus: 'missing',
    sourceFields: Object.fromEntries(REFERENCE_SOURCE_FIELD_NAMES.map(key => [key, null])),
  };
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, {
    manifest, record, officialCandidates: [], registryCandidates: [],
    provinceName: '河北省', cityName: '石家庄市', from: null,
  }));
  assert.match(html, /href="(?:\/eldercare)?\/quanguo\/pingtai\/\?q=%E7%94%B2%E5%85%BB%E8%80%81%E9%99%A2"/);
  assert.match(html, /候选，未核同一机构/);
  assert.doesNotMatch(html, /已关联民政部平台机构/);
});
