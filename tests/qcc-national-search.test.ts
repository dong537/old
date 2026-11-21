import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QccNationalDirectoryContent } from '../components/QccNationalDirectoryView';
import { QccNationalDetailContent } from '../components/QccNationalDetailView';
import { headerSearchHref } from '../components/SiteHeader';
import { findNationalCity, findNationalRecord, loadNationalChunk, loadNationalCityIndex, loadNationalManifest, nationalListHref, safeNationalReturnPath, searchNationalQccRecords } from '../lib/qcc-national-search';
import type { QccNationalChunk, QccNationalDetailRecord, QccNationalIndex, QccNationalIndexRecord, QccNationalManifest } from '../lib/qcc-national-types';
import { QCC_SOURCE_FIELD_NAMES } from '../lib/qcc-types';

Object.assign(globalThis, { React });

const records: QccNationalIndexRecord[] = Array.from({ length: 25 }, (_, number) => ({
  id: 'national-' + (number + 1), rowNumber: number + 2, name: '养老服务主体' + (number + 1),
  province: '北京市', city: '北京市', district: null, subjectType: '企业',
  registrationStatus: '存续', sourceId: 'source-1', chunk: 'chunk-001.v1.json',
}));
records[5] = { ...records[5], name: '福康养老服务中心', subjectType: '个体工商户', registrationStatus: '注销（2020-01-01）' };
const manifest: QccNationalManifest = {
  schemaVersion: 1, snapshotId: 'national-snapshot', exportedAt: '2026-11-05', rowCount: 25,
  sourceFiles: [{ id: 'source-1', filename: '北京.xlsx', sha256: 'a'.repeat(64), rowCount: 25 }],
  provinces: [{ slug: 'beijing', name: '北京市', count: 25, cities: [{ slug: 'beijing-city', name: '北京市', count: 25, indexPath: 'p-aabbccddeeff/c-112233445566/index.v1.json' }] }],
};
const index: QccNationalIndex = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'beijing', citySlug: 'beijing-city', records };
const { chunk: _unusedChunk, ...indexDetail } = records[5];
const detail: QccNationalDetailRecord = {
  sourceFields: Object.fromEntries(QCC_SOURCE_FIELD_NAMES.map(header => [header, null])),
  ...indexDetail, creditCode: null, codeValidity: 'missing', legalRepresentative: null, establishedAt: null,
  registeredCapital: null, organizationCode: null, registrationNo: null, taxId: null, businessTerm: null,
  insuredPersons: null, insuredYear: null, nationalIndustry: null, address: null, mailingAddress: null,
  businessScope: null, formerName: null, englishName: null, companySize: null,
};
const chunk: QccNationalChunk = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: index.provinceSlug, citySlug: index.citySlug, records: [detail] };

function jsonFetch(files: Record<string, unknown>, requested: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    return url in files ? new Response(JSON.stringify(files[url]), { status: 200 }) : new Response('missing', { status: 404 });
  }) as typeof fetch;
}

test('national chunk loader requires exactly 37 source columns with primitive finite values', async () => {
  const base = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH === '/eldercare' ? '/eldercare' : '';
  const path = base + '/data/qcc-national/p-aabbccddeeff/c-112233445566/chunk-001.v1.json';
  const { 企业名称: _removed, ...missing } = detail.sourceFields;
  for (const sourceFields of [undefined, null, [], missing, { ...detail.sourceFields, 额外字段: null },
    { ...detail.sourceFields, 企业名称: true }, { ...detail.sourceFields, 企业名称: {} }]) {
    const data = { ...chunk, records: [{ ...detail, sourceFields }] };
    await assert.rejects(loadNationalChunk(manifest, index, 'chunk-001.v1.json', new AbortController().signal,
      jsonFetch({ [path]: data }, [])), /详情格式无效/);
  }
  assert.deepEqual((await loadNationalChunk(manifest, index, 'chunk-001.v1.json', new AbortController().signal,
    jsonFetch({ [path]: chunk }, []))).records[0].sourceFields, detail.sourceFields);
});

test('national city search combines name, type and status and keeps source order', () => {
  const result = searchNationalQccRecords(index, { province: 'beijing', city: 'beijing-city', q: '  福康 养老 ', type: '个体工商户', status: '注销' });
  assert.deepEqual(result.items.map(item => item.id), ['national-6']);
  assert.equal(result.total, 1);
  assert.equal(searchNationalQccRecords(index, { province: 'beijing', city: 'beijing-city', q: '没有结果', page: '9' }).page, 1);
  assert.equal(searchNationalQccRecords(index, { province: 'beijing', city: 'beijing-city', q: '没有结果' }).pageCount, 1);
  assert.deepEqual(searchNationalQccRecords(index, { province: 'beijing', city: 'beijing-city', page: '2' }).items.map(item => item.id), records.slice(20).map(item => item.id));
  assert.throws(() => searchNationalQccRecords(index, { province: 'other', city: 'beijing-city' }), /地区.*不一致/);
});

test('national list URLs and back links retain only known local filters', () => {
  const from = nationalListHref({ province: 'beijing', city: 'beijing-city', q: '福康', type: '企业', status: '存续', page: 2 });
  assert.equal(from, '/quanguo/zhuti/?province=beijing&city=beijing-city&q=%E7%A6%8F%E5%BA%B7&type=%E4%BC%81%E4%B8%9A&status=%E5%AD%98%E7%BB%AD&page=2');
  assert.equal(safeNationalReturnPath(from), from);
  for (const unsafe of ['https://evil.test/', '//evil.test/', '/rules/', '/quanguo/zhuti/?next=x', '/quanguo/zhuti/?q=x&q=y', '/quanguo/zhuti/?province=../private']) {
    assert.equal(safeNationalReturnPath(unsafe), '/quanguo/zhuti/');
  }
  assert.equal(headerSearchHref('/quanguo/zhuti/', '新词', '/quanguo/zhuti/', '?province=beijing&city=beijing-city&type=企业&status=存续&page=2'), '/quanguo/zhuti/?q=%E6%96%B0%E8%AF%8D&province=beijing&city=beijing-city&type=%E4%BC%81%E4%B8%9A&status=%E5%AD%98%E7%BB%AD');
  assert.equal(headerSearchHref('/quanguo/zhuti/', '新词', '/quanguo/zhuti', '?province=beijing&city=beijing-city'), '/quanguo/zhuti/?q=%E6%96%B0%E8%AF%8D&province=beijing&city=beijing-city');
  assert.equal(headerSearchHref('/quanguo/zhuti/', '新词', '/quanguo/zhuti/detail/', '?province=beijing&city=beijing-city&id=national-6'), '/quanguo/zhuti/?q=%E6%96%B0%E8%AF%8D&province=beijing&city=beijing-city');
});

test('manifest is the only city path whitelist and city index loads on selection', async () => {
  const requested: string[] = [];
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const fetcher = jsonFetch({
      '/eldercare/data/qcc-national/manifest.v1.json': manifest,
      '/eldercare/data/qcc-national/p-aabbccddeeff/c-112233445566/index.v1.json': index,
    }, requested);
    const loaded = await loadNationalManifest(new AbortController().signal, fetcher);
    assert.deepEqual(requested, ['/eldercare/data/qcc-national/manifest.v1.json']);
    assert.equal(findNationalCity(loaded, 'beijing', 'beijing-city')?.city.count, 25);
    assert.equal(findNationalCity(loaded, '../private', 'beijing-city'), null);
    const city = await loadNationalCityIndex(loaded, 'beijing', 'beijing-city', new AbortController().signal, fetcher);
    assert.equal(city.records.length, 25);
    assert.equal(requested[1], '/eldercare/data/qcc-national/p-aabbccddeeff/c-112233445566/index.v1.json');
    await assert.rejects(loadNationalCityIndex(loaded, 'beijing', '../../private', new AbortController().signal, fetcher), /地区.*无效/);
    assert.equal(requested.length, 2);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH; else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('index and chunk reject mismatched snapshots, regions and unsafe basenames', async () => {
  const signal = new AbortController().signal;
  const base = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH === '/eldercare' ? '/eldercare' : '';
  const indexPath = base + '/data/qcc-national/p-aabbccddeeff/c-112233445566/index.v1.json';
  const chunkPath = base + '/data/qcc-national/p-aabbccddeeff/c-112233445566/chunk-001.v1.json';
  await assert.rejects(loadNationalCityIndex(manifest, 'beijing', 'beijing-city', signal, jsonFetch({ [indexPath]: { ...index, snapshotId: 'wrong' } }, [])), /快照.*不一致/);
  await assert.rejects(loadNationalCityIndex(manifest, 'beijing', 'beijing-city', signal, jsonFetch({ [indexPath]: { ...index, citySlug: 'wrong' } }, [])), /地区.*不一致/);
  await assert.rejects(loadNationalCityIndex(manifest, 'beijing', 'beijing-city', signal, jsonFetch({ [indexPath]: { ...index, records: [{ ...records[0], city: '上海市' }, ...records.slice(1)] } }, [])), /地区.*不一致/);
  assert.equal(findNationalRecord(index.records, 'national-6')?.chunk, 'chunk-001.v1.json');
  assert.equal(findNationalRecord([{ ...records[0], chunk: '../secret.xlsx' }], records[0].id), null);
  await assert.rejects(loadNationalChunk(manifest, index, '../secret.xlsx', signal, jsonFetch({}, [])), /分块.*无效/);
  await assert.rejects(loadNationalChunk(manifest, index, 'chunk-001.v1.json', signal, jsonFetch({ [chunkPath]: { ...chunk, snapshotId: 'wrong' } }, [])), /快照.*不一致/);
  await assert.rejects(loadNationalChunk(manifest, index, 'chunk-001.v1.json', signal, jsonFetch({ [chunkPath]: { ...chunk, provinceSlug: 'wrong' } }, [])), /地区.*不一致/);
  await assert.rejects(loadNationalChunk(manifest, index, 'chunk-001.v1.json', signal, jsonFetch({ [chunkPath]: { ...chunk, records: [{ ...detail, province: '上海市' }] } }, [])), /地区.*不一致/);
});

test('directory and detail show provenance, candidate limits and base-path links', () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const initial = renderToStaticMarkup(React.createElement(QccNationalDirectoryContent, { manifest, index: null, query: {} }));
    assert.match(initial, /选择省份和城市/);
    assert.doesNotMatch(initial, /national-6/);
    const query = { province: 'beijing', city: 'beijing-city', q: '福康', type: '个体工商户', status: '注销' };
    const list = renderToStaticMarkup(React.createElement(QccNationalDirectoryContent, { manifest, index, query }));
    assert.match(list, /全国登记主体候选/);
    assert.ok(list.includes('href="/eldercare/quanguo/zhuti/detail/?province=beijing&amp;city=beijing-city&amp;id=national-6'));
    assert.ok(list.includes('<option value="guangdong">广东省（独立快照）</option>'));
    assert.ok(!list.includes('href="/eldercare/guangdong/zhuti/"'));
    const content = renderToStaticMarkup(React.createElement(QccNationalDetailContent, { manifest, record: detail, from: nationalListHref(query) }));
    const hero = content.slice(content.indexOf('<section id="overview"'), content.indexOf('<section id="fields"'));
    assert.match(hero, /福康养老服务中心/);
    assert.match(hero, /登记状态.*注销（2020-01-01）/);
    assert.match(hero, /统一社会信用代码.*导出未提供/);
    assert.match(hero, /主体类型.*个体工商户/);
    assert.match(hero, /北京\.xlsx.*2026-11-05/);
    assert.match(hero, /返回候选目录.*保留筛选/);
    assert.match(content, /北京\.xlsx/);
    assert.match(content, /原始文件第 7 行/);
    assert.ok(content.includes('a'.repeat(64)));
    assert.ok(content.includes('href="/eldercare/quanguo/zhuti/?province=beijing'));
    assert.match(content, /当前这条登记主体与官方来源尚未自动关联/);
    assert.match(content, /aria-label="本页目录"/);
    for (const id of ['overview', 'fields', 'industry', 'original', 'identifiers', 'official', 'sources', 'checklist']) {
      assert.ok(content.includes('id="' + id + '"'), id);
    }
    const order = ['overview', 'fields', 'industry', 'identifiers', 'official', 'sources', 'original', 'checklist'];
    for (let at = 1; at < order.length; at++) {
      assert.ok(content.indexOf('id="' + order[at - 1] + '"') < content.indexOf('id="' + order[at] + '"'), order[at]);
    }
    assert.match(content, /核对这条登记主体候选/);
    assert.ok(content.includes('href="/eldercare/quanguo/laiyuan/"'));
    assert.ok(content.includes('href="https://app.gjzwfw.gov.cn/jmopen/webapp/html5/qgyljgxxcx/index.html"'));
    assert.match(content, /民政部全国养老机构信息查询/);
    assert.doesNotMatch(content, /运营主体已确认|返回官方来源记录/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH; else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('frozen national snapshot resolves first, middle and last city records to matching details', async () => {
  const root = join(process.cwd(), 'public', 'data', 'qcc-national');
  const signal = new AbortController().signal;
  const dataPrefix = (process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH === '/eldercare' ? '/eldercare' : '') + '/data/qcc-national/';
  const fetcher = (async (input: RequestInfo | URL) => {
    const path = String(input);
    assert.ok(path.startsWith(dataPrefix), 'national fetch must use the configured deployment prefix');
    const relative = path.slice(dataPrefix.length);
    assert.match(relative, /^(?:manifest\.v1\.json|p-[0-9a-f]{12}\/c-[0-9a-f]{12}\/(?:index\.v1\.json|chunk-\d{3,}\.v1\.json))$/);
    return new Response(readFileSync(join(root, relative)), { status: 200 });
  }) as typeof fetch;
  const actual = await loadNationalManifest(signal, fetcher);
  assert.equal(actual.rowCount, 141364);
  assert.equal(actual.sourceFiles.length, 25);
  assert.equal(actual.provinces.length, 30);
  const landing = renderToStaticMarkup(React.createElement(QccNationalDirectoryContent, { manifest: actual, index: null, query: {} }));
  const selectorAt = landing.indexOf('aria-label="选择省份和城市"');
  const guangdongAt = landing.indexOf('<option value="guangdong">广东省（独立快照）</option>');
  assert.ok(guangdongAt > selectorAt, 'Guangdong must be selectable in the nationwide province selector');
  assert.ok(landing.indexOf('按省市查登记主体') > selectorAt, 'the area selector should precede the source explanation');
  assert.match(landing, /可选大陆 31 个省级地区/);
  assert.match(landing, /广东与其他省份来自不同来源快照/);
  assert.doesNotMatch(landing, /导出时间不同/);
  assert.match(landing, /不当作去重机构数/);
  const cities = actual.provinces.flatMap(province => province.cities.map(city => ({ province, city })));
  assert.equal(cities.length, 320);
  for (const location of [cities[0], cities[Math.floor(cities.length / 2)], cities[cities.length - 1]]) {
    const loaded = await loadNationalCityIndex(actual, location.province.slug, location.city.slug, signal, fetcher);
    assert.equal(loaded.records.length, location.city.count);
    for (const sample of [loaded.records[0], loaded.records[Math.floor(loaded.records.length / 2)], loaded.records[loaded.records.length - 1]]) {
      const found = findNationalRecord(loaded.records, sample.id);
      assert.ok(found);
      const details = await loadNationalChunk(actual, loaded, found.chunk, signal, fetcher);
      const resolved = details.records.find(record => record.id === found.id);
      assert.ok(resolved);
      assert.equal(resolved.rowNumber, found.rowNumber);
      assert.equal(resolved.sourceId, found.sourceId);
    }
  }
});
