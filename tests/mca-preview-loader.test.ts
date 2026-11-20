import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as publicPreview from '../lib/mca-preview-public';

const project = fileURLToPath(new URL('..', import.meta.url));
const moduleUrl = pathToFileURL(path.join(project, 'lib/mca-preview-local.ts')).href;
const snapshotId = 'observed-' + 'a'.repeat(24);
const mcaId = '0001';
const detailPath = 'details/' + createHash('sha256').update(mcaId).digest('hex') + '.json';

function fixture(id = mcaId) {
  const root = mkdtempSync(path.join(tmpdir(), 'mca-preview-loader-'));
  const snapshot = path.join(root, 'snapshots', snapshotId);
  mkdirSync(path.join(snapshot, 'details'), { recursive: true });
  const file = 'details/' + createHash('sha256').update(id).digest('hex') + '.json';
  const record = { mcaId: id, detailPath: file, name: '测试养老院', facilityTypeCode: '03', facilityTypeLabel: null,
    areaCode: '440100000000', regionLabel: '广州市', regionPath: '广东省/广州市', address: null,
    listedBeds: 0, nursingBeds: null, listedMonthlyFeeMin: 0, listedMonthlyFeeMax: null,
    platformStarCode: '5', evaluationCount: 0, overallEvaluation: null,
    functionPositioningLabel: '护理型', platformTagsRaw: '医养结合,康复护理',
    hasDetail: false, listObservationCount: 1, detailObservationCount: 0, conflictFields: [] };
  const manifest = { schemaVersion: 1, snapshotId, scope: 'private_mca_observed_institutions',
    publishable: false, nationalComplete: false, snapshotVerified: false,
    fieldSemantics: 'partially_mapped', privacyReview: 'required',
    sourceSnapshots: [{ lane: 'base', sha256: 'a'.repeat(64), capturedAtUtc: '2026-11-20T00:00:00Z' }],
    recordCount: 1, withDetailCount: 0, listObservationCount: 1, detailObservationCount: 0,
    withConflictCount: 0, fieldPathCount: 1, ignored: {}, indexPath: 'index.json',
    fieldCatalogPath: 'field-catalog.json', detailDirectory: 'details' };
  const index = { schemaVersion: 1, snapshotId, publishable: false, records: [record] };
  const detail = { schemaVersion: 1, mcaId: id, publishable: false, selectedFieldSources: {},
    conflictFields: [], listObservations: [{ source: { mirror: 'base', fileSha256: 'a'.repeat(64) },
      sourceFields: { axbe0001: id, ahae2347: 0, axbe0013: null } }], detailObservations: [] };
  writeFileSync(path.join(root, 'current.json'), JSON.stringify({ schemaVersion: 1, snapshotId }));
  writeFileSync(path.join(snapshot, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(path.join(snapshot, 'index.json'), JSON.stringify(index));
  writeFileSync(path.join(snapshot, file), JSON.stringify(detail));
  return { root, snapshot, record, index, detail };
}

function run(root: string, assertion: string, env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['--conditions=react-server', '--import=tsx', '--input-type=module', '-e',
    'const assert=(await import("node:assert/strict")).default; const mod=await import(process.env.MCA_MODULE_URL); ' + assertion], {
    cwd: project, encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, NODE_ENV: 'development', ELDERCARE_PRIVATE_PREVIEW: '1',
      MCA_MODULE_URL: moduleUrl, MCA_FIXTURE_ROOT: root, ...env },
  });
}

test('private loader reads one indexed detail and preserves zero versus null', () => {
  const data = fixture();
  try {
    const result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); const catalog=loader.getMcaPreviewCatalog(); assert.equal(catalog.index.records[0].listedBeds,0); assert.equal(catalog.index.records[0].nursingBeds,null); assert.equal(catalog.index.records[0].platformStarCode,'5'); assert.equal(catalog.index.records[0].evaluationCount,0); assert.equal(catalog.index.records[0].overallEvaluation,null); assert.equal(catalog.index.records[0].functionPositioningLabel,'护理型'); assert.equal(catalog.index.records[0].platformTagsRaw,'医养结合,康复护理'); assert.deepEqual(loader.getMcaPreviewIds(),['0001']); assert.equal(loader.getMcaPreviewDetail('0001').detail.listObservations[0].sourceFields.ahae2347,0); assert.equal(loader.getMcaPreviewDetail('0001').detail.listObservations[0].sourceFields.axbe0013,null); assert.equal(loader.getMcaPreviewDetail('../0001'),null); assert.equal(loader.getMcaPreviewDetail('9999'),null);");
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('private loader validates new metadata fields without coercion', () => {
  const data = fixture();
  try {
    const read = "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.equal(loader.getMcaPreviewCatalog().index.records[0].overallEvaluation,4.5);";
    writeFileSync(path.join(data.snapshot, 'index.json'), JSON.stringify({ ...data.index,
      records: [{ ...data.record, overallEvaluation: 4.5 }] }));
    assert.equal(run(data.root, read).status, 0);
    for (const change of [
      { evaluationCount: -1 }, { overallEvaluation: -0.1 }, { platformStarCode: '' },
      { functionPositioningLabel: 0 }, { platformTagsRaw: [] },
    ]) {
      writeFileSync(path.join(data.snapshot, 'index.json'), JSON.stringify({ ...data.index,
        records: [{ ...data.record, ...change }] }));
      const result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.throws(()=>loader.getMcaPreviewCatalog(),/索引/i);");
      assert.equal(result.status, 0, result.stderr);
    }
    const { platformTagsRaw: _omitted, ...missingField } = data.record;
    writeFileSync(path.join(data.snapshot, 'index.json'), JSON.stringify({ ...data.index,
      records: [missingField] }));
    const result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.throws(()=>loader.getMcaPreviewCatalog(),/索引/i);");
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('private loader accepts an observed six-digit numeric platform ID', () => {
  const data = fixture('116010');
  try {
    const result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.deepEqual(loader.getMcaPreviewIds(),['116010']); assert.equal(loader.getMcaPreviewDetail('116010').record.mcaId,'116010');");
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('private loader rejects unsafe paths, missing detail and mismatched ID', () => {
  const data = fixture();
  try {
    writeFileSync(path.join(data.snapshot, 'index.json'), JSON.stringify({ ...data.index,
      records: [{ ...data.record, contactPhone: '仅测试字段' }] }));
    let result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.throws(()=>loader.getMcaPreviewCatalog(),/字段|field|索引/i);");
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(path.join(data.snapshot, 'index.json'), JSON.stringify({ ...data.index, records: [{ ...data.record, detailPath: '../../secret.json' }] }));
    result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.throws(()=>loader.getMcaPreviewCatalog(),/path|路径|索引/i);");
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(path.join(data.snapshot, 'index.json'), JSON.stringify(data.index));
    unlinkSync(path.join(data.snapshot, detailPath));
    result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.throws(()=>loader.getMcaPreviewDetail('0001'),/detail|详情|缺失/i);");
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(path.join(data.snapshot, detailPath), JSON.stringify({ ...data.detail, mcaId: '0002' }));
    result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.throws(()=>loader.getMcaPreviewDetail('0001'),/ID|身份|不一致/i);");
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(path.join(data.snapshot, detailPath), JSON.stringify({ ...data.detail,
      listObservations: data.detail.listObservations.map(item => ({ ...item,
        sourceFields: { ...item.sourceFields, axbe0001: '0002' } })) }));
    result = run(data.root, "const loader=mod.createMcaPreviewLoader(process.env.MCA_FIXTURE_ROOT); assert.throws(()=>loader.getMcaPreviewDetail('0001'),/ID|身份|不一致/i);");
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('public implementation exposes no private catalog or detail', () => {
  assert.equal(publicPreview.getMcaPreviewCatalog(), null);
  assert.deepEqual(publicPreview.getMcaPreviewIds(), []);
  assert.equal(publicPreview.getMcaPreviewDetail('0001'), null);
});

test('private loader cannot be imported outside explicitly enabled development', () => {
  const result = run('unused', '', { NODE_ENV: 'production', ELDERCARE_PRIVATE_PREVIEW: '0' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /private|私有|development|开发/i);
});
