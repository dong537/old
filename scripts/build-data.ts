import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { COMPANY_QUERIED_AT, OFFICIAL_SOURCE, SNAPSHOT_ID, parseOfficialCsv, parsePrivateCsv } from '../lib/import';
import type { Catalog, IdMapEntry } from '../lib/types';

async function saveJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--private') || args.length > 1) throw new Error('只支持 --private 参数。');
  const officialFile = 'data/raw/family_fields_official.csv';
  const csv = await readFile(officialFile, 'utf8');
  const idMap = JSON.parse(await readFile('data/raw/id-map.json', 'utf8')) as IdMapEntry[];
  const institutions = parseOfficialCsv(csv, idMap);
  const catalog: Catalog = { schemaVersion: 1, snapshotId: SNAPSHOT_ID, source: OFFICIAL_SOURCE, institutions };
  // Validate the whole requested input set before replacing any derived output.
  const privateCsv = args.includes('--private') ? await readFile('data/private/registration_status_all235.csv', 'utf8') : null;
  const companySnapshot = privateCsv === null ? null : parsePrivateCsv(privateCsv, institutions);
  await saveJson('data/generated/catalog.json', catalog);
  await saveJson('public/data/guangzhou-institutions.v1.json', catalog);
  const report = {
    schemaVersion: 1, snapshotId: SNAPSHOT_ID, source: OFFICIAL_SOURCE,
    input: officialFile, inputSha256: createHash('sha256').update(csv).digest('hex'),
    institutions: institutions.length, districts: new Set(institutions.map((institution) => institution.district)).size,
    anomalies: institutions.filter((institution) => institution.qualityNotes.length).map(({ id, sourceRow, qualityNotes }) => ({ id, sourceRow, qualityNotes })),
    limitations: ['只读来源快照，不代表实时营业、收费、床位空余或质量评价。', '未知值保留null，备案床位不等于可用床位。'],
  };
  await saveJson('data/generated/import-report.json', report);
  if (companySnapshot && privateCsv !== null) {
    await saveJson('data/private/generated/company-preview.json', companySnapshot);
    await saveJson('data/private/generated/import-report.json', {
      schemaVersion: 1, snapshotId: SNAPSHOT_ID, queriedAt: COMPANY_QUERIED_AT,
      input: 'data/private/registration_status_all235.csv', inputSha256: createHash('sha256').update(privateCsv).digest('hex'),
      companies: companySnapshot.companies.length, links: companySnapshot.links.length,
      exact: companySnapshot.links.filter((link) => link.matchType === 'exact').length,
      parentheses: companySnapshot.links.filter((link) => link.matchType === 'parentheses').length,
      unidentified: Object.values(companySnapshot.institutionStatuses).filter((status) => status === 'unidentified').length,
      review: Object.values(companySnapshot.institutionStatuses).filter((status) => status === 'review').length,
      relationshipVerified: false,
    });
  }
  console.log(`官方快照：${institutions.length}条、${report.districts}区；异常提示${report.anomalies.length}条；SHA256 ${report.inputSha256}`);
  if (companySnapshot) console.log(`本机私有快照：${companySnapshot.companies.length}主体、${companySnapshot.links.length}关联；未核实运营关系。`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
