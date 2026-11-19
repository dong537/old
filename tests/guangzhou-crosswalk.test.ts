import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import type { IdMapEntry } from '../lib/types';
import { buildGuangzhouCrosswalk } from '../scripts/guangzhou-crosswalk';

const officialCsv = readFileSync('data/raw/family_fields_official.csv', 'utf8');
const idMap = JSON.parse(readFileSync('data/raw/id-map.json', 'utf8')) as IdMapEntry[];
const provincePath = 'data/private/guangdong-eldercare-source/exports/20261114_batch10/机构名录_逐条来源.csv';
const provinceCsv = existsSync(provincePath) ? readFileSync(provincePath, 'utf8') : null;

test('same official source row and name link all Guangzhou records without asserting cross-date identity', { skip: provinceCsv === null }, () => {
  const result = buildGuangzhouCrosswalk(officialCsv, idMap, provinceCsv!);
  assert.equal(result.manifest.sourceRecords, 235);
  assert.equal(result.links.length, 235);
  assert.equal(new Set(result.links.map(link => link.publicInstitutionId)).size, 235);
  assert.equal(new Set(result.links.map(link => link.observationId)).size, 235);
  assert.ok(result.links.every(link => link.identityVerified === false && link.evidence === 'same_official_source_row_and_name'));
});

test('source name discrepancy stops crosswalk generation', { skip: provinceCsv === null }, () => {
  const changed = provinceCsv!.replace('广州颐福居养老院有限公司', '广州颐福居养老院（误写）');
  assert.throws(() => buildGuangzhouCrosswalk(officialCsv, idMap, changed), /名称|对应/);
});
