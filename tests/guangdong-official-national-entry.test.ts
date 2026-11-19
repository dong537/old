import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NationalOfficialDirectoryContent } from '../components/NationalOfficialDirectoryView';
import { safeProvinceReturnPath } from '../components/ProvinceReturnToList';
import {
  guangdongOfficialCities, guangdongOfficialListHref, isGuangdongSourceCatalog,
  loadGuangdongSourceCatalog,
} from '../lib/guangdong-official-search';
import { searchProvinceRecords } from '../lib/province-search';
import type { ProvinceCatalog } from '../lib/province-types';
import type { NationalOfficialManifest } from '../lib/national-official-types';
import guangdong from '../public/data/guangdong-source-records.v1.json';
import national from '../public/data/national-official/manifest.v1.json';

Object.assign(globalThis, { React });
const catalog = guangdong as ProvinceCatalog;
const manifest = national as NationalOfficialManifest;

test('Guangdong source batch remains an independently validated 21-city input', async () => {
  assert.ok(isGuangdongSourceCatalog(catalog));
  assert.equal(catalog.records.length, 781);
  assert.equal(guangdongOfficialCities(catalog.records).length, 21);
  const requested: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return new Response(JSON.stringify(catalog), { status: 200 });
  }) as typeof fetch;
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    assert.equal((await loadGuangdongSourceCatalog(new AbortController().signal, fetcher)).snapshotId, catalog.snapshotId);
    assert.deepEqual(requested, ['/eldercare/data/guangdong-source-records.v1.json']);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('Guangdong catalog load fails visibly for HTTP or invalid data', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(loadGuangdongSourceCatalog(signal, (async () => new Response('missing', { status: 404 })) as typeof fetch), /HTTP 404/);
  await assert.rejects(loadGuangdongSourceCatalog(signal, (async () => new Response(JSON.stringify({ ...catalog, records: [] }), { status: 200 })) as typeof fetch), /格式无效/);
});

test('national official page renders Guangdong entries and keeps a safe filtered return', () => {
  const result = searchProvinceRecords(catalog.records, { city: '广州', q: '广州市海珠区社会福利院' });
  assert.equal(result.total, 1);
  const html = renderToStaticMarkup(React.createElement(NationalOfficialDirectoryContent, {
    manifest, index: null, guangdongCatalog: catalog,
    query: { province: 'guangdong', city: '广州', q: '广州市海珠区社会福利院' },
  }));
  assert.match(html, /广东省 · 广州/);
  assert.match(html, /广州市海珠区社会福利院/);
  assert.match(html, /\/guangdong\/jigou\/gd-src-000347\/\?from=/);
  const from = guangdongOfficialListHref({ city: '广州', q: '广州市海珠区社会福利院', page: 2 });
  assert.equal(safeProvinceReturnPath(from), from);
  assert.equal(safeProvinceReturnPath('/quanguo/laiyuan/?province=other&city=%E5%B9%BF%E5%B7%9E'), '/guangdong/jigou/');
  assert.equal(safeProvinceReturnPath('//evil.example/path'), '/guangdong/jigou/');
});
