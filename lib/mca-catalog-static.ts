import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MCA_CATALOG_CSV_FIELDS, type McaCatalogCsvDetail, type McaCatalogIndex, type McaCatalogIndexRecord, type McaCatalogManifest } from './mca-catalog-types';
import { mcaPublicLoader } from './mca-public-static';

const defaultRoot = path.join(process.cwd(), 'public', 'data', 'mca-catalog');
const idPattern = /^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/;
const shaPattern = /^[a-f0-9]{64}$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function readObject(filename: string): Record<string, unknown> {
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('机构目录文件类型不安全：' + filename);
  const parsed: unknown = JSON.parse(readFileSync(filename, 'utf8'));
  if (!object(parsed)) throw new Error('机构目录 JSON 结构无效：' + filename);
  return parsed;
}

function detailPath(id: string): string {
  return 'details/' + createHash('sha256').update(id, 'utf8').digest('hex') + '.v1.json';
}

/** Read a pinned public union without changing the historical observed projection. */
export function createMcaCatalogLoader(root = defaultRoot) {
  let manifestCache: McaCatalogManifest | undefined;
  let indexCache: McaCatalogIndex | undefined;
  let recordMap: Map<string, McaCatalogIndexRecord> | undefined;

  function getManifest(): McaCatalogManifest {
    if (manifestCache) return manifestCache;
    const value = readObject(path.join(root, 'manifest.v1.json'));
    const keys = ['schemaVersion', 'scope', 'snapshotId', 'observedSnapshotId', 'sourceCsvSha256',
      'csvExportDate', 'generatedAtUtc', 'csvRowCount', 'csvStaleCount', 'observedRecordCount',
      'overlapCount', 'recordCount', 'detailCount', 'nationalComplete', 'currentStatusVerified'];
    if (!exact(value, keys) || value.schemaVersion !== 1 || value.scope !== 'partial_mca_csv_catalog' ||
      typeof value.snapshotId !== 'string' || !/^catalog-[a-f0-9]{24}$/.test(value.snapshotId) ||
      typeof value.observedSnapshotId !== 'string' || !/^observed-[a-f0-9]{24}$/.test(value.observedSnapshotId) ||
      typeof value.sourceCsvSha256 !== 'string' || !shaPattern.test(value.sourceCsvSha256) ||
      value.csvExportDate !== '2026-11-23' || typeof value.generatedAtUtc !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value.generatedAtUtc) ||
      !count(value.csvRowCount) || value.csvRowCount === 0 || !count(value.csvStaleCount) ||
      !count(value.observedRecordCount) || !count(value.overlapCount) || !count(value.recordCount) ||
      !count(value.detailCount) || (value.overlapCount as number) > (value.csvRowCount as number) ||
      value.recordCount !== (value.observedRecordCount as number) + (value.csvRowCount as number) - (value.overlapCount as number) ||
      value.nationalComplete !== false || value.currentStatusVerified !== false) {
      throw new Error('机构目录清单结构或覆盖声明无效。');
    }
    const observed = mcaPublicLoader.getManifest();
    if (value.observedSnapshotId !== observed.snapshotId || value.observedRecordCount !== observed.recordCount) {
      throw new Error('机构目录与原有观察快照不匹配，需重新导入。');
    }
    manifestCache = value as unknown as McaCatalogManifest;
    return manifestCache;
  }

  function getIndex(): McaCatalogIndex {
    if (indexCache) return indexCache;
    const manifest = getManifest();
    const value = readObject(path.join(root, 'index.v1.json'));
    if (!exact(value, ['schemaVersion', 'snapshotId', 'records']) || value.schemaVersion !== 1 ||
      value.snapshotId !== manifest.snapshotId || !Array.isArray(value.records) ||
      value.records.length !== manifest.recordCount) throw new Error('机构目录索引结构或数量无效。');
    const records = value.records as unknown[];
    const map = new Map<string, McaCatalogIndexRecord>();
    let csv = 0;
    let stale = 0;
    let details = 0;
    for (const item of records) {
      if (!object(item) || typeof item.mcaId !== 'string' || !idPattern.test(item.mcaId) || map.has(item.mcaId) ||
        !('hasDetail' in item) || item.hasDetail !== (item.detailPath !== null) ||
        (item.detailPath !== null && item.detailPath !== detailPath(item.mcaId))) {
        throw new Error('机构目录索引 ID 或详情路径无效。');
      }
      if (item.sourceKind === 'csv') {
        if (item.hasDetail !== true || !['ok', 'stale'].includes(String(item.collectorStatus)) ||
          typeof item.csvUpdatedAtLocal !== 'string') throw new Error('CSV 索引来源状态无效。');
        csv++;
        if (item.collectorStatus === 'stale') stale++;
      } else if (item.sourceKind === 'observed') {
        if (item.collectorStatus !== null || item.csvUpdatedAtLocal !== null) throw new Error('观察索引来源状态无效。');
      } else throw new Error('机构目录索引来源无效。');
      if (item.hasDetail) details++;
      map.set(item.mcaId, item as unknown as McaCatalogIndexRecord);
    }
    if (csv !== manifest.csvRowCount || stale !== manifest.csvStaleCount ||
      details !== manifest.detailCount) throw new Error('机构目录索引计数不符。');
    for (const old of mcaPublicLoader.getIndex().records) {
      if (!map.has(old.mcaId)) throw new Error('机构目录遗漏原有平台 ID：' + old.mcaId);
    }
    recordMap = map;
    indexCache = value as unknown as McaCatalogIndex;
    return indexCache;
  }

  function getRecord(id: string): McaCatalogIndexRecord | null {
    if (!idPattern.test(id)) return null;
    getIndex();
    return recordMap?.get(id) ?? null;
  }

  function getDetailIds(): string[] {
    return getIndex().records.filter(record => record.detailPath !== null).map(record => record.mcaId);
  }

  function getCsvDetail(id: string): McaCatalogCsvDetail | null {
    const record = getRecord(id);
    if (!record || record.sourceKind !== 'csv') return null;
    const value = readObject(path.join(root, detailPath(id)));
    if (!exact(value, ['schemaVersion', 'snapshotId', 'mcaId', 'sourceKind', 'fields']) ||
      value.schemaVersion !== 1 || value.snapshotId !== getManifest().snapshotId ||
      value.mcaId !== id || value.sourceKind !== 'csv' || !object(value.fields) ||
      !exact(value.fields, MCA_CATALOG_CSV_FIELDS) || value.fields.org_id !== id ||
      value.fields.status !== record.collectorStatus || value.fields.updated_at !== record.csvUpdatedAtLocal) {
      throw new Error('CSV 机构详情结构或来源不匹配：' + id);
    }
    return value as unknown as McaCatalogCsvDetail;
  }

  return { getManifest, getIndex, getRecord, getDetailIds, getCsvDetail };
}

export const mcaCatalogLoader = createMcaCatalogLoader();
