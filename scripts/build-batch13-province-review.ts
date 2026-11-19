import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { assertPrivateOutputPath, buildProvinceReview, renderProvinceOutputFiles,
  verifyProvinceReviewOutput } from './province-pipeline';

// A changed reviewed archive requires an explicit new pinned input, never an overwrite.
const ARCHIVE = 'data/private/guangdong-eldercare-source/research-batch13/cleaned/versions/v1-5aa4fce7142b23b2';
const INPUT = ARCHIVE + '/cumulative-roster-candidates.csv';
const INPUT_MANIFEST = ARCHIVE + '/manifest.json';
const CLASSIFIED_INPUT = ARCHIVE + '/classified-observations.csv';
const INPUT_SHA256 = '227b1608ab0059b608bff5a29865ea192a362feeb233f7c6f3102a2654cd100e';
const BASELINE = 'data/private/guangdong-eldercare-source/research-batch12/merged-observations/v5-62e8cc2697dc/机构名录_来源观察_待审核.csv';
const BASELINE_SHA256 = 'ddc3db52aa54391b4d3b45fd4148db428a5ed4a832ac66bd100d1e0733bf8a77';
const COMPANIES = 'data/private/guangdong-eldercare-source/research-batch8/paid-registration/exports/累计机构与直接照护工商_25字段.csv';
const COMPANY_SHA256 = '04fc73f9de0571527f65ab0b3b457d3304def2e1721706f7818288132c7c2760';
const GENERATOR_FILES = ['scripts/build-batch13-province-review.ts', 'scripts/province-pipeline.ts'];
const OUTPUT_ROOT = 'data/private/guangdong-eldercare-source/research-batch13/province-pipeline';
const FIELDS = ['city', 'institution_name', 'source_url', 'source_published_at', 'source_as_of',
  'source_file', 'evidence_type', 'details'];
const CLASSIFIED_FIELDS = ['observation_id', 'source_family', 'classification',
  'institution_identity_verified', 'current_operating_status', 'date_label_as_published', ...FIELDS];
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object.');
  return value as Record<string, unknown>;
}

function csvRows(csv: string, fields: string[], label: string): Record<string, string>[] {
  const matrix = parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: false }) as string[][];
  if (!matrix[0] || matrix[0].length !== fields.length || fields.some((field, index) => matrix[0][index] !== field)) {
    throw new Error(label + ' header differs from the reviewed input.');
  }
  return matrix.slice(1).map(cells => Object.fromEntries(fields.map((field, index) => [field, cells[index]])));
}

function sameRow(left: Record<string, string>, right: Record<string, string>): boolean {
  return FIELDS.every(field => left[field] === right[field]);
}

async function main() {
  const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
  if (process.argv.length > 2 && !checkOnly) throw new Error('Only --check is supported.');
  const projectRoot = path.resolve(process.cwd());
  const [csv, companyCsv, inputManifestText, baselineCsv, classifiedCsv] = await Promise.all(
    [INPUT, COMPANIES, INPUT_MANIFEST, BASELINE, CLASSIFIED_INPUT].map(filename =>
      readFile(path.join(projectRoot, filename), 'utf8')));
  const inputManifest = record(JSON.parse(inputManifestText) as unknown, 'Archive manifest');
  const outputHashes = record(inputManifest.output_sha256, 'Archive output_sha256');
  if (sha(csv) !== INPUT_SHA256 || outputHashes[path.basename(INPUT)] !== sha(csv) ||
      outputHashes[path.basename(CLASSIFIED_INPUT)] !== sha(classifiedCsv)) {
    throw new Error('Pinned candidate input or archive output_sha256 entry differs.');
  }
  if (sha(baselineCsv) !== BASELINE_SHA256 || sha(companyCsv) !== COMPANY_SHA256) {
    throw new Error('Reviewed baseline or company input SHA-256 differs.');
  }
  const summary = record(inputManifest.summary, 'Archive summary');
  const classCounts = record(summary.class_counts, 'Archive class_counts');
  if (summary.legacy_baseline_rows !== 2348 || summary.current_roster_candidate_rows !== 43 ||
      summary.cumulative_source_observations_including_candidate_roster !== 2391 ||
      summary.approved_institution_identities !== 0 || summary.current_operating_status_verified !== false ||
      classCounts.current_roster_candidate !== 43) {
    throw new Error('Archive candidate counts or approval boundary changed.');
  }
  const rows = csvRows(csv, FIELDS, 'Candidate input');
  const baselineRows = csvRows(baselineCsv, FIELDS, 'Legacy baseline');
  const classifiedRows = csvRows(classifiedCsv, CLASSIFIED_FIELDS, 'Classified archive');
  const additions = classifiedRows.filter(row => row.classification === 'current_roster_candidate');
  if (rows.length !== 2391 || baselineRows.length !== 2348 || additions.length !== 43 ||
      baselineRows.some((row, index) => !sameRow(row, rows[index])) ||
      additions.some((row, index) => row.evidence_type !== 'current_roster_candidate' ||
        row.institution_identity_verified !== 'False' || row.current_operating_status !== 'unknown' ||
        !sameRow(row, rows[baselineRows.length + index]))) {
    throw new Error('Legacy raw fields changed or appended rows are not exactly the 43 classified roster candidates.');
  }
  const result = buildProvinceReview(csv, companyCsv);
  if (result.manifest.sourceRows !== 2391 || result.manifest.cityCount !== 21 ||
      result.manifest.companyRows !== 564 || result.manifest.approvedInstitutions !== 0 ||
      result.candidateGroups.some(group => group.institutionId !== null || group.reviewStatus !== 'unreviewed') ||
      result.companyMatchCandidates.some(match => match.relationshipVerified !== false)) {
    throw new Error('Province review input shape or unreviewed-candidate boundary changed.');
  }
  const generatorFileSha256 = Object.fromEntries(await Promise.all(GENERATOR_FILES.map(async filename =>
    [filename, sha(await readFile(path.join(projectRoot, filename), 'utf8'))] as const)));
  const generatorSha256 = sha(JSON.stringify(generatorFileSha256));
  const version = 'v1-' + result.manifest.inputSha256.slice(0, 12) + '-' +
    (result.manifest.companyInputSha256 ?? '').slice(0, 12) + '-' + generatorSha256.slice(0, 12);
  const root = path.join(projectRoot, OUTPUT_ROOT);
  const output = path.join(root, version);
  assertPrivateOutputPath(projectRoot, output);
  const rendered = renderProvinceOutputFiles(result);
  if (Object.keys(rendered).length !== 13) throw new Error('Expected exactly 13 province-review data outputs.');
  const outputSha256 = Object.fromEntries(Object.entries(rendered).map(([filename, contents]) => [filename, sha(contents)]));
  const manifestText = JSON.stringify({
    ...result.manifest,
    version,
    input: INPUT,
    inputManifest: INPUT_MANIFEST,
    inputManifestSha256: sha(inputManifestText),
    classificationInput: CLASSIFIED_INPUT,
    classificationInputSha256: sha(classifiedCsv),
    legacyBaseline: BASELINE,
    legacyBaselineSha256: BASELINE_SHA256,
    legacyRowsPreservedExactly: baselineRows.length,
    appendedClassifiedRosterCandidates: additions.length,
    companyInput: COMPANIES,
    generatorSha256,
    generatorFileSha256,
    excludedBatch13Classes: ['historical_roster', 'republication_candidate', 'special_subset', 'status_event', 'scan_transcription'],
    currentOperatingStatusVerified: false,
    outputSha256,
  }, null, 2) + '\n';
  const readme = `# 第13批全省审核候选管道\n\n` +
    `版本：\`${version}\`。固定输入：\`${INPUT}\`。\n\n` +
    `本版本复用既有 province-pipeline 领域函数，生成13项数据产物及本说明与manifest。` +
    `2391是来源观察行数，不是机构数；候选名称键也不是已确认的机构实体。\n\n` +
    `旧2348行逐字段与已固定SHA的第12批基线核对，原字段、details与日期原值保持不变；` +
    `旧日期语义未在本轮重新确认。仅追加统一归档中分类为current_roster_candidate的43条区级名录来源观察。` +
    `本轮历史名录、转载候选、专项子集、状态事件与独立扫描转录均不进入本管道。\n\n` +
    `覆盖21市仅表示输入出现21个城市标签，不证明21市名录完整、最新或穷尽。564条工商记录是已有范围内工商输入；` +
    `名称关联仅为待审候选，不证明该工商主体运营对应机构。全部机构身份仍待审核，批准数为0；` +
    `没有确认当前在营状态，不能直接导入公开站点或对外当作已核验名录。\n\n` +
    `版本名称依次含候选输入、工商输入和生成器SHA-256的前12位；完整SHA见manifest。` +
    `生成器指纹覆盖本构建脚本与复用的province-pipeline.ts。\n\n` +
    `生成：\`npx --no-install tsx scripts/build-batch13-province-review.ts\`。` +
    `已有版本不可覆盖。只读核验：\`npx --no-install tsx scripts/build-batch13-province-review.ts --check\`；` +
    `核验归档哈希、边界与逐字段传承，并将13项数据文件、manifest和README与重新生成的内容逐字比较，` +
    `不创建目录、不写文件、不调用外网或API。\n`;
  const expectedFiles = { ...rendered, 'manifest.json': manifestText, 'README.md': readme };
  async function verifySaved(directory: string) {
    const filenames = await readdir(directory);
    if (JSON.stringify(filenames.sort()) !== JSON.stringify(Object.keys(expectedFiles).sort())) {
      throw new Error('Saved output file set differs from the expected 13 data files, manifest and README.');
    }
    const saved = Object.fromEntries(await Promise.all(Object.keys(expectedFiles).map(async filename =>
      [filename, await readFile(path.join(directory, filename), 'utf8')] as const)));
    verifyProvinceReviewOutput(result, JSON.parse(saved['manifest.json']) as unknown,
      Object.fromEntries(Object.keys(rendered).map(filename => [filename, saved[filename]])));
    for (const [filename, contents] of Object.entries(expectedFiles)) {
      if (saved[filename] !== contents) throw new Error('Saved output differs byte-for-byte: ' + filename);
    }
  }
  if (checkOnly) {
    await verifySaved(output);
  } else {
    if (existsSync(output)) throw new Error('The same reviewed inputs and generator already have an immutable output: ' + output);
    const staging = path.join(root, '.staging-' + randomUUID());
    assertPrivateOutputPath(projectRoot, staging);
    await mkdir(staging, { recursive: true });
    for (const [filename, contents] of Object.entries(expectedFiles)) {
      await writeFile(path.join(staging, filename), contents, 'utf8');
    }
    await verifySaved(staging);
    await rename(staging, output);
    await verifySaved(output);
  }
  console.log(JSON.stringify({ [checkOnly ? 'checked' : 'output']: output, version,
    observations: result.manifest.sourceRows, cities: result.manifest.cityCount,
    companyRows: result.manifest.companyRows, approvedInstitutions: result.manifest.approvedInstitutions,
    candidateNameKeysNotEntities: result.manifest.candidateNameKeysNotEntities,
    claims: result.claims.length, companyMatchCandidates: result.manifest.companyMatchCandidates,
    statusReviewCandidates: result.manifest.statusReviewCandidates,
    metadataReviewRows: result.manifest.metadataReviewRows,
    identityPairReviewCandidates: result.manifest.identityPairReviewCandidates,
    outputFiles: Object.keys(rendered).length, generatorSha256 }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
