import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { McaDetailReturnLink } from '../components/McaDetailReturnLink';

function render(from: string | null): string {
  const params = new URLSearchParams();
  if (from !== null) params.set('from', from);
  return renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, { value: params },
    React.createElement(McaDetailReturnLink)));
}

test('detail returns to the same filtered national list when context is valid', () => {
  const html = render('/quanguo/pingtai/?q=%E5%8C%97%E4%BA%AC&page=2');
  assert.match(html, /href="\/quanguo\/pingtai\/\?q=%E5%8C%97%E4%BA%AC&amp;page=2"/);
  assert.match(html, /返回筛选结果/);
});

test('detail rejects an external return path', () => {
  assert.match(render('https://outside.example/'), /href="\/quanguo\/pingtai\/"/);
});

test('detail returns to the same home-service search and rejects unrelated parameters', () => {
  const html = render('/quanguo/shangmen/?province=%E5%8C%97%E4%BA%AC%E5%B8%82&item=%E5%8A%A9%E6%B5%B4&page=2');
  assert.match(html, /href="\/quanguo\/shangmen\/\?province=%E5%8C%97%E4%BA%AC%E5%B8%82&amp;item=%E5%8A%A9%E6%B5%B4&amp;page=2"/);
  assert.match(html, /返回筛选结果/);
  assert.match(render('/quanguo/shangmen/?redirect=https://outside.example'), /href="\/quanguo\/pingtai\/"/);
  assert.match(render('/quanguo/shangmen/?page=0'), /href="\/quanguo\/pingtai\/"/);
});

test('detail can return to price references without allowing external or duplicate state', () => {
  assert.match(render('/quanguo/jiage/?province=%E5%A4%A9%E6%B4%A5%E5%B8%82&page=3'), /href="\/quanguo\/jiage\/\?province=%E5%A4%A9%E6%B4%A5%E5%B8%82&amp;page=3"/);
  for (const invalid of ['/quanguo/jiage/?page=1&page=2', '//outside.example/quanguo/jiage/', '/quanguo/jiage/#fake', '/quanguo/jiage/?type=unknown']) {
    assert.match(render(invalid), /href="\/quanguo\/pingtai\/"/);
  }
});
