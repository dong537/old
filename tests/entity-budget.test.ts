import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { buildProvinceReview } from '../scripts/province-pipeline';
import { summarizeEntityBudget } from '../scripts/build-entity-budget';

const header = 'city,institution_name,source_url,source_published_at,source_as_of,source_file,evidence_type,details';
const observations = [header,
  '广州,广州甲养老服务有限公司,https://example.org/a,2026-01-01,2026-01-01,a.csv,官方名录,{}',
  '广州,广州甲养老服务有限公司,https://example.org/b,2025-01-01,2025-01-01,b.csv,官方历史名录,{}',
  '佛山,广州甲养老服务有限公司,https://example.org/c,2026-01-01,2026-01-01,c.csv,官方名录,{}',
  '佛山,佛山乙敬老院,https://example.org/d,2026-01-01,2026-01-01,d.csv,官方名录,{}',
].join(String.fromCharCode(10));

test('entity budget separates source name keys, paid names and attempted words', () => {
  const report = summarizeEntityBudget(buildProvinceReview(observations), [
    { name: '广州甲养老服务有限公司', creditCode: '914401045780276990' },
  ], new Set(['佛山乙敬老院']));
  assert.deepEqual(report.totals, { sourceRows: 4, cities: 2, nameKeys: 3, sameNamePaid: 2, attemptedWithoutPaid: 1, neither: 0 });
  assert.deepEqual(report.byCity.map(({ city, sourceRows, nameKeys, sameNamePaid }) => ({ city, sourceRows, nameKeys, sameNamePaid })), [
    { city: '佛山', sourceRows: 2, nameKeys: 2, sameNamePaid: 1 },
    { city: '广州', sourceRows: 2, nameKeys: 1, sameNamePaid: 1 },
  ]);
  const guangzhou = report.candidates.find((row) => row.city === '广州');
  assert.equal(guangzhou?.sourceEvidence.length, 2);
  assert.equal(guangzhou?.identityVerified, false);
  assert.equal(guangzhou?.sameNamePaid, true);
  const unmatched = report.candidates.find((row) => row.name === '佛山乙敬老院');
  assert.equal(unmatched?.sameNamePaid, false);
  assert.equal(unmatched?.sameNameAttempted, true);
  assert.equal(unmatched?.identityVerified, false);
});

test('entity budget rejects conflicting purchased names for one credit code', () => {
  const review = buildProvinceReview(observations);
  assert.throws(() => summarizeEntityBudget(review, [
    { name: '广州甲养老服务有限公司', creditCode: '914401045780276990' },
    { name: '不同企业', creditCode: '914401045780276990' },
  ]), /信用代码.*不同名称/);
});

const outputRoot = 'data/private/guangdong-eldercare-source/research-batch23-entity-budget';
test('private budget manifest hashes the exact saved CSV and evidence bytes',
  { skip: !existsSync(path.join(outputRoot, 'manifest.json')) }, () => {
    const manifest = JSON.parse(readFileSync(path.join(outputRoot, 'manifest.json'), 'utf8')) as { outputSha256: Record<string, string> };
    const files = { cityCsv: '21市统计.csv', candidateCsv: '逐家候选名录_待核.csv', evidenceJsonl: '逐家候选_来源证据.jsonl', reportMd: 'REPORT.md' };
    for (const [key, file] of Object.entries(files)) {
      const sha256 = createHash('sha256').update(readFileSync(path.join(outputRoot, file))).digest('hex');
      assert.equal(manifest.outputSha256[key], sha256, file);
    }
  });
