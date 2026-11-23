import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstitutionReferenceProvinceLinks } from '../components/InstitutionReferenceProvinceLinks';
import { InstitutionReferenceProvincePage } from '../components/InstitutionReferenceProvincePage';
import { InstitutionReferenceDetailContent } from '../components/InstitutionReferenceDetailView';
import {
  getReferenceProvincePage, getReferenceProvinceRouteParams,
  referenceProvinceHref, referenceProvinceRecordHref, validateReferenceStaticSnapshot,
} from '../lib/institution-reference-static';
import type { ReferenceManifest, ReferenceIndex } from '../lib/institution-reference-types';

const manifest: ReferenceManifest = {
  schemaVersion: 1, snapshotId: 'v1-4ab89d0a078c4e13', receivedAt: '2026-11-17', rowCount: 3,
  source: { title: '企查查养老机构信息表（用户提供）', sha256: '6bc157e2695965ed8b1c85e82f6f8b7fa7d13102149f9f1512e9863b2489fd81', asOf: null },
  provinces: [
    { slug: 'p-north', name: '北省', count: 2, cities: [{ slug: 'c-one', name: '一市', count: 2, indexPath: 'p-north/c-one/index.v1.json' }] },
    { slug: 'p-south', name: '南省', count: 1, cities: [{ slug: 'c-two', name: '二市', count: 1, indexPath: 'p-south/c-two/index.v1.json' }] },
  ],
};

const index = (provinceSlug: string, citySlug: string, records: ReferenceIndex['records']): ReferenceIndex => ({
  schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug, citySlug, records,
});

const indexes: ReferenceIndex[] = [
  index('p-north', 'c-one', [
    { id: 'qi-6bc157e26959-2', sourceRow: 2, name: '甲养老院', region: '北省一市甲区', address: '甲路1号', beds: 0, chunk: 'chunk-001.v1.json' },
    { id: 'qi-6bc157e26959-3', sourceRow: 3, name: '乙养老院', region: '北省一市乙区', address: null, beds: 20, chunk: 'chunk-001.v1.json' },
  ]),
  index('p-south', 'c-two', [
    { id: 'qi-6bc157e26959-4', sourceRow: 4, name: '乙养老院', region: '南省二市', address: '乙路2号', beds: 30, chunk: 'chunk-001.v1.json' },
  ]),
];

Object.assign(globalThis, { React });

test('static snapshot validation rejects missing, duplicate, cross-province, and mixed-snapshot rows', () => {
  assert.doesNotThrow(() => validateReferenceStaticSnapshot(manifest, indexes));
  assert.throws(() => validateReferenceStaticSnapshot(manifest, indexes.slice(0, 1)), /城市|完整|覆盖/);
  assert.throws(() => validateReferenceStaticSnapshot(manifest, [indexes[0], { ...indexes[1], snapshotId: 'v1-other' }]), /快照/);
  assert.throws(() => validateReferenceStaticSnapshot(manifest, [indexes[0], { ...indexes[1], provinceSlug: 'p-north' }]), /地区/);
  assert.throws(() => validateReferenceStaticSnapshot(manifest, [indexes[0], index('p-south', 'c-two', [{ ...indexes[1].records[0], sourceRow: 5, id: 'qi-6bc157e26959-5' }])]), /行数|字段/);
  assert.throws(() => validateReferenceStaticSnapshot(manifest, [
    index('p-north', 'c-one', [indexes[0].records[0], { ...indexes[0].records[1], id: indexes[0].records[0].id, sourceRow: 2 }]),
    indexes[1],
  ]), /ID/);
  assert.throws(() => validateReferenceStaticSnapshot(manifest, [indexes[0], index('p-south', 'c-two', [{ ...indexes[1].records[0], id: 'qi-6bc157e26959-999' }])]), /ID/);
});

test('institution detail renders every source column without exposing a contact-bearing address', () => {
  const record = {
    ...indexes[0].records[0], creditCode: null, codeStatus: 'invalid' as const,
    sourceFields: {
      '统一社会信用代码': 'NOT-A-CODE', '地址': '[已遮蔽]',
      '行政区划代码': '110105000000', '机构名称': '原始机构名', '地区': '原始地区',
      '床位数': 0, '省份': '补充省', '城市': '补充市', '区县': '补充区县',
      '经度': 121.5, '纬度': 31.2,
    },
  };
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, {
    manifest, record, provinceName: '归属省', cityName: '归属市', from: null,
  }));
  for (const label of ['统一社会信用代码', '地址', '行政区划代码', '机构名称', '地区', '床位数', '省份', '城市', '区县', '经度', '纬度']) {
    assert.ok(html.includes(label), `renders raw source column ${label}`);
  }
  for (const value of Object.values(record.sourceFields)) assert.ok(html.includes(String(value)));
  assert.doesNotMatch(html, /020 12345678/);
  assert.match(html, /补充省市区县.*未用于地区归属/);
  assert.match(html, /坐标.*未用于地区归属/);
  assert.match(html, /资料时点未知/);
  assert.match(html, /不等于当前空床/);
  assert.doesNotMatch(html, /未发布冲突的坐标或派生地区/);
});

test('static province paths paginate by source order and reject unknown routes', async () => {
  const routes = getReferenceProvinceRouteParams(manifest);
  assert.deepEqual(routes, [
    { province: 'p-north', pagination: [] },
    { province: 'p-south', pagination: [] },
  ]);
  assert.equal(await getReferenceProvincePage('unknown-province', 1), null);
  assert.equal(await getReferenceProvincePage('p-north', 0), null);
});

test('province and detail URLs remain local, province-safe, and preserve the page on return', () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    assert.equal(referenceProvinceHref('p-north'), '/eldercare/quanguo/cankao/sheng/p-north/');
    const href = referenceProvinceRecordHref('p-north', 'c-one', 'qref-3', 2);
    assert.equal(href, '/eldercare/quanguo/cankao/detail/?province=p-north&city=c-one&id=qref-3&from=%2Fquanguo%2Fcankao%2Fsheng%2Fp-north%2Fpage%2F2%2F');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('static province page renders source fields, city links, and the requested pagination target', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceProvincePage, {
    data: {
      manifest, province: manifest.provinces[0], page: 1, pageCount: 1,
      records: indexes[0].records.map(record => ({ ...record, citySlug: 'c-one' })),
    },
  }));
  assert.match(html, /北省养老机构来源线索/);
  assert.match(html, /企查查养老机构信息表（用户提供）/);
  assert.match(html, /资料时点未知，不代表全国全量或当前在营/);
  assert.match(html, /甲养老院/);
  assert.match(html, /原表地址字段（未核实）：暂无可公开地址/);
  assert.match(html, /原表床位数[\s\S]{0,80}?0 张/);
  assert.match(html, /c-one/);
  assert.match(html, /查看线索与来源/);
});

test('published source snapshot exposes 31 provinces and pages every row once with its own city route', async () => {
  const root = join(process.cwd(), 'public', 'data', 'qcc-institutions');
  const actual = JSON.parse(readFileSync(join(root, 'manifest.v1.json'), 'utf8')) as ReferenceManifest;
  const allIndexes: ReferenceIndex[] = [];
  for (const province of actual.provinces) {
    for (const city of province.cities) {
      allIndexes.push(JSON.parse(readFileSync(join(root, city.indexPath), 'utf8')) as ReferenceIndex);
    }
  }
  validateReferenceStaticSnapshot(actual, allIndexes);
  assert.equal(actual.provinces.length, 31);
  const entryMarkup = renderToStaticMarkup(React.createElement(InstitutionReferenceProvinceLinks, { provinces: actual.provinces }));
  for (const province of actual.provinces) {
    assert.ok(entryMarkup.includes('href="' + referenceProvinceHref(province.slug) + '"'), province.name + ' has a direct entry link');
  }
  const routes = getReferenceProvinceRouteParams(actual);
  assert.equal(routes.length, actual.provinces.reduce((sum, province) => sum + Math.ceil(province.count / 20), 0));

  let total = 0;
  const sourceRows = new Set<number>();
  for (const province of actual.provinces) {
    const pageCount = Math.ceil(province.count / 20);
    for (let page = 1; page <= pageCount; page++) {
      const result = await getReferenceProvincePage(province.slug, page);
      assert.ok(result, province.slug + ' page ' + page);
      assert.ok(result.records.length > 0 && result.records.length <= 20);
      for (const record of result.records) {
        assert.equal(sourceRows.has(record.sourceRow), false, 'source row is exported once');
        sourceRows.add(record.sourceRow);
        const city = province.cities.find(item => item.slug === record.citySlug);
        assert.ok(city, 'record city belongs to ' + province.slug);
        const href = new URL(referenceProvinceRecordHref(province.slug, record.citySlug, record.id, page), 'https://local.test');
        assert.equal(href.searchParams.get('province'), province.slug);
        assert.equal(href.searchParams.get('city'), record.citySlug);
        assert.equal(href.searchParams.get('id'), record.id);
        assert.match(href.searchParams.get('from') ?? '', new RegExp('^/quanguo/cankao/sheng/' + province.slug + '/'));
      }
      total += result.records.length;
    }
  }
  assert.equal(total, actual.rowCount);
  assert.equal(sourceRows.size, actual.rowCount);
});
