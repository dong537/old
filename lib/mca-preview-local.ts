import 'server-only';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { mcaPreviewFields } from './mca-preview-types';
import type { McaPreviewCatalog, McaPreviewDetail, McaPreviewDetailResult, McaPreviewIndex,
  McaPreviewIndexRecord, McaPreviewManifest } from './mca-preview-types';

if (process.env.NODE_ENV !== 'development' || process.env.ELDERCARE_PRIVATE_PREVIEW !== '1') {
  throw new Error('MCA 私有目录仅允许显式本机开发预览。');
}

const idPattern = /^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/;
const snapshotPattern = /^observed-[a-f0-9]{24}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const fieldSet = new Set<string>(mcaPreviewFields);
const numericFields = ['listedBeds', 'nursingBeds', 'listedMonthlyFeeMin', 'listedMonthlyFeeMax',
  'evaluationCount', 'overallEvaluation'] as const;
const textFields = ['name', 'facilityTypeCode', 'facilityTypeLabel', 'areaCode', 'regionLabel',
  'regionPath', 'address', 'platformStarCode', 'functionPositioningLabel', 'platformTagsRaw'] as const;
const defaultRoot = path.join(process.cwd(), 'data', 'private', 'generated', 'mca-observed-catalog');

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function textOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.trim().length > 0);
}
function numberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}
function fields(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(field => typeof field === 'string' && fieldSet.has(field)) &&
    new Set(value).size === value.length;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every(key => expected.includes(key));
}
function shaOf(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

function directory(location: string): void {
  const stat = lstatSync(location);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('MCA 私有目录路径不安全。');
}
function readObject(location: string, label: string): Record<string, unknown> {
  let raw: string;
  try {
    const stat = lstatSync(location);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('文件类型不安全');
    raw = readFileSync(location, 'utf8');
  } catch (error) {
    throw new Error('MCA 私有' + label + '缺失或不可读取。', { cause: error });
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch (error) {
    throw new Error('MCA 私有' + label + '不是有效 JSON。', { cause: error });
  }
  if (!object(value)) throw new Error('MCA 私有' + label + '结构无效。');
  return value;
}

function validManifest(value: Record<string, unknown>, snapshotId: string): value is Record<string, unknown> & McaPreviewManifest {
  return exactKeys(value, ['schemaVersion', 'snapshotId', 'scope', 'publishable', 'nationalComplete',
    'snapshotVerified', 'fieldSemantics', 'privacyReview', 'sourceSnapshots', 'recordCount',
    'withDetailCount', 'listObservationCount', 'detailObservationCount', 'withConflictCount',
    'fieldPathCount', 'ignored', 'indexPath', 'fieldCatalogPath', 'detailDirectory']) &&
    value.schemaVersion === 1 && value.snapshotId === snapshotId &&
    value.scope === 'private_mca_observed_institutions' && value.publishable === false &&
    value.nationalComplete === false && value.snapshotVerified === false &&
    value.fieldSemantics === 'partially_mapped' && value.privacyReview === 'required' &&
    value.indexPath === 'index.json' && value.fieldCatalogPath === 'field-catalog.json' &&
    value.detailDirectory === 'details' &&
    ['recordCount', 'withDetailCount', 'listObservationCount', 'detailObservationCount',
      'withConflictCount', 'fieldPathCount'].every(key => count(value[key])) &&
    Array.isArray(value.sourceSnapshots) && value.sourceSnapshots.every(item => object(item) &&
      typeof item.lane === 'string' && shaPattern.test(String(item.sha256)) &&
      (item.capturedAtUtc === null || typeof item.capturedAtUtc === 'string')) &&
    object(value.ignored) && Object.values(value.ignored).every(count);
}

function validIndexRecord(value: unknown): value is McaPreviewIndexRecord {
  if (!object(value) || !exactKeys(value, ['mcaId', 'detailPath', ...mcaPreviewFields,
    'hasDetail', 'listObservationCount', 'detailObservationCount', 'conflictFields']) ||
    typeof value.mcaId !== 'string' || !idPattern.test(value.mcaId) ||
    value.detailPath !== 'details/' + shaOf(value.mcaId) + '.json' ||
    !textFields.every(field => textOrNull(value[field])) ||
    !numericFields.every(field => numberOrNull(value[field])) ||
    !count(value.listObservationCount) || !count(value.detailObservationCount) ||
    value.listObservationCount + value.detailObservationCount < 1 ||
    value.hasDetail !== (value.detailObservationCount > 0) || !fields(value.conflictFields)) return false;
  return true;
}

function validIndex(value: Record<string, unknown>, manifest: McaPreviewManifest): value is Record<string, unknown> & McaPreviewIndex {
  if (!exactKeys(value, ['schemaVersion', 'snapshotId', 'publishable', 'records']) ||
    value.schemaVersion !== 1 || value.snapshotId !== manifest.snapshotId ||
    value.publishable !== false || !Array.isArray(value.records) ||
    value.records.length !== manifest.recordCount || !value.records.every(validIndexRecord)) return false;
  const records = value.records as McaPreviewIndexRecord[];
  return new Set(records.map(record => record.mcaId)).size === records.length &&
    records.filter(record => record.hasDetail).length === manifest.withDetailCount &&
    records.filter(record => record.conflictFields.length > 0).length === manifest.withConflictCount &&
    records.reduce((sum, record) => sum + record.listObservationCount, 0) === manifest.listObservationCount &&
    records.reduce((sum, record) => sum + record.detailObservationCount, 0) === manifest.detailObservationCount;
}

function validJson(value: unknown, depth = 0): boolean {
  if (depth > 100) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => validJson(item, depth + 1));
  return object(value) && Object.values(value).every(item => validJson(item, depth + 1));
}
function validObservation(value: unknown): boolean {
  return object(value) && object(value.source) && object(value.sourceFields) &&
    validJson(value.source) && validJson(value.sourceFields);
}
function observationMatchesId(value: unknown, id: string): boolean {
  return object(value) && object(value.sourceFields) &&
    (!Object.hasOwn(value.sourceFields, 'axbe0001') || value.sourceFields.axbe0001 === id);
}
function validDetail(value: Record<string, unknown>, record: McaPreviewIndexRecord): value is Record<string, unknown> & McaPreviewDetail {
  if (!exactKeys(value, ['schemaVersion', 'mcaId', 'publishable', 'selectedFieldSources',
    'conflictFields', 'listObservations', 'detailObservations']) ||
    value.schemaVersion !== 1 || value.mcaId !== record.mcaId || value.publishable !== false ||
    !object(value.selectedFieldSources) || !fields(value.conflictFields) ||
    JSON.stringify(value.conflictFields) !== JSON.stringify(record.conflictFields) ||
    !Array.isArray(value.listObservations) || value.listObservations.length !== record.listObservationCount ||
    !value.listObservations.every(item => validObservation(item) && observationMatchesId(item, record.mcaId)) ||
    !Array.isArray(value.detailObservations) || value.detailObservations.length !== record.detailObservationCount ||
    !value.detailObservations.every(item => object(item) && object(item.source) && validJson(item.source) &&
      object(item.endpoints) && Object.keys(item.endpoints).sort().join(',') === 'orgBaseDetail,yangLaoOrgDetail' &&
      validObservation(item.endpoints.orgBaseDetail) && validObservation(item.endpoints.yangLaoOrgDetail) &&
      observationMatchesId(item.endpoints.orgBaseDetail, record.mcaId) &&
      observationMatchesId(item.endpoints.yangLaoOrgDetail, record.mcaId))) return false;
  return Object.entries(value.selectedFieldSources).every(([field, selected]) => fieldSet.has(field) &&
    object(selected) && ['list', 'orgBaseDetail', 'yangLaoOrgDetail'].includes(String(selected.channel)) &&
    object(selected.source) && validJson(selected.source));
}

/** Test seam accepts a fixture root; application calls below always use the fixed private root. */
export function createMcaPreviewLoader(root: string) {
  function getMcaPreviewCatalog(): McaPreviewCatalog | null {
    const target = path.resolve(root);
    if (!existsSync(path.join(target, 'current.json'))) return null;
    directory(target);
    const current = readObject(path.join(target, 'current.json'), '快照指针');
    if (current.schemaVersion !== 1 || typeof current.snapshotId !== 'string' ||
      !snapshotPattern.test(current.snapshotId)) throw new Error('MCA 私有快照指针无效。');
    const snapshot = path.join(target, 'snapshots', current.snapshotId);
    directory(path.join(target, 'snapshots'));
    directory(snapshot);
    const manifest = readObject(path.join(snapshot, 'manifest.json'), '清单');
    if (!validManifest(manifest, current.snapshotId)) throw new Error('MCA 私有清单结构或发布门禁无效。');
    const index = readObject(path.join(snapshot, 'index.json'), '索引');
    if (!validIndex(index, manifest)) throw new Error('MCA 私有索引结构、计数或详情路径无效。');
    return { manifest, index };
  }
  function getMcaPreviewIds(): string[] {
    return getMcaPreviewCatalog()?.index.records.map(record => record.mcaId) ?? [];
  }
  function getMcaPreviewDetail(id: string): McaPreviewDetailResult | null {
    if (!idPattern.test(id)) return null;
    const catalog = getMcaPreviewCatalog();
    if (!catalog) return null;
    const record = catalog.index.records.find(item => item.mcaId === id);
    if (!record) return null;
    const snapshot = path.join(path.resolve(root), 'snapshots', catalog.manifest.snapshotId);
    directory(path.join(snapshot, 'details'));
    const detail = readObject(path.join(snapshot, 'details', shaOf(id) + '.json'), '详情');
    if (detail.mcaId !== id) throw new Error('MCA 私有详情 ID 与索引不一致。');
    if (!validDetail(detail, record)) throw new Error('MCA 私有详情结构或观察数与索引不一致。');
    return { record, detail, manifest: catalog.manifest };
  }
  return { getMcaPreviewCatalog, getMcaPreviewIds, getMcaPreviewDetail };
}

const loader = createMcaPreviewLoader(defaultRoot);
export const getMcaPreviewCatalog = loader.getMcaPreviewCatalog;
export const getMcaPreviewIds = loader.getMcaPreviewIds;
export const getMcaPreviewDetail = loader.getMcaPreviewDetail;
