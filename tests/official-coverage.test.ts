import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assertOfficialCoverageSnapshot, buildOfficialCoverage } from '../lib/official-coverage';
import { OfficialCoverageView } from '../components/OfficialCoverageView';
import NationalOfficialPage from '../app/quanguo/laiyuan/page';
import type { ReferenceProvince } from '../lib/institution-reference-types';
import type { NationalOfficialProvince } from '../lib/national-official-types';

Object.assign(globalThis, { React });

function reference(name: string, slug: string, count: number): ReferenceProvince {
  return { name, slug, count, cities: [] };
}

function official(name: string, slug: string, count: number): NationalOfficialProvince {
  return { name, slug, count, cities: [] };
}

test('coverage joins province names while preserving source-specific slugs and row units', () => {
  const result = buildOfficialCoverage(
    [reference('江苏省', 'p-jiangsu', 12), reference('上海市', 'p-shanghai', 8)],
    [official('江苏省', 'jiangsu', 5)],
    0,
  );
  assert.deepEqual(result.regions, [
    { name: '江苏省', referenceSlug: 'p-jiangsu', referenceCount: 12, officialSlug: 'jiangsu', officialRowCount: 5 },
    { name: '上海市', referenceSlug: 'p-shanghai', referenceCount: 8, officialSlug: null, officialRowCount: 0 },
  ]);
  assert.equal(result.officialRegionCount, 1);
  assert.equal(result.pendingRegionCount, 1);
  assert.equal(result.officialRowCount, 5);
  assert.equal(result.referenceRowCount, 20);
});

test('coverage adds Guangdong only from its separate official source snapshot', () => {
  const result = buildOfficialCoverage(
    [reference('广东省', 'p-guangdong', 10), reference('上海市', 'p-shanghai', 8)], [], 3,
  );
  assert.deepEqual(result.regions[0], {
    name: '广东省', referenceSlug: 'p-guangdong', referenceCount: 10,
    officialSlug: 'guangdong', officialRowCount: 3,
  });
  assert.equal(result.officialRowCount, 3);
});

test('coverage rejects ambiguous names, missing matches and invalid counts', () => {
  const ref = [reference('广东省', 'p-guangdong', 10)];
  assert.throws(() => buildOfficialCoverage([...ref, ...ref], [], 3), /重复|唯一/);
  assert.throws(() => buildOfficialCoverage(ref, [official('广东省', 'guangdong', 1)], 3), /广东|重复/);
  assert.throws(() => buildOfficialCoverage(ref, [official('上海市', 'shanghai', 1)], 3), /匹配|上海/);
  assert.throws(() => buildOfficialCoverage(ref, [], -1), /计数|非负/);
  assert.throws(() => buildOfficialCoverage([reference('广东省', 'p-guangdong', Number.NaN)], [], 3), /计数/);
  assert.throws(() => buildOfficialCoverage(ref, [], 0.5), /计数|整数/);
  assert.throws(() => buildOfficialCoverage(
    [reference('江苏省', 'p-jiangsu', 1)],
    [official('江苏省', 'jiangsu', 1), official('江苏省', 'other', 2)], 0,
  ), /重复/);
  assert.throws(() => buildOfficialCoverage(ref, [], Number.MAX_SAFE_INTEGER + 1), /计数/);
  assert.throws(() => buildOfficialCoverage([], [], 0), /快照/);
  assert.throws(() => buildOfficialCoverage([reference('上海市', 'p-shanghai', 1)], [], 1), /广东.*匹配/);
});

test('zero source rows remain pending rather than claiming official coverage', () => {
  const result = buildOfficialCoverage(
    [reference('江苏省', 'p-jiangsu', 0), reference('广东省', 'p-guangdong', 1)],
    [official('江苏省', 'jiangsu', 0)], 0,
  );
  assert.equal(result.officialRegionCount, 0);
  assert.equal(result.pendingRegionCount, 2);
  assert.equal(result.regions[0].officialSlug, null);
});

test('real snapshots expose 31 regions, 13 with official rows and 18 pending', () => {
  const data = path.join(process.cwd(), 'public', 'data');
  const references = JSON.parse(readFileSync(path.join(data, 'qcc-institutions', 'manifest.v1.json'), 'utf8'));
  const officials = JSON.parse(readFileSync(path.join(data, 'national-official', 'manifest.v1.json'), 'utf8'));
  const guangdong = JSON.parse(readFileSync(path.join(data, 'guangdong-source-records.v1.json'), 'utf8'));
  const coverage = buildOfficialCoverage(references.provinces, officials.provinces, guangdong.records.length);
  assert.equal(coverage.regions.length, 31);
  assert.equal(coverage.officialRegionCount, 13);
  assert.equal(coverage.pendingRegionCount, 18);
  assert.equal(coverage.officialRowCount, 8500);
  assert.equal(coverage.referenceRowCount, 41955);

  const markup = renderToStaticMarkup(React.createElement(OfficialCoverageView, { coverage }));
  assert.match(markup, /31.*13.*8,500/);
  assert.match(markup, /18.*待补/);
  assert.match(markup, /\/quanguo\/laiyuan\/\?province=guangdong/);
  assert.match(markup, /\/quanguo\/cankao\/sheng\/p-2e9414cac2ca\//);
  assert.match(markup, /上海市/);
  assert.doesNotMatch(markup, /上海市[^<]*0 家养老机构/);
});

test('build-time coverage refuses incomplete or mismatched real snapshots', () => {
  const data = path.join(process.cwd(), 'public', 'data');
  const references = JSON.parse(readFileSync(path.join(data, 'qcc-institutions', 'manifest.v1.json'), 'utf8'));
  const officials = JSON.parse(readFileSync(path.join(data, 'national-official', 'manifest.v1.json'), 'utf8'));
  const guangdong = JSON.parse(readFileSync(path.join(data, 'guangdong-source-records.v1.json'), 'utf8'));
  const coverage = buildOfficialCoverage(references.provinces, officials.provinces, guangdong.records.length);

  assert.doesNotThrow(() => assertOfficialCoverageSnapshot(coverage, references.rowCount, officials.rowCount, guangdong.records.length));
  assert.doesNotThrow(() => NationalOfficialPage());
  assert.throws(() => assertOfficialCoverageSnapshot(
    { ...coverage, regions: coverage.regions.slice(1) }, references.rowCount, officials.rowCount, guangdong.records.length,
  ), /31/);
  assert.throws(() => assertOfficialCoverageSnapshot(coverage, references.rowCount, officials.rowCount + 1, guangdong.records.length), /官方来源/);
  assert.throws(() => assertOfficialCoverageSnapshot(coverage, references.rowCount + 1, officials.rowCount, guangdong.records.length), /线索/);
});
