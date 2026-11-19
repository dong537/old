import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const assessmentCsv = '序号,类型,机构名称,服务地址,考核等次\n1,护理机构,甲护理站,广州市海珠区甲路1号,优秀\n2,设备机构,甲护理站,广州市海珠区甲路1号,无等次\n3,护理机构,乙护理站,甲路2号,合格\n';
const noticeCsv = '序号,单位名称,所在区,提供服务地址,服务类别,服务项目,机构类别\n1,丙养老服务机构,番禺区,广州市番禺区丙路1号,居家护理,生活照料,养老服务机构\n';
const html = '<html><table><tr><td>原始官方表格归档</td></tr></table></html>';

function fixture() {
  const manifest = {
    schemaVersion: 1, snapshotId: 'guangzhou-official-service-records-test',
    archives: [
      { source: { id: 'assessment-2025', title: '2025年度综合考核结果', url: 'https://www.gz.gov.cn/example/assessment.html', publisher: '广州市医疗保险服务中心', publishedAt: '2026-05-09', accessedAt: '2026-11-15', kind: 'annual-assessment', period: '2025年度', limitations: '年度考核记录，不代表当前有效定点。' }, htmlFile: 'assessment.html', htmlSha256: sha(html), tableFile: 'assessment.csv', tableSha256: sha(assessmentCsv), expectedRows: 3, recordIdPrefix: 'gz-ltci-2025-assessment-' },
      { source: { id: 'notice-20260901', title: '新增定点评估合格公示', url: 'https://www.gz.gov.cn/example/notice.html', publisher: '广州市医疗保险服务中心', publishedAt: '2026-09-01', accessedAt: '2026-11-15', kind: 'designation-notice', period: '2026.15', limitations: '评估合格公示，不代表当前协议状态。' }, htmlFile: 'notice.html', htmlSha256: sha(html), tableFile: 'notice.csv', tableSha256: sha(noticeCsv), expectedRows: 1, recordIdPrefix: 'gz-ltci-20260901-notice-' },
    ],
  };
  return { manifest, files: { 'assessment.html': html, 'assessment.csv': assessmentCsv, 'notice.html': html, 'notice.csv': noticeCsv } };
}

test('service import preserves source rows, duplicate names and unknown service capabilities', async () => {
  const { buildServiceCatalog } = await import('../lib/service-import');
  const { manifest, files } = fixture();
  const result = buildServiceCatalog(manifest, files);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.records.length, 4);
  assert.deepEqual(result.records.slice(0, 2).map(row => row.name), ['甲护理站', '甲护理站']);
  assert.deepEqual(result.records.slice(0, 3).map(row => row.id), ['gz-ltci-2025-assessment-0001', 'gz-ltci-2025-assessment-0002', 'gz-ltci-2025-assessment-0003']);
  assert.equal(result.records[1].assessmentGrade, '无等次');
  assert.equal(result.records[0].serviceCategory, null);
  assert.equal(result.records[0].serviceItems, null);
  assert.equal(result.records[0].district, '海珠区');
  assert.equal(result.records[0].districtBasis, 'address-text');
  assert.equal(result.records[2].district, null);
  assert.equal(result.records[2].districtBasis, null);
  assert.equal(result.records[3].district, '番禺区');
  assert.equal(result.records[3].districtBasis, 'source');
  assert.equal(result.records[3].serviceCategory, '居家护理');
  assert.equal(result.records[3].assessmentGrade, null);
  assert.ok(result.records.every(row => result.sources.some(source => source.id === row.sourceId)));
});

test('service import blocks changed archives, incomplete rows and invalid source metadata', async () => {
  const { buildServiceCatalog } = await import('../lib/service-import');
  const { manifest, files } = fixture();
  assert.throws(() => buildServiceCatalog(manifest, { ...files, 'assessment.html': html + 'changed' }), /SHA-256/);
  assert.throws(() => buildServiceCatalog(manifest, { ...files, 'assessment.csv': assessmentCsv + '\n' }), /SHA-256/);
  assert.throws(() => buildServiceCatalog(manifest, { ...files, 'assessment.html': undefined }), /缺少归档/);
  const missingRow = assessmentCsv.replace('3,护理机构,乙护理站,甲路2号,合格\n', '');
  const fewer = structuredClone(manifest);
  fewer.archives[0].tableSha256 = sha(missingRow);
  assert.throws(() => buildServiceCatalog(fewer, { ...files, 'assessment.csv': missingRow }), /记录数/);
  const duplicateRow = assessmentCsv.replace('3,护理机构', '2,护理机构');
  const duplicate = structuredClone(manifest);
  duplicate.archives[0].tableSha256 = sha(duplicateRow);
  assert.throws(() => buildServiceCatalog(duplicate, { ...files, 'assessment.csv': duplicateRow }), /来源序号/);
  const bad = structuredClone(manifest);
  bad.archives[0].source.url = 'http://localhost/private';
  assert.throws(() => buildServiceCatalog(bad, files), /官方HTTPS来源/);
  const traversal = structuredClone(manifest);
  traversal.archives[0].htmlFile = '../private.html';
  assert.throws(() => buildServiceCatalog(traversal, files), /归档文件名/);
});

test('archived official service tables remain 250 assessment records and one notice without entity merging', async () => {
  const { buildServiceCatalog } = await import('../lib/service-import');
  const directory = path.resolve('data/raw/services');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'source-manifest.json'), 'utf8'));
  const files: Record<string, string> = {};
  for (const archive of manifest.archives) {
    files[archive.htmlFile] = readFileSync(path.join(directory, archive.htmlFile), 'utf8');
    files[archive.tableFile] = readFileSync(path.join(directory, archive.tableFile), 'utf8');
  }
  const result = buildServiceCatalog(manifest, files);
  const annual = result.records.filter(row => row.recordType === 'annual-assessment');
  const notice = result.records.filter(row => row.recordType === 'designation-notice');
  assert.equal(result.sources.length, 2);
  assert.equal(annual.length, 250);
  assert.equal(new Set(annual.map(row => row.name)).size, 246);
  assert.equal(annual.filter(row => row.providerType === '护理机构').length, 245);
  assert.equal(annual.filter(row => row.providerType === '设备机构').length, 5);
  assert.equal(annual.filter(row => row.assessmentGrade === '无等次').length, 4);
  assert.ok(annual.every(row => row.serviceCategory === null && row.serviceItems === null));
  assert.equal(notice.length, 1);
  assert.equal(notice[0].name, '广州市善雅医疗养老有限公司');
  assert.equal(notice[0].serviceCategory, '居家护理');
  assert.equal(notice[0].district, '番禺区');
  assert.equal(notice[0].districtBasis, 'source');
  const publicResult = JSON.parse(readFileSync('public/data/guangzhou-services.v1.json', 'utf8'));
  assert.deepEqual(publicResult, result);
});
