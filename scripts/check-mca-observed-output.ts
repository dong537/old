import { createHash } from 'node:crypto';
import { mcaPreviewFields } from '../lib/mca-preview-types';

const root = 'data/mca-observed/';
const detailFile = /^data\/mca-observed\/details\/([a-f0-9]{64})\.v1\.json$/;
const states = new Set(['observed', 'missing', 'conflict']);
const indexStrings = [
  'name', 'facilityTypeCode', 'facilityTypeLabel', 'areaCode', 'regionLabel',
  'regionPath', 'address', 'platformStarCode', 'functionPositioningLabel', 'platformTagsRaw',
];
const indexNumbers = [
  'listedBeds', 'nursingBeds', 'listedMonthlyFeeMin', 'listedMonthlyFeeMax',
  'evaluationCount', 'overallEvaluation',
];
const indexResolvedStrings = ['listedContactPhone', 'serviceCategoryLabel', 'subsidyCode'];
const indexResolvedNumbers = ['dayCareBeds', 'fullCareBeds'];
const indexKeys = [
  'mcaId', 'detailPath', ...indexStrings, ...indexNumbers, 'hasDetail',
  'listObservationCount', 'detailObservationCount', 'conflictFields',
  'listObservedAtUtc',
  ...indexResolvedStrings, ...indexResolvedNumbers,
];

function fail(reason: string): never { throw new Error('MCA公开投影' + reason); }
function object(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('结构错误：' + where);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail('含未知或缺失字段：' + where);
  }
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function optionalText(value: unknown): boolean { return value === null || typeof value === 'string'; }
function count(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function number(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function optionalNumber(value: unknown): boolean { return value === null || number(value); }
function date(value: unknown): boolean { return text(value) && !Number.isNaN(Date.parse(value)); }
function timeRange(value: unknown): boolean {
  if (value === null) return false;
  const range = object(value, '逐家采集时间');
  exact(range, ['earliest', 'latest'], '逐家采集时间');
  return date(range.earliest) && date(range.latest) &&
    Date.parse(range.earliest as string) <= Date.parse(range.latest as string);
}
function parse(content: string, where: string): Record<string, unknown> {
  try { return object(JSON.parse(content), where); }
  catch { return fail('不是有效JSON：' + where); }
}
function resolved(value: unknown, validValue: (item: unknown) => boolean, where: string): void {
  const item = object(value, where);
  exact(item, ['state', 'value', 'observationCount'], where);
  if (!states.has(String(item.state)) || !count(item.observationCount) ||
    (item.state === 'observed' ? !validValue(item.value) || item.observationCount === 0 : item.value !== null)) {
    fail('字段状态或值错误：' + where);
  }
}
function stringArray(value: unknown): boolean { return Array.isArray(value) && value.every(text); }
function moneyRange(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every(number);
}
function chargeItems(value: unknown): boolean {
  return Array.isArray(value) && value.every(entry => {
    const item = object(entry, '收费项');
    exact(item, ['id', 'name', 'description', 'standard'], '收费项');
    return ['id', 'name', 'description', 'standard'].every(key => optionalText(item[key]));
  });
}
function platformDetail(value: unknown): void {
  const item = object(value, '详情字段');
  exact(item, ['identity', 'tags', 'subsidyCode', 'contactName', 'contactPhone', 'pointRaw',
    'photoCount', 'areaSqm', 'introduction', 'service', 'beds', 'feeSummary', 'charges', 'subServices', 'evaluation'], '详情字段');
  const identity = object(item.identity, '身份字段');
  exact(identity, ['facilityType', 'starCode', 'functionPositioning', 'region', 'address'], '身份字段');
  for (const [key, value] of Object.entries(identity)) resolved(value, text, '身份字段.' + key);
  resolved(item.tags, stringArray, '标签');
  for (const key of ['subsidyCode', 'contactName', 'contactPhone', 'pointRaw', 'introduction']) resolved(item[key], text, key);
  for (const key of ['photoCount', 'areaSqm']) resolved(item[key], number, key);
  const service = object(item.service, '服务字段');
  exact(service, ['content', 'team', 'hours', 'scope', 'explanation'], '服务字段');
  for (const [key, value] of Object.entries(service)) resolved(value, text, '服务字段.' + key);
  const beds = object(item.beds, '床位字段');
  exact(beds, ['total', 'dayCare', 'fullCare', 'nursing'], '床位字段');
  for (const [key, value] of Object.entries(beds)) resolved(value, number, '床位字段.' + key);
  if (!Array.isArray(item.feeSummary) || item.feeSummary.length !== 4) fail('四类费用缺失');
  for (const [position, code] of ['04', '02', '01', '03'].entries()) {
    const fee = object(item.feeSummary[position], '费用');
    exact(fee, ['code', 'label', 'range', 'description'], '费用');
    if (fee.code !== code || !text(fee.label)) fail('费用代码或名称错误');
    resolved(fee.range, moneyRange, '费用范围');
    resolved(fee.description, text, '费用说明');
  }
  resolved(item.charges, chargeItems, '分项收费');
  const sub = object(item.subServices, '子服务');
  exact(sub, ['respite', 'dayCare', 'homeVisit', 'assessment'], '子服务');
  for (const key of ['respite', 'dayCare', 'homeVisit']) {
    const block = object(sub[key], '子服务.' + key);
    exact(block, ['beds', 'nursingBeds', 'fee', 'unit', 'project', 'charges'], '子服务.' + key);
    resolved(block.beds, number, '子服务床位数');
    resolved(block.nursingBeds, number, '子服务护理型床位');
    resolved(block.fee, moneyRange, '子服务费用');
    if (!text(block.unit)) fail('子服务费用单位错误');
    resolved(block.project, text, '子服务项目');
    resolved(block.charges, chargeItems, '子服务收费项');
  }
  const assessment = object(sub.assessment, '能力评估');
  exact(assessment, ['home', 'site'], '能力评估');
  resolved(assessment.home, number, '上门评估费');
  resolved(assessment.site, number, '站点评估费');
  const evaluation = object(item.evaluation, '评价');
  exact(evaluation, ['state', 'text', 'count', 'score'], '评价');
  if (!states.has(String(evaluation.state)) || typeof evaluation.text !== 'string') fail('评价状态错误');
  resolved(evaluation.count, number, '评价次数');
  resolved(evaluation.score, number, '评价分数');
}

export function validateMcaObservedOutput(files: ReadonlyMap<string, string>): void {
  if (!files.size) return;
  const manifestPath = root + 'manifest.v1.json';
  const indexPath = root + 'index.v1.json';
  const manifest = parse(files.get(manifestPath) ?? fail('缺失manifest'), manifestPath);
  exact(manifest, ['schemaVersion', 'scope', 'snapshotId', 'sourcePage', 'snapshotCapturedAtUtc',
    'generatedAtUtc', 'recordCount', 'listObservedCount', 'withDetailCount', 'detailOnlyCount',
    'nationalComplete', 'currentStatusVerified', 'sourceSnapshots'], 'manifest');
  if (manifest.schemaVersion !== 1 || manifest.scope !== 'partial_observed_mca_institutions' ||
    !text(manifest.snapshotId) || manifest.sourcePage !== 'https://yanglao.mca.gov.cn/?#/index/institutionList' ||
    !date(manifest.snapshotCapturedAtUtc) || !date(manifest.generatedAtUtc) ||
    !count(manifest.recordCount) || manifest.recordCount === 0 || !count(manifest.listObservedCount) ||
    !count(manifest.withDetailCount) || !count(manifest.detailOnlyCount) ||
    (manifest.withDetailCount as number) > (manifest.recordCount as number) ||
    manifest.nationalComplete !== false || manifest.currentStatusVerified !== false ||
    !Array.isArray(manifest.sourceSnapshots) || manifest.sourceSnapshots.length === 0) fail('manifest状态或来源错误');
  for (const entry of manifest.sourceSnapshots as unknown[]) {
    const source = object(entry, '来源快照');
    exact(source, ['lane', 'sha256', 'capturedAtUtc'], '来源快照');
    if (!text(source.lane) || typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256) ||
      (source.capturedAtUtc !== null && !date(source.capturedAtUtc))) fail('来源快照字段错误');
  }
  const index = parse(files.get(indexPath) ?? fail('缺失index'), indexPath);
  exact(index, ['schemaVersion', 'snapshotId', 'records'], 'index');
  if (index.schemaVersion !== 1 || index.snapshotId !== manifest.snapshotId ||
    !Array.isArray(index.records) || index.records.length !== manifest.recordCount) fail('index与manifest不一致');
  const ids = new Set<string>();
  const expectedDetails = new Set<string>();
  let listObservedCount = 0;
  let detailOnlyCount = 0;
  for (const entry of index.records) {
    const record = object(entry, '列表记录');
    exact(record, indexKeys, '列表记录');
    if (typeof record.mcaId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(record.mcaId) || ids.has(record.mcaId)) fail('列表ID错误或重复');
    ids.add(record.mcaId);
    for (const key of indexStrings) if (!optionalText(record[key])) fail('列表文本值错误：' + key);
    for (const key of indexNumbers) if (!optionalNumber(record[key])) fail('列表数值错误：' + key);
    for (const key of indexResolvedStrings) resolved(record[key], text, '列表.' + key);
    for (const key of indexResolvedNumbers) resolved(record[key], number, '列表.' + key);
    if (record.listObservationCount === 0 ? record.listObservedAtUtc !== null : !timeRange(record.listObservedAtUtc)) {
      fail('逐家列表采集时间与观察次数不符');
    }
    if (typeof record.hasDetail !== 'boolean' || !count(record.listObservationCount) || (!record.hasDetail && record.listObservationCount === 0) ||
      !count(record.detailObservationCount) || !Array.isArray(record.conflictFields) ||
      !record.conflictFields.every((field: unknown) => mcaPreviewFields.includes(field as typeof mcaPreviewFields[number]))) fail('列表状态错误');
    if (record.listObservationCount > 0) listObservedCount++;
    else if (record.hasDetail) detailOnlyCount++;
    const expected = 'details/' + createHash('sha256').update(record.mcaId).digest('hex') + '.v1.json';
    if (record.hasDetail) {
      if (record.detailPath !== expected || record.detailObservationCount === 0) fail('MCA详情路径或状态错误');
      expectedDetails.add(root + expected);
    } else if (record.detailPath !== null || record.detailObservationCount !== 0) fail('MCA详情路径或状态错误');
  }
  if (expectedDetails.size !== manifest.withDetailCount || listObservedCount !== manifest.listObservedCount ||
    detailOnlyCount !== manifest.detailOnlyCount || files.size !== expectedDetails.size + 2) fail('详情数量或文件范围错误');
  for (const [relative, content] of files) {
    if (relative === manifestPath || relative === indexPath) continue;
    if (!detailFile.test(relative) || !expectedDetails.has(relative)) fail('未经批准的MCA投影路径：' + relative);
    const detail = parse(content, relative);
    exact(detail, ['schemaVersion', 'snapshotId', 'mcaId', 'sourcePage', 'detailObservedAtUtc', 'platformDetail', 'facts', 'conflictLabels'], '详情');
    if (!timeRange(detail.detailObservedAtUtc)) fail('逐家详情采集时间错误');
    const sourceHref = 'https://yanglao.mca.gov.cn/?#/index/orgServicesDetail?axbe0001=' +
      encodeURIComponent(String(detail.mcaId)) + '&parentRoute=institutionList&tagValue=3';
    if (detail.schemaVersion !== 1 || detail.snapshotId !== manifest.snapshotId || !ids.has(String(detail.mcaId)) ||
      root + 'details/' + createHash('sha256').update(String(detail.mcaId)).digest('hex') + '.v1.json' !== relative ||
      detail.sourcePage !== sourceHref ||
      !Array.isArray(detail.facts) || detail.facts.length !== mcaPreviewFields.length ||
      !Array.isArray(detail.conflictLabels) || !detail.conflictLabels.every(text)) fail('MCA详情身份或结构错误');
    const factKeys = new Set<string>();
    for (const entry of detail.facts) {
      const fact = object(entry, '列表事实');
      exact(fact, ['key', 'label', 'text', 'state', 'source', 'warning'], '列表事实');
      if (!mcaPreviewFields.includes(fact.key as typeof mcaPreviewFields[number]) || factKeys.has(String(fact.key)) ||
        !text(fact.label) || typeof fact.text !== 'string' || !states.has(String(fact.state)) || !optionalText(fact.warning)) fail('列表事实错误');
      factKeys.add(String(fact.key));
      if (fact.source !== null) {
        const source = object(fact.source, '事实来源');
        exact(source, ['channelLabel', 'fetchedAtUtc'], '事实来源');
        if (!text(source.channelLabel) || (source.fetchedAtUtc !== null && !date(source.fetchedAtUtc))) fail('事实来源错误');
      }
    }
    platformDetail(detail.platformDetail);
  }
}
