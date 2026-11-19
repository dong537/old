import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildOfficialCoverage } from '../lib/official-coverage';
import { officialVerificationPointer } from '../lib/official-verification-pointers';
import { OfficialCoverageView } from '../components/OfficialCoverageView';
import type { ReferenceProvince } from '../lib/institution-reference-types';

Object.assign(globalThis, { React });

function reference(name: string, slug: string): ReferenceProvince {
  return { name, slug, count: 1, cities: [] };
}

test('Jiangxi official pointer is a scoped external source, not a counted record', () => {
  const pointer = officialVerificationPointer('江西省');
  assert.equal(pointer.kind, 'regional');
  assert.match(pointer.title, /赣州市.*养老机构名录/);
  assert.match(pointer.scope, /仅赣州市/);
  assert.ok(pointer.url.startsWith('https://www.ganzhou.gov.cn/'));
  assert.equal(pointer.checkedAt, '2026-11-18');
});

test('all 18 pending regions have a scoped official exit or an explicit national query', () => {
  const regionalCases = [
    ['上海市', '保基本'], ['江西省', '仅赣州市'], ['河南省', '仅洛阳市涧西区'],
    ['海南省', '仅三亚市'], ['贵州省', '仅贵阳市云岩区'], ['云南省', '16 州市'],
    ['辽宁省', '2024 年'], ['吉林省', '旅居养老服务子集'], ['黑龙江省', '仅佳木斯市'],
    ['陕西省', '仅西安市公办'], ['甘肃省', '仅张掖市'], ['青海省', '新评定二星级以上'],
    ['宁夏回族自治区', '仅银川市'], ['新疆维吾尔自治区', '仅乌鲁木齐市'],
    ['山西省', '全省第二批等级评定'], ['内蒙古自治区', '仅包头市青山区'],
    ['西藏自治区', '仅林芝市巴宜区'],
  ] as const;
  assert.equal(regionalCases.length, 17);
  for (const [name, scopePart] of regionalCases) {
    const pointer = officialVerificationPointer(name);
    assert.equal(pointer.kind, 'regional', name);
    assert.ok(pointer.scope.includes(scopePart), name);
    const url = new URL(pointer.url);
    assert.equal(url.protocol, 'https:', name);
    assert.ok(url.hostname.endsWith('.gov.cn'), name);
    assert.equal(pointer.checkedAt, '2026-11-18', name);
  }
  const nationalFallbacks = ['广西壮族自治区'];
  for (const name of nationalFallbacks) {
    const pointer = officialVerificationPointer(name);
    assert.equal(pointer.kind, 'national', name);
    assert.match(pointer.scope, /自行.*地区.*验证码/);
  }
  const data = path.join(process.cwd(), 'public', 'data');
  const references = JSON.parse(readFileSync(path.join(data, 'qcc-institutions', 'manifest.v1.json'), 'utf8'));
  const officials = JSON.parse(readFileSync(path.join(data, 'national-official', 'manifest.v1.json'), 'utf8'));
  const guangdong = JSON.parse(readFileSync(path.join(data, 'guangdong-source-records.v1.json'), 'utf8'));
  const coverage = buildOfficialCoverage(references.provinces, officials.provinces, guangdong.records.length);
  const actualPending = coverage.regions.filter(region => region.officialSlug === null).map(region => region.name).sort();
  assert.deepEqual(actualPending, [...regionalCases.map(([name]) => name), ...nationalFallbacks].sort());
  assert.equal(coverage.officialRegionCount, 13);
  assert.equal(coverage.officialRowCount, 8500);
});

test('unmapped regions use a clearly labelled national government query', () => {
  const pointer = officialVerificationPointer('测试省');
  assert.equal(pointer.kind, 'national');
  assert.match(pointer.title, /全国养老机构信息查询/);
  assert.match(pointer.scope, /自行.*地区.*验证码/);
  assert.ok(pointer.url.startsWith('https://app.gjzwfw.gov.cn/'));
});

test('pending regions render separate local and external links without implying official coverage', () => {
  const coverage = buildOfficialCoverage([
    reference('江西省', 'p-jiangxi'), reference('测试省', 'p-test'),
  ], [], 0);
  const html = renderToStaticMarkup(React.createElement(OfficialCoverageView, { coverage }));
  assert.match(html, /江西省/);
  assert.ok(html.includes('/quanguo/cankao/sheng/p-jiangxi/'));
  assert.ok(html.includes('https://www.ganzhou.gov.cn/'));
  assert.match(html, /仅赣州市/);
  assert.ok(html.includes('https://app.gjzwfw.gov.cn/'));
  assert.match(html, /新窗口打开/);
  assert.match(html, /待补官方来源/);
  assert.doesNotMatch(html, /2 条官方来源观察/);
  assert.doesNotMatch(html, /<a[^>]*>[^<]*<a/);
});
