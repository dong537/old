import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { mcaOfficialDetailHref } from './mca-preview-ui';
import { mcaPreviewFields } from './mca-preview-types';
import type { McaPublicDetailRecord, McaPublicIndex, McaPublicIndexRecord, McaPublicManifest } from './mca-public-types';

const defaultRoot = path.join(process.cwd(), 'public', 'data', 'mca-observed');
const idPattern = /^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/;
const snapshotPattern = /^observed-[a-f0-9]{24}$/;
const sourcePage = 'https://yanglao.mca.gov.cn/?#/index/institutionList';
const numericFields = ['listedBeds', 'nursingBeds', 'listedMonthlyFeeMin', 'listedMonthlyFeeMax', 'evaluationCount', 'overallEvaluation'] as const;
const textFields = ['name', 'facilityTypeCode', 'facilityTypeLabel', 'areaCode', 'regionLabel', 'regionPath', 'address', 'platformStarCode', 'functionPositioningLabel', 'platformTagsRaw'] as const;
const fieldSet = new Set<string>(mcaPreviewFields);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every(key => expected.includes(key));
}

function readObject(filename: string): Record<string, unknown> {
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('平台采集快照文件类型不安全：' + filename);
  const parsed: unknown = JSON.parse(readFileSync(filename, 'utf8'));
  if (!object(parsed)) throw new Error('平台采集快照 JSON 结构无效：' + filename);
  return parsed;
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function nullableText(value: unknown): boolean { return value === null || typeof value === 'string'; }
function nullableNumber(value: unknown): boolean { return value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function resolved(value: unknown, kind: 'text' | 'number'): boolean {
  if (!object(value) || !exactKeys(value, ['state', 'value', 'observationCount']) || !count(value.observationCount)) return false;
  if (value.state === 'observed') return (value.observationCount as number) > 0 &&
    (kind === 'text' ? typeof value.value === 'string' && value.value.length > 0 :
      typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0);
  return (value.state === 'missing' || value.state === 'conflict') && value.value === null;
}
function observedTimeRange(value: unknown): boolean {
  if (!object(value) || !exactKeys(value, ['earliest', 'latest']) ||
      typeof value.earliest !== 'string' || typeof value.latest !== 'string') return false;
  const utc = /^\d{4}-\d{2}-\d{2}T.+(?:Z|\+00:00)$/;
  const earliest = Date.parse(value.earliest);
  const latest = Date.parse(value.latest);
  return utc.test(value.earliest) && utc.test(value.latest) &&
    Number.isFinite(earliest) && Number.isFinite(latest) && earliest <= latest;
}
function detailPath(id: string): string {
  return 'details/' + createHash('sha256').update(id, 'utf8').digest('hex') + '.v1.json';
}

function parseManifest(value: Record<string, unknown>): McaPublicManifest {
  if (!exactKeys(value, ['schemaVersion', 'scope', 'snapshotId', 'sourcePage', 'snapshotCapturedAtUtc', 'generatedAtUtc',
    'recordCount', 'listObservedCount', 'withDetailCount', 'detailOnlyCount', 'nationalComplete', 'currentStatusVerified', 'sourceSnapshots']) ||
    value.schemaVersion !== 1 || value.scope !== 'partial_observed_mca_institutions' ||
    typeof value.snapshotId !== 'string' || !snapshotPattern.test(value.snapshotId) ||
    value.sourcePage !== sourcePage || typeof value.snapshotCapturedAtUtc !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value.snapshotCapturedAtUtc) ||
    typeof value.generatedAtUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value.generatedAtUtc) ||
    !count(value.recordCount) || value.recordCount === 0 || !count(value.listObservedCount) ||
    !count(value.withDetailCount) || !count(value.detailOnlyCount) ||
    (value.listObservedCount as number) + (value.detailOnlyCount as number) !== value.recordCount ||
    (value.detailOnlyCount as number) > (value.withDetailCount as number) ||
    (value.withDetailCount as number) > (value.recordCount as number) ||
    value.nationalComplete !== false || value.currentStatusVerified !== false ||
    !Array.isArray(value.sourceSnapshots)) throw new Error('平台采集快照清单无效或错误宣称完整。');
  return value as unknown as McaPublicManifest;
}

function validRecord(value: unknown): value is McaPublicIndexRecord {
  if (!object(value) || !exactKeys(value, ['mcaId', 'detailPath', ...mcaPreviewFields,
    'listedContactPhone', 'serviceCategoryLabel', 'subsidyCode', 'dayCareBeds', 'fullCareBeds', 'listObservedAtUtc',
    'hasDetail', 'listObservationCount', 'detailObservationCount', 'conflictFields']) ||
    typeof value.mcaId !== 'string' || !idPattern.test(value.mcaId) ||
    !textFields.every(key => nullableText(value[key])) || !numericFields.every(key => nullableNumber(value[key])) ||
    !count(value.listObservationCount) || !count(value.detailObservationCount) ||
    !resolved(value.listedContactPhone, 'text') || !resolved(value.serviceCategoryLabel, 'text') ||
    !resolved(value.subsidyCode, 'text') || !resolved(value.dayCareBeds, 'number') ||
    !resolved(value.fullCareBeds, 'number') ||
    (value.listObservationCount === 0 ? value.listObservedAtUtc !== null : !observedTimeRange(value.listObservedAtUtc)) ||
    !Array.isArray(value.conflictFields) || !value.conflictFields.every(key => typeof key === 'string' && fieldSet.has(key)) ||
    new Set(value.conflictFields).size !== value.conflictFields.length) return false;
  if (value.detailPath !== null && value.detailPath !== detailPath(value.mcaId)) return false;
  return value.hasDetail === (value.detailPath !== null) && value.hasDetail === ((value.detailObservationCount as number) > 0) &&
    ((value.listObservationCount as number) > 0 || (value.detailObservationCount as number) > 0);
}

function parseIndex(value: Record<string, unknown>, manifest: McaPublicManifest): McaPublicIndex {
  if (!exactKeys(value, ['schemaVersion', 'snapshotId', 'records']) || value.schemaVersion !== 1 ||
    value.snapshotId !== manifest.snapshotId || !Array.isArray(value.records) ||
    value.records.length !== manifest.recordCount || !value.records.every(validRecord)) {
    throw new Error('平台采集索引结构、快照或详情路径无效。');
  }
  const records = value.records as McaPublicIndexRecord[];
  if (new Set(records.map(row => row.mcaId)).size !== records.length ||
    records.filter(row => row.detailPath !== null).length !== manifest.withDetailCount ||
    records.filter(row => row.listObservationCount > 0).length !== manifest.listObservedCount ||
    records.filter(row => row.listObservationCount === 0).length !== manifest.detailOnlyCount) {
    throw new Error('平台采集索引 ID 或详情数量不一致。');
  }
  return value as unknown as McaPublicIndex;
}

function parseDetail(value: Record<string, unknown>, record: McaPublicIndexRecord, manifest: McaPublicManifest): McaPublicDetailRecord {
  if (!exactKeys(value, ['schemaVersion', 'snapshotId', 'mcaId', 'sourcePage', 'detailObservedAtUtc', 'platformDetail', 'facts', 'conflictLabels']) ||
    value.schemaVersion !== 1 || value.snapshotId !== manifest.snapshotId || value.mcaId !== record.mcaId ||
    value.sourcePage !== mcaOfficialDetailHref(record.mcaId) || !observedTimeRange(value.detailObservedAtUtc) ||
    !object(value.platformDetail) ||
    !Array.isArray(value.facts) || !Array.isArray(value.conflictLabels) ||
    !value.conflictLabels.every(label => typeof label === 'string')) {
    throw new Error('平台采集详情 ID、快照或结构无效。');
  }
  return value as unknown as McaPublicDetailRecord;
}

/** Reads only the reviewed public projection during static export; never touches private raw snapshots. */
export function createMcaPublicLoader(root: string = defaultRoot) {
  let manifestCache: McaPublicManifest | null = null;
  let indexCache: McaPublicIndex | null = null;
  function getManifest(): McaPublicManifest {
    if (!manifestCache) manifestCache = parseManifest(readObject(path.join(root, 'manifest.v1.json')));
    return manifestCache;
  }
  function getIndex(): McaPublicIndex {
    if (!indexCache) indexCache = parseIndex(readObject(path.join(root, 'index.v1.json')), getManifest());
    return indexCache;
  }
  function getDetailIds(): string[] {
    return getIndex().records.filter(record => record.detailPath !== null).map(record => record.mcaId);
  }
  function getDetail(id: string): McaPublicDetailRecord | null {
    if (!idPattern.test(id)) return null;
    const record = getIndex().records.find(item => item.mcaId === id);
    if (!record || !record.detailPath) return null;
    return parseDetail(readObject(path.join(root, 'details', createHash('sha256').update(id, 'utf8').digest('hex') + '.v1.json')), record, getManifest());
  }
  return { getManifest, getIndex, getDetailIds, getDetail };
}

export const mcaPublicLoader = createMcaPublicLoader();
