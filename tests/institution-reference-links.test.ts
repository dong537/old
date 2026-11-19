import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstitutionReferenceDetailContent } from '../components/InstitutionReferenceDetailView';
import {
  loadReferenceCityLinks, loadReferenceLinksManifest, officialCandidateHref,
} from '../lib/institution-reference-links';
import { loadReferenceIndex, loadReferenceManifest } from '../lib/institution-reference-search';
import { sitePath } from '../lib/site-path';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';
import type {
  ReferenceDetailRecord, ReferenceIndex, ReferenceLinksCityFile, ReferenceLinksManifest,
  ReferenceManifest, ReferenceOfficialMatch,
} from '../lib/institution-reference-types';

Object.assign(globalThis, { React });

const referenceManifest: ReferenceManifest = {
  schemaVersion: 1, snapshotId: 'v1-reference', receivedAt: '2026-11-17', rowCount: 1,
  source: { title: '企查查机构线索', sha256: 'a'.repeat(64), asOf: null },
  provinces: [{ slug: 'p-test', name: '重庆市', count: 1, cities: [
    { slug: 'c-test', name: '重庆市', count: 1, indexPath: 'p-test/c-test/index.v1.json' },
  ] }],
};
const referenceIndex: ReferenceIndex = {
  schemaVersion: 1, snapshotId: 'v1-reference', provinceSlug: 'p-test', citySlug: 'c-test',
  records: [{ id: 'qi-test-2', sourceRow: 2, name: '甲养老院', region: '重庆市', address: null, beds: 0, chunk: 'chunk-001.v1.json' }],
};
const record: ReferenceDetailRecord = {
  id: 'qi-test-2', sourceRow: 2, name: '甲养老院', region: '重庆市', address: null,
  beds: 0, creditCode: null, codeStatus: 'missing',
  sourceFields: Object.fromEntries(REFERENCE_SOURCE_FIELD_NAMES.map(key => [key, null])),
};
const nationalMatch: ReferenceOfficialMatch = {
  kind: 'nationalOfficial', id: 'cq-source-1', provinceSlug: 'chongqing', citySlug: 'chongqing',
  city: '重庆市', sourceTitle: '重庆民政局名录',
};
const guangdongMatch: ReferenceOfficialMatch = {
  kind: 'guangdongOfficial', id: 'gd-src-000001', provinceSlug: null, citySlug: null,
  city: '广州市', sourceTitle: '广东民政厅名录',
};
const linksManifest: ReferenceLinksManifest = {
  schemaVersion: 1, snapshotId: 'v1-links', referenceSnapshotId: 'v1-reference',
  officialSnapshotId: 'v1-official', guangdongSnapshotId: 'v1-guangdong',
  linkedReferenceCount: 1, matchCount: 1, regionCount: 1,
};
const cityLinks: ReferenceLinksCityFile = {
  schemaVersion: 1, snapshotId: 'v1-links', referenceSnapshotId: 'v1-reference',
  provinceSlug: 'p-test', citySlug: 'c-test',
  links: [{ referenceId: 'qi-test-2', matches: [nationalMatch] }],
};
const manifestPath = '/data/qcc-institution-links/manifest.v1.json';
const cityPath = '/data/qcc-institution-links/p-test/c-test/links.v1.json';

function jsonFetch(files: Record<string, unknown>, requested: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    return url in files ? new Response(JSON.stringify(files[url]), { status: 200 }) : new Response('missing', { status: 404 });
  }) as typeof fetch;
}

test('candidate links load only validated manifest and city files with base path', async () => {
  const previous = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
  process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare';
  try {
    const requested: string[] = [];
    const files = { ['/eldercare' + manifestPath]: linksManifest, ['/eldercare' + cityPath]: cityLinks };
    const fetcher = jsonFetch(files, requested);
    const loaded = await loadReferenceLinksManifest(referenceManifest, new AbortController().signal, fetcher);
    const city = await loadReferenceCityLinks(loaded, referenceManifest, referenceIndex, new AbortController().signal, fetcher);
    assert.deepEqual(requested, Object.keys(files));
    assert.deepEqual(city.links[0].matches, [nationalMatch]);
    assert.equal(officialCandidateHref(nationalMatch), '/eldercare/quanguo/laiyuan/detail/?province=chongqing&city=chongqing&id=cq-source-1');
    assert.equal(officialCandidateHref(guangdongMatch), '/eldercare/guangdong/jigou/gd-src-000001/');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH;
    else process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH = previous;
  }
});

test('candidate loader rejects stale snapshots, wrong region, orphan IDs, unsafe routes and HTTP failure', async () => {
  const signal = new AbortController().signal;
  const loadManifest = (value: unknown) => loadReferenceLinksManifest(referenceManifest, signal, jsonFetch({ [sitePath(manifestPath)]: value }, []));
  await assert.rejects(loadManifest({ ...linksManifest, referenceSnapshotId: 'v1-other' }), /快照/);
  await assert.rejects(loadManifest({ ...linksManifest, linkedReferenceCount: 2 }), /数量|格式/);
  await assert.rejects(loadManifest({ ...linksManifest, extra: true }), /格式/);
  const loadCity = (value: unknown) => loadReferenceCityLinks(linksManifest, referenceManifest, referenceIndex, signal, jsonFetch({ [sitePath(cityPath)]: value }, []));
  await assert.rejects(loadCity({ ...cityLinks, snapshotId: 'v1-other' }), /快照/);
  await assert.rejects(loadCity({ ...cityLinks, citySlug: 'c-wrong' }), /地区/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: 'qi-missing', matches: [nationalMatch] }] }), /引用|索引|格式/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: 'qi-test-2', matches: [{ ...nationalMatch, id: '../escape' }] }] }), /目标|格式|链接/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: 'qi-test-2', matches: [{ ...nationalMatch, citySlug: null }] }] }), /目标|格式|链接/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: 'qi-test-2', matches: [{ ...guangdongMatch, provinceSlug: 'guangdong' }] }] }), /目标|格式|链接/);
  await assert.rejects(loadCity({ ...cityLinks, links: [{ referenceId: 'qi-test-2', matches: [nationalMatch, nationalMatch] }] }), /重复|格式/);
  await assert.rejects(loadCity({ ...cityLinks, links: [] , extra: true }), /格式/);
  await assert.rejects(loadReferenceCityLinks(linksManifest, referenceManifest, referenceIndex, signal, jsonFetch({}, [])), /HTTP/);
});

test('candidate section labels a match as unverified and distinguishes a verified empty file', async () => {
  const matched = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, {
    manifest: referenceManifest, record, provinceName: '重庆市', cityName: '重庆市', from: null,
    officialCandidates: [nationalMatch],
  }));
  assert.match(matched, /同省同名官方来源候选/);
  assert.match(matched, /重庆民政局名录/);
  assert.match(matched, /候选匹配.*身份未核实/);
  assert.ok(matched.includes(`href="${officialCandidateHref(nationalMatch).replaceAll('&', '&amp;')}"`));
  const emptyCity = await loadReferenceCityLinks(linksManifest, referenceManifest, referenceIndex, new AbortController().signal, jsonFetch({ [sitePath(cityPath)]: { ...cityLinks, links: [] } }, []));
  const unmatched = renderToStaticMarkup(React.createElement(InstitutionReferenceDetailContent, {
    manifest: referenceManifest, record, provinceName: '重庆市', cityName: '重庆市', from: null,
    officialCandidates: emptyCity.links.find(item => item.referenceId === record.id)?.matches ?? [],
  }));
  assert.match(unmatched, /本站已收录的官方来源中未发现同省同名记录/);
  assert.match(unmatched, /不证明机构不存在/);
});

test('real candidate projection validates every city and reconciles manifest totals', async () => {
  const prefix = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH ?? '';
  const root = join(process.cwd(), 'public');
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith(prefix + '/data/')) return new Response('unexpected path', { status: 404 });
    try {
      return new Response(readFileSync(join(root, url.slice(prefix.length + 1))), { status: 200 });
    } catch {
      return new Response('missing', { status: 404 });
    }
  }) as typeof fetch;
  const signal = new AbortController().signal;
  const actual = await loadReferenceManifest(signal, fetcher);
  const actualLinks = await loadReferenceLinksManifest(actual, signal, fetcher);
  let regions = 0;
  let linked = 0;
  let matches = 0;
  for (const province of actual.provinces) {
    for (const city of province.cities) {
      const index = await loadReferenceIndex(actual, province.slug, city.slug, signal, fetcher);
      const links = await loadReferenceCityLinks(actualLinks, actual, index, signal, fetcher);
      regions += 1;
      linked += links.links.length;
      for (const entry of links.links) {
        matches += entry.matches.length;
        for (const match of entry.matches) assert.ok(officialCandidateHref(match).startsWith(prefix + '/'));
      }
    }
  }
  assert.equal(regions, actualLinks.regionCount);
  assert.equal(linked, actualLinks.linkedReferenceCount);
  assert.equal(matches, actualLinks.matchCount);
});
