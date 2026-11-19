import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { ProvinceSourceRecord } from '../lib/province-types';
import { searchProvinceRecords } from '../lib/province-search';
import { ProvinceDirectoryView } from '../components/ProvinceDirectoryView';
import { ProvinceReturnToList } from '../components/ProvinceReturnToList';
import { ProvinceSourceLink } from '../components/ProvinceSourceLink';
import ProvinceRecordPage, { generateStaticParams } from '../app/guangdong/jigou/[id]/page';
import provinceSnapshot from '../public/data/guangdong-source-records.v1.json';

Object.assign(globalThis, { React });

const makeRecord = (index: number, city = '广州市', name = `养老线索${index}`): ProvinceSourceRecord => ({
  id: `gd-source-${String(index).padStart(6, '0')}`,
  city,
  name,
  evidenceType: '名录',
  sourceUrl: 'https://example.gov.cn/source',
  sourcePublishedAt: null,
  sourceAsOf: null,
  sourceStatusNote: null,
});

const records = Array.from({ length: 25 }, (_, index) => makeRecord(index + 1));
records[5] = makeRecord(6, '深圳市', '南山颐养中心');
records[20] = makeRecord(21, '深圳市', '福田长者服务中心');

test('省级来源记录保留原始顺序，每页展示20条', () => {
  const first = searchProvinceRecords(records, {});
  assert.equal(first.total, 25);
  assert.deepEqual(first.items.map(item => item.id), records.slice(0, 20).map(item => item.id));
  assert.equal(first.pageCount, 2);
  assert.equal(searchProvinceRecords(records, { page: '2' }).items.length, 5);
});

test('城市与多关键词同时约束结果，词可命中名称和城市', () => {
  assert.deepEqual(searchProvinceRecords(records, { city: '深圳市', q: ' 南山 颐养 ' }).items.map(item => item.id), ['gd-source-000006']);
  assert.equal(searchProvinceRecords(records, { q: '深圳市 长者' }).total, 1);
  assert.equal(searchProvinceRecords(records, { city: '广州市', q: '南山' }).total, 0);
});

test('非法城市、页码和过长检索词有可见纠正提示', () => {
  const invalid = searchProvinceRecords(records, { city: '不在范围内', page: '-1', q: '院'.repeat(81) });
  assert.equal(invalid.city, '');
  assert.equal(invalid.page, 1);
  assert.equal([...invalid.q].length, 80);
  assert.equal(invalid.issues.length, 3);
  for (const page of ['0', '1.5', '01', '1e2', 'Infinity', '9007199254740993']) {
    assert.equal(searchProvinceRecords(records, { page }).page, 1);
  }
  assert.equal(searchProvinceRecords(records, { page: '999' }).page, 2);
});

test('无匹配结果仍返回可恢复的第一页', () => {
  const result = searchProvinceRecords(records, { city: '深圳市', q: '不存在的记录', page: '9' });
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
  assert.equal(result.page, 1);
  assert.equal(result.pageCount, 1);
  assert.ok(result.issues.length);
});

test('列表按城市展示来源记录和证据时间，不暗示当前运营状态', () => {
  const cities = ['广州市', '深圳市'];
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ city: '深圳市' }),
  }, React.createElement(ProvinceDirectoryView, { records, cities })));
  assert.match(html, /<select[^>]*name="city"/);
  assert.match(html, /共.*2.*条来源记录/);
  assert.match(html, /南山颐养中心/);
  assert.match(html, /福田长者服务中心/);
  assert.match(html, /证据类型/);
  assert.match(html, /来源发布日期/);
  assert.match(html, /资料期/);
  assert.match(html, /原文未说明/);
  assert.match(html, /各市仅收录一份官方逐名来源/);
  assert.match(html, /社区、居家服务中心和医院/);
  assert.match(html, /缺少逐行原件校验或可定位源行号/);
  assert.doesNotMatch(html, /在线预约|可入住|确认在营/);
});

test('同城同名来源记录显示未合并提示', () => {
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ city: '深圳市', q: '南山' }),
  }, React.createElement(ProvinceDirectoryView, { records: [...records, makeRecord(26, '深圳市', '南山颐养中心')], cities: ['广州市', '深圳市'] })));
  assert.match(html, /共.*2.*条来源记录/);
  assert.match(html, /同城同名.*2.*条.*未合并/);
});

test('广州来源记录提示与既有235档案可能重合并提供入口', () => {
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ city: '广州市' }),
  }, React.createElement(ProvinceDirectoryView, { records, cities: ['广州市', '深圳市'] })));
  assert.match(html, /同名可能与广州既有档案重合/);
  assert.match(html, /不相加、不合并身份/);
  assert.match(html, /href="\/(?:eldercare\/)?guangzhou\/jigou\/"/);
});

test('来源详情仅接受省目录白名单返回地址', () => {
  const render = (from: string) => renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ from }),
  }, React.createElement(ProvinceReturnToList)));
  const valid = render('/guangdong/jigou/?city=深圳市&q=颐养&page=2');
  assert.match(valid, /href="\/(?:eldercare\/)?guangdong\/jigou\/\?city=/);
  assert.match(valid, /保留筛选/);
  for (const from of ['https://example.test/guangdong/jigou/', '//example.test/', '/rules/', '/guangdong/jigou/?next=https://example.test/']) {
    assert.match(render(from), /href="\/(?:eldercare\/)?guangdong\/jigou\/"/);
  }
});

test('静态详情逐条公开来源记录，不生成未核实服务承诺', async () => {
  assert.equal(generateStaticParams().length, 781);
  const first = provinceSnapshot.records[0];
  const content = await ProvinceRecordPage({ params: Promise.resolve({ id: first.id }) });
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams(),
  }, content));
  assert.match(html, new RegExp(first.name));
  assert.match(html, /来源记录 · 待核线索/);
  assert.match(html, /aria-label="本页目录"/);
  for (const section of ['overview', 'fields', 'sources', 'checklist']) {
    assert.ok(html.includes('id="' + section + '"'), section + ' must have a matching section');
    assert.ok(html.includes('href="#' + section + '"'), section + ' must be reachable from the archive TOC');
  }
  assert.match(html, /核对这条官方记录/);
  assert.match(html, /href="\/(?:eldercare\/)?quanguo\/laiyuan\/"/);
  assert.match(html, /来源发布日期/);
  assert.match(html, /资料期/);
  assert.match(html, /不能统称已登记养老机构/);
  assert.match(html, /查看官方原始来源/);
  assert.doesNotMatch(html, /在线预约|可入住|确认在营/);
  const from = '/quanguo/laiyuan/?province=guangdong&city=%E5%B9%BF%E5%B7%9E&q=%E8%80%81%E4%BA%BA';
  const fromNational = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ from }),
  }, content));
  assert.match(fromNational, /返回全国官方来源（保留筛选）/);
  assert.match(fromNational, /href="\/(?:eldercare\/)?quanguo\/laiyuan\/\?province=guangdong/);
});

test('省级目录链接服从隔离前缀，外部来源仅允许安全协议', () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
      value: new URLSearchParams({ city: '深圳市' }),
    }, React.createElement(ProvinceDirectoryView, { records, cities: ['广州市', '深圳市'] })));
    assert.match(html, /action="\/eldercare\/guangdong\/jigou\/"/);
    assert.match(html, /href="\/eldercare\/guangdong\/jigou\/gd-source-000006\//);
    assert.match(html, /href="https:\/\/example.gov.cn\/source"/);
    const unsafe = renderToStaticMarkup(React.createElement(ProvinceSourceLink, { url: 'javascript:alert(1)' }));
    assert.doesNotMatch(unsafe, /href=/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('来源当时的暂停营业提示在结果卡片显著标出', () => {
  const warned = records.map(record => record.id === 'gd-source-000006'
    ? { ...record, sourceStatusNote: '来源当时标注：暂停营业' } : record);
  const html = renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams({ q: '南山' }),
  }, React.createElement(ProvinceDirectoryView, { records: warned, cities: ['广州市', '深圳市'] })));
  assert.match(html, /text-caution[^>]*>原文状态提示：来源当时标注：暂停营业/);
});
