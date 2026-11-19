import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInstitutionReferenceLinks } from '../scripts/check-qcc-institution-links-output';

const p = 'p-aaaaaaaaaaaa';
const c = 'c-bbbbbbbbbbbb';
const name = '示例养老服务中心';
const refId = 'qi-aaaaaaaaaaaa-2';

function fixture() {
  const referenceManifest = { schemaVersion: 1, snapshotId: 'ref-1', rowCount: 1,
    provinces: [{ slug: p, name: '北京市', count: 1, cities: [{ slug: c, name: '北京市', count: 1,
      indexPath: p + '/' + c + '/index.v1.json' }] }] };
  const referenceIndex = { schemaVersion: 1, snapshotId: 'ref-1', provinceSlug: p, citySlug: c,
    records: [{ id: refId, name, sourceRow: 2 }] };
  const officialManifest = { schemaVersion: 1, snapshotId: 'off-1', rowCount: 1,
    sources: [{ id: 'source-1', province: '北京市', title: '北京市养老机构表' }],
    provinces: [{ slug: 'beijing', name: '北京市', cities: [{ slug: 'beijing', name: '北京',
      indexPath: 'beijing/beijing/index.v1.json' }] }] };
  const officialIndex = { schemaVersion: 1, snapshotId: 'off-1', provinceSlug: 'beijing', citySlug: 'beijing',
    records: [{ id: 'off-record-1', sourceId: 'source-1', name, rowNumber: 1 }] };
  const guangdong = { schemaVersion: 1, snapshotId: 'gd-1', records: [] };
  const linkManifest = { schemaVersion: 1, snapshotId: 'links-1', referenceSnapshotId: 'ref-1',
    officialSnapshotId: 'off-1', guangdongSnapshotId: 'gd-1', linkedReferenceCount: 1,
    matchCount: 1, regionCount: 1 };
  const linkFile = { schemaVersion: 1, snapshotId: 'links-1', referenceSnapshotId: 'ref-1',
    provinceSlug: p, citySlug: c, links: [{ referenceId: refId, matches: [{
      kind: 'nationalOfficial', id: 'off-record-1', provinceSlug: 'beijing', citySlug: 'beijing',
      city: '北京', sourceTitle: '北京市养老机构表',
    }] }] };
  const reference = new Map([
    ['data/qcc-institutions/manifest.v1.json', JSON.stringify(referenceManifest)],
    ['data/qcc-institutions/' + p + '/' + c + '/index.v1.json', JSON.stringify(referenceIndex)],
  ]);
  const official = new Map([
    ['data/national-official/manifest.v1.json', JSON.stringify(officialManifest)],
    ['data/national-official/beijing/beijing/index.v1.json', JSON.stringify(officialIndex)],
  ]);
  const links = new Map([
    ['data/qcc-institution-links/manifest.v1.json', JSON.stringify(linkManifest)],
    ['data/qcc-institution-links/' + p + '/' + c + '/links.v1.json', JSON.stringify(linkFile)],
  ]);
  const write = () => {
    links.set('data/qcc-institution-links/manifest.v1.json', JSON.stringify(linkManifest));
    links.set('data/qcc-institution-links/' + p + '/' + c + '/links.v1.json', JSON.stringify(linkFile));
  };
  return { reference, official, guangdong: JSON.stringify(guangdong), links, linkManifest, linkFile, write };
}

test('same-province exact-name candidate links resolve to actual official source rows', () => {
  const files = fixture();
  assert.doesNotThrow(() => validateInstitutionReferenceLinks(files.links, files.reference, files.official, files.guangdong));
});

test('candidate links reject mismatched target names and missing city files', () => {
  const files = fixture();
  files.linkFile.links[0].matches[0].id = 'off-record-missing';
  files.write();
  assert.throws(() => validateInstitutionReferenceLinks(files.links, files.reference, files.official, files.guangdong), /目标|匹配|记录/);
  files.linkFile.links[0].matches[0].id = 'off-record-1';
  files.write();
  files.links.delete('data/qcc-institution-links/' + p + '/' + c + '/links.v1.json');
  assert.throws(() => validateInstitutionReferenceLinks(files.links, files.reference, files.official, files.guangdong), /缺失|地区|文件/);
});

test('candidate links reject stale input snapshots and extra fields', () => {
  const files = fixture();
  files.linkManifest.officialSnapshotId = 'stale';
  files.write();
  assert.throws(() => validateInstitutionReferenceLinks(files.links, files.reference, files.official, files.guangdong), /快照|不一致/);
  files.linkManifest.officialSnapshotId = 'off-1';
  Object.assign(files.linkFile.links[0].matches[0], { phone: '13800000000' });
  files.write();
  assert.throws(() => validateInstitutionReferenceLinks(files.links, files.reference, files.official, files.guangdong), /白名单|字段/);
});
