import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstitutionReferenceDirectoryContent } from '../components/InstitutionReferenceDirectoryView';
import { NationalOfficialDirectoryContent } from '../components/NationalOfficialDirectoryView';
import type { ReferenceIndex, ReferenceManifest } from '../lib/institution-reference-types';
import type { NationalOfficialIndex, NationalOfficialManifest } from '../lib/national-official-types';
import type { ProvinceCatalog } from '../lib/province-types';

Object.assign(globalThis, { React });

function firstCard(html: string): string {
  const card = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/)?.[0];
  assert.ok(card, 'a matching result must render a record card');
  return card;
}

const referenceManifest: ReferenceManifest = {
  schemaVersion: 1, snapshotId: 'reference-test', receivedAt: '2026-11-17', rowCount: 1,
  source: { title: '企查查来源表', sha256: 'a'.repeat(64), asOf: null },
  provinces: [{ slug: 'hebei', name: '河北省', count: 1, cities: [{ slug: 'shijiazhuang', name: '石家庄市', count: 1, indexPath: 'hebei/shijiazhuang/index.v1.json' }] }],
};
const referenceIndex: ReferenceIndex = {
  schemaVersion: 1, snapshotId: 'reference-test', provinceSlug: 'hebei', citySlug: 'shijiazhuang',
  records: [{ id: 'reference-2', sourceRow: 2, name: '甲养老院', region: '河北省石家庄市', address: '甲路1号', beds: 0, chunk: 'chunk-001.v1.json' }],
};

const officialManifest: NationalOfficialManifest = {
  schemaVersion: 1, snapshotId: 'official-test', archivedAt: '2026-11-18', rowCount: 2,
  sources: [{ id: 'official-source', province: '重庆市', city: '重庆市', scope: '重庆市公开名单', title: '重庆官方名单', url: 'https://example.test/official', publishedAt: '2025-12-22', asOf: '2025-12-01', sha256: 'b'.repeat(64), rowCount: 2 }],
  provinces: [{ slug: 'chongqing', name: '重庆市', count: 2, cities: [{ slug: 'chongqing', name: '重庆市', count: 2, indexPath: 'chongqing/chongqing/index.v1.json' }] }],
};
const officialIndex: NationalOfficialIndex = {
  schemaVersion: 1, snapshotId: 'official-test', provinceSlug: 'chongqing', citySlug: 'chongqing',
  records: [
    { id: 'official-1', sourceId: 'official-source', rowNumber: 1, name: '乙敬老院', address: '乙路2号', beds: 0, chunk: 'chunk-001.v1.json' },
    { id: 'official-2', sourceId: 'official-source', rowNumber: 2, name: '丙敬老院', address: null, beds: null, chunk: 'chunk-001.v1.json' },
  ],
};

test('national reference result keeps source identity and unknown date beside the record', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, {
    manifest: referenceManifest, index: referenceIndex, query: { province: 'hebei', city: 'shijiazhuang' },
  }));
  const card = firstCard(html);
  assert.match(card, /甲养老院/);
  assert.match(card, /0 张/);
  assert.match(card, /<footer[^>]*aria-label="来源与核对"/);
  assert.match(card, /企查查来源表/);
  assert.match(card, /工作表第 2 行/);
  assert.match(card, /资料时点未知/);
  assert.match(card, /查看线索与来源/);
  assert.doesNotMatch(card, /当前空床|参考月费/);
  assert.match(html, /aria-label="检索养老机构来源线索"/);
  assert.ok(html.indexOf('aria-label="检索养老机构来源线索"') < html.indexOf('aria-label="查找条件"'));
  assert.match(card, /本来源未提供：护理型床位/);
  assert.match(card, /本来源未提供：[^<]*月费用/);
  assert.match(card, /本来源未提供：[^<]*机构星级/);
});

test('official result keeps published date, source period and original-document exit on its card', () => {
  const html = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, {
    manifest: officialManifest, index: officialIndex, query: { province: 'chongqing', city: 'chongqing' },
  }));
  const card = firstCard(html);
  assert.match(card, /乙敬老院/);
  assert.match(card, /床位数[\s\S]{0,80}?0 张/);
  assert.match(card, /<footer[^>]*aria-label="来源与核对"/);
  assert.match(card, /重庆官方名单/);
  assert.match(card, /发布于[^<]*<time dateTime="2025-12-22">2025-12-22<\/time>/);
  assert.match(card, /资料期 2025-12-01/);
  assert.ok(card.includes('href="https://example.test/official"'));
  assert.match(card, /打开官方原文核对/);
  assert.doesNotMatch(card, /当前空床|参考月费/);
  const missing = html.match(/<article\b[^>]*>[^]*?丙敬老院[^]*?<\/article>/)?.[0] ?? '';
  assert.match(missing, /本来源未提供：[^<]*床位数/);
  assert.match(html, /aria-label="检索官方来源记录"/);
  assert.ok(html.indexOf('aria-label="检索官方来源记录"') < html.indexOf('aria-label="官方来源地区条件"'));
  assert.match(card, /本来源未提供：护理型床位/);
  assert.match(card, /本来源未提供：[^<]*月费用/);
  assert.match(card, /本来源未提供：[^<]*机构星级/);
  assert.match(html, /<aside[^>]*aria-label="官方来源地区条件"[^>]*>\s*<details[^>]*>/);
});

test('Guangdong source row keeps its own evidence type and dates with a direct source exit', () => {
  const guangdong: ProvinceCatalog = {
    schemaVersion: 1, snapshotId: 'guangdong-test', archivedAt: '2026-11-18',
    records: [{ id: 'gd-1', city: '广州', name: '广州甲养老院', evidenceType: '市级名单', sourceUrl: 'https://example.test/guangdong', sourcePublishedAt: '2026-09-23', sourceAsOf: '2026-09', sourceStatusNote: null }],
  };
  const html = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, {
    manifest: officialManifest, index: null, guangdongCatalog: guangdong, query: { province: 'guangdong', city: '广州' },
  }));
  const card = firstCard(html);
  assert.match(card, /广州甲养老院/);
  assert.match(card, /<footer[^>]*aria-label="来源与核对"/);
  assert.match(card, /市级名单/);
  assert.match(card, /发布于[^<]*<time dateTime="2026-09-23">2026-09-23<\/time>/);
  assert.match(card, /资料期 2026-09/);
  assert.ok(card.includes('href="https://example.test/guangdong"'));
  assert.match(card, /打开官方原文核对/);
  assert.match(html, /<aside[^>]*aria-label="官方来源地区条件"[^>]*>\s*<details[^>]*>/);
});
