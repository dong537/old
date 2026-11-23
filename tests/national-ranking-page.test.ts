import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NationalRankingPage from '../app/quanguo/bangdan/page';
import { NationalRankingView } from '../components/NationalRankingView';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';

test('榜单页沿用分类与单项卡片，但不把快照数据编成质量排名', () => {
  const page = NationalRankingPage();
  const [title, content] = React.Children.toArray(page.props.children) as React.ReactElement<{ title?: string }>[];
  assert.equal(title.props.title, '榜单');
  const html = renderToStaticMarkup(content);
  const manifest = mcaCatalogLoader.getManifest();
  assert.match(html, /榜单/);
  assert.match(html, /养老机构/);
  assert.match(html, /上门服务/);
  assert.equal((html.match(/怎么算的/g) ?? []).length, 3);
  assert.equal((html.match(/本期未发布/g) ?? []).length, 4);
  assert.ok(html.includes(manifest.recordCount.toLocaleString('zh-CN')));
  assert.ok(html.includes(manifest.csvExportDate));
  assert.match(html, /不是全国全量或实时营业名单/);
  assert.doesNotMatch(html, /已认领并核验|A级|B级|C级|D级|本月第1名|入住预约/);
  assert.match(html, /href="\/quanguo\/pingtai\/?"/);
});

test('类别切换按钮具有可读的按下状态和足够大的点击面积', () => {
  const html = renderToStaticMarkup(React.createElement(NationalRankingView, {
    snapshotDate: '2026-11-23', recordCount: 6520, csvRowCount: 3497,
  }));
  assert.match(html, /role="group" aria-label="榜单类别"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /min-h-11/);
});
