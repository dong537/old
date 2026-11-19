import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPrivateOutputPath, buildProvinceReview, provinceOutputRoot,
  renderProvinceOutputFiles, verifyProvinceReviewOutput } from './province-pipeline';

const OBSERVATIONS = 'data/private/guangdong-eldercare-source/exports/20261114_batch10/机构名录_逐条来源.csv';
const COMPANIES = 'data/private/guangdong-eldercare-source/research-batch8/paid-registration/exports/累计机构与直接照护工商_25字段.csv';
const OUTPUT_FILES = ['source-documents.jsonl', 'observations.jsonl', 'claims.jsonl', 'candidate-groups.jsonl',
  'company-match-candidates.jsonl', 'status-review-queue.jsonl', 'metadata-review-queue.jsonl',
  'identity-pair-review-queue.jsonl', 'detail-field-inventory.json',
  '候选机构名称组_待审核.csv', '待核状态与来源日期.csv', '可能同一机构或服务点_待审对.csv', '详情字段清单.csv'];
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

async function main() {
  const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
  if (process.argv.length > 2 && !checkOnly) throw new Error('只支持 --check；不接受覆盖输入或公开输出路径参数。');
  const projectRoot = path.resolve(process.cwd());
  const observationCsv = await readFile(path.join(projectRoot, OBSERVATIONS), 'utf8');
  const companyCsv = await readFile(path.join(projectRoot, COMPANIES), 'utf8');
  const result = buildProvinceReview(observationCsv, companyCsv);
  const { manifest } = result;
  if (manifest.sourceRows !== 2129 || manifest.cityCount !== 21 ||
      manifest.candidateNameKeysNotEntities !== 1676 || manifest.companyRows !== 564 ||
      manifest.detailFieldCount !== 74) {
    throw new Error('第十批输入规模/字段结构改变，须先审查新来源，不生成旧版审核产物。');
  }
  const root = provinceOutputRoot(projectRoot);
  const version = 'v4-' + manifest.inputSha256.slice(0, 12) + '-' + (manifest.companyInputSha256 ?? '').slice(0, 12);
  const output = path.join(root, version);
  const staging = path.join(root, '.staging-' + randomUUID());
  assertPrivateOutputPath(projectRoot, output);
  assertPrivateOutputPath(projectRoot, staging);
  if (checkOnly) {
    const saved: unknown = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    const files = Object.fromEntries(await Promise.all(OUTPUT_FILES.map(async filename =>
      [filename, await readFile(path.join(output, filename), 'utf8')] as const)));
    verifyProvinceReviewOutput(result, saved, files);
    console.log(JSON.stringify({ checked: output, outputFiles: OUTPUT_FILES.length,
      sourceRows: manifest.sourceRows, candidateNameKeysNotEntities: manifest.candidateNameKeysNotEntities,
      claims: result.claims.length, statusReviewCandidates: manifest.statusReviewCandidates,
      metadataReviewRows: manifest.metadataReviewRows, identityPairReviewCandidates: manifest.identityPairReviewCandidates }, null, 2));
    return;
  }
  if (existsSync(output)) throw new Error('相同输入的审核产物已存在：' + output + '；请核对版本，不覆盖旧结果。');
  await mkdir(staging, { recursive: true });
  const files = renderProvinceOutputFiles(result);
  if (Object.keys(files).sort().join('|') !== OUTPUT_FILES.slice().sort().join('|')) throw new Error('输出文件清单与 --check 校验清单不一致。');
  for (const [filename, contents] of Object.entries(files)) {
    await writeFile(path.join(staging, filename), contents, 'utf8');
  }
  const outputAudit = Object.fromEntries(Object.entries(files).map(([filename, contents]) => [filename, sha(contents)]));
  await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({
    ...manifest, input: OBSERVATIONS, companyInput: COMPANIES, outputSha256: outputAudit,
  }, null, 2) + '\n', 'utf8');
  await rename(staging, output);
  console.log(JSON.stringify({ output, sourceRows: manifest.sourceRows, candidateNameKeysNotEntities: manifest.candidateNameKeysNotEntities,
    claims: result.claims.length, detailFields: manifest.detailFieldCount,
    statusReviewCandidates: manifest.statusReviewCandidates, metadataReviewRows: manifest.metadataReviewRows,
    identityPairReviewCandidates: manifest.identityPairReviewCandidates }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
