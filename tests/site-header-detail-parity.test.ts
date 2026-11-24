import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { SiteHeader } from '../components/SiteHeader';

Object.assign(globalThis, { React });

function renderHeader(pathname: string): string {
  return renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: { push: () => undefined } as never },
      React.createElement(PathnameContext.Provider, { value: pathname },
        React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() },
          React.createElement(SiteHeader, { publishedAt: '2026-11-21', showMcaPreview: true })))),
  );
}

test('national platform institution detail keeps the institution category active in the shared navigation', () => {
  const html = renderHeader('/quanguo/mca-preview/detail/');
  const desktop = html.match(/<nav aria-label="主导航"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.match(desktop, /<a\b(?=[^>]*aria-current="page")(?=[^>]*href="\/quanguo\/pingtai")[^>]*>找养老机构<\/a>/);
  assert.doesNotMatch(desktop, /<a\b(?=[^>]*aria-current="page")(?=[^>]*href="\/")[^>]*>首页<\/a>/);
});

test('desktop and mobile navigation keep the original green treatment and recognizable groups', () => {
  const html = renderHeader('/');
  assert.match(html, /class="[^"]*bg-\[#2e861f\][^"]*"/);
  assert.match(html, /class="[^"]*bg-\[#67ad13\][^"]*"/);
  assert.match(html, /class="[^"]*bg-\[#0e8521\][^"]*"/);
  assert.match(html, /aria-controls="site-mega-menu"/);
  assert.match(html, /<nav aria-label="主导航"[^>]*lg:grid-cols-8/);
  assert.match(html, /<nav aria-label="移动端导航"/);
});

test('desktop dropdown panels are present for motion but not interactive when collapsed', () => {
  const html = renderHeader('/');
  for (const id of ['site-mega-menu', 'site-menu-institutions', 'site-menu-policy']) {
    const tag = html.match(new RegExp('<div id="' + id + '"[^>]*>'))?.[0] ?? '';
    assert.match(tag, /data-nav-panel="closed"/);
    assert.match(tag, /aria-hidden="true"/);
    assert.match(tag, /\binert=""/);
    assert.doesNotMatch(tag, /class="hidden /);
  }
  assert.match(html, /<details class="site-nav-mobile lg:hidden"/);
  assert.match(html, /class="site-nav-chevron/);
});

test('desktop category and mega-menu triggers share a hover boundary with their panels', () => {
  const html = renderHeader('/');
  for (const [key, id] of [['all', 'site-mega-menu'], ['institutions', 'site-menu-institutions'], ['policy', 'site-menu-policy']]) {
    const wrapper = html.indexOf('data-nav-hover="' + key + '"');
    const button = html.indexOf('aria-controls="' + id + '"');
    const panel = html.indexOf('id="' + id + '"');
    assert.ok(wrapper >= 0 && wrapper < button && button < panel, key);
  }
  assert.match(html, /<details class="site-nav-mobile lg:hidden"/);
});
