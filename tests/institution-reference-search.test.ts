import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstitutionReferenceDirectoryContent } from '../components/InstitutionReferenceDirectoryView';
import { InstitutionReferenceDetailContent } from '../components/InstitutionReferenceDetailView';
import { sitePath } from '../lib/site-path';
import {
  findReferenceCity, findReferenceRecord, loadReferenceChunk, loadReferenceIndex,
  loadReferenceManifest, loadReferenceProvinceIndexes, referenceListHref,
  safeReferenceReturnPath, searchReferenceProvinceRecords, searchReferenceRecords,
} from '../lib/institution-reference-search';
import type { ReferenceChunk, ReferenceIndex, ReferenceManifest } from '../lib/institution-reference-types';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';

Object.assign(globalThis, { React });
const sourceFields = Object.fromEntries(REFERENCE_SOURCE_FIELD_NAMES.map(key => [key, null]));

const manifest: ReferenceManifest = {
  schemaVersion: 1, snapshotId: 'v1-test', receivedAt: '2026-11-17', rowCount: 3,
  source: { title: '养老机构信息.xlsx · 企查查来源', sha256: 'a'.repeat(64), asOf: null },
  provinces: [{ slug: 'hebei', name: '河北省', count: 3, cities: [{ slug: 'shijiazhuang', name: '石家庄市', count: 3, indexPath: 'hebei/shijiazhuang/index.v1.json' }] }],
};
const index: ReferenceIndex = {
  schemaVersion: 1, snapshotId: 'v1-test', provinceSlug: 'hebei', citySlug: 'shijiazhuang',
  records: [
    { id: 'qref-a1-2', sourceRow: 2, name: '甲养老院', region: '河北省石家庄市长安区', address: '甲路1号', beds: 0, chunk: 'chunk-001.v1.json' },
    { id: 'qref-a1-3', sourceRow: 3, name: '乙养老院', region: '河北省石家庄市桥西区', address: null, beds: 58, chunk: 'chunk-001.v1.json' },
    { id: 'qref-a1-4', sourceRow: 4, name: '甲养老院', region: '河北省石家庄市裕华区', address: '乙路2号', beds: 60, chunk: 'chunk-001.v1.json' },
  ],
};
const chunk: ReferenceChunk = {
  schemaVersion: 1, snapshotId: 'v1-test', provinceSlug: 'hebei', citySlug: 'shijiazhuang',
  records: [
    { id: 'qref-a1-2', sourceRow: 2, name: '甲养老院', region: '河北省石家庄市长安区', address: '甲路1号', beds: 0, creditCode: '52110101MJ0189463E', codeStatus: 'valid', sourceFields },
    { id: 'qref-a1-3', sourceRow: 3, name: '乙养老院', region: '河北省石家庄市桥西区', address: null, beds: 58, creditCode: null, codeStatus: 'invalid', sourceFields },
    { id: 'qref-a1-4', sourceRow: 4, name: '甲养老院', region: '河北省石家庄市裕华区', address: '乙路2号', beds: 60, creditCode: null, codeStatus: 'missing', sourceFields },
  ],
};

function jsonFetch(files: Record<string, unknown>, requested: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    return url in files ? new Response(JSON.stringify(files[url]), { status: 200 }) : new Response('missing', { status: 404 });
  }) as typeof fetch;
}

test('reference detail loader requires every original column and preserves raw values without accepting nested fields', async () => {
  const uri = sitePath('/data/qcc-institutions/hebei/shijiazhuang/chunk-001.v1.json');
  const rawFields = { ...sourceFields, '统一社会信用代码': '-', '地址': '联系 13800000000 office@example.com', '床位数': 0, '经度': 113.1, '城市': '' };
  const records = chunk.records.map(record => ({ ...record, sourceFields: rawFields }));
  const load = (fields: unknown) => loadReferenceChunk(manifest, index, 'chunk-001.v1.json', new AbortController().signal,
    jsonFetch({ [uri]: { ...chunk, records: records.map((record, at) => at === 0 ? { ...record, sourceFields: fields } : record) } }, []));
  const details = await load(rawFields);
  assert.deepEqual(details.records[0].sourceFields, rawFields);
  for (const invalid of [undefined, {}, { ...rawFields, 'extra': 'no' }, { ...rawFields, '地址': {} }, { ...rawFields, '地址': true }]) {
    await assert.rejects(load(invalid), /详情|索引|格式/);
  }
});

test('reference search preserves source rows, filters region, and keeps zero beds', () => {
  const result = searchReferenceRecords(index, { province: 'hebei', city: 'shijiazhuang', q: '甲' });
  assert.deepEqual(result.items.map(item => item.sourceRow), [2, 4]);
  assert.equal(result.items[0].beds, 0);
  assert.equal(searchReferenceRecords(index, { province: 'hebei', city: 'shijiazhuang', q: '桥西' }).items[0].address, null);
  assert.deepEqual(searchReferenceRecords(index, { province: 'hebei', city: 'shijiazhuang', q: '不存在' }).items, []);
  assert.deepEqual(searchReferenceRecords(index, { province: 'hebei', city: 'shijiazhuang', page: 'abc' }).issues, ['页码无效，已返回第1页。']);
  assert.throws(() => searchReferenceRecords(index, { province: 'hunan', city: 'shijiazhuang' }), /地区/);
});

test('reference URLs preserve only local bounded search state', () => {
  const from = referenceListHref({ province: 'hebei', city: 'shijiazhuang', q: '养老', page: 2 });
  assert.equal(from, '/quanguo/cankao/?province=hebei&city=shijiazhuang&q=%E5%85%BB%E8%80%81&page=2');
  assert.equal(safeReferenceReturnPath(from), from);
  const provinceOnly = referenceListHref({ province: 'hebei', q: '养老', page: 2 });
  assert.equal(provinceOnly, '/quanguo/cankao/?province=hebei&q=%E5%85%BB%E8%80%81&page=2');
  assert.equal(safeReferenceReturnPath(provinceOnly), provinceOnly);
  assert.equal(safeReferenceReturnPath('/quanguo/cankao/sheng/p-hebei/'), '/quanguo/cankao/sheng/p-hebei/');
  assert.equal(safeReferenceReturnPath('/quanguo/cankao/sheng/p-hebei/page/3/'), '/quanguo/cankao/sheng/p-hebei/page/3/');
  for (const bad of ['https://evil.test/', '//evil.test/', '/quanguo/cankao/?next=x', '/quanguo/cankao/?q=x&q=y', '/quanguo/cankao/?city=x', '/quanguo/cankao/?q=%0A', '/quanguo/cankao/?q=' + 'x'.repeat(1300)]) {
    assert.equal(safeReferenceReturnPath(bad), '/quanguo/cankao/');
  }
  assert.equal(safeReferenceReturnPath('/quanguo/cankao/sheng/p-hebei/page/9007199254740992/'), '/quanguo/cankao/');
});

test('province loader reads only that province and rejects missing or mismatched city indexes', async () => {
  const tangshan: ReferenceIndex = {
    ...index, citySlug: 'tangshan', records: [
      { id: 'qref-a1-5', sourceRow: 5, name: '唐山养老院', region: '河北省唐山市路北区', address: '丙路3号', beds: 80, chunk: 'chunk-001.v1.json' },
    ],
  };
  const provinceManifest: ReferenceManifest = {
    ...manifest, rowCount: 5, provinces: [
      { ...manifest.provinces[0], count: 4, cities: [...manifest.provinces[0].cities,
        { slug: 'tangshan', name: '唐山市', count: 1, indexPath: 'hebei/tangshan/index.v1.json' }] },
      { slug: 'hunan', name: '湖南省', count: 1, cities: [{ slug: 'changsha', name: '长沙市', count: 1, indexPath: 'hunan/changsha/index.v1.json' }] },
    ],
  };
  const first = sitePath('/data/qcc-institutions/hebei/shijiazhuang/index.v1.json');
  const second = sitePath('/data/qcc-institutions/hebei/tangshan/index.v1.json');
  const requested: string[] = [];
  const indexes = await loadReferenceProvinceIndexes(provinceManifest, 'hebei', new AbortController().signal,
    jsonFetch({ [first]: index, [second]: tangshan }, requested));
  assert.deepEqual(requested, [first, second]);
  assert.deepEqual(searchReferenceProvinceRecords(provinceManifest, indexes, { province: 'hebei' }).items.map(item => item.sourceRow), [2, 3, 4, 5]);
  assert.equal(searchReferenceProvinceRecords(provinceManifest, indexes, { province: 'hebei', q: '唐山' }).items[0].citySlug, 'tangshan');
  assert.throws(() => searchReferenceProvinceRecords(provinceManifest, [index], { province: 'hebei' }), /省份/);
  assert.throws(() => searchReferenceProvinceRecords(provinceManifest, [index, { ...tangshan, records: [{ ...tangshan.records[0], sourceRow: 2 }] }], { province: 'hebei' }), /重复/);
  await assert.rejects(loadReferenceProvinceIndexes(provinceManifest, 'hebei', new AbortController().signal,
    jsonFetch({ [first]: index }, [])), /HTTP 404/);
  await assert.rejects(loadReferenceProvinceIndexes(provinceManifest, 'other', new AbortController().signal,
    jsonFetch({}, [])), /省份/);
});

test('reference area selection keeps a keyword entered before choosing a province', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, {
    manifest, index: null, query: { q: '养老' },
  }));
  const selectionForm = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0];
  assert.ok(selectionForm);
  assert.ok(selectionForm.includes('action="' + sitePath('/quanguo/cankao/') + '"'));
  assert.match(selectionForm, /<input type="hidden" name="q" value="养老"\/>/);
  assert.match(html, /先选择省份，再检索“养老”/);
  assert.match(selectionForm, /<option value=""[^>]*>全部地区<\/option>/);
});

test('province-only selection searches every city and opens each record in its city', () => {
  const tangshan: ReferenceIndex = {
    ...index, citySlug: 'tangshan', records: [
      { id: 'qref-a1-5', sourceRow: 5, name: '唐山养老院', region: '河北省唐山市路北区', address: '丙路3号', beds: 80, chunk: 'chunk-001.v1.json' },
    ],
  };
  const provinceManifest: ReferenceManifest = {
    ...manifest, rowCount: 4, provinces: [{ ...manifest.provinces[0], count: 4, cities: [
      ...manifest.provinces[0].cities, { slug: 'tangshan', name: '唐山市', count: 1, indexPath: 'hebei/tangshan/index.v1.json' },
    ] }],
  };
  const props = { manifest: provinceManifest, index: null, provinceIndexes: [index, tangshan], query: { province: 'hebei', q: '养老' } };
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, props));
  assert.match(html, /城市或原表地区分组（可选）/);
  assert.match(html, /匹配 <b>4<\/b> 条来源线索/);
  assert.match(html, /city=shijiazhuang/);
  assert.match(html, /city=tangshan/);
  assert.match(html, /from=%2Fquanguo%2Fcankao%2F%3Fprovince%3Dhebei/);
});

test('reference manifest whitelists index and chunk locations and rejects mixed snapshots', async () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const paths = {
      '/eldercare/data/qcc-institutions/manifest.v1.json': manifest,
      '/eldercare/data/qcc-institutions/hebei/shijiazhuang/index.v1.json': index,
      '/eldercare/data/qcc-institutions/hebei/shijiazhuang/chunk-001.v1.json': chunk,
    };
    const requested: string[] = [];
    const fetcher = jsonFetch(paths, requested);
    const loaded = await loadReferenceManifest(new AbortController().signal, fetcher);
    assert.equal(findReferenceCity(loaded, 'hebei', 'shijiazhuang')?.city.count, 3);
    assert.equal(findReferenceCity(loaded, '../private', 'shijiazhuang'), null);
    const selected = await loadReferenceIndex(loaded, 'hebei', 'shijiazhuang', new AbortController().signal, fetcher);
    assert.equal(findReferenceRecord(selected.records, 'qref-a1-3')?.address, null);
    const details = await loadReferenceChunk(loaded, selected, 'chunk-001.v1.json', new AbortController().signal, fetcher);
    assert.equal(details.records[0].beds, 0);
    assert.deepEqual(requested, Object.keys(paths));
    await assert.rejects(loadReferenceIndex(loaded, '../private', 'x', new AbortController().signal, fetcher), /地区/);
    await assert.rejects(loadReferenceChunk(loaded, selected, '../../private', new AbortController().signal, fetcher), /分块/);
    await assert.rejects(loadReferenceIndex(loaded, 'hebei', 'shijiazhuang', new AbortController().signal, jsonFetch({ [Object.keys(paths)[1]]: { ...index, snapshotId: 'wrong' } }, [])), /快照/);
    await assert.rejects(loadReferenceChunk(loaded, selected, 'chunk-001.v1.json', new AbortController().signal, jsonFetch({ [Object.keys(paths)[2]]: { ...chunk, citySlug: 'wrong' } }, [])), /地区/);
    await assert.rejects(loadReferenceChunk(loaded, selected, 'chunk-001.v1.json', new AbortController().signal, jsonFetch({ [Object.keys(paths)[2]]: { ...chunk, records: chunk.records.map((record, at) => at === 0 ? { ...record, beds: 1 } : record) } }, [])), /索引/);
    for (const creditCode of ['000000000000000000', '52110101MJ0189463X']) {
      await assert.rejects(loadReferenceChunk(loaded, selected, 'chunk-001.v1.json', new AbortController().signal, jsonFetch({ [Object.keys(paths)[2]]: { ...chunk, records: chunk.records.map((record, at) => at === 0 ? { ...record, creditCode } : record) } }, [])), /索引/);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH; else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('reference directory and detail state the source limits and missing fields', () => {
  const list = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, { manifest, index, query: { province: 'hebei', city: 'shijiazhuang', q: '甲' } }));
  assert.match(list, /来源线索/);
  assert.match(list, /匹配 <b>2<\/b> 条/);
  assert.match(list, /0 张/);
  assert.match(list, /资料时点未知/);
  assert.match(list, /原表地址字段（未核实）：甲路1号/);
  assert.match(list, /原始地址和经纬度未经核实，不能用于导航/);
  assert.match(list, /查看来源定位，再核对官方资料/);
  assert.ok(list.indexOf('aria-label="选择线索省份和可选城市"') < list.indexOf('查看来源定位，再核对官方资料'));
  assert.match(list, /原始 XLSX 未公开，所列工作表行号用于资料复核/);
  assert.match(list, /全部 11 个原列名和非联系字段原值/);
  assert.match(list, /含联系方式的自由文本整格显示“\[已遮蔽\]”/);
  assert.match(list, /私有原件保留不变/);
  assert.doesNotMatch(list, /详情保留原表全部字段|全部 11 个原表字段及原值/);
  assert.doesNotMatch(list, /先核对原表/);
  const missingAddressList = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, { manifest, index, query: { province: 'hebei', city: 'shijiazhuang', q: '乙' } }));
  assert.match(missingAddressList, /原表地址字段（未核实）：暂无可公开地址/);
  assert.match(missingAddressList, /原表空白、含联系方式或以机构名称占位/);
  const detail = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, { manifest, record: chunk.records[1], officialCandidates: [], provinceName: '河北省', cityName: '石家庄市', from: referenceListHref({ province: 'hebei', city: 'shijiazhuang', q: '乙' }) }));
  assert.match(detail, /aria-label="本页目录"/);
  for (const section of ['overview', 'fields', 'original', 'official', 'registry', 'sources', 'checklist']) {
    assert.ok(detail.includes('id="' + section + '"'), section + ' must have a matching section');
    assert.ok(detail.includes('href="#' + section + '"'), section + ' must be reachable from the archive TOC');
  }
  assert.match(detail, /核对这条机构线索/);
  assert.doesNotMatch(detail, /在线预约暂未开放|预约探访/);
  assert.match(detail, /工作表第 3 行/);
  assert.match(detail, /原表地址字段（未核实）.*暂无可公开地址/);
  assert.match(detail, /原表地址字段未经核实，不能用于导航/);
  assert.match(detail, /摘要地址可能因原表空白、含联系方式或以机构名称占位而不展示/);
  assert.match(detail, /统一社会信用代码.*原表代码未通过校验/);
  assert.match(detail, /保留筛选/);
  assert.doesNotMatch(detail, /52110101MJ0189463E|可立即预约|当前空床 58/);
});

test('reference empty and invalid-location states offer a way back', () => {
  const empty = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, { manifest, index, query: { province: 'hebei', city: 'shijiazhuang', q: '没有的名称' } }));
  assert.match(empty, /没有找到线索/);
  assert.match(empty, /查看当前地区全部线索/);
  const invalid = renderToStaticMarkup(React.createElement(InstitutionReferenceDirectoryContent, { manifest, index: null, query: { province: 'bad', city: 'bad' } }));
  assert.match(invalid, /地区参数无效/);
  assert.match(invalid, /清除条件/);
});

test('real source snapshot loads through public manifest, index, and detail contracts', async () => {
  const prefix = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH ?? '';
  const root = join(process.cwd(), 'public', 'data', 'qcc-institutions');
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const start = prefix + '/data/qcc-institutions/';
    if (!url.startsWith(start)) return new Response('unexpected path', { status: 404 });
    try {
      return new Response(readFileSync(join(root, url.slice(start.length))), { status: 200 });
    } catch {
      return new Response('missing', { status: 404 });
    }
  }) as typeof fetch;
  const signal = new AbortController().signal;
  const actual = await loadReferenceManifest(signal, fetcher);
  assert.equal(actual.rowCount, 41955);
  assert.equal(actual.provinces.length, 31);
  const sampled = [actual.provinces[0], actual.provinces[Math.floor(actual.provinces.length / 2)], actual.provinces.at(-1)!];
  for (const province of sampled) {
    const city = province.cities[Math.floor(province.cities.length / 2)];
    const selected = await loadReferenceIndex(actual, province.slug, city.slug, signal, fetcher);
    assert.equal(selected.records.length, city.count);
    const indexed = selected.records[Math.floor(selected.records.length / 2)];
    const detail = await loadReferenceChunk(actual, selected, indexed.chunk, signal, fetcher);
    assert.equal(detail.records.find(record => record.id === indexed.id)?.sourceRow, indexed.sourceRow);
  }
  let provinceRows = 0;
  for (const province of actual.provinces) {
    const indexes = await loadReferenceProvinceIndexes(actual, province.slug, signal, fetcher);
    const result = searchReferenceProvinceRecords(actual, indexes, { province: province.slug });
    assert.equal(result.total, province.count, province.name);
    assert.ok(result.items.every(item => province.cities.some(city => city.slug === item.citySlug)), province.name);
    provinceRows += result.total;
  }
  assert.equal(provinceRows, actual.rowCount);
});
