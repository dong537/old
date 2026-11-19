import { sitePath } from './site-path';
import type { ProvinceCatalog, ProvinceSourceRecord } from './province-types';
import type { ProvinceSearchParams } from './province-search';

const catalogPath = '/data/guangdong-source-records.v1.json';
const listPath = '/quanguo/laiyuan/';

function isRecord(value: unknown): value is ProvinceSourceRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && /^gd-src-\d{6}$/.test(record.id) &&
    typeof record.city === 'string' && record.city.length > 0 &&
    typeof record.name === 'string' && record.name.length > 0 &&
    typeof record.evidenceType === 'string' && record.evidenceType.length > 0 &&
    typeof record.sourceUrl === 'string' && /^https?:\/\/[a-z0-9.-]+\//i.test(record.sourceUrl) &&
    (record.sourcePublishedAt === null || typeof record.sourcePublishedAt === 'string') &&
    (record.sourceAsOf === null || typeof record.sourceAsOf === 'string') &&
    (record.sourceStatusNote === null || typeof record.sourceStatusNote === 'string');
}

export function isGuangdongSourceCatalog(value: unknown): value is ProvinceCatalog {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const catalog = value as Record<string, unknown>;
  return catalog.schemaVersion === 1 && typeof catalog.snapshotId === 'string' &&
    /^v1-[0-9a-f]{16}$/.test(catalog.snapshotId) &&
    typeof catalog.archivedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(catalog.archivedAt) &&
    Array.isArray(catalog.records) && catalog.records.length > 0 && catalog.records.every(isRecord) &&
    new Set(catalog.records.map(record => (record as ProvinceSourceRecord).id)).size === catalog.records.length;
}

export async function loadGuangdongSourceCatalog(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ProvinceCatalog> {
  const response = await fetcher(sitePath(catalogPath), { signal });
  if (!response.ok) throw new Error('广东官方来源读取失败（HTTP ' + response.status + '）。');
  const value: unknown = await response.json();
  if (!isGuangdongSourceCatalog(value)) throw new Error('广东官方来源清单格式无效。');
  return value;
}

export function guangdongOfficialCities(records: readonly ProvinceSourceRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.city, (counts.get(record.city) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([name, count]) => ({ name, count }));
}

export function guangdongOfficialListHref(params: ProvinceSearchParams): string {
  const query = new URLSearchParams({ province: 'guangdong' });
  if (params.city && params.city.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(params.city)) query.set('city', params.city);
  if (params.q) query.set('q', params.q);
  if (Number(params.page) > 1) query.set('page', String(params.page));
  return listPath + '?' + query;
}
