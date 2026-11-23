import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PriceReferencePage from '../app/quanguo/jiage/page';
import { PriceReferenceContent } from '../components/PriceReferenceView';
import { buildPriceReference } from '../lib/price-reference';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';

Object.assign(globalThis, { React });

test('价格路由用真实样本输出可读正文、方法与机构详情出口', () => {
  const html = renderToStaticMarkup(PriceReferencePage());
  assert.match(html, /全国养老机构价格参考/);
  assert.match(html, /2,328/);
  assert.match(html, /月总费用/);
  assert.match(html, /不是成交价/);
  assert.match(html, /数据来源与计算方法/);
  assert.match(html, /\/quanguo\/pingtai\//);
  assert.doesNotMatch(html, /失能档位|按老人情况分档|月费中位数|虚构|seed\.ts/);
});

test('价格明细保留零值说明、采集日期、官网和返回条件；无结果可清除', () => {
  const data = buildPriceReference(mcaCatalogLoader.getIndex().records);
  const zero = data.records.find(record => record.min === 0 && record.max === 0);
  assert.ok(zero);
  const params = new URLSearchParams({ province: zero.province, city: zero.city, q: zero.name });
  const html = renderToStaticMarkup(React.createElement(PriceReferenceContent, { data, query: params.toString() }));
  assert.match(html, /来源原值，不代表免费/);
  assert.ok(html.includes(zero.updatedAt));
  assert.match(html, /yanglao\.mca\.gov\.cn/);
  assert.match(html, /from=%2Fquanguo%2Fjiage%2F/);
  const empty = renderToStaticMarkup(React.createElement(PriceReferenceContent, { data, query: new URLSearchParams({ q: '这是一个绝对不存在的养老机构名称' }).toString() }));
  assert.match(empty, /没有符合条件的月费记录/);
  assert.match(empty, /清除筛选/);
});

test('带部署前缀时价格筛选、分页和详情链接只添加一次 basePath', () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const data = buildPriceReference(mcaCatalogLoader.getIndex().records);
    const html = renderToStaticMarkup(React.createElement(PriceReferenceContent, { data, query: new URLSearchParams({ province: '河北省' }).toString() }));
    assert.match(html, /action="\/eldercare\/quanguo\/jiage\/"/);
    assert.match(html, /href="\/eldercare\/quanguo\/pingtai\//);
    assert.match(html, /href="\/eldercare\/quanguo\/jiage\/\?/);
    assert.doesNotMatch(html, /eldercare\/eldercare/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});
