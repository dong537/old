import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import ServiceDirectoryPage from '../app/guangzhou/shangmen/page';
import ChanghuxianGuide from '../app/guangzhou/changhuxian/page';
import { ServiceDirectoryView } from '../components/ServiceDirectoryView';
import type { ServiceCatalog } from '../lib/service-types';

Object.assign(globalThis, { React });

function renderServices(catalog: ServiceCatalog, query = '') {
  return renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams(query),
  }, React.createElement(ServiceDirectoryView, { catalog })));
}

const catalog: ServiceCatalog = {
  schemaVersion: 1, snapshotId: 'service-layout-test',
  sources: [{
    id: 'assessment', title: '广州医保年度考核原文', url: 'https://example.test/assessment',
    publisher: '广州市医保', publishedAt: '2026-05-09', accessedAt: '2026-11-15',
    kind: 'annual-assessment', period: '2025年度', limitations: '历史考核记录，不证明当前定点。',
  }],
  records: [{
    id: 'service-1', sourceId: 'assessment', sourceRow: 7, name: '广州甲护理机构',
    address: '广州市越秀区甲路1号', district: '越秀区', districtBasis: 'source',
    recordType: 'annual-assessment', providerType: '护理机构', assessmentGrade: '优秀',
    serviceCategory: null, serviceItems: null,
  }],
};

test('service search leads the page and historical-source caveat follows the result summary', () => {
  const html = renderServices(catalog, 'district=%E8%B6%8A%E7%A7%80%E5%8C%BA');
  const search = html.indexOf('aria-label="搜索养老服务公开记录"');
  const count = html.indexOf('共 <b>1</b> 条记录');
  const caveat = html.indexOf('不代表当前有效资格');
  assert.ok(search >= 0 && count > search && caveat > count);
  assert.ok(html.includes('name="district" value="越秀区"'));
  const page = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams(),
  }, React.createElement(ServiceDirectoryPage)));
  assert.doesNotMatch(page, /aria-label="公开记录范围"/);
});

test('service card identifies its source, date and original-document exit beside the record', () => {
  const html = renderServices(catalog);
  const card = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/)?.[0];
  assert.ok(card);
  assert.match(card, /广州甲护理机构/);
  assert.match(card, /<footer[^>]*aria-label="来源与核对"/);
  assert.match(card, /广州医保年度考核原文/);
  assert.match(card, /2025年度/);
  assert.match(card, /原始记录第 7 条/);
  assert.match(card, /<time dateTime="2026-05-09">2026-05-09<\/time>/);
  assert.ok(card.includes('href="https://example.test/assessment"'));
  assert.match(card, /打开官方原文核对/);
  assert.match(card, /from=%2Fguangzhou%2Fshangmen%2F/);
});

test('long-term-care guide puts application steps first and dates citations inline', () => {
  const html = renderToStaticMarkup(React.createElement(ChanghuxianGuide));
  const steps = html.indexOf('id="application-steps"');
  const faq = html.indexOf('aria-label="常见问题"');
  assert.ok(steps >= 0 && faq > steps);
  const firstStep = html.slice(steps, faq);
  assert.match(firstStep, /核对参保和办理口径/);
  assert.match(firstStep, /href="#source-service-management"/);
  assert.match(firstStep, /<time dateTime="2023-12-08">2023-12-08<\/time>/);
});
