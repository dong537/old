import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../app/page';
import RulesPage from '../app/rules/page';
import CorrectionPage from '../app/corrections/page';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';
import { summarizeMcaCatalog } from '../lib/mca-catalog-scope';
import { correctionIssueHref } from '../lib/correction-channel';
import { McaPublicDirectoryContent } from '../components/McaPublicDirectoryView';

Object.assign(globalThis, { React });

test('主目录统一使用合并平台 ID 和有详情 ID 的不同口径', () => {
  const manifest = mcaCatalogLoader.getManifest();
  const scope = summarizeMcaCatalog(manifest);
  assert.equal(scope.recordCount, manifest.recordCount);
  assert.equal(scope.detailCount, manifest.detailCount);
  assert.equal(scope.indexOnlyCount, manifest.recordCount - manifest.detailCount);
  assert.equal(scope.csvRowCount, manifest.csvRowCount);
  assert.equal(scope.csvStaleCount, manifest.csvStaleCount);
  assert.equal(scope.csvExportDate, manifest.csvExportDate);
  assert.equal(scope.nationalComplete, false);
  assert.equal(scope.currentStatusVerified, false);
});

test('首页与方法论使用同一清单并解释非全量、非当前状态', () => {
  const scope = summarizeMcaCatalog(mcaCatalogLoader.getManifest());
  const home = renderToStaticMarkup(React.createElement(HomePage));
  const rules = renderToStaticMarkup(React.createElement(RulesPage));
  for (const html of [home, rules]) {
    assert.ok(html.includes(scope.recordCount.toLocaleString('zh-CN') + ' 个不重复平台 ID'));
    assert.ok(html.includes(scope.detailCount.toLocaleString('zh-CN') + ' 条有详情'));
    assert.ok(html.includes(scope.indexOnlyCount.toLocaleString('zh-CN') + ' 条仅有索引'));
    assert.match(html, /非全国全量|不代表全国全量/);
    assert.match(html, /不代表当前在营/);
  }
});

test('平台目录同样区分有详情与仅有索引的数量', () => {
  const manifest = mcaCatalogLoader.getManifest();
  const scope = summarizeMcaCatalog(manifest);
  const html = renderToStaticMarkup(React.createElement(McaPublicDirectoryContent, {
    manifest, records: mcaCatalogLoader.getIndex().records, params: new URLSearchParams(),
  }));
  assert.ok(html.includes(scope.recordCount.toLocaleString('zh-CN') + ' 个不重复平台 ID'));
  assert.ok(html.includes(scope.detailCount.toLocaleString('zh-CN') + ' 条有详情'));
  assert.ok(html.includes(scope.indexOnlyCount.toLocaleString('zh-CN') + ' 条仅有索引'));
  assert.ok(html.includes(scope.csvStaleCount.toLocaleString('zh-CN') + ' 条待刷新'));
});

test('机构纠错链接只在工单标题提示平台 ID，保留公开 Issues 入口', () => {
  const id = 'BA7E6A754BB0A66AE053E897A6C0B507';
  const issueUrl = new URL(correctionIssueHref(id));
  assert.equal(issueUrl.hostname, 'github.com');
  assert.equal(issueUrl.pathname, '/dong537/qqqqq/issues/new');
  assert.equal(issueUrl.searchParams.get('template'), 'institution-correction.yml');
  assert.match(issueUrl.searchParams.get('title') ?? '', new RegExp(id));
  assert.equal(issueUrl.searchParams.has('record_locator'), false);
  assert.doesNotMatch(issueUrl.href, /phone|contact|health|身份证/);
});

test('纠错说明页清楚说明公开渠道、提交门槛和证据核实', () => {
  const html = renderToStaticMarkup(React.createElement(CorrectionPage));
  assert.match(html, /GitHub 账号/);
  assert.match(html, /公开可见/);
  assert.match(html, /身份证|病历/);
  assert.match(html, /民政部平台目录填写平台 ID/);
  assert.match(html, /提交.*工单|创建.*工单/);
  assert.match(html, /核实/);
  assert.match(html, /issues\/new\?template=institution-correction.yml/);
});
