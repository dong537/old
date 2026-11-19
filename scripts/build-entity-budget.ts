import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { assertPrivateOutputPath, buildProvinceReview, normalizeCandidateName, type ProvinceReview } from './province-pipeline';

type PaidName = { name: string; creditCode: string };
type Evidence = { sourceUrl: string; sourceFile: string; sourcePointer: string; publishedAt: string | null; asOfRaw: string | null; evidenceType: string; sourceSha256: string | null };
type Candidate = {
  candidateKey: string; city: string; name: string; variants: string[]; observationCount: number;
  legalFormSuffix: boolean; sameNamePaid: boolean; sameNameAttempted: boolean;
  paidCreditCodes: string[]; identityVerified: false; sourceEvidence: Evidence[];
};
type CityBudget = { city: string; sourceRows: number; nameKeys: number; sameNamePaid: number; attemptedWithoutPaid: number; neither: number; legalFormKeys: number; legalFormWithoutPaid: number };

const sortText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const legalForm = /(?:有限责任公司|股份有限公司|有限公司|分公司|普通合伙|有限合伙|合伙企业)$/u;

export function summarizeEntityBudget(review: ProvinceReview, paidNames: PaidName[], attemptedNames = new Set<string>()): {
  totals: { sourceRows: number; cities: number; nameKeys: number; sameNamePaid: number; attemptedWithoutPaid: number; neither: number };
  byCity: CityBudget[]; candidates: Candidate[];
} {
  const nameByCode = new Map<string, string>();
  const codesByName = new Map<string, Set<string>>();
  for (const paid of paidNames) {
    const name = paid.name.trim();
    const code = paid.creditCode.trim();
    if (!name || !/^[0-9A-HJ-NPQRTUWXY]{18}$/u.test(code)) throw new Error('已购工商名称或信用代码无效。');
    const old = nameByCode.get(code);
    if (old && old !== name) throw new Error('同一信用代码对应不同名称，停止统计。');
    nameByCode.set(code, name);
    const normalized = normalizeCandidateName(name);
    const codes = codesByName.get(normalized) ?? new Set<string>();
    codes.add(code);
    codesByName.set(normalized, codes);
  }
  const attempted = new Set([...attemptedNames].map(normalizeCandidateName));
  const observationById = new Map(review.observations.map((item) => [item.id, item]));
  const candidates: Candidate[] = review.candidateGroups.map((group): Candidate => {
    const sourceEvidence = group.observationIds.map((id): Evidence => {
      const observation = observationById.get(id);
      if (!observation) throw new Error('候选名称缺少来源观察：' + id);
      return {
        sourceUrl: observation.sourceUrl, sourceFile: observation.sourceFile, sourcePointer: observation.sourcePointer,
        publishedAt: observation.publishedAt, asOfRaw: observation.asOfRaw,
        evidenceType: observation.evidenceType, sourceSha256: observation.sourceSha256,
      };
    });
    const paidCreditCodes = [...(codesByName.get(group.normalizedName) ?? [])].sort(sortText);
    return {
      candidateKey: group.candidateKey, city: group.city, name: group.displayNames[0], variants: group.displayNames,
      observationCount: sourceEvidence.length, legalFormSuffix: legalForm.test(group.normalizedName),
      sameNamePaid: paidCreditCodes.length > 0, sameNameAttempted: attempted.has(group.normalizedName),
      paidCreditCodes, identityVerified: false, sourceEvidence,
    };
  }).sort((a, b) => sortText(a.city, b.city) || sortText(a.name, b.name));
  const cities = [...new Set(review.observations.map((item) => item.city))].sort(sortText);
  const byCity = cities.map((city): CityBudget => {
    const sourceRows = review.observations.filter((item) => item.city === city).length;
    const rows = candidates.filter((item) => item.city === city);
    return {
      city, sourceRows, nameKeys: rows.length, sameNamePaid: rows.filter((item) => item.sameNamePaid).length,
      attemptedWithoutPaid: rows.filter((item) => !item.sameNamePaid && item.sameNameAttempted).length,
      neither: rows.filter((item) => !item.sameNamePaid && !item.sameNameAttempted).length,
      legalFormKeys: rows.filter((item) => item.legalFormSuffix).length,
      legalFormWithoutPaid: rows.filter((item) => item.legalFormSuffix && !item.sameNamePaid).length,
    };
  });
  const totals = {
    sourceRows: review.observations.length, cities: cities.length, nameKeys: candidates.length,
    sameNamePaid: byCity.reduce((sum, city) => sum + city.sameNamePaid, 0),
    attemptedWithoutPaid: byCity.reduce((sum, city) => sum + city.attemptedWithoutPaid, 0),
    neither: byCity.reduce((sum, city) => sum + city.neither, 0),
  };
  if (totals.nameKeys !== totals.sameNamePaid + totals.attemptedWithoutPaid + totals.neither) throw new Error('候选分类与总量不一致。');
  return { totals, byCity, candidates };
}

function csvLine(values: (string | number | boolean | null)[]): string {
  return values.map((value) => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',');
}

async function main(): Promise<void> {
  const root = 'data/private/guangdong-eldercare-source';
  const sourcePath = root + '/research-batch15/cleaned/versions/v1-aa3bf6d7cd70aaae/cumulative-roster-candidates.csv';
  const paidPath = root + '/research-batch22-province-registration/累计机构与直接照护工商_25字段.csv';
  const allPaidPath = root + '/research-batch22-province-registration/累计工商登记_25字段.csv';
  const ledgerPath = root + '/query-ledger.jsonl';
  const outputRoot = path.resolve(root, 'research-batch23-entity-budget');
  assertPrivateOutputPath(process.cwd(), outputRoot);
  const [sourceCsv, paidCsv, allPaidCsv, ledgerText] = await Promise.all([
    readFile(sourcePath, 'utf8'), readFile(paidPath, 'utf8'), readFile(allPaidPath, 'utf8'), readFile(ledgerPath, 'utf8'),
  ]);
  const paidRows = parse(paidCsv, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const allPaidRows = parse(allPaidCsv, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const paidNames = paidRows.map((row) => ({ name: row['企业名称'], creditCode: row['统一社会信用代码'] }));
  const allCodes = new Set(allPaidRows.map((row) => row['统一社会信用代码']));
  if (paidRows.length !== 610 || allPaidRows.length !== 630 || allCodes.size !== 630 || paidNames.some((row) => !allCodes.has(row.creditCode))) {
    throw new Error('累计工商输入与第22批已核基线不一致。');
  }
  const ledgerRows = ledgerText.split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  const attemptedNotFound = new Set(ledgerRows.filter((row) => row.dimension === 'basic.registration' && row.ok === true && row.not_found === true)
    .map((row) => row.keyword).filter((word): word is string => typeof word === 'string'));
  const result = summarizeEntityBudget(buildProvinceReview(sourceCsv), paidNames, attemptedNotFound);
  if (result.totals.sourceRows !== 2429 || result.totals.cities !== 21 || result.totals.nameKeys !== 1795 ||
    result.totals.sameNamePaid !== 295 || result.totals.attemptedWithoutPaid !== 16 || result.totals.neither !== 1484) {
    throw new Error('全省候选计数与本轮审查口径不一致，停止覆盖产物。');
  }
  const cityHeader = ['城市', '来源观察行', '城市名称候选键', '与已购工商名称字面一致', '同名已尝试未找到', '无同名直接命中', '带企业法定后缀', '后缀名未同名购入', '识别压力测试积分', '若全为新企业登记追加积分'];
  const cityCsv = [csvLine(cityHeader), ...result.byCity.map((city) => csvLine([
    city.city, city.sourceRows, city.nameKeys, city.sameNamePaid, city.attemptedWithoutPaid,
    city.neither, city.legalFormKeys, city.legalFormWithoutPaid, city.neither, city.neither * 3,
  ]))].join(String.fromCharCode(10)) + String.fromCharCode(10);
  const candidateHeader = ['候选键', '城市', '来源机构名', '原名变体', '观察行数', '企业后缀', '已购工商同名', '原名登记已尝试未找到', '已购信用代码仅供核对', '机构运营关系已核实', '来源URL与行位'];
  const candidateCsv = [csvLine(candidateHeader), ...result.candidates.map((item) => csvLine([
    item.candidateKey, item.city, item.name, item.variants.join(' | '), item.observationCount,
    item.legalFormSuffix, item.sameNamePaid, !item.sameNamePaid && item.sameNameAttempted,
    item.paidCreditCodes.join(' | '), false,
    item.sourceEvidence.map((source) => source.sourceUrl + ' # ' + source.sourcePointer).join(' | '),
  ]))].join(String.fromCharCode(10)) + String.fromCharCode(10);
  const cityOutput = String.fromCharCode(0xfeff) + cityCsv;
  const candidateOutput = String.fromCharCode(0xfeff) + candidateCsv;
  const evidenceOutput = result.candidates.map((row) => JSON.stringify(row)).join(String.fromCharCode(10)) + String.fromCharCode(10);
  const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');
  const legalFormKeys = result.byCity.reduce((sum, city) => sum + city.legalFormKeys, 0);
  const legalFormWithoutPaid = result.byCity.reduce((sum, city) => sum + city.legalFormWithoutPaid, 0);
  const reportText = [
    '# 广东21市养老机构名称候选与工商预算｜2026-11-15',
    '',
    '这份报告是内部核验清单，不是广东当前在营机构名录。来源观察跨越不同年份和名单类型；一条城市＋名称候选键可能对应历史异文、服务点或非企业机构。',
    '',
    '## 已归并数据',
    '',
    '- 21市、2,429条跨期来源观察，按城市＋去空白/统一括号的原文名称归为1,795个文本候选键；每条保留来源URL和原始行位。',
    '- 已购工商累计630个独立信用代码，其中610个属于机构或直接照护相关集合；630不是机构数。',
    '- 1,795个名称键中，295个与已购工商企业名称严格同名，16个以同名付费查询登记但返回未找到，1,484个在上述两类均无同名直接命中。字面命中不证明运营关系；无字面命中也不证明该企业未查。',
    '- 因此不能把1,484写成“尚未查询的企业数”：其中可能有异名已购主体、同一企业的多个设施、公办或民非机构及历史异文。准确未购企业数须先逐家确认登记主体，再按信用代码和已购账本去重。',
    '- 2,429行使用第15批统一观察快照；第21、22批新归档官方来源尚未整体并回这份观察表。工商累计表已更新至第22批。后续11次工商登记查询不能直接加为11个名称键或机构。',
    '- 带企业法定后缀的名称键' + legalFormKeys + '个：同名已购' + (legalFormKeys - legalFormWithoutPaid) + '个、未同名购入' + legalFormWithoutPaid + '个。后者包含已尝试未找到和已复核异文，不能直接组成新收费队列。',
    '',
    '## 分市核对',
    '',
    '| 城市 | 来源行 | 名称键 | 同名已购 | 同名未找到 | 无同名直接命中 | 企业后缀未同名购入 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...result.byCity.map((city) => '| ' + [city.city, city.sourceRows, city.nameKeys, city.sameNamePaid, city.attemptedWithoutPaid, city.neither, city.legalFormWithoutPaid].join(' | ') + ' |'),
    '| 合计 | ' + [result.totals.sourceRows, result.totals.nameKeys, result.totals.sameNamePaid, result.totals.attemptedWithoutPaid, result.totals.neither, legalFormWithoutPaid].join(' | ') + ' |',
    '',
    '## 查询预算',
    '',
    '- 第21、22批已对现有明确主体和已购账本逐条排重；当前已归档证据可安全直接新增工商登记查询的主体为0，因此本轮建议立即支出0积分。',
    '- 21市统计.csv按城市列出识别/登记压力测试积分；它假设每个无同名直接命中的名称都单独查询，且最终各自对应一个不同的新企业。只是成本上界情景，不是待支付订单或查询计划。',
    '- 新取得官方原件后，先核法定全称或18位信用代码及来源行位，再与630个已购代码和付费账本排重。设需要实体识别的未确认词数为S、确认是未购新主体的数量为R，预算＝S×1＋R×3积分；未找到也会扣费。',
    '- 仅作数学压力测试：若对1,484个无同名直接命中的名称全部查实体识别，需1,484积分；若又全部成为不同的新企业并查工商，再需4,452积分，合计5,936积分。现实中包含公办/民非、历史异文和一企多设施，不能按此清单盲查。',
    '',
    '## 文件与边界',
    '',
    '- 逐家候选名录_待核.csv：1,795行，每行有城市、原名、来源位置及同名已购/已尝试标记。逐家候选_来源证据.jsonl：保留每条观察的来源URL、文件、行位、资料日期及哈希线索。',
    '- 21市统计.csv：分市汇总。manifest.json：输入和输出SHA-256，用于复核版本。',
    '- 这些文件仅存放在Git忽略的data/private目录；没有改动公开网站，也没有为本报告调用查企GO收费接口。',
    '',
  ].join(String.fromCharCode(10)) + String.fromCharCode(10);
  const manifest = {
    generatedOn: '2026-11-15', source: sourcePath, sourceSha256: sha256(sourceCsv),
    carePaidSource: paidPath, carePaidSha256: sha256(paidCsv), carePaidRows: paidRows.length,
    allPaidSource: allPaidPath, allPaidSha256: sha256(allPaidCsv), allPaidRows: allPaidRows.length,
    ledgerSource: ledgerPath, ledgerSha256: sha256(ledgerText),
    totals: result.totals, legalFormKeys, legalFormWithoutPaid,
    outputSha256: { cityCsv: sha256(cityOutput), candidateCsv: sha256(candidateOutput), evidenceJsonl: sha256(evidenceOutput), reportMd: sha256(reportText) },
    limitations: ['名称键不等于独立机构或当前在营设施。', '同名工商仅是字面匹配，不证明运营关系。', '未同名命中不等于企业从未查询。', '当前安全新增工商队列为0，需新官方主体证据。'],
  };
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputRoot, '21市统计.csv'), cityOutput, 'utf8'),
    writeFile(path.join(outputRoot, '逐家候选名录_待核.csv'), candidateOutput, 'utf8'),
    writeFile(path.join(outputRoot, '逐家候选_来源证据.jsonl'), evidenceOutput, 'utf8'),
    writeFile(path.join(outputRoot, 'REPORT.md'), reportText, 'utf8'),
    writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + String.fromCharCode(10), 'utf8'),
  ]);
  console.log(JSON.stringify({ totals: result.totals, legalFormKeys: manifest.legalFormKeys,
    legalFormWithoutPaid: manifest.legalFormWithoutPaid, allPaidRows: allPaidRows.length,
    carePaidRows: paidRows.length, outputRoot }));
}

if (path.basename(process.argv[1] ?? '') === 'build-entity-budget.ts') {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
