import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { headerSearchHref, SiteHeader } from '../components/SiteHeader';
import { catalog } from '../lib/catalog';
import GuangzhouPage from '../app/guangzhou/page';
import HomePage from '../app/page';

Object.assign(globalThis, { React });

function withNavigation(pathname: string, query: string, child: React.ReactNode) {
  return React.createElement(AppRouterContext.Provider, { value: { push: () => undefined } as never },
    React.createElement(PathnameContext.Provider, { value: pathname },
      React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams(query) }, child)));
}

test('site search starts with the current URL keyword', () => {
  const html = renderToStaticMarkup(withNavigation('/guangzhou/jigou/gz-000001/', 'q=颐福居',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  const input = html.match(/<input\b[^>]*id="site-q"[^>]*>/)?.[0];
  assert.ok(input, '全站搜索框应存在');
  assert.match(input, /value="颐福居"/);
});

test('directory header leaves keyword search to the directory form', () => {
  const html = renderToStaticMarkup(withNavigation('/guangzhou/jigou/', 'q=颐福居',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.doesNotMatch(html, /<form\b/);
});

test('site search retains active Guangzhou filters while replacing the keyword', () => {
  const href = headerSearchHref('/guangzhou/jigou/', ' 新关键词 ', '/guangzhou/jigou/',
    '?q=旧词&district=越秀区&compare=gz-000001&advanceFee=yes&deposit=no&membershipFee=unknown&page=3');
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('q'), '新关键词');
  assert.equal(url.searchParams.get('district'), '越秀区');
  assert.equal(url.searchParams.get('compare'), 'gz-000001');
  assert.equal(url.searchParams.get('advanceFee'), 'yes');
  assert.equal(url.searchParams.get('deposit'), 'no');
  assert.equal(url.searchParams.get('membershipFee'), 'unknown');
  assert.equal(url.searchParams.has('page'), false);
});

test('searching nationwide from a legacy Guangzhou list drops regional-only filters', () => {
  const href = headerSearchHref('/quanguo/cankao/', ' 海珠 ', '/guangzhou/jigou/',
    '?district=越秀区&compare=gz-000001&deposit=yes&page=3');
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('q'), '海珠');
  assert.equal(url.searchParams.has('district'), false);
  assert.equal(url.searchParams.has('compare'), false);
  assert.equal(url.searchParams.has('deposit'), false);
});

test('header search from a static province page keeps the province', () => {
  const href = headerSearchHref('/quanguo/cankao/', ' 颐养 ',
    '/quanguo/cankao/sheng/p-e69f6da6173d/page/2/', '');
  const url = new URL(href, 'https://example.test');
  assert.equal(url.pathname, '/quanguo/cankao/');
  assert.equal(url.searchParams.get('province'), 'p-e69f6da6173d');
  assert.equal(url.searchParams.get('q'), '颐养');
  assert.equal(url.searchParams.has('page'), false);
});

test('site search preserves the institution reference area and offers its own entry', () => {
  const html = renderToStaticMarkup(withNavigation('/quanguo/cankao/', '',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.doesNotMatch(html, /<form\b/);
  assert.match(html, /href="\/quanguo\/cankao"[^>]*>找养老机构<\/a>/);
  const href = headerSearchHref('/quanguo/cankao/', ' 新词 ', '/quanguo/cankao/detail/',
    '?province=p-abc&city=c-def&id=qi-old-2&page=3');
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('q'), '新词');
  assert.equal(url.searchParams.get('province'), 'p-abc');
  assert.equal(url.searchParams.get('city'), 'c-def');
  assert.equal(url.searchParams.has('page'), false);
  assert.equal(url.searchParams.has('id'), false);
});

test('Guangzhou entry points to nationwide official records separately from candidates', () => {
  const html = renderToStaticMarkup(React.createElement(GuangzhouPage));
  assert.match(html, /查全国官方来源/);
  assert.match(html, /href="\/quanguo\/laiyuan"/);
  assert.match(html, /不代表全国完整机构名录/);
  assert.doesNotMatch(html, /href="\/guangdong\/jigou/);
  assert.match(html, /查全国机构线索/);
  assert.match(html, /href="\/quanguo\/cankao"/);
});

test('home starts with a province and keyword search and distinguishes the Guangzhou official list', () => {
  const home = renderToStaticMarkup(React.createElement(HomePage));
  const form = home.match(/<form\b[^>]*action="(?:\/eldercare)?\/quanguo\/cankao\/?"[^>]*>/)?.[0];
  assert.ok(form, '首页应直接提供全国机构线索搜索');
  assert.match(home, /<select\b[^>]*name="province"[^>]*required/);
  assert.match(home, /<input\b[^>]*name="q"[^>]*>/);
  assert.match(home, /href="(?:\/eldercare)?\/guangzhou\/jigou\/?"/);
  assert.match(home, /广州官方名单/);
  assert.match(home, /核对官方来源/);
});

test('header offers real navigation without disabled visitor actions or duplicate home search', () => {
  const header = renderToStaticMarkup(withNavigation('/', '',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.match(header, /<summary[^>]*>菜单<\/summary>/);
  assert.match(header, /href="(?:\/eldercare)?\/quanguo\/cankao\/?"[^>]*>找养老机构<\/a>/);
  assert.match(header, /href="(?:\/eldercare)?\/quanguo\/laiyuan\/?"[^>]*>官方来源<\/a>/);
  assert.doesNotMatch(header, /<button[^>]*disabled/);
  assert.doesNotMatch(header, /<form\b/);
});

