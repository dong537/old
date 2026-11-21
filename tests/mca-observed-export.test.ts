import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import type { McaPreviewCatalog, McaPreviewDetail, McaPreviewIndexRecord } from '../lib/mca-preview-types';
import { buildMcaCandidate, buildPublicProjection, loadMcaCandidate, publishMcaPublicProjection,
  PRIVATE_OUTPUT, PRIVATE_STAGE_PARENT, PUBLIC_DIR } from '../scripts/build-mca-observed-export';

const snapshotId = 'observed-aaaaaaaaaaaaaaaaaaaaaaaa';
const observedAt = '2026-11-20T12:00:00Z';

function record(mcaId: string, hasDetail: boolean): McaPreviewIndexRecord {
  return {
    mcaId, detailPath: 'details/private-file.json', name: mcaId, facilityTypeCode: '3', facilityTypeLabel: '养老机构',
    areaCode: '110000', regionLabel: '北京市', regionPath: '北京市/东城区', address: '测试路 1 号',
    listedBeds: hasDetail ? 0 : null, nursingBeds: hasDetail ? 0 : null,
    listedMonthlyFeeMin: hasDetail ? 0 : null, listedMonthlyFeeMax: hasDetail ? 5000 : null,
    platformStarCode: null, evaluationCount: null, overallEvaluation: null,
    functionPositioningLabel: null, platformTagsRaw: null, hasDetail,
    listObservationCount: 1, detailObservationCount: hasDetail ? 1 : 0, conflictFields: [],
  };
}

function sampleDetail(mcaId = 'ENTITY001', hasDetail = true): McaPreviewDetail {
  return {
    schemaVersion: 1, mcaId, publishable: false, selectedFieldSources: {}, conflictFields: [],
    listObservations: [{ source: { fetchedAtUtc: observedAt }, sourceFields: {
      internal: 'SECRET-TOKEN', ahae0012: '13800000000', ahae0633Name: '机构养老',
      ahae0635: '1', ahae0019: 0, ahae2343: 55,
    } }],
    detailObservations: hasDetail ? [{ source: { fetchedAtUtc: observedAt }, endpoints: {
      orgBaseDetail: { source: { fetchedAtUtc: observedAt }, sourceFields: {
        ahae0021: 123.4, ahae2572: '联系人甲', ahae2573: '13800000000',
        orgBaseInfo: { infoDetail: '机构介绍', point: '116,39' },
        orgServiceInfo: { serviceDetail: '生活照料', serviceTeam: '护理团队', serviceTime: '全天',
          serviceRadius: '东城区', serviceRadiusExplain: '服务说明' },
        hae5List: [{ ahae2372: 'image-file-id' }],
      } },
      yangLaoOrgDetail: { source: { fetchedAtUtc: observedAt }, sourceFields: {
        ahae2347: 0, ahae0019: 0, ahae2343: 0, ahae2323: 0,
        hae8List: [{ axbe8002: '04', axbe8004: 0, axbe8003: 5000 }],
        hae4List: [{ axbe4001: 'fee-1', axbe4002: '床位费', axbe4003: '按房型', axbe4004: '2000/月' }],
      } },
    } }] : [],
  };
}

function catalog(): McaPreviewCatalog {
  return {
    manifest: {
      schemaVersion: 1, snapshotId, scope: 'private_mca_observed_institutions', publishable: false,
      nationalComplete: false, snapshotVerified: false, fieldSemantics: 'partially_mapped', privacyReview: 'required',
      sourceSnapshots: [{ lane: 'test', sha256: 'a'.repeat(64), capturedAtUtc: observedAt }],
      recordCount: 2, withDetailCount: 1, listObservationCount: 2, detailObservationCount: 1,
      withConflictCount: 0, fieldPathCount: 0, ignored: {}, indexPath: 'index.json',
      fieldCatalogPath: 'field-catalog.json', detailDirectory: 'details',
    },
    index: { schemaVersion: 1, snapshotId, publishable: false,
      records: [record('ENTITY001', true), record('ENTITY002', false)] },
  };
}

test('candidate keeps typed zero and leaves uncaptured details null', () => {
  let detailReads = 0;
  const candidate = buildMcaCandidate(catalog(), id => {
    detailReads++;
    return sampleDetail(id, id === 'ENTITY001');
  }, observedAt);
  assert.equal(candidate.recordCount, 2);
  assert.equal(candidate.withDetailCount, 1);
  assert.equal(candidate.listObservedCount, 2);
  assert.equal(candidate.detailOnlyCount, 0);
  assert.equal(detailReads, 2);
  assert.deepEqual(candidate.records[0].list.dayCareBeds,
    { state: 'observed', value: 0, observationCount: 1 });
  assert.deepEqual(candidate.records[1].list.listedContactPhone,
    { state: 'observed', value: '13800000000', observationCount: 1 });
  assert.equal(candidate.records[0].list.listedBeds, 0);
  assert.equal(candidate.records[0].detail?.platformDetail.beds.total.value, 0);
  assert.equal(candidate.records[1].list.listedBeds, null);
  assert.equal(candidate.records[1].detail, null);
  assert.equal(candidate.records[0].detail?.platformDetail.areaSqm.value, 123.4);
  assert.equal(candidate.records[0].detail?.platformDetail.service.content.value, '生活照料');
});

test('public projection exposes reviewed values without raw responses or private paths', () => {
  const candidate = buildMcaCandidate(catalog(), id => sampleDetail(id, id === 'ENTITY001'), observedAt);
  const output = buildPublicProjection(candidate, observedAt);
  assert.equal(output.manifest.scope, 'partial_observed_mca_institutions');
  assert.equal(output.manifest.nationalComplete, false);
  assert.equal(output.manifest.listObservedCount, 2);
  assert.equal(output.manifest.detailOnlyCount, 0);
  assert.equal(output.index.records[1].detailPath, null);
  assert.match(output.index.records[0].detailPath ?? '', /^details\/[a-f0-9]{64}\.v1\.json$/);
  assert.equal(output.details.length, 1);
  assert.equal(output.details[0].sourcePage,
    'https://yanglao.mca.gov.cn/?#/index/orgServicesDetail?axbe0001=ENTITY001&parentRoute=institutionList&tagValue=3');
  assert.equal(output.details[0].platformDetail.contactName.value, '联系人甲');
  assert.equal(output.details[0].platformDetail.contactPhone.value, '13800000000');
  assert.equal(output.details[0].platformDetail.photoCount.value, 1);
  assert.equal(output.index.records[0].serviceCategoryLabel.value, '机构养老');
  assert.equal(output.index.records[1].subsidyCode.value, '1');
  assert.equal(output.index.records[1].fullCareBeds.value, 55);
  assert.deepEqual(output.index.records[0].listObservedAtUtc,
    { earliest: observedAt, latest: observedAt });
  assert.deepEqual(output.details[0].detailObservedAtUtc,
    { earliest: observedAt, latest: observedAt });
  const encoded = JSON.stringify(output);
  assert.doesNotMatch(encoded, /SECRET-TOKEN|image-file-id|private-file\.json|sourceFields|detailObservations/);
  assert.match(PRIVATE_OUTPUT, /data[/\\]private[/\\]generated/);
  assert.match(PUBLIC_DIR, /public[/\\]data[/\\]mca-observed/);
});

test('duplicate platform IDs fail before any export', () => {
  const source = catalog();
  source.index.records[1] = record('ENTITY001', false);
  assert.throws(() => buildMcaCandidate(source, () => sampleDetail(), observedAt), /duplicate.*ID/i);
});

test('detail-only record keeps its sourced name without inventing a region', () => {
  const source = catalog();
  source.index.records[0].listObservationCount = 0;
  source.index.records[0].regionPath = null;
  source.index.records[0].regionLabel = null;
  source.manifest.listObservationCount = 1;
  const candidate = buildMcaCandidate(source, id => id === 'ENTITY001'
    ? { ...sampleDetail(), listObservations: [] } : sampleDetail(id, false), observedAt);
  const publicData = buildPublicProjection(candidate, observedAt);
  assert.equal(publicData.manifest.listObservedCount, 1);
  assert.equal(publicData.manifest.detailOnlyCount, 1);
  assert.equal(publicData.index.records[0].name, 'ENTITY001');
  assert.equal(publicData.index.records[0].regionPath, null);
  assert.equal(publicData.index.records[0].regionLabel, null);
  assert.equal(publicData.index.records[0].listObservedAtUtc, null);
  assert.equal(publicData.index.records[0].listedContactPhone.state, 'missing');
});

test('list values fill only missing detail fields and preserve zero', () => {
  const source = catalog();
  const candidate = buildMcaCandidate(source, id => {
    const detail = sampleDetail(id, id === 'ENTITY001');
    if (id === 'ENTITY001') {
      delete detail.detailObservations[0].endpoints.orgBaseDetail.sourceFields.ahae2573;
      delete detail.detailObservations[0].endpoints.orgBaseDetail.sourceFields.ahae0635;
      delete detail.detailObservations[0].endpoints.yangLaoOrgDetail.sourceFields.ahae0019;
      delete detail.detailObservations[0].endpoints.yangLaoOrgDetail.sourceFields.ahae2343;
    }
    return detail;
  }, observedAt);
  const detail = buildPublicProjection(candidate, observedAt).details[0].platformDetail;
  assert.equal(detail.contactPhone.value, '13800000000');
  assert.equal(detail.subsidyCode.value, '1');
  assert.equal(detail.beds.dayCare.value, 0);
  assert.equal(detail.beds.fullCare.value, 55);
});

test('conflicting list observations do not become public values', () => {
  const source = catalog();
  source.index.records[0].listObservationCount = 2;
  source.manifest.listObservationCount = 3;
  const candidate = buildMcaCandidate(source, id => {
    const detail = sampleDetail(id, id === 'ENTITY001');
    if (id === 'ENTITY001') detail.listObservations.push({
      source: { fetchedAtUtc: '2026-11-20T13:00:00Z' },
      sourceFields: { ahae0012: '另一号码', ahae0019: 2 },
    });
    return detail;
  }, observedAt);
  const output = buildPublicProjection(candidate, observedAt);
  assert.deepEqual(output.index.records[0].listedContactPhone,
    { state: 'conflict', value: null, observationCount: 2 });
  assert.deepEqual(output.index.records[0].dayCareBeds,
    { state: 'conflict', value: null, observationCount: 2 });
  assert.equal(output.details[0].platformDetail.contactPhone.state, 'observed');
  assert.deepEqual(output.index.records[0].listObservedAtUtc,
    { earliest: observedAt, latest: '2026-11-20T13:00:00Z' });
});

test('staged write failure leaves prior public directory intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'mca-public-publish-'));
  const destination = join(root, 'mca-observed');
  try {
    mkdirSync(join(destination, 'details'), { recursive: true });
    writeFileSync(join(destination, 'manifest.v1.json'), 'OLD-MANIFEST');
    writeFileSync(join(destination, 'details', 'old.v1.json'), 'OLD-DETAIL');
    const candidate = buildMcaCandidate(catalog(), id => sampleDetail(id, id === 'ENTITY001'), observedAt);
    const projection = buildPublicProjection(candidate, observedAt);
    let writes = 0;
    assert.throws(() => publishMcaPublicProjection(projection, destination, (file, value) => {
      if (++writes === 2) throw new Error('simulated write failure');
      writeFileSync(file, value, 'utf8');
    }), /simulated write failure/);
    assert.equal(readFileSync(join(destination, 'manifest.v1.json'), 'utf8'), 'OLD-MANIFEST');
    assert.equal(readFileSync(join(destination, 'details', 'old.v1.json'), 'utf8'), 'OLD-DETAIL');
    assert.deepEqual(readdirSync(root), ['mca-observed']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('production staging and backup paths live outside public', () => {
  const publicRoot = resolve(PUBLIC_DIR, '../..');
  const relativePath = relative(publicRoot, PRIVATE_STAGE_PARENT);
  assert.ok(relativePath === '..' || relativePath.startsWith('..' + sep));
  assert.ok(PRIVATE_STAGE_PARENT.includes(join('data', 'private', 'generated')));
  const candidate = buildMcaCandidate(catalog(), id => sampleDetail(id, id === 'ENTITY001'), observedAt);
  const projection = buildPublicProjection(candidate, observedAt);
  const stagedPaths: string[] = [];
  assert.throws(() => publishMcaPublicProjection(projection, PUBLIC_DIR, location => {
    stagedPaths.push(location);
    throw new Error('stop before public exchange');
  }), /stop before public exchange/);
  assert.equal(stagedPaths.length, 1);
  const stagedPath = stagedPaths[0];
  const stagedRelative = relative(publicRoot, stagedPath);
  assert.ok(stagedRelative === '..' || stagedRelative.startsWith('..' + sep));
  assert.ok(stagedPath.startsWith(PRIVATE_STAGE_PARENT + sep));
});

test('successful publish validates full stage and removes stale old details', () => {
  const root = mkdtempSync(join(tmpdir(), 'mca-public-publish-'));
  const destination = join(root, 'mca-observed');
  try {
    mkdirSync(join(destination, 'details'), { recursive: true });
    writeFileSync(join(destination, 'details', 'old.v1.json'), 'OLD-DETAIL');
    const candidate = buildMcaCandidate(catalog(), id => sampleDetail(id, id === 'ENTITY001'), observedAt);
    const projection = buildPublicProjection(candidate, observedAt);
    publishMcaPublicProjection(projection, destination);
    assert.equal(existsSync(join(destination, 'details', 'old.v1.json')), false);
    assert.equal(existsSync(join(destination, projection.index.records[0].detailPath!)), true);
    assert.equal(JSON.parse(readFileSync(join(destination, 'index.v1.json'), 'utf8')).records.length, 2);
    assert.deepEqual(readdirSync(root), ['mca-observed']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('invalid staged projection cannot replace prior public directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'mca-public-publish-'));
  const destination = join(root, 'mca-observed');
  try {
    mkdirSync(destination);
    writeFileSync(join(destination, 'manifest.v1.json'), 'OLD-MANIFEST');
    const candidate = buildMcaCandidate(catalog(), id => sampleDetail(id, id === 'ENTITY001'), observedAt);
    const projection = buildPublicProjection(candidate, observedAt);
    projection.index.records[0].listedContactPhone = { state: 'observed', value: null, observationCount: 1 };
    assert.throws(() => publishMcaPublicProjection(projection, destination), /字段状态|结构|投影/);
    assert.equal(readFileSync(join(destination, 'manifest.v1.json'), 'utf8'), 'OLD-MANIFEST');
    assert.deepEqual(readdirSync(root), ['mca-observed']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('local MCA snapshot retains captured BA7E values and partial detail coverage', {
  skip: !existsSync('data/private/generated/mca-observed-catalog/current.json'),
}, () => {
  const candidate = loadMcaCandidate();
  assert.equal(candidate.recordCount, 3726);
  assert.equal(candidate.withDetailCount, 131);
  assert.equal(candidate.listObservedCount, 3716);
  assert.equal(candidate.detailOnlyCount, 10);
  assert.equal(candidate.records.filter(item => item.detail === null).length, 3595);
  const sample = candidate.records.find(item => item.mcaId === 'BA7E6A754BB0A66AE053E897A6C0B507');
  assert.ok(sample?.detail);
  assert.equal(sample.detail.platformDetail.areaSqm.value, 1112.7);
  assert.equal(sample.detail.platformDetail.beds.total.value, 55);
  assert.deepEqual(sample.detail.platformDetail.feeSummary[0].range.value, [8000, 15000]);
  assert.equal(sample.detail.platformDetail.service.content.state, 'observed');
  assert.equal(sample.list.subsidyCode.state, 'observed');
  assert.equal(sample.list.dayCareBeds.value, 0);
  assert.equal(sample.list.fullCareBeds.value, 55);
});
