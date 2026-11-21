import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NationalOfficialDirectoryContent } from '../components/NationalOfficialDirectoryView';
import { NationalOfficialDetailContent } from '../components/NationalOfficialDetailView';
import { headerSearchHref } from '../components/SiteHeader';
import { sitePath } from '../lib/site-path';
import { findOfficialCity, findOfficialRecord, loadOfficialChunk, loadOfficialIndex, loadOfficialManifest, officialListHref, safeOfficialReturnPath, searchOfficialRecords } from '../lib/national-official-search';
import type { NationalOfficialChunk, NationalOfficialIndex, NationalOfficialManifest } from '../lib/national-official-types';

Object.assign(globalThis, { React });

const manifest: NationalOfficialManifest = {
  schemaVersion: 1, snapshotId: 'v1-test', archivedAt: '2026-11-17', rowCount: 3,
  sources: [{ id: 'cq-mzj-20251222', province: '重庆市', city: '重庆市', scope: '重庆官方网页', title: '养老服务机构', url: 'https://mzj.cq.gov.cn/source', publishedAt: '2025-12-22', asOf: null, sha256: 'a'.repeat(64), rowCount: 3 }],
  provinces: [{ slug: 'chongqing', name: '重庆市', count: 3, cities: [{ slug: 'chongqing', name: '重庆市', count: 3, indexPath: 'chongqing/chongqing/index.v1.json' }] }],
};
const index: NationalOfficialIndex = {
  schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'chongqing', citySlug: 'chongqing',
  records: [
    { id: 'cq-mzj-20251222-0001', sourceId: 'cq-mzj-20251222', rowNumber: 1, name: '甲养老服务中心', address: '重庆市甲区', beds: 100, chunk: 'chunk-001.v1.json' },
    { id: 'cq-mzj-20251222-0002', sourceId: 'cq-mzj-20251222', rowNumber: 2, name: '乙敬老院', address: '重庆市乙区', beds: null, chunk: 'chunk-001.v1.json' },
    { id: 'cq-mzj-20251222-0003', sourceId: 'cq-mzj-20251222', rowNumber: 3, name: '甲养老服务中心', address: '重庆市丙区', beds: 40, chunk: 'chunk-001.v1.json' },
  ],
};
const chunk: NationalOfficialChunk = {
  schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'chongqing', citySlug: 'chongqing',
  records: index.records.map(({ chunk: _chunk, ...record }) => ({ ...record, residentCount: 12, staffCount: 4, services: '照护' })),
};

function jsonFetch(files: Record<string, unknown>, requested: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    return url in files ? new Response(JSON.stringify(files[url]), { status: 200 }) : new Response('missing', { status: 404 });
  }) as typeof fetch;
}

test('official source search preserves rows and distinguishes unknown beds', () => {
  const result = searchOfficialRecords(index, { province: 'chongqing', city: 'chongqing', q: '甲', page: '1' });
  assert.deepEqual(result.items.map(item => item.rowNumber), [1, 3]);
  assert.equal(result.total, 2);
  assert.equal(searchOfficialRecords(index, { province: 'chongqing', city: 'chongqing', q: '乙' }).items[0].beds, null);
  assert.deepEqual(searchOfficialRecords(index, { province: 'chongqing', city: 'chongqing', q: '不存在' }).items, []);
  assert.deepEqual(searchOfficialRecords(index, { province: 'chongqing', city: 'chongqing', page: 'abc' }).issues, ['页码无效，已返回第1页。']);
  assert.throws(() => searchOfficialRecords(index, { province: 'jiangsu', city: 'suzhou' }), /地区/);
});

test('Zhejiang public rows retain original CSV ordinals beyond the displayed row count', async () => {
  const zhejiang: NationalOfficialManifest = {
    ...manifest, rowCount: 1,
    sources: [{ ...manifest.sources[0], id: 'zj-prov-20260902', province: '浙江省', city: null, rowCount: 1 }],
    provinces: [{ slug: 'zhejiang', name: '浙江省', count: 1, cities: [{ slug: 'hangzhou', name: '杭州市', count: 1, indexPath: 'zhejiang/hangzhou/index.v1.json' }] }],
  };
  const record = { id: 'zj-prov-20260902-1147', sourceId: 'zj-prov-20260902', rowNumber: 1147, name: '测试养老机构', address: null, beds: 100, chunk: 'chunk-001.v1.json' };
  const cityIndex: NationalOfficialIndex = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'zhejiang', citySlug: 'hangzhou', records: [record] };
  const cityChunk: NationalOfficialChunk = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'zhejiang', citySlug: 'hangzhou', records: [{ ...record, residentCount: null, staffCount: null, services: null }] };
  const prefix = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH ?? '';
  const files = {
    [prefix + '/data/national-official/manifest.v1.json']: zhejiang,
    [prefix + '/data/national-official/zhejiang/hangzhou/index.v1.json']: cityIndex,
    [prefix + '/data/national-official/zhejiang/hangzhou/chunk-001.v1.json']: cityChunk,
  };
  const signal = new AbortController().signal;
  const loaded = await loadOfficialManifest(signal, jsonFetch(files, []));
  const selected = await loadOfficialIndex(loaded, 'zhejiang', 'hangzhou', signal, jsonFetch(files, []));
  assert.equal(selected.records[0].rowNumber, 1147);
  assert.equal((await loadOfficialChunk(loaded, selected, 'chunk-001.v1.json', signal, jsonFetch(files, []))).records[0].rowNumber, 1147);
  const invalid = { ...cityIndex, records: [{ ...record, rowNumber: 1148, id: 'zj-prov-20260902-1148' }] };
  await assert.rejects(loadOfficialIndex(loaded, 'zhejiang', 'hangzhou', signal, jsonFetch({ ...files, [prefix + '/data/national-official/zhejiang/hangzhou/index.v1.json']: invalid }, [])), /索引格式无效/);
});

test('provincewide undated source keeps unknown address distinct from zero beds', async () => {
  const provincewide = structuredClone(manifest) as NationalOfficialManifest;
  Object.assign(provincewide.sources[0], { city: null, publishedAt: null, asOf: '2026年2月底' });
  const indexWithUnknownAddress = { ...index, records: index.records.map((record, at) => at === 0 ? { ...record, address: null, beds: 0 } : record) } as unknown as NationalOfficialIndex;
  const chunkWithUnknownAddress = { ...chunk, records: chunk.records.map((record, at) => at === 0 ? { ...record, address: null, beds: 0 } : record) } as unknown as NationalOfficialChunk;
  const prefix = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH ?? '';
  const fetcher = jsonFetch({
    [prefix + '/data/national-official/manifest.v1.json']: provincewide,
    [prefix + '/data/national-official/chongqing/chongqing/index.v1.json']: indexWithUnknownAddress,
    [prefix + '/data/national-official/chongqing/chongqing/chunk-001.v1.json']: chunkWithUnknownAddress,
  }, []);
  const signal = new AbortController().signal;
  const loaded = await loadOfficialManifest(signal, fetcher);
  const selected = await loadOfficialIndex(loaded, 'chongqing', 'chongqing', signal, fetcher);
  const result = searchOfficialRecords(selected, { province: 'chongqing', city: 'chongqing', q: '甲' });
  assert.equal(result.items[0].address, null);
  assert.equal(result.items[0].beds, 0);
  const details = await loadOfficialChunk(loaded, selected, 'chunk-001.v1.json', signal, fetcher);
  assert.equal(details.records[0].address, null);
  const listMarkup = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, { manifest: loaded, index: selected, query: { province: 'chongqing', city: 'chongqing' } }));
  const detailMarkup = renderToStaticMarkup(React.createElement(NationalOfficialDetailContent, { manifest: loaded, record: details.records[0], from: null }));
  assert.match(listMarkup, /发布于.*?原文未说明/);
  assert.match(listMarkup, /地址：原表未提供/);
  assert.match(detailMarkup, /发布日期.*?原文未说明/);
  assert.match(detailMarkup, /2026年2月底/);
  assert.match(detailMarkup, /床位数.*?0 张/);
  assert.doesNotMatch(detailMarkup, /dateTime="null"/);
});

test('official source scope has one sentence-ending mark before publication date', () => {
  const marked = structuredClone(manifest) as NationalOfficialManifest;
  marked.sources[0].scope = '鲁西新区局部来源。';
  const markup = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, {
    manifest: marked, index, query: { province: 'chongqing', city: 'chongqing' },
  }));
  assert.match(markup, /鲁西新区局部来源。发布于/);
  assert.doesNotMatch(markup, /鲁西新区局部来源。。发布于/);
});

test('official source URLs retain only local search state', () => {
  const from = officialListHref({ province: 'chongqing', city: 'chongqing', q: '养老', page: 2 });
  assert.equal(from, '/quanguo/laiyuan/?province=chongqing&city=chongqing&q=%E5%85%BB%E8%80%81&page=2');
  assert.equal(safeOfficialReturnPath(from), from);
  for (const bad of ['https://evil.test/', '//evil.test/', '/guangdong/jigou/', '/quanguo/laiyuan/?next=x', '/quanguo/laiyuan/?q=x&q=y', '/quanguo/laiyuan/?city=chongqing']) {
    assert.equal(safeOfficialReturnPath(bad), '/quanguo/laiyuan/');
  }
  assert.equal(headerSearchHref('/quanguo/laiyuan/', '新词', '/quanguo/laiyuan/', '?province=chongqing&city=chongqing&page=2'), '/quanguo/laiyuan/?q=%E6%96%B0%E8%AF%8D&province=chongqing&city=chongqing');
  assert.equal(headerSearchHref('/quanguo/laiyuan/', '新词', '/quanguo/laiyuan/detail/', '?province=chongqing&city=chongqing&id=cq-mzj-20251222-0001'), '/quanguo/laiyuan/?q=%E6%96%B0%E8%AF%8D&province=chongqing&city=chongqing');
});

test('official area selection keeps a keyword entered before choosing a city', () => {
  const html = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, {
    manifest, index: null, query: { q: '养老' },
  }));
  const selectionForm = html.match(/<form\b[^>]*aria-label="选择官方来源省份和城市"[^>]*>[\s\S]*?<\/form>/)?.[0];
  assert.ok(selectionForm);
  assert.ok(selectionForm.includes('action="' + sitePath('/quanguo/laiyuan/') + '"'));
  assert.match(selectionForm, /<input type="hidden" name="q" value="养老"\/>/);
  assert.match(html, /先选择省份和地区范围，再检索“养老”/);
});

test('official return path keeps bounded long Unicode searches but rejects oversized decoded input', () => {
  const longChinese = officialListHref({ province: 'chongqing', city: 'chongqing', q: '养'.repeat(60), page: 2 });
  assert.ok(longChinese.length > 512);
  assert.equal(safeOfficialReturnPath(longChinese), longChinese);
  const astral = officialListHref({ province: 'chongqing', city: 'chongqing', q: '🏠'.repeat(80) });
  assert.equal(safeOfficialReturnPath(astral), astral);
  for (const bad of [
    officialListHref({ province: 'chongqing', city: 'chongqing', q: '养'.repeat(81) }),
    officialListHref({ province: 'c'.repeat(81), city: 'chongqing', q: '养' }),
    '/quanguo/laiyuan/?province=chongqing&city=chongqing&q=%0A',
    '/quanguo/laiyuan/?province=chongqing&city=chongqing&page=9007199254740992',
    '/quanguo/laiyuan/?province=chongqing&city=chongqing&q=' + 'x'.repeat(1300),
  ]) assert.equal(safeOfficialReturnPath(bad), '/quanguo/laiyuan/');
});

test('official manifest whitelists locations and checks linked snapshot data', async () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const requested: string[] = [];
    const paths = {
      '/eldercare/data/national-official/manifest.v1.json': manifest,
      '/eldercare/data/national-official/chongqing/chongqing/index.v1.json': index,
      '/eldercare/data/national-official/chongqing/chongqing/chunk-001.v1.json': chunk,
    };
    const fetcher = jsonFetch(paths, requested);
    const loaded = await loadOfficialManifest(new AbortController().signal, fetcher);
    assert.equal(findOfficialCity(loaded, 'chongqing', 'chongqing')?.city.count, 3);
    assert.equal(findOfficialCity(loaded, '../private', 'chongqing'), null);
    const city = await loadOfficialIndex(loaded, 'chongqing', 'chongqing', new AbortController().signal, fetcher);
    assert.equal(findOfficialRecord(city.records, 'cq-mzj-20251222-0002')?.beds, null);
    const details = await loadOfficialChunk(loaded, city, 'chunk-001.v1.json', new AbortController().signal, fetcher);
    assert.equal(details.records[0].name, city.records[0].name);
    assert.deepEqual(requested, Object.keys(paths));
    await assert.rejects(loadOfficialIndex(loaded, '../private', 'chongqing', new AbortController().signal, fetcher), /地区/);
    await assert.rejects(loadOfficialChunk(loaded, city, '../../private', new AbortController().signal, fetcher), /分块/);
    const wrongIndex = { ...index, snapshotId: 'wrong' };
    await assert.rejects(loadOfficialIndex(loaded, 'chongqing', 'chongqing', new AbortController().signal, jsonFetch({ [Object.keys(paths)[1]]: wrongIndex }, [])), /快照/);
    const wrongChunk = { ...chunk, citySlug: 'other' };
    await assert.rejects(loadOfficialChunk(loaded, city, 'chunk-001.v1.json', new AbortController().signal, jsonFetch({ [Object.keys(paths)[2]]: wrongChunk }, [])), /地区/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH; else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('official source pages expose scope, dated provenance and unknown values', () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const landing = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, { manifest, index: null, query: {} }));
    assert.match(landing, /广东公开来源/);
    assert.match(landing, /选择省份和地区范围/);
    const selected = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, { manifest, index, query: { province: 'chongqing', city: 'chongqing', q: '乙' } }));
    assert.match(selected, /乙敬老院/);
    assert.match(selected, /床位数.*原表未提供/);
    assert.ok(selected.includes('href="/eldercare/quanguo/laiyuan/detail/?province=chongqing'));
    const detail = renderToStaticMarkup(React.createElement(NationalOfficialDetailContent, { manifest, record: chunk.records[1], from: officialListHref({ province: 'chongqing', city: 'chongqing', q: '乙' }) }));
    assert.match(detail, /aria-label="本页目录"/);
    for (const section of ['overview', 'fields', 'services', 'care', 'reviews', 'sources', 'checklist']) {
      assert.ok(detail.includes('id="' + section + '"'), section + ' must have a matching section');
      assert.ok(detail.includes('href="#' + section + '"'), section + ' must be reachable from the archive TOC');
    }
    assert.match(detail, /核对这条官方记录/);
    assert.ok(detail.indexOf('<section id="overview"') < detail.indexOf('<section aria-label="床位与费用摘要"'));
    assert.ok(detail.indexOf('<section aria-label="床位与费用摘要"') < detail.indexOf('<section id="fields"'));
    assert.ok(detail.indexOf('<section id="reviews"') < detail.indexOf('核对这条官方记录'));
    assert.doesNotMatch(detail, /在线预约暂未开放|预约探访/);
    assert.match(detail, /重庆官方网页/);
    assert.match(detail, /原文标题/);
    assert.match(detail, /官方公开材料中的一条来源记录/);
    const hero = detail.slice(detail.indexOf('<section id="overview"'), detail.indexOf('<section id="fields"'));
    assert.match(hero, /养老服务机构/);
    assert.match(hero, /2025-12-22/);
    assert.match(hero, /资料截至.*原文未说明/);
    assert.match(hero, /打开官方原文核对/);
    assert.doesNotMatch(detail, /原始发布单位与标题/);
    assert.match(detail, /2025-12-22/);
    assert.match(detail, /来源第 2 条/);
    assert.doesNotMatch(detail, /工作表第/);
    assert.match(detail, /原表床位数.*本来源未提供/);
    assert.match(detail, /提供服务内容.*照护/);
    assert.match(detail, /服务团队.*本来源未提供/);
    assert.match(detail, /不代表当前空床/);
    assert.match(detail, /联系电话：<\/dt><dd[^>]*>本来源未提供/);
    assert.doesNotMatch(detail, /href="tel:|可立即预约/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH; else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('Hunan source anomalies keep raw values but do not present them as verified address or cleaned name', () => {
  const hunanManifest: NationalOfficialManifest = {
    ...manifest,
    rowCount: 2,
    sources: [{ ...manifest.sources[0], id: 'hn-mzt-20260112', province: '湖南省', city: null, rowCount: 2 }],
    provinces: [{ slug: 'hunan', name: '湖南省', count: 2, cities: [{ slug: 'shaoyang', name: '邵阳市', count: 2, indexPath: 'hunan/shaoyang/index.v1.json' }] }],
  };
  const records: NationalOfficialIndex['records'] = [
    { id: 'hn-mzt-20260112-0708', sourceId: 'hn-mzt-20260112', rowNumber: 708, name: '邵阳县黄亭市区域性敬老院', address: '169', beds: 100, chunk: 'chunk-001.v1.json' },
    { id: 'hn-mzt-20260112-1667', sourceId: 'hn-mzt-20260112', rowNumber: 1667, name: ':涟源正弘健康养老服务有限公司', address: null, beds: 0, chunk: 'chunk-001.v1.json' },
  ];
  const hunanIndex: NationalOfficialIndex = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'hunan', citySlug: 'shaoyang', records };
  const list = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, { manifest: hunanManifest, index: hunanIndex, query: { province: 'hunan', city: 'shaoyang' } }));
  assert.match(list, /来源第 708 条/);
  assert.match(list, /原表仅填“169”，详细地址无法确定/);
  assert.match(list, /原表名称以冒号开头/);
  const addressDetail = renderToStaticMarkup(React.createElement(NationalOfficialDetailContent, { manifest: hunanManifest, record: { ...records[0], residentCount: null, staffCount: null, services: null }, from: null }));
  assert.match(addressDetail, /来源第 708 条/);
  assert.match(addressDetail, /工作表第 710 行/);
  assert.match(addressDetail, /原表仅填“169”，详细地址无法确定/);
  const nameDetail = renderToStaticMarkup(React.createElement(NationalOfficialDetailContent, { manifest: hunanManifest, record: { ...records[1], residentCount: null, staffCount: null, services: null }, from: null }));
  assert.match(nameDetail, /:涟源正弘健康养老服务有限公司/);
  assert.match(nameDetail, /原表名称以冒号开头/);
  assert.match(nameDetail, /工作表第 1669 行/);
});
