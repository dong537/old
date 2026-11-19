import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPrivateOutputPath, buildProvinceReview, renderProvinceOutputFiles,
  verifyProvinceReviewOutput } from './province-pipeline';

// Pinned input: a new source package requires a new reviewed merge version.
const INPUT = 'data/private/guangdong-eldercare-source/research-batch12/merged-observations/v5-62e8cc2697dc/机构名录_来源观察_待审核.csv';
const INPUT_MANIFEST = 'data/private/guangdong-eldercare-source/research-batch12/merged-observations/v5-62e8cc2697dc/manifest.json';
const COMPANIES = 'data/private/guangdong-eldercare-source/research-batch8/paid-registration/exports/累计机构与直接照护工商_25字段.csv';
const OUTPUT_ROOT = 'data/private/guangdong-eldercare-source/research-batch12/province-pipeline';
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

async function main() {
  const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
  if (process.argv.length > 2 && !checkOnly) throw new Error('Only --check is supported.');
  const projectRoot = path.resolve(process.cwd());
  const csv = await readFile(path.join(projectRoot, INPUT), 'utf8');
  const companyCsv = await readFile(path.join(projectRoot, COMPANIES), 'utf8');
  const inputManifest: unknown = JSON.parse(await readFile(path.join(projectRoot, INPUT_MANIFEST), 'utf8'));
  if (!inputManifest || typeof inputManifest !== 'object' || Array.isArray(inputManifest) ||
      (inputManifest as Record<string, unknown>).output_sha256 !== sha(csv) ||
      (inputManifest as Record<string, unknown>).output_rows !== 2348) {
    throw new Error('Merged observation manifest or row count differs from the reviewed input.');
  }
  const result = buildProvinceReview(csv, companyCsv);
  if (result.manifest.sourceRows !== 2348 || result.manifest.cityCount !== 21 ||
      result.manifest.companyRows !== 564 || result.manifest.approvedInstitutions !== 0) {
    throw new Error('Province review input shape or approval boundary changed.');
  }
  const root = path.join(projectRoot, OUTPUT_ROOT);
  const version = 'v8-' + result.manifest.inputSha256.slice(0, 12) + '-' +
    (result.manifest.companyInputSha256 ?? '').slice(0, 12);
  const output = path.join(root, version);
  assertPrivateOutputPath(projectRoot, output);
  const rendered = renderProvinceOutputFiles(result);
  if (checkOnly) {
    const saved: unknown = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    const files = Object.fromEntries(await Promise.all(Object.keys(rendered).map(async filename =>
      [filename, await readFile(path.join(output, filename), 'utf8')] as const)));
    verifyProvinceReviewOutput(result, saved, files);
    console.log(JSON.stringify({ checked: output, observations: result.manifest.sourceRows,
      candidateNameKeysNotEntities: result.manifest.candidateNameKeysNotEntities,
      claims: result.claims.length, outputFiles: Object.keys(files).length }, null, 2));
    return;
  }
  if (existsSync(output)) throw new Error('The same reviewed input already has an immutable output: ' + output);
  const staging = path.join(root, '.staging-' + randomUUID());
  assertPrivateOutputPath(projectRoot, staging);
  await mkdir(staging, { recursive: true });
  for (const [filename, contents] of Object.entries(rendered)) {
    await writeFile(path.join(staging, filename), contents, 'utf8');
  }
  const outputSha256 = Object.fromEntries(Object.entries(rendered).map(([filename, contents]) =>
    [filename, sha(contents)]));
  await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({
    ...result.manifest, input: INPUT, companyInput: COMPANIES, outputSha256,
  }, null, 2) + '\n', 'utf8');
  await rename(staging, output);
  console.log(JSON.stringify({ output, observations: result.manifest.sourceRows,
    candidateNameKeysNotEntities: result.manifest.candidateNameKeysNotEntities,
    claims: result.claims.length, outputFiles: Object.keys(rendered).length }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
