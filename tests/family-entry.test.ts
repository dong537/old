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

test('directory header keeps the nationwide search available', () => {
  const html = renderToStaticMarkup(withNavigation('/guangzhou/jigou/', 'q=颐福居',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.match(html, /<form\b[^>]*action="(?:\/eldercare)?\/quanguo\/pingtai\/?"/);
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

test('platform snapshot search keeps its source and active filters', () => {
  const href = headerSearchHref('/quanguo/pingtai/', ' 新词 ', '/quanguo/pingtai/BA7E6A754BB0A66AE053E897A6C0B507/',
    '?province=北京市&city=北京市&type=养老机构&page=3');
  const url = new URL(href, 'https://example.test');
  assert.equal(url.pathname, '/quanguo/pingtai/');
  assert.equal(url.searchParams.get('q'), '新词');
  assert.equal(url.searchParams.get('province'), '北京市');
  assert.equal(url.searchParams.get('city'), '北京市');
  assert.equal(url.searchParams.get('type'), '养老机构');
  assert.equal(url.searchParams.has('page'), false);
});

test('platform detail header searches nationwide institutions', () => {
  const html = renderToStaticMarkup(withNavigation('/quanguo/pingtai/BA7E6A754BB0A66AE053E897A6C0B507/', 'q=颐养',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.match(html, /<form\b[^>]*action="(?:\/eldercare)?\/quanguo\/pingtai\/?"/);
  assert.match(html, /<form\b[^>]*aria-label="搜索全国养老机构"/);
  assert.match(html, /<input\b[^>]*id="site-q"[^>]*value="颐养"/);
});

test('site search preserves the institution reference area and offers its own entry', () => {
  const html = renderToStaticMarkup(withNavigation('/quanguo/cankao/', '',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.match(html, /<form\b[^>]*action="(?:\/eldercare)?\/quanguo\/cankao\/?"/);
  assert.match(html, /href="\/quanguo\/cankao"[^>]*>企查查机构线索<\/a>/);
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

test('home starts with nationwide search and separates source types', () => {
  const home = renderToStaticMarkup(React.createElement(HomePage));
  const form = home.match(/<form\b[^>]*action="(?:\/eldercare)?\/quanguo\/pingtai\/?"[^>]*>/)?.[0];
  assert.ok(form, '首页应直接提供民政部平台部分采集快照搜索');
  assert.match(home, /<input\b[^>]*name="q"[^>]*>/);
  assert.match(home, /进入目录可按省市和设施类型筛选/);
  assert.match(home, /href="(?:\/eldercare)?\/quanguo\/cankao\/?"/);
  assert.match(home, /企查查机构线索/);
  assert.match(home, /核对官方来源/);
  assert.match(home, /登记主体候选/);
  assert.doesNotMatch(home, /href="(?:\/eldercare)?\/guangzhou\/jigou\/?"/);
  assert.match(home, /href="(?:\/eldercare)?\/quanguo\/pingtai\/?"/);
  assert.match(home, /民政部平台部分采集快照/);
});

test('home follows the observed portal order while keeping unsupported services explicit', () => {
  const home = renderToStaticMarkup(React.createElement(HomePage));
  const order = ['id="home-hero"', 'id="home-find"', 'id="service-query"', 'id="home-cost-policy"', 'aria-label="首页热点服务"', 'id="online-services"', 'id="home-verify"', 'id="region-index"', 'id="home-entrances"'];
  for (let index = 1; index < order.length; index++) {
    assert.ok(home.indexOf(order[index - 1]) < home.indexOf(order[index]), `wrong homepage section order: ${order[index]}`);
  }
  assert.match(home, /aria-label="办事指南类别"/);
  assert.match(home, /id="online-tab-personal" role="tab"[^>]*aria-selected="true"/);
  assert.match(home, /办理前查机构来源线索/);
  assert.match(home, /办理前核对资料日期/);
  assert.match(home, /按省份展开来源线索/);
  assert.doesNotMatch(home, /养老地图分类|elderlyCareMap|机构地图点位/);
  assert.match(home, /本站整理办事事项的办理口径/);
  assert.doesNotMatch(home, /预约成功|当前空床|立即申领/);
});

test('header keeps national source links available beside the main navigation', () => {
  const header = renderToStaticMarkup(withNavigation('/', '',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.match(header, /<summary[^>]*>.*网站导航<\/summary>/);
  assert.match(header, /全国/);
  assert.match(header, /href="(?:\/eldercare)?\/quanguo\/cankao\/?"[^>]*>企查查机构线索<\/a>/);
  assert.match(header, /href="(?:\/eldercare)?\/quanguo\/laiyuan\/?"[^>]*>官方来源<\/a>/);
  assert.match(header, /href="(?:\/eldercare)?\/quanguo\/zhuti\/?"[^>]*>登记主体<\/a>/);
  assert.match(header, /href="(?:\/eldercare)?\/quanguo\/pingtai\/?"[^>]*>找养老机构<\/a>/);
  assert.doesNotMatch(header, /href="(?:\/eldercare)?\/guangzhou\/jigou\/?"/);
  assert.doesNotMatch(header, /<button[^>]*disabled/);
  assert.match(header, /<form\b[^>]*action="(?:\/eldercare)?\/quanguo\/pingtai\/?"/);
});

test('header offers screenshot-style national quick links and category menus', () => {
  const header = renderToStaticMarkup(withNavigation('/', '',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  assert.match(header, /<nav aria-label="快捷入口"/);
  assert.match(header, /aria-controls="site-mega-menu"/);
  assert.match(header, /<nav aria-label="主导航"[\s\S]*?>[\s\S]*养老院[\s\S]*养老服务[\s\S]*政策保障[\s\S]*用户服务/);
  for (const href of ['/quanguo/pingtai', '/quanguo/shangmen', '/quanguo/changhuxian',
    '/quanguo/jiage', '/quanguo/bangdan', '/quanguo/laiyuan', '/corrections']) {
    assert.ok(header.includes('href="' + href + '"'), href);
  }
  assert.doesNotMatch(header, /东营|移动端 App|用户中心|href="#"/);
  const quick = header.match(/<nav aria-label="快捷入口"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.ok(quick.indexOf('id="site-mega-menu"') > quick.indexOf('aria-controls="site-mega-menu"'));
  assert.ok(quick.indexOf('id="site-mega-menu"') < quick.indexOf('全国机构'));
  const mobile = header.match(/<nav aria-label="移动端导航"[\s\S]*?<\/nav>/)?.[0] ?? '';
  for (const href of ['/zhengce', '/quanguo/banshi', '/corrections']) {
    assert.ok(mobile.includes('href="' + href + '"'), href);
  }
});

test('portal header opens all four national prototype categories in order', () => {
  const header = renderToStaticMarkup(withNavigation('/', '',
    React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
  const desktop = header.match(/<nav aria-label="主导航"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const labels = ['首页', '找养老机构', '找上门服务', '长护险指南', '价格参考', '榜单', '方法论'];
  for (const label of labels) {
    assert.ok(desktop.includes(label), label);
  }
  for (let index = 1; index < labels.length; index++) {
    assert.ok(desktop.indexOf(labels[index - 1]) < desktop.indexOf(labels[index]), labels[index]);
  }
  assert.ok(desktop.includes('href="/quanguo/pingtai"'));
  assert.ok(desktop.includes('href="/rules"'));
  for (const [route, label] of [['shangmen', '找上门服务'], ['changhuxian', '长护险指南'], ['jiage', '价格参考'], ['bangdan', '榜单']]) {
    assert.match(desktop, new RegExp('href="/quanguo/' + route + '"[^>]*>' + label + '</a>'));
  }
  assert.doesNotMatch(desktop, /待开放|aria-disabled/);
  assert.doesNotMatch(desktop, /养老地图|elderlyCareMap/);
  assert.doesNotMatch(desktop, /href="\/guangzhou\//);
  assert.doesNotMatch(desktop, /target="_blank"/);
  assert.doesNotMatch(desktop, /yanglao\.mca\.gov\.cn/);
  assert.ok(header.includes('href="/quanguo/laiyuan"'));
  assert.ok(header.includes('href="/quanguo/zhuti"'));
});

test('the four opened pages keep their own category active alongside the nationwide search', () => {
  for (const [route, label] of [['shangmen', '找上门服务'], ['changhuxian', '长护险指南'], ['jiage', '价格参考'], ['bangdan', '榜单']]) {
    const html = renderToStaticMarkup(withNavigation('/quanguo/' + route + '/', '',
      React.createElement(SiteHeader, { publishedAt: catalog.source.publishedAt })));
    assert.match(html, new RegExp('<a\\b(?=[^>]*aria-current="page")(?=[^>]*href="/quanguo/' + route + '")[^>]*>' + label + '</a>'));
    assert.match(html, /<form\b[^>]*action="(?:\/eldercare)?\/quanguo\/pingtai\/?"/);
  }
});
