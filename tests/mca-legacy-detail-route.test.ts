import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import McaDetailPage from '../app/quanguo/pingtai/[id]/page';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';
import { mcaPublicLoader } from '../lib/mca-public-static';

function escapedText(value: string): string {
  return renderToStaticMarkup(React.createElement('span', null, value)).slice(6, -7);
}

test('仅旧快照详情通过共享布局保留真实值、原有来源与官网出口', async () => {
  const records = mcaCatalogLoader.getIndex().records.filter(
    record => record.sourceKind === 'observed' && record.hasDetail,
  );
  assert.ok(records.length > 0, '目录至少应保留一条仅旧快照详情');

  for (const record of records) {
    const detail = mcaPublicLoader.getDetail(record.mcaId);
    assert.ok(detail, record.mcaId + ' 应保留旧快照详情');
    assert.equal(mcaCatalogLoader.getCsvDetail(record.mcaId), null,
      record.mcaId + ' 不能伪装为 CSV 详情');
    const page = await McaDetailPage({ params: Promise.resolve({ id: record.mcaId }) });
    const html = renderToStaticMarkup(page);

    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, record.mcaId + ' 应有唯一机构标题');
    if (record.name && !record.conflictFields.includes('name')) {
      assert.ok(html.includes(escapedText(record.name)), record.mcaId + ' 缺少机构名称');
    }
    for (const section of ['mca-public-fees', 'mca-public-basic', 'mca-public-service',
      'mca-public-contact', 'mca-public-source']) {
      assert.ok(html.includes('id="' + section + '"'), record.mcaId + ' 缺少 ' + section);
    }

    const data = detail.platformDetail;
    for (const field of [data.identity.address, data.introduction, data.service.content,
      data.service.team, data.service.hours, data.service.scope, data.service.explanation,
      data.contactName, data.contactPhone]) {
      if (field.state === 'observed' && field.value !== null) {
        assert.ok(html.includes(escapedText(field.value)), record.mcaId + ' 遗漏已观察的正文或联系值');
      }
    }
    assert.ok(html.includes(escapedText(detail.sourcePage)), record.mcaId + ' 官网出口不符');
    assert.ok(html.includes(detail.detailObservedAtUtc.earliest), record.mcaId + ' 缺少真实采集时间');
    assert.match(html, /该机构详情采集时间/);
    assert.match(html, /快照不代表实时在营、实时空床或最新报价/);
    assert.doesNotMatch(html, /CSV 文件日期|CSV 原件 SHA-256|采集状态原值：/,
      record.mcaId + ' 旧观察不能套用 CSV 来源声明');
    assert.doesNotMatch(html, /<img\b|images_json|图片记录|图片文件名|机构图片记录/,
      record.mcaId + ' 暂不展示图片或其内部记录');
  }
});
