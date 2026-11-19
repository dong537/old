import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validateInstitutionRegistryLinks } from '../scripts/check-qcc-institution-registry-links-output';

const p = 'p-aaaaaaaaaaaa';
const c = 'c-bbbbbbbbbbbb';
const np = 'p-cccccccccccc';
const nc = 'c-dddddddddddd';
const refId = 'qi-aaaaaaaaaaaa-2';
const targetId = 'qcc-n-' + 'e'.repeat(20);
const alphabet = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
function code(prefix: string): string {
  const total = [...prefix].reduce((sum, char, at) => sum + alphabet.indexOf(char) * weights[at], 0);
  return prefix + alphabet[(31 - total % 31) % 31];
}
const creditCode = code('91440101MA0000001');
const alternateCode = code('91440101MA0000002');
function file(value: unknown): string { return JSON.stringify(value); }

function fixture() {
  const reference = new Map<string, string>();
  const nationalIndexes = new Map<string, { snapshotId: string; provinceSlug: string; citySlug: string; records: { id: string; name: string; province: string; city: string; chunk: string }[] }>();
  const nationalChunks = new Map<string, { snapshotId: string; provinceSlug: string; citySlug: string; records: { id: string; name: string; province: string; city: string; creditCode: string | null; codeValidity: string | null }[] }>();
  const guangdong = new Map<string, string>();
  const links = new Map<string, string>();
  const referenceManifest = { schemaVersion: 1, snapshotId: 'v1-ref', rowCount: 1, provinces: [
    { slug: p, name: '广东省', count: 1, cities: [{ slug: c, name: '广州市', count: 1, indexPath: `${p}/${c}/index.v1.json` }] },
  ] };
  const nationalManifest = { schemaVersion: 1, snapshotId: 'v1-national', rowCount: 1, provinces: [
    { slug: np, name: '广东省', count: 1, cities: [{ slug: nc, name: '广州', count: 1, indexPath: `${np}/${nc}/index.v1.json` }] },
  ] };
  const basis = { schemaVersion: 1, referenceSnapshotId: 'v1-ref', nationalSnapshotId: 'v1-national', guangdongSnapshotId: 'v1-guangdong' };
  const snapshotId = 'v1-' + createHash('sha256').update(JSON.stringify(basis) + '\n').digest('hex').slice(0, 16);
  const manifest = { ...basis, snapshotId, referenceRowCount: 1, eligibleReferenceCount: 1, uniqueCodeHitCount: 1, linkedReferenceCount: 1, crossProvinceHitCount: 0, ambiguousReferenceCount: 0, regionCount: 1 };
  const link = { referenceId: refId, target: { kind: 'nationalRegistry', id: targetId, provinceSlug: np, citySlug: nc, province: '广东省', city: '广州', name: '登记主体甲' } };
  const cityFile = { schemaVersion: 1, snapshotId, referenceSnapshotId: 'v1-ref', provinceSlug: p, citySlug: c, links: [link] };
  const linkPath = `data/qcc-institution-registry-links/${p}/${c}/links.v1.json`;
  reference.set('data/qcc-institutions/manifest.v1.json', file(referenceManifest));
  reference.set(`data/qcc-institutions/${p}/${c}/index.v1.json`, file({ schemaVersion: 1, snapshotId: 'v1-ref', provinceSlug: p, citySlug: c, records: [
    { id: refId, name: '养老机构甲', sourceRow: 2, region: '广东省广州市', address: null, beds: 0, chunk: 'chunk-001.v1.json' },
  ] }));
  reference.set(`data/qcc-institutions/${p}/${c}/chunk-001.v1.json`, file({ schemaVersion: 1, snapshotId: 'v1-ref', provinceSlug: p, citySlug: c, records: [
    { id: refId, name: '养老机构甲', sourceRow: 2, region: '广东省广州市', address: null, beds: 0, creditCode, codeStatus: 'valid' },
  ] }));
  nationalIndexes.set(`data/qcc-national/${np}/${nc}/index.v1.json`, { snapshotId: 'v1-national', provinceSlug: np, citySlug: nc, records: [
    { id: targetId, name: '登记主体甲', province: '广东省', city: '广州', chunk: 'chunk-001.v1.json' },
  ] });
  nationalChunks.set(`data/qcc-national/${np}/${nc}/chunk-001.v1.json`, { snapshotId: 'v1-national', provinceSlug: np, citySlug: nc, records: [
    { id: targetId, name: '登记主体甲', province: '广东省', city: '广州', creditCode, codeValidity: 'valid' },
  ] });
  guangdong.set('data/qcc/index.v1.json', file({ schemaVersion: 1, snapshotId: 'v1-guangdong', records: [] }));
  links.set('data/qcc-institution-registry-links/manifest.v1.json', file(manifest));
  links.set(linkPath, file(cityFile));
  const check = () => validateInstitutionRegistryLinks(links, reference, nationalManifest, nationalIndexes, nationalChunks, guangdong);
  const save = () => { links.set('data/qcc-institution-registry-links/manifest.v1.json', file(manifest)); links.set(linkPath, file(cityFile)); };
  return { check, links, manifest, link, cityFile, linkPath, save, nationalChunks, reference };
}

test('published code links resolve to the same-province registry detail', () => {
  assert.doesNotThrow(fixture().check);
});

test('code links reject a changed target code and a nonexistent target', () => {
  const files = fixture();
  files.nationalChunks.get(`data/qcc-national/${np}/${nc}/chunk-001.v1.json`)!.records[0].creditCode = alternateCode;
  assert.throws(files.check, /代码|匹配/);
  files.nationalChunks.get(`data/qcc-national/${np}/${nc}/chunk-001.v1.json`)!.records[0].creditCode = creditCode;
  files.link.target.id = 'qcc-n-' + 'f'.repeat(20); files.save();
  assert.throws(files.check, /目标|匹配/);
});

test('code links reject changed routes, missing links and extra fields', () => {
  const files = fixture();
  files.link.target.citySlug = 'c-' + 'f'.repeat(12); files.save();
  assert.throws(files.check, /地区|目标|匹配/);
  files.link.target.citySlug = nc; files.cityFile.links = []; files.save();
  assert.throws(files.check, /链接|关联|计数|缺失/);
  files.cityFile.links = [files.link]; Object.assign(files.link.target, { phone: '13800000000' }); files.save();
  assert.throws(files.check, /字段|白名单/);
  files.links.set('data/qcc-institution-registry-links/unexpected.json', '{}');
  assert.throws(files.check, /文件|白名单/);
});

test('code links reject stale snapshots, altered totals and extra city files', () => {
  const files = fixture();
  files.manifest.nationalSnapshotId = 'v1-stale'; files.save();
  assert.throws(files.check, /快照/);
  files.manifest.nationalSnapshotId = 'v1-national'; files.manifest.linkedReferenceCount = 0; files.save();
  assert.throws(files.check, /计数|关联/);
  files.manifest.linkedReferenceCount = 1; files.save();
  files.links.set('data/qcc-institution-registry-links/extra/links.v1.json', '{}');
  assert.throws(files.check, /文件|白名单/);
});
