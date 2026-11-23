import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { filterHomeServices, homeServiceListHref, projectHomeService, type HomeServiceRecord } from '../lib/national-home-services';
import { getNationalHomeServices } from '../lib/national-home-services-static';
import { NationalHomeServiceContent } from '../components/NationalHomeServiceDirectory';
import NationalLtciGuide from '../app/quanguo/changhuxian/page';
import { ltciGuide } from '../lib/ltci-guide';
import { sitePath } from '../lib/site-path';
import McaDetailPage from '../app/quanguo/pingtai/[id]/page';

Object.assign(globalThis, { React });

const source = {
  org_id: 'fixture-100', name: '北京示例护理机构', area: '北京市朝阳区', address: null,
  services: ['机构服务'], home_service_project: null as string | null,
  updated_at: '2026-11-22T10:00:00', status: 'ok' as const,
};

test('home services require an explicit category or project, never a zero price or name inference', () => {
  assert.equal(projectHomeService({ mcaId: source.org_id, regionPath: '北京市/朝阳区' }, source), null);
  const record = projectHomeService({ mcaId: source.org_id, regionPath: '北京市/朝阳区' }, { ...source, services: ['居家养老上门服务'], home_service_project: '生活照料服务,健康管理服务' });
  assert.ok(record);
  assert.equal(record.province, '北京市');
  assert.equal(record.city, '朝阳区');
  assert.deepEqual(record.projects, ['生活照料服务', '健康管理服务']);
  assert.deepEqual(record.evidence, ['服务类别', '上门服务项目']);
  assert.equal(record.updatedAtLocal, source.updated_at);
});

test('home service filtering retains URL state, combines criteria, and clamps pages', () => {
  const fixture: HomeServiceRecord[] = [
    { id: 'fixture-100', name: '甲养老院', province: '北京市', city: '朝阳区', area: '北京市朝阳区', address: '东路一号', categories: ['居家养老上门服务'], projects: ['生活照料服务'], evidence: ['服务类别', '上门服务项目'], updatedAtLocal: source.updated_at, collectorStatus: 'ok' },
    { id: 'fixture-101', name: '乙养老院', province: '河北省', city: '石家庄市', area: '河北省石家庄市', address: null, categories: [], projects: ['健康管理服务'], evidence: ['上门服务项目'], updatedAtLocal: source.updated_at, collectorStatus: 'stale' },
  ];
  const result = filterHomeServices(fixture, new URLSearchParams('province=北京市&city=朝阳区&item=生活照料服务&q=甲&page=999'));
  assert.equal(result.total, 1);
  assert.equal(result.page, 1);
  assert.equal(result.items[0].id, 'fixture-100');
  assert.deepEqual(result.cities, ['朝阳区']);
  assert.match(homeServiceListHref(result.selected, 2), /^\/quanguo\/shangmen\/\?/);
  assert.equal(new URL(homeServiceListHref(result.selected, 2), 'https://example.test').searchParams.get('item'), '生活照料服务');
  assert.equal(filterHomeServices(fixture, new URLSearchParams('q=不存在')).total, 0);
});

test('real home service projection is complete within the locked CSV and links unique platform IDs', () => {
  const catalog = getNationalHomeServices();
  assert.equal(catalog.records.length, 1746);
  assert.equal(new Set(catalog.records.map(record => record.id)).size, 1746);
  assert.deepEqual(catalog.provinces, ['北京市', '天津市', '山西省', '河北省', '内蒙古自治区'].sort((a, b) => a.localeCompare(b, 'zh-CN')));
  assert.equal(catalog.exportDate, '2026-11-23');
  for (const record of catalog.records) assert.ok(record.evidence.length > 0);
});

test('home service cards show source scope, projects, detail links and a recoverable empty state', () => {
  const catalog = getNationalHomeServices();
  const html = renderToStaticMarkup(React.createElement(NationalHomeServiceContent, { catalog, query: 'province=北京市' }));
  assert.match(html, /城市／区县/);
  assert.match(html, /服务项目/);
  assert.match(html, /CSV 导出日期/);
  assert.match(html, /机构所在地不等于上门服务范围/);
  assert.ok(html.includes('#mca-public-service'));
  assert.doesNotMatch(html, /立即预约|免费上门|可信度 [ABCD]|长护险定点（居家护理）/);
  const empty = renderToStaticMarkup(React.createElement(NationalHomeServiceContent, { catalog, query: 'q=确定不存在的名称123456789' }));
  assert.match(empty, /没有符合条件的记录/);
  assert.ok(empty.includes(`href="${sitePath('/quanguo/shangmen/')}"`));
});

test('a category-only home service link lands on a section that exists in its real detail', async () => {
  const catalog = getNationalHomeServices();
  const record = catalog.records.find(item => item.id === '0605175104f397e2d5b5e3c1c972a501');
  assert.ok(record);
  const html = renderToStaticMarkup(React.createElement(NationalHomeServiceContent, {
    catalog: { ...catalog, records: [record] }, query: '',
  }));
  const target = html.match(/href="([^"]+#mca-public-[^"]+)"/);
  assert.ok(target);
  const hash = new URL(target[1].replaceAll('&amp;', '&'), 'https://example.test').hash.slice(1);
  const detail = renderToStaticMarkup(await McaDetailPage({ params: Promise.resolve({ id: record.id }) }));
  assert.ok(detail.includes(`id="${hash}"`), `详情缺少目标区域：${hash}`);
});

test('unknown URL filters remain selected and visibly explain that no snapshot records match', () => {
  const html = renderToStaticMarkup(React.createElement(NationalHomeServiceContent, {
    catalog: getNationalHomeServices(), query: 'province=未知省份&city=未知城市&item=未知项目',
  }));
  for (const value of ['未知省份', '未知城市', '未知项目']) {
    assert.ok(html.includes(`value="${value}" selected=""`));
    assert.ok(html.includes(`${value}（当前资料无记录）`));
  }
});

test('national LTCI guide retains dist FAQ and two care paths without nationwide entitlement claims', () => {
  const html = renderToStaticMarkup(React.createElement(NationalLtciGuide));
  assert.match(html, /<details/);
  assert.match(html, /机构护理/);
  assert.match(html, /居家护理/);
  assert.match(html, /不同地区/);
  assert.match(html, /目前可查的详细办理资料：广州/);
  assert.ok(html.includes(`href="${sitePath('/guangzhou/changhuxian/')}"`));
  assert.ok(html.includes(`href="${sitePath('/quanguo/shangmen/')}"`));
  for (const item of ltciGuide.sources) assert.ok(html.includes(item.url));
  assert.doesNotMatch(html, /FAQPage|全部定点机构|2028|立即申请|\d+\s*[%％元]/);
});
