import { createHash } from 'node:crypto';
import { MCA_CATALOG_CSV_FIELDS } from '../lib/mca-catalog-types';
import { mcaPreviewFields } from '../lib/mca-preview-types';

const root = 'data/mca-catalog/';
const detailFile = /^data\/mca-catalog\/details\/([a-f0-9]{64})\.v1\.json$/;
const sha256 = /^[a-f0-9]{64}$/;
const idPattern = /^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/;
const localTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const day = /^\d{4}-\d{2}-\d{2}$/;
const privateToken = /(?:\bBearer\s+[A-Za-z0-9._~-]{12,}|qy_live_[A-Za-z0-9]{12,})/i;
const numericFields = [
  'building_area', 'total_beds', 'beds', 'nursing_beds',
  'fee_month_min', 'fee_month_max', 'fee_bed_min', 'fee_bed_max',
  'fee_care_min', 'fee_care_max', 'fee_meal_min', 'fee_meal_max',
  'evaluation', 'eval_count', 'cx_beds', 'cx_nursing_beds',
  'cx_fee_day_min', 'cx_fee_day_max', 'rt_beds', 'rt_nursing_beds',
  'rt_fee_day_min', 'rt_fee_day_max', 'home_fee_time_min',
  'home_fee_time_max', 'assess_fee_home', 'assess_fee_site',
] as const;
const arrayFields = ['tags', 'services'] as const;
const chargeFields = ['fee_detail_json', 'cx_fee_detail_json', 'rt_fee_detail_json'] as const;
const requiredText = ['org_id', 'name', 'org_type', 'area', 'area_code'] as const;
const optionalText = [
  'address', 'contact', 'phone', 'intro', 'service_detail', 'service_team',
  'service_time', 'service_radius', 'service_radius_explain', 'point',
  'risk_level', 'home_service_project',
] as const;
const baseIndexKeys = [
  'mcaId', 'detailPath', ...mcaPreviewFields, 'hasDetail', 'listObservationCount',
  'detailObservationCount', 'conflictFields', 'listedContactPhone',
  'serviceCategoryLabel', 'subsidyCode', 'dayCareBeds', 'fullCareBeds',
  'listObservedAtUtc',
] as const;
const indexKeys = [...baseIndexKeys, 'sourceKind', 'collectorStatus', 'csvUpdatedAtLocal'] as const;

export interface McaCatalogSourceLock {
  sourceCsvSha256: string;
  csvRowCount: number;
  csvStaleCount: number;
}

/** The source bytes and row count authorized for this release; future batches require a new review. */
export const MCA_CATALOG_SOURCE_LOCK: McaCatalogSourceLock = {
  sourceCsvSha256: 'd11c1916f5020a9cb2ea69a2f92ec7e4c881a1247cb4a744a4d968d8b8d4330a',
  csvRowCount: 3497,
  csvStaleCount: 3,
};

function fail(reason: string): never { throw new Error('MCA目录投影' + reason); }
function object(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('结构错误：' + where);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('字段缺失或多余：' + where);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
}
function nullableText(value: unknown): boolean { return value === null || typeof value === 'string' && value.length <= 200000; }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function number(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function nullableNumber(value: unknown): boolean { return value === null || number(value); }
function utcTime(value: unknown): boolean {
  return text(value) && /^\d{4}-\d{2}-\d{2}T.+(?:Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value));
}
function locallyTimed(value: unknown): value is string {
  return text(value) && localTime.test(value) && Number.isFinite(Date.parse(value));
}
function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function parse(files: ReadonlyMap<string, string>, file: string): Record<string, unknown> {
  const raw = files.get(file);
  if (raw === undefined) fail('缺失文件：' + file);
  try { return object(JSON.parse(raw), file); }
  catch { return fail('JSON无效：' + file); }
}
function resolved(value: unknown, kind: 'text' | 'number', where: string): void {
  const item = object(value, where);
  exact(item, ['state', 'value', 'observationCount'], where);
  if (!integer(item.observationCount)) fail('字段观察次数无效：' + where);
  if (item.state === 'observed') {
    if (item.observationCount === 0 || !(kind === 'text' ? text(item.value) : number(item.value))) fail('字段观察值无效：' + where);
  } else if ((item.state !== 'missing' && item.state !== 'conflict') || item.value !== null) fail('字段状态无效：' + where);
}
function observedTime(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 2 && utcTime(item.earliest) && utcTime(item.latest) &&
    Date.parse(item.earliest as string) <= Date.parse(item.latest as string);
}
function validateIndexRecord(item: Record<string, unknown>): void {
  exact(item, indexKeys, '索引');
  if (!text(item.mcaId) || !idPattern.test(item.mcaId) ||
    (item.detailPath !== null && (typeof item.detailPath !== 'string' || item.detailPath !== 'details/' + sha(item.mcaId) + '.v1.json')) ||
    item.hasDetail !== (item.detailPath !== null) || !integer(item.listObservationCount) ||
    !integer(item.detailObservationCount) ||
    (item.listObservationCount === 0 ? item.listObservedAtUtc !== null : !observedTime(item.listObservedAtUtc)) ||
    !Array.isArray(item.conflictFields) || !item.conflictFields.every(key => mcaPreviewFields.includes(key)) ||
    new Set(item.conflictFields).size !== item.conflictFields.length) fail('索引身份或观察状态无效');
  for (const key of ['name', 'facilityTypeCode', 'facilityTypeLabel', 'areaCode', 'regionLabel',
    'regionPath', 'address', 'platformStarCode', 'functionPositioningLabel', 'platformTagsRaw']) {
    if (!nullableText(item[key])) fail('索引文本字段无效：' + key);
  }
  for (const key of ['listedBeds', 'nursingBeds', 'listedMonthlyFeeMin', 'listedMonthlyFeeMax',
    'evaluationCount', 'overallEvaluation']) if (!nullableNumber(item[key])) fail('索引数值字段无效：' + key);
  for (const key of ['listedContactPhone', 'serviceCategoryLabel', 'subsidyCode']) resolved(item[key], 'text', '索引.' + key);
  for (const key of ['dayCareBeds', 'fullCareBeds']) resolved(item[key], 'number', '索引.' + key);
  if (item.sourceKind === 'csv') {
    if (!item.hasDetail || !integer(item.detailObservationCount) || item.detailObservationCount === 0 ||
      !['ok', 'stale'].includes(String(item.collectorStatus)) || !locallyTimed(item.csvUpdatedAtLocal)) fail('CSV索引状态无效');
  } else if (item.sourceKind !== 'observed' || item.collectorStatus !== null || item.csvUpdatedAtLocal !== null) {
    fail('索引来源状态无效');
  }
}
function validateCharge(value: unknown, where: string): void {
  if (value === null) return;
  if (!Array.isArray(value)) fail('收费字段无效：' + where);
  for (const entry of value) {
    const item = object(entry, where);
    exact(item, ['serviceType', 'project', 'priceRangeText'], where);
    if (!['serviceType', 'project', 'priceRangeText'].every(key => nullableText(item[key]))) fail('收费项目字段无效：' + where);
  }
}
function validateCsvFields(fields: Record<string, unknown>, id: string, record: Record<string, unknown>): void {
  exact(fields, MCA_CATALOG_CSV_FIELDS, 'CSV详情字段');
  for (const key of requiredText) if (!text(fields[key])) fail('CSV必填字段无效：' + key);
  for (const key of optionalText) if (!nullableText(fields[key])) fail('CSV文本字段无效：' + key);
  for (const key of numericFields) if (!nullableNumber(fields[key])) fail('CSV数值字段无效：' + key);
  for (const key of arrayFields) {
    const value = fields[key];
    if (value !== null && (!Array.isArray(value) || !value.every(text))) fail('CSV列表字段无效：' + key);
  }
  for (const key of chargeFields) validateCharge(fields[key], key);
  if (fields.found_date !== null && (!text(fields.found_date) || !day.test(fields.found_date) ||
    Number.isNaN(Date.parse(fields.found_date)))) fail('CSV日期字段无效');
  if (fields.status !== 'ok' && fields.status !== 'stale') fail('CSV采集状态无效');
  if (!locallyTimed(fields.updated_at)) fail('CSV采集时间字段无效');
  if (fields.org_id !== id || fields.name !== record.name || fields.status !== record.collectorStatus ||
    fields.updated_at !== record.csvUpdatedAtLocal) fail('CSV详情与索引身份或状态不一致');
}

/** Validates the entire projected batch against the original observed IDs and an optional source lock. */
export function validateMcaCatalogOutput(files: ReadonlyMap<string, string>,
  observedFiles: ReadonlyMap<string, string>, sourceLock?: McaCatalogSourceLock): void {
  if (files.size < 3) fail('缺失manifest、索引或详情');
  const manifest = parse(files, root + 'manifest.v1.json');
  exact(manifest, ['schemaVersion', 'scope', 'snapshotId', 'observedSnapshotId', 'sourceCsvSha256',
    'csvExportDate', 'generatedAtUtc', 'csvRowCount', 'csvStaleCount', 'observedRecordCount',
    'overlapCount', 'recordCount', 'detailCount', 'nationalComplete', 'currentStatusVerified'], 'manifest');
  const observedManifest = parse(observedFiles, 'data/mca-observed/manifest.v1.json');
  const observedIndex = parse(observedFiles, 'data/mca-observed/index.v1.json');
  if (!Array.isArray(observedIndex.records) || !text(observedManifest.snapshotId) ||
    observedIndex.snapshotId && observedIndex.snapshotId !== observedManifest.snapshotId) fail('旧观察来源索引无效');
  if (manifest.schemaVersion !== 1 || manifest.scope !== 'partial_mca_csv_catalog' ||
    typeof manifest.sourceCsvSha256 !== 'string' || !sha256.test(manifest.sourceCsvSha256) ||
    manifest.snapshotId !== 'catalog-' + sha(manifest.sourceCsvSha256 + ':' + observedManifest.snapshotId).slice(0, 24) ||
    manifest.observedSnapshotId !== observedManifest.snapshotId || manifest.csvExportDate !== '2026-11-23' ||
    !utcTime(manifest.generatedAtUtc) || !integer(manifest.csvRowCount) || manifest.csvRowCount === 0 ||
    !integer(manifest.csvStaleCount) || manifest.csvStaleCount > manifest.csvRowCount ||
    !integer(manifest.observedRecordCount) || manifest.observedRecordCount !== observedIndex.records.length ||
    !integer(manifest.overlapCount) || !integer(manifest.recordCount) || !integer(manifest.detailCount) ||
    manifest.nationalComplete !== false || manifest.currentStatusVerified !== false) fail('manifest快照、来源或数量无效');
  if (sourceLock && (manifest.sourceCsvSha256 !== sourceLock.sourceCsvSha256 ||
    manifest.csvRowCount !== sourceLock.csvRowCount || manifest.csvStaleCount !== sourceLock.csvStaleCount)) {
    fail('来源SHA或行数与锁定CSV不一致');
  }
  const oldById = new Map<string, Record<string, unknown>>();
  for (const entry of observedIndex.records) {
    const row = object(entry, '旧观察索引');
    if (!text(row.mcaId) || oldById.has(row.mcaId)) fail('旧观察索引ID重复');
    oldById.set(row.mcaId, row);
  }
  const index = parse(files, root + 'index.v1.json');
  exact(index, ['schemaVersion', 'snapshotId', 'records'], '索引');
  if (index.schemaVersion !== 1 || index.snapshotId !== manifest.snapshotId ||
    !Array.isArray(index.records) || index.records.length !== manifest.recordCount) fail('索引快照或数量无效');
  const rows = new Map<string, Record<string, unknown>>();
  const csvIds = new Set<string>();
  let stale = 0;
  let detailCount = 0;
  for (const entry of index.records) {
    const row = object(entry, '索引记录');
    validateIndexRecord(row);
    const id = row.mcaId as string;
    if (rows.has(id)) fail('索引ID重复：' + id);
    rows.set(id, row);
    if (row.detailPath !== null) detailCount++;
    if (row.sourceKind === 'csv') {
      csvIds.add(id);
      if (row.collectorStatus === 'stale') stale++;
    } else {
      const old = oldById.get(id);
      if (!old || baseIndexKeys.some(key => JSON.stringify(row[key]) !== JSON.stringify(old[key]))) {
        fail('旧观察记录被篡改或无对应ID：' + id);
      }
    }
  }
  const overlap = [...csvIds].filter(id => oldById.has(id)).length;
  if (rows.size !== oldById.size + csvIds.size - overlap ||
    [...oldById.keys()].some(id => !rows.has(id)) ||
    csvIds.size !== manifest.csvRowCount || stale !== manifest.csvStaleCount ||
    overlap !== manifest.overlapCount || detailCount !== manifest.detailCount ||
    manifest.recordCount !== oldById.size + csvIds.size - overlap) fail('索引合并或详情数量不一致');
  const expectedDetails = new Set([...csvIds].map(id => root + 'details/' + sha(id) + '.v1.json'));
  if (files.size !== expectedDetails.size + 2 || [...expectedDetails].some(file => !files.has(file))) {
    fail('CSV详情文件缺失或多余');
  }
  for (const [file, content] of files) {
    if (file === root + 'manifest.v1.json' || file === root + 'index.v1.json') continue;
    if (!detailFile.test(file) || !expectedDetails.has(file)) fail('未经批准的详情路径：' + file);
    if (privateToken.test(content)) fail('详情含凭据令牌：' + file);
    const detail = parse(files, file);
    exact(detail, ['schemaVersion', 'snapshotId', 'mcaId', 'sourceKind', 'fields'], 'CSV详情');
    const row = rows.get(String(detail.mcaId));
    if (!row || row.sourceKind !== 'csv' || detail.schemaVersion !== 1 ||
      detail.snapshotId !== manifest.snapshotId || detail.sourceKind !== 'csv' ||
      root + row.detailPath !== file) fail('CSV详情身份、来源或快照不一致：' + file);
    validateCsvFields(object(detail.fields, 'CSV详情字段'), detail.mcaId as string, row);
  }
}
