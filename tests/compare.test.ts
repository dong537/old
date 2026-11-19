import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { ComparisonView } from '../components/ComparisonView';
import { catalog } from '../lib/catalog';
import { compareUrl, directoryReturnUrl, parseCompareSelection, toggleCompareId } from '../lib/compare';
import { logicalPathname, sitePath } from '../lib/site-path';

const knownIds = new Set(['gz-000001', 'gz-000002', 'gz-000003', 'gz-000004']);
Object.assign(globalThis, { React });

test('compare selection keeps known, unique IDs in requested order', () => {
  const result = parseCompareSelection('gz-000003,gz-000001,gz-000003', knownIds);
  assert.deepEqual(result.ids, ['gz-000003', 'gz-000001']);
  assert.equal(result.issues.length, 0);
  assert.equal(compareUrl(result.ids), '/guangzhou/duibi/?ids=gz-000003%2Cgz-000001');
});

test('comparison rejects unknown and excess IDs with visible correction', () => {
  const result = parseCompareSelection('gz-000001,wrong,gz-000002,gz-000003,gz-000004', knownIds);
  assert.deepEqual(result.ids, ['gz-000001', 'gz-000002', 'gz-000003']);
  assert.equal(result.issues.length, 2);
  assert.deepEqual(parseCompareSelection('', knownIds).ids, []);
  assert.deepEqual(parseCompareSelection('x'.repeat(513), knownIds).ids, []);
});

test('toggle comparison enforces three selections and can remove one', () => {
  const selected = ['gz-000001', 'gz-000002', 'gz-000003'];
  const denied = toggleCompareId(selected, 'gz-000004');
  assert.deepEqual(denied.ids, selected);
  assert.ok(denied.issue);
  assert.deepEqual(toggleCompareId(selected, 'gz-000002').ids, ['gz-000001', 'gz-000003']);
});

test('comparison keeps its originating search when returning or opening a profile', () => {
  const from = '/guangzhou/jigou/?q=养老&district=越秀区&page=2&compare=gz-000004';
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ ids: 'gz-000001,gz-000002', from }),
  }, React.createElement(ComparisonView, { catalog }))).replaceAll('&amp;', '&');
  const returnHref = html.match(/href="([^"]+)"[^>]*>返回目录添加机构/)?.[1];
  assert.ok(returnHref);
  const back = new URL(returnHref, 'https://example.test');
  assert.equal(back.pathname, sitePath('/guangzhou/jigou/'));
  assert.equal(back.searchParams.get('q'), '养老');
  assert.equal(back.searchParams.get('district'), '越秀区');
  assert.equal(back.searchParams.get('page'), '2');
  assert.equal(back.searchParams.get('compare'), 'gz-000001,gz-000002');
  const profileHref = [...html.matchAll(/href="([^"]+)"/g)]
    .map(match => match[1])
    .find(href => href.startsWith(sitePath('/guangzhou/jigou/gz-000001/?from=')));
  assert.ok(profileHref);
  assert.equal(new URL(profileHref, 'https://example.test').searchParams.get('from'), logicalPathname(back.pathname) + back.search);
});

test('comparison ignores an external or unrelated return URL', () => {
  for (const from of ['https://example.test/guangzhou/jigou/', '//example.test/', '/rules/?q=养老']) {
    const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
      value: new URLSearchParams({ ids: 'gz-000001,gz-000002', from }),
    }, React.createElement(ComparisonView, { catalog }))).replaceAll('&amp;', '&');
    const returnHref = html.match(/href="([^"]+)"[^>]*>返回目录添加机构/)?.[1];
    assert.ok(returnHref);
    assert.equal(returnHref, sitePath('/guangzhou/jigou/?compare=gz-000001%2Cgz-000002'));
  }
});

test('comparison return links retain valid prepayment-filter context', () => {
  const from = '/guangzhou/jigou/?q=养老&district=越秀区&advanceFee=unknown&deposit=yes&membershipFee=no&page=2';
  const selected = ['gz-000001', 'gz-000002'];
  const compare = new URL(compareUrl(selected, from), 'https://example.test');
  const returnContext = new URL(compare.searchParams.get('from') ?? '', 'https://example.test');
  const expectedContext = new URL(from, 'https://example.test');
  assert.equal(returnContext.pathname, expectedContext.pathname);
  assert.deepEqual([...returnContext.searchParams.entries()], [...expectedContext.searchParams.entries()]);
  const back = new URL(directoryReturnUrl(compare.searchParams.get('from'), selected), 'https://example.test');
  assert.equal(back.searchParams.get('advanceFee'), 'unknown');
  assert.equal(back.searchParams.get('deposit'), 'yes');
  assert.equal(back.searchParams.get('membershipFee'), 'no');
  assert.equal(back.searchParams.get('compare'), selected.join(','));
});

test('comparison keeps a valid eighty-character Chinese query after URL encoding', () => {
  const from = '/guangzhou/jigou/?q=' + encodeURIComponent('养'.repeat(80)) + '&district=' + encodeURIComponent('越秀区') + '&deposit=yes&membershipFee=no';
  assert.ok(from.length > 512);
  const selected = ['gz-000001', 'gz-000002'];
  const comparison = new URL(compareUrl(selected, from), 'https://example.test');
  const savedFrom = comparison.searchParams.get('from');
  assert.ok(savedFrom);
  const back = new URL(directoryReturnUrl(savedFrom, selected), 'https://example.test');
  assert.equal(back.searchParams.get('q'), '养'.repeat(80));
  assert.equal(back.searchParams.get('district'), '越秀区');
  assert.equal(back.searchParams.get('deposit'), 'yes');
  assert.equal(back.searchParams.get('membershipFee'), 'no');
});

test('comparison distinguishes withheld source mobile from absent telephone', () => {
  const institutions = [
    { ...catalog.institutions[0], phone: null, phoneHref: null, phoneWithheld: true },
    catalog.institutions[1],
  ];
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ ids: 'gz-000001,gz-000002' }),
  }, React.createElement(ComparisonView, { catalog: { ...catalog, institutions } })));
  assert.match(html, /原表有手机号格式电话，本站暂不展示/);
  assert.doesNotMatch(html, /13800000000|href="tel:13800000000"/);
});

test('comparison offers a printable visit sheet with dated source and questions to verify', () => {
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ ids: 'gz-000001,gz-000002' }),
  }, React.createElement(ComparisonView, { catalog })));
  assert.match(html, /打印探访核对单/);
  assert.match(html, /class="[^"]*visit-print-sheet/);
  assert.match(html, new RegExp(catalog.source.publishedAt));
  assert.match(html, /当前是否营业/);
  assert.match(html, /当前是否有空床/);
  assert.match(html, /实际月费及其他收费/);
  assert.match(html, /服务与医疗安排/);
  assert.match(html, /合同签约主体/);
  assert.match(html, /原表标记不等于当前收费/);
  assert.ok(html.includes(catalog.institutions[0].name));
  assert.ok(html.includes(catalog.institutions[1].name));
  const cards = [...html.matchAll(/<article[^>]*visit-sheet-card[^>]*>([\s\S]*?)<\/article>/g)].map(match => match[1]);
  assert.equal(cards.length, 2);
  for (const card of cards) {
    assert.ok(card.includes('联系与探访核对单'), '每家跨页打印时应自带核对单标题');
    assert.ok(card.includes(catalog.source.title), '每家单独打印时应带来源名称');
    assert.ok(card.includes(catalog.source.publishedAt), '每家单独打印时应带名单日期');
    assert.ok(card.includes(catalog.source.url), '每家单独打印时应带来源链接');
  }
});

test('single selection does not offer a comparison visit sheet', () => {
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ ids: 'gz-000001' }),
  }, React.createElement(ComparisonView, { catalog })));
  assert.doesNotMatch(html, /打印探访核对单|visit-print-sheet/);
});
