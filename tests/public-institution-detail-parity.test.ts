import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicInstitutionDetailSections, PublicInstitutionSummary, PublicInstitutionHero, PublicInstitutionBottomNav } from '../components/PublicInstitutionDetailSections';
import { NationalOfficialDetailContent } from '../components/NationalOfficialDetailView';
import { InstitutionReferenceDetailContent } from '../components/InstitutionReferenceDetailView';
import { mapOfficialInstitutionDetail, mapReferenceInstitutionDetail } from '../lib/institution-detail-dto';
import type { ReferenceDetailRecord, ReferenceManifest } from '../lib/institution-reference-types';
import type { NationalOfficialDetailRecord, NationalOfficialManifest, NationalOfficialSource } from '../lib/national-official-types';

Object.assign(globalThis, { React });

const source: NationalOfficialSource = {
  id: 'city-list', province: '河北省', city: '石家庄市', scope: '石家庄市',
  title: '民政机构名录', url: 'https://example.gov.cn/list', publishedAt: '2026-01-01',
  asOf: '2025-12-31', sha256: 'a'.repeat(64), rowCount: 1,
};
const official: NationalOfficialDetailRecord = {
  id: 'item-1', sourceId: 'city-list', rowNumber: 1, name: '甲养老院',
  address: '甲路 1 号', beds: 0, residentCount: null, staffCount: null, services: '日间照护',
};
const reference: ReferenceDetailRecord = {
  id: 'ref-1', sourceRow: 2, name: '乙养老院', region: '河北省石家庄市', address: null,
  beds: 0, creditCode: null, codeStatus: 'missing', sourceFields: { 经度: 114.5, 纬度: 38.1 },
};

test('profile DTO exposes official-page fields with distinct missing states', () => {
  for (const dto of [mapOfficialInstitutionDetail(official, source), mapReferenceInstitutionDetail(reference)]) {
    const profile = (dto as unknown as { profile?: Record<string, { value: unknown; availability: string }> }).profile;
    assert.ok(profile, 'profile fields must be part of the DTO');
    for (const key of ['facilityType', 'starLevel', 'subsidyStatus', 'functionPositioning', 'tags', 'areaSqm', 'contactName', 'contactPhone', 'photos']) {
      assert.deepEqual([profile[key]?.value, profile[key]?.availability], [null, 'source_missing'], key);
    }
    assert.equal(dto.beds.total.value, 0);
    assert.equal(dto.beds.total.availability, 'recorded');
  }
  assert.deepEqual(mapOfficialInstitutionDetail(official, source).profile.mapPoint, {
    label: '地图坐标', value: null, availability: 'source_missing', source: 'official',
  });
  assert.deepEqual(mapReferenceInstitutionDetail(reference).profile.mapPoint, {
    label: '原表坐标（未核实）', value: { longitude: 114.5, latitude: 38.1 }, availability: 'recorded', source: 'reference',
  });
});

test('incomplete or invalid raw coordinates never become a map point', () => {
  for (const sourceFields of [{ 经度: '114.5', 纬度: '' }, { 经度: 'not a number', 纬度: '38.1' }, { 经度: 181, 纬度: 38.1 }]) {
    const dto = mapReferenceInstitutionDetail({ ...reference, sourceFields });
    assert.equal(dto.profile.mapPoint.value, null);
    assert.equal(dto.profile.mapPoint.availability, 'source_missing');
  }
});

test('public detail follows overview, four fees, introduction, services, care and reviews', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PublicInstitutionSummary, { dto }),
    React.createElement(PublicInstitutionDetailSections, { dto }),
  ));
  assert.match(html, /机构养老/);
  assert.match(html, /<table[^>]*aria-label="月费用明细"/);
  for (const label of ['月总费用', '床位费用', '护理费用', '膳食费用', '机构面积', '机构介绍', '服务内容', '服务团队', '服务时间', '服务范围', '服务说明', '床位信息', '收费标准', '用户评价']) {
    assert.ok(html.includes(label), label);
  }
  const sections = ['id="fields"', 'id="services"', 'id="care"', 'id="reviews"'];
  for (let i = 1; i < sections.length; i++) assert.ok(html.indexOf(sections[i - 1]) < html.indexOf(sections[i]));
  assert.doesNotMatch(html, /预约参观|服务申请|查看地图/);
});

test('read-only profile header shows source facts and safe unavailable states', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PublicInstitutionHero, { dto, sourceLabel: '官方公开来源', sourceTitle: source.title,
      sourceDate: source.asOf, sourceHref: source.url, returnHref: '/quanguo/laiyuan/' }),
    React.createElement(PublicInstitutionBottomNav, { name: dto.name, items: [
      { id: 'fields', label: '基本信息' }, { id: 'services', label: '服务信息' }, { id: 'care', label: '机构养老' },
    ] }),
  ));
  const visibleText = html.replace(/<[^>]+>/g, '');
  assert.match(html, /id="overview"/);
  assert.match(html, /甲养老院/);
  assert.match(visibleText, /评价未提供/);
  assert.match(visibleText, /评分：本来源未提供/);
  assert.match(visibleText, /设施类型：本来源未提供/);
  assert.match(visibleText, /机构星级：本来源未提供/);
  assert.match(visibleText, /养老消费补贴：本来源未提供/);
  assert.match(visibleText, /功能定位：本来源未提供/);
  assert.match(visibleText, /机构标签：本来源未提供/);
  assert.match(visibleText, /机构面积：本来源未提供/);
  assert.match(visibleText, /联系人：本来源未提供/);
  assert.match(visibleText, /联系电话：本来源未提供/);
  assert.match(visibleText, /机构照片：本来源未提供/);
  assert.match(html, /打开来源原文/);
  assert.match(html, /aria-label="本页目录"/);
  assert.doesNotMatch(html, /预约参观|服务申请|查看地图/);
});

test('recorded fee notes and permitted photos render their values, not only counts', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  dto.monthlyFees.total = { ...dto.monthlyFees.total, value: { min: 8000, max: 15000 }, availability: 'recorded' };
  dto.monthlyFees.meal = { ...dto.monthlyFees.meal, value: { min: 1500, max: 1500 }, availability: 'recorded' };
  dto.monthlyFeeNotes.total = { ...dto.monthlyFeeNotes.total, value: '按房型和护理等级', availability: 'recorded' };
  dto.profile.photos = { ...dto.profile.photos, value: [{ url: 'https://example.gov.cn/photo.jpg', alt: '机构公共区域' }], availability: 'recorded' };
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PublicInstitutionHero, { dto, sourceLabel: '官方公开来源', sourceTitle: source.title, sourceDate: source.asOf, returnHref: '/quanguo/laiyuan/' }),
    React.createElement(PublicInstitutionSummary, { dto }),
  ));
  assert.match(html, /按房型和护理等级/);
  assert.ok(html.includes('¥8,000–15,000 元/月'));
  assert.ok(html.includes('¥1,500–1,500 元/月'));
  assert.match(html, /aria-label="机构照片"/);
  assert.match(html, /alt="机构公共区域"/);
  assert.match(html, /aria-label="机构照片"[^>]*sm:grid-cols-3/);
  assert.match(html, /aspect-\[16\/9\]/);
});

test('public profile mirrors the reference gallery footprint and section heading hierarchy', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  const hero = renderToStaticMarkup(React.createElement(PublicInstitutionHero, { dto, sourceLabel: '官方公开来源',
    sourceTitle: source.title, sourceDate: source.asOf, returnHref: '/quanguo/laiyuan/' }));
  const content = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PublicInstitutionSummary, { dto }),
    React.createElement(PublicInstitutionDetailSections, { dto }),
  ));
  assert.match(hero, /机构照片：本来源未提供/);
  assert.ok(hero.indexOf('<h1') < hero.indexOf('官方公开来源'));
  assert.match(hero, /max-w-\[860px\]/);
  assert.match(hero, /min-h-36/);
  assert.match(content, /机构养老<\/h2>/);
  assert.match(content, /基本信息<\/h2>/);
  assert.match(content, /sm:grid-cols-\[220px_minmax\(0,1fr\)\]/);
  const basic = content.match(/<h2[^>]*>基本信息<\/h2>/)?.[0] ?? '';
  assert.doesNotMatch(basic, /border-l/);
});

test('basic information leads with the introduction and charge rows use the reference rhythm', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  dto.introduction = { ...dto.introduction, value: '真实机构介绍', availability: 'recorded' };
  dto.chargeItems = { ...dto.chargeItems, value: [
    { name: '床位费', description: '单人间', standard: '5000 元/月' },
    { name: '餐费', description: '三餐', standard: '1500 元/月' },
  ], availability: 'recorded' };
  const html = renderToStaticMarkup(React.createElement(PublicInstitutionDetailSections, { dto }));
  const basic = html.slice(html.indexOf('id="fields"'), html.indexOf('id="services"'));
  assert.ok(basic.indexOf('真实机构介绍') < basic.indexOf('机构面积'));
  assert.ok(basic.indexOf('真实机构介绍') < basic.indexOf('原表地址'));
  assert.match(html, /<tr[^>]*even:bg-\[#F2F2F2\]/);
});

test('service facts keep the reference icon and label rhythm without adding extra copy', () => {
  const html = renderToStaticMarkup(React.createElement(PublicInstitutionDetailSections, { dto: mapOfficialInstitutionDetail(official, source) }));
  const services = html.slice(html.indexOf('id="services"'), html.indexOf('id="care"'));
  assert.equal((services.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length, 5);
  for (const label of ['提供服务内容', '服务团队', '服务时间', '服务范围', '服务说明']) assert.ok(services.includes(label));
});

test('explicitly empty charge list is distinct from a source missing the charge list', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  dto.chargeItems = { ...dto.chargeItems, value: [], availability: 'recorded' };
  const html = renderToStaticMarkup(React.createElement(PublicInstitutionDetailSections, { dto }));
  assert.match(html, /本来源明确记录 0 项分项收费/);
  assert.doesNotMatch(html, /本来源未提供分项收费表/);
});

test('mobile charge details show each item and its standard without sideways scrolling', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  dto.chargeItems = { ...dto.chargeItems, availability: 'recorded', value: [
    { name: '床位费', description: '按房型', standard: '4500–6500 元/月' },
  ] };
  const html = renderToStaticMarkup(React.createElement(PublicInstitutionDetailSections, { dto }));
  const mobile = html.match(/<div aria-label="分项收费（窄屏）"[^>]*>(.*?)<\/div><div class="mt-3 hidden/s)?.[1];
  assert.ok(mobile);
  for (const term of ['床位费', '按房型', '4500–6500 元/月']) assert.ok(mobile.includes(term));
  assert.doesNotMatch(mobile, /min-w-\\[600px\\]/);
  const missing = renderToStaticMarkup(React.createElement(PublicInstitutionDetailSections, { dto: mapOfficialInstitutionDetail(official, source) }));
  assert.match(missing, /aria-label="分项收费（窄屏）"[^>]*>本来源未提供分项收费表/);
});

test('profile keeps region text without a map slot', () => {
  const html = renderToStaticMarkup(React.createElement(PublicInstitutionDetailSections, { dto: mapOfficialInstitutionDetail(official, source) }));
  assert.match(html, /地区：/);
  assert.doesNotMatch(html, /地图位置|地图坐标|地图导航/);
});

test('raw coordinates remain in the DTO but are not shown as map UI', () => {
  const dto = mapReferenceInstitutionDetail(reference);
  assert.equal(dto.profile.mapPoint.value?.latitude, 38.1);
  assert.equal(dto.profile.mapPoint.value?.longitude, 114.5);
  const html = renderToStaticMarkup(React.createElement(PublicInstitutionDetailSections, { dto }));
  assert.doesNotMatch(html, /来源坐标|地图位置|地图导航/);
});

test('an explicitly empty tag list is not described as a missing source field', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  dto.profile.tags = { ...dto.profile.tags, availability: 'recorded', value: [] };
  const html = renderToStaticMarkup(React.createElement(PublicInstitutionHero, { dto, sourceLabel: '官方公开来源',
    sourceTitle: source.title, sourceDate: source.asOf, returnHref: '/quanguo/laiyuan/' }));
  assert.match(html, /机构标签：来源记录 0 项/);
  assert.doesNotMatch(html, /机构标签：本来源未提供/);
});

test('official detail page uses a full-width profile and in-flow section navigation', () => {
  const manifest: NationalOfficialManifest = {
    schemaVersion: 1, snapshotId: 'test', archivedAt: '2026-01-02', rowCount: 1, sources: [source], provinces: [],
  };
  const html = renderToStaticMarkup(React.createElement(NationalOfficialDetailContent, { manifest, record: official, from: null }));
  assert.match(html, /institution-detail-page/);
  assert.ok(html.includes('id="overview"') && html.includes('bg-[#FFF0D0]'));
  assert.match(html, /aria-label="本页目录"/);
  assert.doesNotMatch(html, /aria-label="本页目录"[^>]*sticky/);
  assert.ok(html.indexOf('id="overview"') < html.indexOf('aria-label="床位与费用摘要"'));
  assert.ok(html.indexOf('aria-label="床位与费用摘要"') < html.indexOf('id="fields"'));
  assert.doesNotMatch(html, /xl:flex/);
});

test('reference detail page keeps candidate evidence after the official-style read-only profile', () => {
  const manifest: ReferenceManifest = {
    schemaVersion: 1, snapshotId: 'test', receivedAt: '2026-01-02', rowCount: 1,
    source: { title: '来源线索表', sha256: 'a'.repeat(64), asOf: null }, provinces: [],
  };
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, {
    manifest, record: reference, provinceName: '河北省', cityName: '石家庄市', from: null,
  }));
  assert.match(html, /institution-detail-page/);
  assert.ok(html.includes('id="overview"') && html.includes('bg-[#FFF0D0]'));
  assert.match(html, /aria-label="本页目录"/);
  assert.doesNotMatch(html, /aria-label="本页目录"[^>]*sticky/);
  assert.ok(html.indexOf('id="reviews"') < html.indexOf('id="official"'));
  assert.ok(html.indexOf('id="official"') < html.indexOf('id="registry"'));
  assert.doesNotMatch(html, /xl:flex|预约参观|服务申请/);
});
