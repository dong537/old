import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertPrivateOutputPath, buildProvinceReview, renderCandidateCsv, renderReviewCsv,
  verifyProvinceReviewOutput } from '../scripts/province-pipeline';

const header = ['city', 'institution_name', 'source_url', 'source_published_at', 'source_as_of', 'source_file', 'evidence_type', 'details'];
function row(values: string[]) { return values.map(value => '"' + value.replaceAll('"', '""') + '"').join(','); }
function observationCsv() {
  return [header.join(','),
    row(['江门', '安康养老院', 'https://example.org/a', '2026-09-04', '2026-08-31', 'city.csv', '官方名录', JSON.stringify({ source_row: '1', source_sha256: 'abc', address_as_published: '江门市A路1号', beds_as_published: '80', status_as_published: '在运营（原表标题口径）' })]),
    row(['江门', ' 安康养老院 ', 'https://example.org/b', '2025-01-01', '', 'old.csv', '官方历史名录', JSON.stringify({ source_row: '3', address: '江门市旧址', beds: 60, status_as_published: '暂停营业', source_period: '2025年' })]),
    row(['深圳', '安康养老院', 'https://example.org/c', '', '', 'other.csv', '官方名录', '{}']),
    row(['江门', '安康护理中心', 'https://example.org/d', '2026-02-02', '', 'care.csv', '官方名录', '{}']),
  ].join('\n');
}
const companyHeader = ['企业名称', '统一社会信用代码', '登记状态', '来源URL', '证据状态限制'];
function companyCsv() { return [companyHeader.join(','), row(['安康养老院', '914401045780276990', '存续', 'https://example.org/company', ''])].join('\n'); }

test('preserves observations and per-field source evidence without inventing institution identities', () => {
  const result = buildProvinceReview(observationCsv(), companyCsv());
  assert.equal(result.manifest.sourceRows, 4);
  assert.equal(result.manifest.cityCount, 2);
  assert.equal(result.candidateGroups.length, 3);
  const group = result.candidateGroups.find(item => item.city === '江门' && item.normalizedName === '安康养老院');
  assert.ok(group);
  assert.equal(group.institutionId, null);
  assert.equal(group.observationIds.length, 2);
  const address = result.claims.find(item => item.rawField === 'address_as_published' && item.value === '江门市A路1号');
  assert.ok(address);
  assert.equal(address.field, 'address');
  assert.equal(address.asOf, '2026-08-31');
  assert.equal(address.sourceUrl, 'https://example.org/a');
  assert.equal(address.sourcePointer, 'source_row:1');
  assert.equal(result.observations.find(item => item.name === '安康护理中心')?.candidateKey === group.candidateKey, false);
  assert.equal(result.companyMatchCandidates.length, 2);
  assert.ok(result.companyMatchCandidates.every(link => link.relationshipVerified === false));
  assert.ok(result.companyMatchCandidates.some(link => link.candidateKey === group.candidateKey));
});

test('flags raw status variation and stop signals for review without deciding current operation', () => {
  const result = buildProvinceReview(observationCsv());
  assert.equal(result.statusReviewQueue.length, 1);
  const item = result.statusReviewQueue[0];
  assert.ok(item.reasons.includes('possible_stop_or_pause'));
  assert.ok(item.reasons.includes('different_raw_statuses'));
  assert.deepEqual(item.signals.map(signal => signal.value).sort(), ['在运营（原表标题口径）', '暂停营业'].sort());
  assert.equal(result.candidateGroups.every(group => group.institutionId === null), true);
});

test('keeps and validates every company source URL in a separated multi-link field', () => {
  const combined = 'https://example.org/company-a | https://example.org/company-b';
  const result = buildProvinceReview(observationCsv(), companyCsv().replace('https://example.org/company', combined));
  assert.ok(result.companyMatchCandidates.every(link => link.companySourceUrlRaw === combined));
  assert.deepEqual(result.companyMatchCandidates[0].companySourceUrls,
    ['https://example.org/company-a', 'https://example.org/company-b']);
  assert.throws(() => buildProvinceReview(observationCsv(), companyCsv().replace('https://example.org/company',
    'https://example.org/company-a | not-a-url')), /source_url/);
});

test('queues same-address or same-source-row names as identity pairs without merging them', () => {
  const csv = [header.join(','),
    row(['江门', '甲养老院', 'https://example.org/roster', '2026-09-04', '', 'city.csv', '官方名录', JSON.stringify({ source_row: '1', address: '江门市 A路1号' })]),
    row(['江门', '乙护理站', 'https://example.org/roster', '2026-09-04', '', 'city.csv', '官方名录', JSON.stringify({ source_row: '1', address_as_published: '江门市A路1号' })]),
  ].join('\n');
  const result = buildProvinceReview(csv);
  assert.equal(result.candidateGroups.length, 2);
  assert.equal(result.identityPairReviewQueue.length, 1);
  assert.deepEqual(result.identityPairReviewQueue[0].reasons.sort(), ['same_address_ignoring_whitespace', 'same_source_row_pointer']);
  assert.equal(result.identityPairReviewQueue[0].identityVerified, false);
  assert.notEqual(result.identityPairReviewQueue[0].evidence[0].leftRawAddress, result.identityPairReviewQueue[0].evidence[0].rightRawAddress);
});

test('rejects malformed source evidence and invalid company identifiers instead of silently dropping rows', () => {
  assert.throws(() => buildProvinceReview(observationCsv().replace('https://example.org/a', 'broken-url')), /source_url/);
  const badJson = [header.join(','), row(['江门', '机构', 'https://example.org/a', '', '', 'city.csv', '名录', '{bad'])].join('\n');
  assert.throws(() => buildProvinceReview(badJson), /details/);
  assert.throws(() => buildProvinceReview(observationCsv(), companyCsv().replace('914401045780276990', 'invalid')), /统一社会信用代码/);
});

test('keeps every detail field and conflicting date metadata without treating prose as a precise date', () => {
  const rawDetails = {
    city: '江门市', source_published_at: '2025年名录（网页日期待核）', source_as_of: '2026年，原页未给精确统计截止日',
    institution_nature_as_published: '公办', medical_integration_as_published: '',
    filing_number_as_published: 'MZ-1', operating_status: '当前在营、许可和实体关系未核实',
    unusual_field: { source: '原表', text: '未解释' },
  };
  const csv = [header.join(','), row(['江门', '甲机构', 'https://example.org/a', '2026-09-04 10:30', '2026年，原页未给精确统计截止日', 'city.csv', '官方名录', JSON.stringify(rawDetails)])].join('\n');
  const result = buildProvinceReview(csv);
  assert.deepEqual(result.observations[0].rawDetails, rawDetails);
  assert.equal(result.observations[0].rawRow.source_as_of, '2026年，原页未给精确统计截止日');
  assert.equal(result.observations[0].publishedDate.isoDate, '2026-09-04');
  assert.equal(result.observations[0].publishedDate.precision, 'datetime_unzoned');
  assert.equal(result.observations[0].asOfDate.isoDate, null);
  assert.equal(result.observations[0].asOfDate.precision, 'unparsed');
  for (const field of ['institution_nature_as_published', 'medical_integration_as_published', 'filing_number_as_published', 'operating_status', 'unusual_field']) {
    assert.ok(result.claims.some(claim => claim.rawField === field), field);
  }
  assert.equal(result.claims.find(claim => claim.rawField === 'medical_integration_as_published')?.value, '');
  assert.deepEqual(result.claims.find(claim => claim.rawField === 'unusual_field')?.value, rawDetails.unusual_field);
  assert.ok(result.metadataReviewQueue[0].reasons.includes('detail_city_differs'));
  assert.ok(result.metadataReviewQueue[0].reasons.includes('detail_published_at_differs'));
  assert.ok(renderCandidateCsv(result).startsWith('\ufeff'));
  assert.ok(renderReviewCsv(result).includes('detail_published_at_differs'));
});

test('classifies a collection date misfiled as source_as_of as retrieval time only', () => {
  const csv = [header.join(','), row(['广州', '甲机构', 'https://example.org/list', '', '2026-11-13采集', 'capture.csv', '动态预览', '{}'])].join('\n');
  const result = buildProvinceReview(csv);
  const observation = result.observations[0];
  assert.equal(observation.asOfRaw, '2026-11-13采集');
  assert.equal(observation.asOf, null);
  assert.equal(observation.asOfDate.isoDate, null);
  assert.equal(observation.retrievedAt, '2026-11-13');
  assert.equal(result.manifest.retrievalDateMisfiledCount, 1);
  assert.ok(result.metadataReviewQueue[0].reasons.includes('retrieval_date_in_source_as_of'));
});

test('refuses a public output path', () => {
  const root = path.resolve('.');
  assert.throws(() => assertPrivateOutputPath(root, path.join(root, 'public', 'data', 'province.json')), /private/);
  assert.doesNotThrow(() => assertPrivateOutputPath(root, path.join(root, 'data', 'private', 'province.json')));
});

test('read-only output check detects changed input, output hashes and line counts', () => {
  const result = buildProvinceReview(observationCsv());
  const jsonl = (values: unknown[]) => values.map(value => JSON.stringify(value)).join('\n') + '\n';
  const files = {
    'observations.jsonl': jsonl(result.observations),
    'candidate-groups.jsonl': jsonl(result.candidateGroups),
  };
  const outputSha256 = Object.fromEntries(Object.entries(files).map(([name, contents]) =>
    [name, createHash('sha256').update(contents).digest('hex')]));
  const manifest = { ...result.manifest, outputSha256 };
  assert.doesNotThrow(() => verifyProvinceReviewOutput(result, manifest, files));
  assert.throws(() => verifyProvinceReviewOutput(result, { ...manifest, sourceRows: 5 }, files), /sourceRows/);
  assert.throws(() => verifyProvinceReviewOutput(result, manifest,
    { ...files, 'observations.jsonl': files['observations.jsonl'] + 'tampered\n' }), /sha256/);
  const shortened = jsonl(result.observations.slice(1));
  const shortenedFiles = { ...files, 'observations.jsonl': shortened };
  const shortenedManifest = { ...manifest, outputSha256: { ...outputSha256,
    'observations.jsonl': createHash('sha256').update(shortened).digest('hex') } };
  assert.throws(() => verifyProvinceReviewOutput(result, shortenedManifest, shortenedFiles), /行数/);
  const altered = files['observations.jsonl'].replace('安康养老院', '虚假养老院');
  const alteredFiles = { ...files, 'observations.jsonl': altered };
  const alteredManifest = { ...manifest, outputSha256: { ...outputSha256,
    'observations.jsonl': createHash('sha256').update(altered).digest('hex') } };
  assert.throws(() => verifyProvinceReviewOutput(result, alteredManifest, alteredFiles), /可再生内容/);
});

const realObservations = 'data/private/guangdong-eldercare-source/exports/20261114_batch10/机构名录_逐条来源.csv';
const realCompanies = 'data/private/guangdong-eldercare-source/research-batch8/paid-registration/exports/累计机构与直接照护工商_25字段.csv';
test('real tenth-batch observations remain 2,129 rows and 1,676 name keys with the current company snapshot',
  { skip: !existsSync(realObservations) || !existsSync(realCompanies) }, () => {
    const result = buildProvinceReview(readFileSync(realObservations, 'utf8'), readFileSync(realCompanies, 'utf8'));
    assert.equal(result.manifest.sourceRows, 2129);
    assert.equal(result.manifest.cityCount, 21);
    assert.equal(result.candidateGroups.length, 1676);
    assert.equal(result.manifest.companyRows, 596);
    assert.equal(result.manifest.detailFieldCount, 74);
    assert.equal(result.manifest.topLevelAsOfMissing, 1193);
    assert.equal(result.manifest.topLevelPublishedNotPureDate, 1001);
    assert.equal(result.manifest.detailCityRawDifferences, 210);
    assert.equal(result.manifest.detailPublishedRawDifferences, 29);
    assert.equal(result.manifest.retrievalDateMisfiledCount, 14);
    assert.equal(result.manifest.companyMultiUrlRows, 90);
    assert.deepEqual(result.manifest.asOfPrecisionCounts,
      { missing: 1207, day: 219, month: 275, year: 180, datetime_unzoned: 0, unparsed: 248 });
    assert.equal(result.identityPairReviewQueue.filter(pair => pair.reasons.includes('same_address_ignoring_whitespace')).length, 19);
    assert.equal(result.detailFieldInventory.find(field => field.rawField === '原始序号')?.fieldRole, 'source_metadata');
    assert.ok(result.candidateGroups.every(group => group.institutionId === null));
    assert.ok(result.companyMatchCandidates.every(link => link.relationshipVerified === false));
  });
