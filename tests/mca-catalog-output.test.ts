import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MCA_CATALOG_CSV_FIELDS } from '../lib/mca-catalog-types';
import { MCA_CATALOG_SOURCE_LOCK, validateMcaCatalogOutput } from '../scripts/check-mca-catalog-output';
import { scanPublicOutput } from '../scripts/check-public-output';

const root = 'data/mca-catalog/';
const sourceSha = 'a'.repeat(64);
const observedManifest = JSON.parse(readFileSync('public/data/mca-observed/manifest.v1.json', 'utf8'));
const old = JSON.parse(readFileSync('public/data/mca-observed/index.v1.json', 'utf8')).records.find(
  (row: { hasDetail: boolean; listObservationCount: number }) => !row.hasDetail && row.listObservationCount > 0,
);
const csvId = 'CSV-CATALOG-TEST-1';
const snapshotId = 'catalog-' + createHash('sha256').update(sourceSha + ':' + observedManifest.snapshotId).digest('hex').slice(0, 24);
const detailPath = 'details/' + createHash('sha256').update(csvId).digest('hex') + '.v1.json';
const oldFiles = new Map<string, string>([
  ['data/mca-observed/manifest.v1.json', JSON.stringify({
    schemaVersion: 1, scope: 'partial_observed_mca_institutions', snapshotId: observedManifest.snapshotId,
    sourcePage: 'https://yanglao.mca.gov.cn/?#/index/institutionList',
    snapshotCapturedAtUtc: '2026-11-20T00:00:00Z', generatedAtUtc: '2026-11-23T00:00:00Z',
    recordCount: 1, listObservedCount: 1, withDetailCount: 0, detailOnlyCount: 0,
    nationalComplete: false, currentStatusVerified: false,
    sourceSnapshots: [{ lane: 'synthetic', sha256: 'b'.repeat(64), capturedAtUtc: '2026-11-20T00:00:00Z' }],
  })],
  ['data/mca-observed/index.v1.json', JSON.stringify({ schemaVersion: 1, snapshotId: observedManifest.snapshotId, records: [old] })],
]);

function fixture() {
  const fields: Record<string, unknown> = Object.fromEntries(MCA_CATALOG_CSV_FIELDS.map(key => [key, null]));
  Object.assign(fields, {
    org_id: csvId, name: '测试养老机构', org_type: '养老机构', area: '北京市 / 东城区',
    area_code: '110101', status: 'ok', updated_at: '2026-11-23T12:34:56',
    total_beds: 0, beds: 12, nursing_beds: 3, tags: ['民办'], services: ['机构服务'],
    found_date: '2021-04-13', fee_detail_json: [
      { serviceType: '机构服务', project: '单人间', priceRangeText: '100元/天' },
    ],
  });
  const csvRecord = { ...old, mcaId: csvId, name: '测试养老机构', detailPath, hasDetail: true,
    listObservationCount: 0, detailObservationCount: 1, listObservedAtUtc: null,
    sourceKind: 'csv', collectorStatus: 'ok', csvUpdatedAtLocal: '2026-11-23T12:34:56' };
  const oldRecord = { ...old, sourceKind: 'observed', collectorStatus: null, csvUpdatedAtLocal: null };
  const manifest = { schemaVersion: 1, scope: 'partial_mca_csv_catalog', snapshotId,
    observedSnapshotId: observedManifest.snapshotId, sourceCsvSha256: sourceSha,
    csvExportDate: '2026-11-23', generatedAtUtc: '2026-11-23T12:00:00Z',
    csvRowCount: 1, csvStaleCount: 0, observedRecordCount: 1, overlapCount: 0,
    recordCount: 2, detailCount: 1 + Number(old.detailPath !== null),
    nationalComplete: false, currentStatusVerified: false };
  const index = { schemaVersion: 1, snapshotId, records: [oldRecord, csvRecord] };
  const detail = { schemaVersion: 1, snapshotId, mcaId: csvId, sourceKind: 'csv', fields };
  const files = new Map<string, string>();
  const save = () => {
    files.set(root + 'manifest.v1.json', JSON.stringify(manifest));
    files.set(root + 'index.v1.json', JSON.stringify(index));
    files.set(root + detailPath, JSON.stringify(detail));
  };
  save();
  return { files, manifest, index, detail, fields, save };
}

test('catalog release requires exact typed CSV fields and a complete ID union', () => {
  const data = fixture();
  validateMcaCatalogOutput(data.files, oldFiles);

  (data.fields as Record<string, unknown>).images_json = 'private-photo-file-id';
  data.save();
  assert.throws(() => validateMcaCatalogOutput(data.files, oldFiles), /字段|图片/);
  delete (data.fields as Record<string, unknown>).images_json;

  data.fields.total_beds = -1;
  data.save();
  assert.throws(() => validateMcaCatalogOutput(data.files, oldFiles), /数值|字段/);
  data.fields.total_beds = 0;

  data.index.records.pop();
  data.save();
  assert.throws(() => validateMcaCatalogOutput(data.files, oldFiles), /索引|数量|缺失/);
});

test('catalog release checks snapshot, source lock, status and missing detail', () => {
  const data = fixture();
  const lock = { sourceCsvSha256: sourceSha, csvRowCount: 1, csvStaleCount: 0 };
  validateMcaCatalogOutput(data.files, oldFiles, lock);

  assert.throws(() => validateMcaCatalogOutput(data.files, oldFiles,
    { ...lock, sourceCsvSha256: 'b'.repeat(64) }), /来源|SHA|哈希/);

  data.detail.snapshotId = 'catalog-wrong';
  data.save();
  assert.throws(() => validateMcaCatalogOutput(data.files, oldFiles), /快照|snapshot/);
  data.detail.snapshotId = snapshotId;

  data.fields.status = 'active';
  data.save();
  assert.throws(() => validateMcaCatalogOutput(data.files, oldFiles), /状态|字段/);
  data.fields.status = 'ok';

  data.save();
  data.files.delete(root + detailPath);
  assert.throws(() => validateMcaCatalogOutput(data.files, oldFiles), /详情|缺失|数量/);
});

test('public scan delegates approved catalog paths to strict validation and rejects extra files', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mca-catalog-scan-'));
  const catalog = path.join(dir, 'data', 'mca-catalog');
  try {
    mkdirSync(catalog, { recursive: true });
    writeFileSync(path.join(catalog, 'manifest.v1.json'), '{}');
    await assert.rejects(scanPublicOutput(dir), /MCA目录投影缺失|MCA目录投影.*字段/);
    writeFileSync(path.join(catalog, 'unreviewed.json'), '{}');
    await assert.rejects(scanPublicOutput(dir), /MCA数据|MCA目录投影.*路径/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('published catalog projects every locked CSV row into one typed detail', () => {
  const files = new Map<string, string>();
  const observed = new Map<string, string>();
  function walk(folder: string, result: Map<string, string>): void {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(absolute, result);
      else if (entry.isFile()) result.set(path.relative('public', absolute).split(path.sep).join('/'), readFileSync(absolute, 'utf8'));
    }
  }
  walk('public/data/mca-catalog', files);
  walk('public/data/mca-observed', observed);
  validateMcaCatalogOutput(files, observed, MCA_CATALOG_SOURCE_LOCK);
  const manifest = JSON.parse(files.get(root + 'manifest.v1.json')!);
  assert.equal(manifest.csvRowCount, 3497);
  assert.equal(manifest.recordCount, 6520);
  assert.equal(manifest.detailCount, 3597);
});

test('public scan permits source prose about registration authority only in the reviewed introduction', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mca-catalog-intro-'));
  const data = fixture();
  const write = () => {
    for (const [relative, value] of [...oldFiles, ...data.files]) {
      const file = path.join(dir, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, value);
    }
  };
  try {
    data.fields.intro = '机构由登记机关备案。' + String.fromCharCode(11);
    data.save(); write();
    assert.equal((await scanPublicOutput(dir)).filesScanned, 5);

    data.fields.intro = '机构由登记机关备案。';
    data.save(); write();
    const page = path.join(dir, 'quanguo', 'pingtai', csvId, 'index.html');
    mkdirSync(path.dirname(page), { recursive: true });
    writeFileSync(page, '<p>机构由登记机关备案。</p><script>"机构由登记机关备案。"</script>');
    assert.equal((await scanPublicOutput(dir)).filesScanned, 6);
    writeFileSync(page, '<p>机构由登记机关备案。</p><div>另一处登记机关字段</div>');
    await assert.rejects(scanPublicOutput(dir), /介绍以外|私有/);
    writeFileSync(page, '<p>机构由登记机关备案。</p>');

    data.fields.service_detail = '登记机关：不应豁免';
    data.save(); write();
    await assert.rejects(scanPublicOutput(dir), /私有/);
    data.fields.service_detail = null;

    data.fields.intro = 'companyCreditCode';
    data.save(); write();
    await assert.rejects(scanPublicOutput(dir), /私有/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public scan recognizes a reviewed introduction split across Next flight chunks', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mca-catalog-flight-intro-'));
  const data = fixture();
  const intro = '机构全称：测试养老机构 登记机关：当地民政部门 业务范围：养老服务。';
  data.fields.intro = intro;
  data.save();
  const page = path.join(dir, 'quanguo', 'pingtai', csvId, 'index.html');
  const flight = JSON.stringify({ children: intro });
  const splitAt = flight.indexOf('登记机关') - 8;
  const chunk = (value: string) => '<script>self.__next_f.push([1,' + JSON.stringify(value) + '])</script>';
  const write = (extra = '') => {
    for (const [relative, value] of [...oldFiles, ...data.files]) {
      const file = path.join(dir, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, value);
    }
    mkdirSync(path.dirname(page), { recursive: true });
    writeFileSync(page, '<p>' + intro + '</p>' + chunk(flight.slice(0, splitAt)) +
      chunk(flight.slice(splitAt)) + extra);
  };
  try {
    write();
    assert.equal((await scanPublicOutput(dir)).filesScanned, 6);
    write(chunk(JSON.stringify({ children: '另一处登记机关字段不可借用介绍豁免' })));
    await assert.rejects(scanPublicOutput(dir), /介绍以外|私有/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
