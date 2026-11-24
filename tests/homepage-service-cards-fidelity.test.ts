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

test('首页内容保留原版区域和卡片样式，在原热点栏提供费用和政策链接', () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  assert.equal([...html.matchAll(/role="search"/g)].length, 1);
  const hot = html.match(/<nav aria-label="首页热点服务"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.match(hot, /class="home-portal-hotLinks"/);
  assert.match(hot, /href="\/quanguo\/jiage\/?"/);
  assert.match(hot, /href="\/zhengce\/?"/);
  assert.match(html, /id="online-services-title"[^>]*>办事指南</);
});

test('首页分区目录与正文标题一致，语义分区依次呈现找机构、费用政策和核对来源', () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  const toc = html.match(/<nav aria-label="本页分区"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const flow = [
    ['home-find', '找养老机构', 'id="region-shortcuts"'],
    ['home-cost-policy', '看费用与政策', 'id="online-services"'],
    ['home-verify', '核对资料来源', 'id="home-entrances"'],
  ];
  let lastEnd = 0;
  for (const [id, name, child] of flow) {
    assert.ok(toc.includes('href="#' + id + '"'), name);
    const start = html.indexOf('<section id="' + id + '" aria-labelledby="' + id + '-title"');
    assert.ok(start > lastEnd, name);
    assert.match(html.slice(start), new RegExp('<h2 id="' + id + '-title"[^>]*>' + name + '</h2>'));
    const end = html.indexOf(child, start);
    assert.ok(end > start, child);
    lastEnd = end;
  }
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.match(html, /CSV 导出日期/);
});

test('首页在搜索框之后直达查机构和费用，下方独立展示资料解读与政策', () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  const quick = html.match(/<nav aria-label="搜索快捷入口"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.match(quick, /href="\/quanguo\/pingtai\/?"/);
  assert.match(quick, /href="\/quanguo\/jiage\/?"/);
  assert.ok(html.indexOf('</form>') < html.indexOf(quick));
  assert.ok(html.indexOf('id="home-find"') < html.indexOf('id="home-reading"'));
  assert.match(html, /href="[^"]+\/wenzhang\/longtan-zhaoru-bed-fee-source-guide\/?"/);
  assert.match(html, /id="home-reading-title"[^>]*>文章与政策解读</);
});
