import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMcaPublicLoader } from '../lib/mca-public-static';
import { mcaOfficialDetailHref } from '../lib/mca-preview-ui';

const id = 'AD3777D91F431D21E053E897A6C077E1';
const snapshotId = 'observed-aaaaaaaaaaaaaaaaaaaaaaaa';
const detailName = createHash('sha256').update(id).digest('hex') + '.v1.json';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mca-public-static-'));
  mkdirSync(join(root, 'details'));
  const manifest = {
    schemaVersion: 1, scope: 'partial_observed_mca_institutions', snapshotId,
    sourcePage: 'https://yanglao.mca.gov.cn/?#/index/institutionList',
    snapshotCapturedAtUtc: '2026-11-18T17:58:00Z', generatedAtUtc: '2026-11-21T01:00:00Z',
    recordCount: 2, listObservedCount: 2, withDetailCount: 1, detailOnlyCount: 0,
    nationalComplete: false, currentStatusVerified: false,
    sourceSnapshots: [],
  };
  const row = {
    mcaId: id, detailPath: 'details/' + detailName,
    name: '测试养老院', facilityTypeCode: '3', facilityTypeLabel: '养老机构',
    areaCode: '110101', regionLabel: '北京市', regionPath: '北京市/东城区', address: '测试路 1 号',
    listedBeds: 55, nursingBeds: 55, listedMonthlyFeeMin: 8000, listedMonthlyFeeMax: 15000,
    platformStarCode: '02', evaluationCount: 0, overallEvaluation: 0,
    functionPositioningLabel: '机构养老', platformTagsRaw: '护理',
    listedContactPhone: { state: 'observed', value: '01012345678', observationCount: 1 },
    serviceCategoryLabel: { state: 'observed', value: '机构养老', observationCount: 1 },
    subsidyCode: { state: 'observed', value: '1', observationCount: 1 },
    dayCareBeds: { state: 'observed', value: 0, observationCount: 1 },
    fullCareBeds: { state: 'observed', value: 55, observationCount: 1 },
    listObservedAtUtc: { earliest: '2026-11-18T17:57:00Z', latest: '2026-11-18T17:58:00Z' },
    hasDetail: true, listObservationCount: 1, detailObservationCount: 1, conflictFields: [],
  };
  const index = { schemaVersion: 1, snapshotId, records: [row, {
    ...row, mcaId: 'BA7E6A754BB0A66AE053E897A6C0B507', name: '仅列表记录',
    detailPath: null, hasDetail: false, detailObservationCount: 0,
  }] };
  const detail = { schemaVersion: 1, snapshotId, mcaId: id,
    sourcePage: mcaOfficialDetailHref(id),
    detailObservedAtUtc: { earliest: '2026-11-18T17:57:30Z', latest: '2026-11-18T17:58:00Z' },
    platformDetail: { introduction: { state: 'observed', value: '原文介绍', observationCount: 1 } },
    facts: [], conflictLabels: [] };
  const write = (name: string, value: unknown) => writeFileSync(join(root, name), JSON.stringify(value));
  write('manifest.v1.json', manifest);
  write('index.v1.json', index);
  write('details/' + detailName, detail);
  return { root, manifest, index, detail, write };
}

test('公开 loader 只生成已采详情 ID，按同一快照读取精确 ID', () => {
  const data = fixture();
  try {
    const loader = createMcaPublicLoader(data.root);
    assert.equal(loader.getManifest().recordCount, 2);
    assert.deepEqual(loader.getDetailIds(), [id]);
    assert.equal(loader.getIndex().records[1].detailPath, null);
    assert.equal(loader.getDetail(id)?.mcaId, id);
    assert.equal(loader.getDetail('BA7E6A754BB0A66AE053E897A6C0B507'), null);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('公开 loader 拒绝私有全量声明、详情路径篡改和 ID 不匹配', () => {
  const data = fixture();
  try {
    const manifest = { ...data.manifest, nationalComplete: true };
    data.write('manifest.v1.json', manifest);
    assert.throws(() => createMcaPublicLoader(data.root).getManifest(), /清单|完整/);
    data.write('manifest.v1.json', data.manifest);
    data.write('manifest.v1.json', { ...data.manifest, detailOnlyCount: 1 });
    assert.throws(() => createMcaPublicLoader(data.root).getManifest(), /清单|完整/);
    data.write('manifest.v1.json', data.manifest);
    const index = { ...data.index, records: [{ ...data.index.records[0], detailPath: 'details/other.v1.json' }, data.index.records[1]] };
    data.write('index.v1.json', index);
    assert.throws(() => createMcaPublicLoader(data.root).getIndex(), /路径|索引/);
    data.write('index.v1.json', data.index);
    data.write('details/' + detailName, { ...data.detail, sourcePage: data.manifest.sourcePage });
    assert.throws(() => createMcaPublicLoader(data.root).getDetail(id), /ID|详情/);
    data.write('details/' + detailName, { ...data.detail, mcaId: 'wrong-id' });
    assert.throws(() => createMcaPublicLoader(data.root).getDetail(id), /ID|详情/);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('公开 loader 拒绝新增列表字段把未知或冲突冒充已观察值', () => {
  const data = fixture();
  try {
    data.write('index.v1.json', { ...data.index, records: [
      { ...data.index.records[0], listedContactPhone: { state: 'observed', value: null, observationCount: 1 } },
      data.index.records[1],
    ] });
    assert.throws(() => createMcaPublicLoader(data.root).getIndex(), /索引|结构/);
    data.write('index.v1.json', { ...data.index, records: [
      { ...data.index.records[0], dayCareBeds: { state: 'conflict', value: 0, observationCount: 2 } },
      data.index.records[1],
    ] });
    assert.throws(() => createMcaPublicLoader(data.root).getIndex(), /索引|结构/);
    data.write('index.v1.json', { ...data.index, records: [
      { ...data.index.records[0], listObservedAtUtc: { earliest: '2026-11-19T00:00:00Z', latest: '2026-11-18T00:00:00Z' } },
      data.index.records[1],
    ] });
    assert.throws(() => createMcaPublicLoader(data.root).getIndex(), /索引|结构/);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});
