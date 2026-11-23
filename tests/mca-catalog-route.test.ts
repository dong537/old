import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import McaDetailPage, { generateStaticParams } from '../app/quanguo/pingtai/[id]/page';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';

test('全国目录按平台 ID 合并原有索引与 3,497 条 CSV，并给所有 CSV 行生成详情', () => {
  const manifest = mcaCatalogLoader.getManifest();
  const index = mcaCatalogLoader.getIndex();
  const ids = generateStaticParams().map(item => item.id);
  assert.equal(manifest.csvRowCount, 3497);
  assert.equal(manifest.observedRecordCount, 3726);
  assert.equal(manifest.overlapCount, 703);
  assert.equal(manifest.recordCount, 6520);
  assert.equal(manifest.detailCount, 3597);
  assert.equal(index.records.length, 6520);
  assert.equal(new Set(index.records.map(item => item.mcaId)).size, 6520);
  assert.equal(ids.length, 3597);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(index.records.filter(item => item.sourceKind === 'csv').length, 3497);
  assert.equal(index.records.filter(item => item.collectorStatus === 'stale').length, 3);
});

test('CSV 首、中、末和 stale 机构均有可读详情，不冒充在营或展示图片文件', async () => {
  const csv = mcaCatalogLoader.getIndex().records.filter(item => item.sourceKind === 'csv');
  const samples = [csv[0], csv[Math.floor(csv.length / 2)], csv.at(-1), ...csv.filter(item => item.collectorStatus === 'stale')];
  for (const record of samples) {
    assert.ok(record);
    const detail = mcaCatalogLoader.getCsvDetail(record.mcaId);
    assert.ok(detail);
    const page = await McaDetailPage({ params: Promise.resolve({ id: record.mcaId }) });
    const html = renderToStaticMarkup(page);
    assert.ok(html.includes(record.name ?? ''), record.mcaId);
    assert.match(html, /全国养老服务信息平台/);
    const forbidden = html.match(/images_json|图片文件名|机构图片记录|机构状态：在营/);
    assert.ok(!forbidden, record.mcaId + ': ' + (forbidden ? html.slice((forbidden.index ?? 0) - 80, (forbidden.index ?? 0) + 90) : ''));
    if (record.collectorStatus === 'stale') assert.match(html, /资料待刷新|采集状态待刷新/);
  }
});
