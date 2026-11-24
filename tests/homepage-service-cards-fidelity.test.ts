import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../app/page';

Object.assign(globalThis, { React });

test('首页按全国机构主流程展示真实入口和检索', () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  const entries = html.slice(html.indexOf('aria-label="首页主要入口"'), html.indexOf('aria-label="首页热点服务"'));
  const labels = ['养老院查询', '机构线索', '官方来源', '上门服务'];
  for (const label of labels) assert.ok(entries.includes(label), label);
  for (let index = 1; index < labels.length; index++) {
    assert.ok(entries.indexOf(labels[index - 1]) < entries.indexOf(labels[index]));
  }
  assert.match(entries, /href="\/quanguo\/shangmen\/?"/);
  assert.match(html, /action="\/quanguo\/pingtai\/?"/);
  assert.match(html, /id="region-shortcuts"/);
  assert.doesNotMatch(entries, /尚未开放|建设中|homeServiceList/);
});
