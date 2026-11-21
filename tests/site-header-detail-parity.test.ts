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

test('national platform institution detail keeps the partial snapshot category active in the shared navigation', () => {
  const html = renderHeader('/quanguo/mca-preview/detail/');
  const desktop = html.match(/<nav aria-label="主导航"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.match(desktop, /<a\b(?=[^>]*aria-current="page")(?=[^>]*href="\/quanguo\/pingtai")[^>]*>平台采集快照（部分）<\/a>/);
  assert.doesNotMatch(desktop, /<a\b(?=[^>]*aria-current="page")(?=[^>]*href="\/")[^>]*>首页<\/a>/);
});
