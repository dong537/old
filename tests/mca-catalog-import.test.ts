import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MCA_CATALOG_CSV_FIELDS, MCA_CSV_COLUMNS } from '../lib/mca-catalog-types';
import type { McaPublicIndex, McaPublicIndexRecord, McaPublicManifest } from '../lib/mca-public-types';
import { buildMcaCatalogProjection, publishMcaCatalogProjection } from '../scripts/import-mca-catalog';

const observedSnapshotId = 'observed-aaaaaaaaaaaaaaaaaaaaaaaa';
const generatedAtUtc = '2026-11-23T01:00:00.000Z';
const observedManifest: McaPublicManifest = {
  schemaVersion: 1, scope: 'partial_observed_mca_institutions', snapshotId: observedSnapshotId,
  sourcePage: 'https://yanglao.mca.gov.cn/?#/index/institutionList',
  snapshotCapturedAtUtc: '2026-11-20T00:00:00Z', generatedAtUtc,
  recordCount: 2, listObservedCount: 2, withDetailCount: 2, detailOnlyCount: 0,
  nationalComplete: false, currentStatusVerified: false, sourceSnapshots: [],
};
const missingString = { state: 'missing' as const, value: null, observationCount: 0 };
const missingNumber = { state: 'missing' as const, value: null, observationCount: 0 };

function observedRecord(mcaId: string): McaPublicIndexRecord {
  return {
    mcaId, detailPath: 'details/' + createHash('sha256').update(mcaId).digest('hex') + '.v1.json',
    name: '旧记录 ' + mcaId, facilityTypeCode: '1', facilityTypeLabel: '养老机构',
    areaCode: '110101000000', regionLabel: '北京市东城区', regionPath: '北京市/东城区',
    address: null, listedBeds: 12, nursingBeds: 2, listedMonthlyFeeMin: null,
    listedMonthlyFeeMax: null, platformStarCode: '02', evaluationCount: 0,
    overallEvaluation: 0, functionPositioningLabel: null, platformTagsRaw: null,
    hasDetail: true, listObservationCount: 1, detailObservationCount: 1, conflictFields: [],
    listedContactPhone: missingString, serviceCategoryLabel: missingString,
    subsidyCode: missingString, dayCareBeds: missingNumber, fullCareBeds: missingNumber,
    listObservedAtUtc: { earliest: '2026-11-20T00:00:00Z', latest: '2026-11-20T00:00:00Z' },
  };
}
const observedIndex: McaPublicIndex = {
  schemaVersion: 1, snapshotId: observedSnapshotId,
  records: [observedRecord('AD3777D91F431D21E053E897A6C077E1'), observedRecord('OLDONLY123')],
};

function csvRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ...Object.fromEntries(MCA_CSV_COLUMNS.map(key => [key, ''])),
    org_id: 'AD3777D91F431D21E053E897A6C077E1', name: '新记录', org_type: '养老机构',
    area: '北京市东城区', area_code: '110101000000', found_date: '2020-01-01 00:00:00',
    total_beds: '100', beds: '40', nursing_beds: '20', fee_month_min: '0', fee_month_max: '3000',
    tags: '公办,医养结合', services: '机构服务,日托服务', evaluation: '0', eval_count: '0',
    fee_detail_json: '[{"服务类型":"床位费","项目":"双人间","价格区间":"100元/月"}]',
    images_json: '["secret-file-name.jpg"]', status: 'ok', updated_at: '2026-11-23T00:40:10',
    ...overrides,
  };
}

function csv(rows: Record<string, string>[], columns: readonly string[] = MCA_CSV_COLUMNS): Buffer {
  const cell = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  return Buffer.from('\ufeff' + [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key] ?? '')).join(','))].join('\r\n'), 'utf8');
}

test('exact 52-column CSV yields 51 typed public fields, merged index, and no image filename', () => {
  assert.equal(MCA_CSV_COLUMNS.length, 52);
  assert.equal(MCA_CATALOG_CSV_FIELDS.length, 51);
  const source = csv([csvRow(), csvRow({ org_id: '312154669843480576', name: '数字 ID 机构',
    area: '河北省邢台市巨鹿县', area_code: '130529000000', status: 'stale' })]);
  const output = buildMcaCatalogProjection(source, observedManifest, observedIndex, generatedAtUtc);
  assert.equal(output.manifest.sourceCsvSha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(output.manifest.snapshotId, 'catalog-' + createHash('sha256')
    .update(output.manifest.sourceCsvSha256 + ':' + observedSnapshotId).digest('hex').slice(0, 24));
  assert.equal(output.manifest.csvRowCount, 2);
  assert.equal(output.manifest.csvStaleCount, 1);
  assert.equal(output.manifest.overlapCount, 1);
  assert.equal(output.manifest.recordCount, 3);
  assert.equal(output.manifest.detailCount, 3);
  assert.equal(output.details.length, 2);
  const existing = output.index.records.find(item => item.mcaId === 'AD3777D91F431D21E053E897A6C077E1');
  const oldOnly = output.index.records.find(item => item.mcaId === 'OLDONLY123');
  const stale = output.index.records.find(item => item.mcaId === '312154669843480576');
  assert.equal(existing?.sourceKind, 'csv');
  assert.equal(existing?.name, '新记录');
  assert.equal(existing?.listedBeds, 100);
  assert.equal(existing?.fullCareBeds.value, 40);
  assert.equal(oldOnly?.sourceKind, 'observed');
  assert.equal(oldOnly?.detailPath, observedIndex.records[1].detailPath);
  assert.equal(stale?.sourceKind, 'csv');
  assert.equal(stale?.collectorStatus, 'stale');
  assert.equal(stale?.regionPath, '河北省/邢台市/巨鹿县');
  assert.deepEqual(existing?.conflictFields, ['listedBeds']);
  const detail = output.details.find(item => item.mcaId === existing?.mcaId);
  assert.ok(detail);
  assert.equal(detail.fields.found_date, '2020-01-01');
  assert.equal(detail.fields.fee_month_min, 0);
  assert.equal(detail.fields.beds, 40);
  assert.deepEqual(detail.fields.tags, ['公办', '医养结合']);
  assert.deepEqual(detail.fields.services, ['机构服务', '日托服务']);
  assert.deepEqual(detail.fields.fee_detail_json, [{ serviceType: '床位费', project: '双人间', priceRangeText: '100元/月' }]);
  assert.equal(Object.keys(detail.fields).length, 51);
  assert.deepEqual(Object.keys(detail.fields).sort(), [...MCA_CATALOG_CSV_FIELDS].sort());
  assert.doesNotMatch(JSON.stringify(output), /images_json|secret-file-name/);
});

test('published files contain only CSV details; observed detail remains at its original path', () => {
  const output = buildMcaCatalogProjection(csv([csvRow()]), observedManifest, observedIndex, generatedAtUtc);
  const parent = mkdtempSync(path.join(tmpdir(), 'mca-catalog-import-'));
  const destination = path.join(parent, 'mca-catalog');
  try {
    publishMcaCatalogProjection(output, destination);
    const details = readdirSync(path.join(destination, 'details'));
    assert.equal(details.length, 1);
    assert.equal(details[0], createHash('sha256').update(output.details[0].mcaId).digest('hex') + '.v1.json');
    assert.equal(JSON.parse(readFileSync(path.join(destination, 'details', details[0]), 'utf8')).fields.images_json, undefined);
    assert.equal(JSON.parse(readFileSync(path.join(destination, 'index.v1.json'), 'utf8')).records.length, 2);
    writeFileSync(path.join(destination, 'details', 'user-note.txt'), 'preserve this file');
    assert.throws(() => publishMcaCatalogProjection(output, destination), /unexpected|unreviewed/i);
    assert.equal(readFileSync(path.join(destination, 'details', 'user-note.txt'), 'utf8'), 'preserve this file');
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('rejects altered headers, duplicate or malformed IDs, malformed JSON, negative and reversed fees', () => {
  const build = (rows: Record<string, string>[], columns?: readonly string[]) =>
    buildMcaCatalogProjection(csv(rows, columns), observedManifest, observedIndex, generatedAtUtc);
  assert.throws(() => build([csvRow()], [...MCA_CSV_COLUMNS].reverse()), /header|column/i);
  assert.throws(() => build([csvRow(), csvRow()]), /duplicate.*ID/i);
  assert.throws(() => build([csvRow({ org_id: '../bad' })]), /ID/i);
  assert.throws(() => build([csvRow({ fee_detail_json: '{bad' })]), /JSON/i);
  assert.throws(() => build([csvRow({ images_json: '{bad' })]), /JSON/i);
  assert.throws(() => build([csvRow({ fee_month_min: '-1' })]), /negative/i);
  assert.throws(() => build([csvRow({ fee_month_min: '4000', fee_month_max: '3000' })]), /range/i);
  assert.throws(() => build([csvRow({ total_beds: 'twelve' })]), /number/i);
});
