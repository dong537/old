import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstitutionReferenceDetailContent } from '../components/InstitutionReferenceDetailView';
import { loadReferenceIndex, loadReferenceManifest } from '../lib/institution-reference-search';
import { institutionRegistryCandidateHref, loadInstitutionRegistryCityLinks, loadInstitutionRegistryLinksManifest } from '../lib/institution-registry-links';
import { sitePath } from '../lib/site-path';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';
import type { ReferenceIndex, ReferenceManifest, ReferenceDetailRecord } from '../lib/institution-reference-types';
import type { InstitutionRegistryCityLinks, InstitutionRegistryLinksManifest, InstitutionRegistryTarget } from '../lib/institution-registry-types';

Object.assign(globalThis, { React });

const p = 'p-aaaaaaaaaaaa';
const c = 'c-bbbbbbbbbbbb';
const refId = 'qi-aaaaaaaaaaaa-2';
const target: InstitutionRegistryTarget = {
  kind: 'nationalRegistry', id: 'qcc-n-cccccccccccccccccccc', provinceSlug: 'p-dddddddddddd',
  citySlug: 'c-eeeeeeeeeeee', province: '广东省', city: '广州', name: '不同名称的登记主体',
};
const referenceManifest: ReferenceManifest = {
  schemaVersion: 1, snapshotId: 'v1-reference', receivedAt: '2026-11-17', rowCount: 1,
  source: { title: '来源线索', sha256: 'a'.repeat(64), asOf: null },
  provinces: [{ slug: p, name: '广东省', count: 1, cities: [
    { slug: c, name: '广州市', count: 1, indexPath: `${p}/${c}/index.v1.json` },
  ] }],
};
const referenceIndex: ReferenceIndex = {
  schemaVersion: 1, snapshotId: 'v1-reference', provinceSlug: p, citySlug: c,
  records: [{ id: refId, sourceRow: 2, name: '甲养老院', region: '广东省广州市',
    address: null, beds: 0, chunk: 'chunk-001.v1.json' }],
};
const record: ReferenceDetailRecord = {
  id: refId, sourceRow: 2, name: '甲养老院', region: '广东省广州市',
  address: null, beds: 0, creditCode: '91440101MA0000001X', codeStatus: 'valid',
  sourceFields: Object.fromEntries(REFERENCE_SOURCE_FIELD_NAMES.map(key => [key, null])),
};
const manifest: InstitutionRegistryLinksManifest = {
  schemaVersion: 1, snapshotId: 'v1-links', referenceSnapshotId: 'v1-reference',
  nationalSnapshotId: 'v1-national', guangdongSnapshotId: 'v1-guangdong',
  referenceRowCount: 1, eligibleReferenceCount: 1, uniqueCodeHitCount: 1,
  linkedReferenceCount: 1, crossProvinceHitCount: 0, ambiguousReferenceCount: 0, regionCount: 1,
};
const cityLinks: InstitutionRegistryCityLinks = {
  schemaVersion: 1, snapshotId: 'v1-links', referenceSnapshotId: 'v1-reference',
  provinceSlug: p, citySlug: c, links: [{ referenceId: refId, target }],
};
const manifestPath = '/data/qcc-institution-registry-links/manifest.v1.json';
const cityPath = `/data/qcc-institution-registry-links/${p}/${c}/links.v1.json`;

function jsonFetch(files: Record<string, unknown>, requested: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    return url in files ? new Response(JSON.stringify(files[url]), { status: 200 }) : new Response('missing', { status: 404 });
  }) as typeof fetch;
}

test('registry candidate loader verifies all three snapshots and keeps site base path', async () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const requested: string[] = [];
    const files = {
      ['/eldercare' + manifestPath]: manifest,
      '/eldercare/data/qcc-national/manifest.v1.json': { schemaVersion: 1, snapshotId: 'v1-national' },
      '/eldercare/data/qcc/index.v1.json': { schemaVersion: 1, snapshotId: 'v1-guangdong' },
      ['/eldercare' + cityPath]: cityLinks,
    };
    const fetcher = jsonFetch(files, requested);
    const loaded = await loadInstitutionRegistryLinksManifest(referenceManifest, new AbortController().signal, fetcher);
    const city = await loadInstitutionRegistryCityLinks(loaded, referenceManifest, referenceIndex, new AbortController().signal, fetcher);
    assert.deepEqual(requested, Object.keys(files));
    assert.deepEqual(city.links[0].target, target);
    assert.equal(institutionRegistryCandidateHref(target),
      '/eldercare/quanguo/zhuti/detail/?province=p-dddddddddddd&city=c-eeeeeeeeeeee&id=qcc-n-cccccccccccccccccccc');
    assert.equal(institutionRegistryCandidateHref({ kind: 'guangdongRegistry', id: 'gd-qcc-' + 'f'.repeat(20),
      provinceSlug: null, citySlug: null, province: '广东省', city: '广州', name: '另一个主体' }),
    '/eldercare/guangdong/zhuti/detail/?id=gd-qcc-ffffffffffffffffffff');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('registry candidate loader rejects stale snapshots, wrong province, orphan IDs and unsafe routes', async () => {
  const signal = new AbortController().signal;
  const sourceFiles = {
    [sitePath('/data/qcc-national/manifest.v1.json')]: { schemaVersion: 1, snapshotId: 'v1-national' },
    [sitePath('/data/qcc/index.v1.json')]: { schemaVersion: 1, snapshotId: 'v1-guangdong' },
  };
  const loadManifest = (value: unknown) => loadInstitutionRegistryLinksManifest(referenceManifest, signal,
    jsonFetch({ ...sourceFiles, [sitePath(manifestPath)]: value }, []));
  await assert.rejects(loadManifest({ ...manifest, nationalSnapshotId: 'v1-stale' }), /快照/);
  await assert.rejects(loadManifest({ ...manifest, linkedReferenceCount: 0 }), /格式/);
  await assert.rejects(loadManifest({ ...manifest, extra: 'phone' }), /格式/);
  const loadCity = (value: unknown) => loadInstitutionRegistryCityLinks(manifest, referenceManifest, referenceIndex, signal,
    jsonFetch({ [sitePath(cityPath)]: value }, []));
  await assert.rejects(loadCity({ ...cityLinks, snapshotId: 'v1-stale' }), /快照/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: 'qi-aaaaaaaaaaaa-3', target }] }), /引用/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: refId, target: { ...target, province: '重庆市' } }] }), /目标/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: refId, target: { ...target, citySlug: '../escape' } }] }), /目标/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: refId, target: { ...target, phone: '13800000000' } }] }), /目标/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: refId, target }, { referenceId: refId, target }] }), /引用/);
  await assert.rejects(loadCity({ ...cityLinks, links: [] , extra: true }), /格式/);
  await assert.rejects(loadInstitutionRegistryCityLinks(manifest, referenceManifest, referenceIndex, signal, jsonFetch({}, [])), /HTTP/);
});

test('failed candidate sections preserve the core reference detail and offer retry', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, {
    manifest: referenceManifest, record, provinceName: '广东省', cityName: '广州市', from: null,
    officialError: '官方快照暂不可用', onOfficialRetry: () => {},
    registryError: '主体快照暂不可用', onRegistryRetry: () => {},
  }));
  assert.match(html, /原表床位数/);
  assert.match(html, /工作表第 2 行/);
  assert.match(html, /官方来源候选暂时不可用/);
  assert.match(html, /登记主体候选暂时不可用/);
  assert.equal((html.match(/重试候选关联/g) ?? []).length, 2);
  const matched = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, {
    manifest: referenceManifest, record, provinceName: '广东省', cityName: '广州市', from: null,
    officialCandidates: [], registryCandidates: [target],
  }));
  assert.match(matched, /名称不同，仅说明代码相同/);
  assert.match(matched, /查看登记主体记录/);
  assert.match(matched, /本站已收录的官方来源中未发现同省同名记录/);
});

test('real registry projection covers every city and reconciles the published totals', async () => {
  const prefix = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH ?? '';
  const publicRoot = join(process.cwd(), 'public');
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith(prefix + '/data/')) return new Response('unexpected path', { status: 404 });
    try {
      return new Response(readFileSync(join(publicRoot, url.slice(prefix.length + 1))), { status: 200 });
    } catch {
      return new Response('missing', { status: 404 });
    }
  }) as typeof fetch;
  const signal = new AbortController().signal;
  const reference = await loadReferenceManifest(signal, fetcher);
  const linksManifest = await loadInstitutionRegistryLinksManifest(reference, signal, fetcher);
  let regions = 0;
  let linked = 0;
  for (const province of reference.provinces) {
    for (const city of province.cities) {
      const index = await loadReferenceIndex(reference, province.slug, city.slug, signal, fetcher);
      const links = await loadInstitutionRegistryCityLinks(linksManifest, reference, index, signal, fetcher);
      regions++;
      linked += links.links.length;
      for (const item of links.links) assert.ok(institutionRegistryCandidateHref(item.target).startsWith(prefix + '/'));
    }
  }
  assert.equal(regions, linksManifest.regionCount);
  assert.equal(linked, linksManifest.linkedReferenceCount);
  assert.equal(linksManifest.uniqueCodeHitCount, linksManifest.linkedReferenceCount + linksManifest.crossProvinceHitCount);
});
