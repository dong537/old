import { sitePath } from './site-path';
import { isQccSourceFields, searchQccRecords } from './qcc-search';
import type { QccSearchParams, QccSearchResult } from './qcc-search';
import type { QccNationalChunk, QccNationalIndex, QccNationalIndexRecord, QccNationalManifest, QccNationalProvince, QccNationalCity } from './qcc-national-types';

const root = '/data/qcc-national/';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const indexPathPattern = /^p-[0-9a-f]{12}\/c-[0-9a-f]{12}\/index\.v1\.json$/;
const chunkPattern = /^chunk-\d{3,}\.v1\.json$/;
const listPath = '/quanguo/zhuti/';

export interface QccNationalSearchParams extends Omit<QccSearchParams, 'city'> {
  province?: string;
  city?: string;
}

export interface QccNationalSearchResult extends Omit<QccSearchResult, 'city' | 'items'> {
  province: string;
  city: string;
  items: QccNationalIndexRecord[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validManifest(raw: unknown): raw is QccNationalManifest {
  if (!object(raw) || raw.schemaVersion !== 1 || typeof raw.snapshotId !== 'string' || !raw.snapshotId ||
    typeof raw.exportedAt !== 'string' || !raw.exportedAt || !validCount(raw.rowCount) ||
    !Array.isArray(raw.sourceFiles) || !Array.isArray(raw.provinces)) return false;
  const sources = raw.sourceFiles;
  const provinces = raw.provinces;
  if (sources.length === 0 || provinces.length === 0 || !sources.every(file => object(file) &&
    typeof file.id === 'string' && file.id.length > 0 && typeof file.filename === 'string' &&
    file.filename.endsWith('.xlsx') && !/[\\/]/.test(file.filename) &&
    typeof file.sha256 === 'string' && /^[0-9a-f]{64}$/.test(file.sha256) && validCount(file.rowCount))) return false;
  if (new Set(sources.map(file => file.id)).size !== sources.length ||
    sources.reduce((sum, file) => sum + file.rowCount, 0) !== raw.rowCount) return false;
  if (!provinces.every(province => object(province) && typeof province.slug === 'string' &&
    slugPattern.test(province.slug) && typeof province.name === 'string' && province.name.length > 0 &&
    validCount(province.count) && Array.isArray(province.cities) && province.cities.length > 0 &&
    province.cities.every(city => object(city) && typeof city.slug === 'string' &&
      slugPattern.test(city.slug) && typeof city.name === 'string' && city.name.length > 0 &&
      validCount(city.count) && typeof city.indexPath === 'string' && indexPathPattern.test(city.indexPath)) &&
    new Set(province.cities.map(city => city.slug)).size === province.cities.length &&
    province.cities.reduce((sum, city) => sum + city.count, 0) === province.count)) return false;
  return new Set(provinces.map(province => province.slug)).size === provinces.length &&
    provinces.reduce((sum, province) => sum + province.count, 0) === raw.rowCount;
}

function validIndexRecord(raw: unknown, sourceIds: ReadonlySet<string>): raw is QccNationalIndexRecord {
  return object(raw) && typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(raw.id) &&
    Number.isSafeInteger(raw.rowNumber) && (raw.rowNumber as number) >= 2 &&
    typeof raw.name === 'string' && typeof raw.province === 'string' &&
    typeof raw.city === 'string' && typeof raw.sourceId === 'string' && sourceIds.has(raw.sourceId) &&
    typeof raw.chunk === 'string' && chunkPattern.test(raw.chunk);
}

function validDetailRecord(raw: unknown, sourceIds: ReadonlySet<string>): boolean {
  return object(raw) && typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(raw.id) &&
    Number.isSafeInteger(raw.rowNumber) && (raw.rowNumber as number) >= 2 &&
    typeof raw.name === 'string' && typeof raw.province === 'string' &&
    typeof raw.city === 'string' && typeof raw.sourceId === 'string' && sourceIds.has(raw.sourceId) &&
    (raw.creditCode === null || typeof raw.creditCode === 'string') &&
    (raw.codeValidity === null || typeof raw.codeValidity === 'string') && isQccSourceFields(raw.sourceFields);
}

async function readJson(path: string, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(sitePath(path), { signal });
  if (!response.ok) throw new Error('跨省登记主体候选数据读取失败（HTTP ' + response.status + '）。');
  return response.json();
}

export async function loadNationalManifest(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<QccNationalManifest> {
  const raw = await readJson(root + 'manifest.v1.json', signal, fetcher);
  if (!validManifest(raw)) throw new Error('跨省登记主体候选清单格式无效。');
  return raw;
}

export function findNationalCity(manifest: QccNationalManifest, provinceSlug: string, citySlug: string): { province: QccNationalProvince; city: QccNationalCity } | null {
  if (!slugPattern.test(provinceSlug) || !slugPattern.test(citySlug)) return null;
  const province = manifest.provinces.find(item => item.slug === provinceSlug);
  const city = province?.cities.find(item => item.slug === citySlug);
  return province && city ? { province, city } : null;
}

export async function loadNationalCityIndex(manifest: QccNationalManifest, provinceSlug: string, citySlug: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<QccNationalIndex> {
  const location = findNationalCity(manifest, provinceSlug, citySlug);
  if (!location || !indexPathPattern.test(location.city.indexPath)) throw new Error('省市地区参数无效。');
  const raw = await readJson(root + location.city.indexPath, signal, fetcher);
  if (!object(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.records)) throw new Error('跨省登记主体候选城市索引格式无效。');
  if (raw.snapshotId !== manifest.snapshotId) throw new Error('城市索引与清单快照不一致。');
  if (raw.provinceSlug !== provinceSlug || raw.citySlug !== citySlug) throw new Error('城市索引地区不一致。');
  const sourceIds = new Set(manifest.sourceFiles.map(file => file.id));
  if (raw.records.length !== location.city.count || !raw.records.every(record => validIndexRecord(record, sourceIds))) {
    throw new Error('跨省登记主体候选城市索引格式无效。');
  }
  if (raw.records.some(record => record.province !== location.province.name || record.city !== location.city.name)) {
    throw new Error('城市索引记录地区不一致。');
  }
  return raw as unknown as QccNationalIndex;
}

export function findNationalRecord(records: readonly QccNationalIndexRecord[], id: string): QccNationalIndexRecord | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const record = records.find(item => item.id === id);
  return record && chunkPattern.test(record.chunk) ? record : null;
}

export async function loadNationalChunk(manifest: QccNationalManifest, index: QccNationalIndex, filename: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<QccNationalChunk> {
  const location = findNationalCity(manifest, index.provinceSlug, index.citySlug);
  if (!location || !indexPathPattern.test(location.city.indexPath)) throw new Error('省市地区参数无效。');
  if (!chunkPattern.test(filename)) throw new Error('详情分块文件名无效。');
  if (index.snapshotId !== manifest.snapshotId) throw new Error('城市索引与清单快照不一致。');
  const path = root + location.city.indexPath.slice(0, -'index.v1.json'.length) + filename;
  const raw = await readJson(path, signal, fetcher);
  if (!object(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.records)) throw new Error('跨省登记主体候选详情格式无效。');
  if (raw.snapshotId !== manifest.snapshotId) throw new Error('详情分块与清单快照不一致。');
  if (raw.provinceSlug !== index.provinceSlug || raw.citySlug !== index.citySlug) throw new Error('详情分块地区不一致。');
  const sourceIds = new Set(manifest.sourceFiles.map(file => file.id));
  if (!raw.records.every(record => validDetailRecord(record, sourceIds))) throw new Error('跨省登记主体候选详情格式无效。');
  if (raw.records.some(record => record.province !== location.province.name || record.city !== location.city.name)) {
    throw new Error('详情分块记录地区不一致。');
  }
  return raw as unknown as QccNationalChunk;
}

export function searchNationalQccRecords(index: QccNationalIndex, params: QccNationalSearchParams): QccNationalSearchResult {
  if (index.provinceSlug !== params.province || index.citySlug !== params.city) throw new Error('检索地区与城市索引不一致。');
  const { city: _unusedCity, ...result } = searchQccRecords(index.records, { q: params.q, type: params.type, status: params.status, page: params.page });
  return { ...result, items: result.items as QccNationalIndexRecord[], province: index.provinceSlug, city: index.citySlug };
}

export function nationalListHref(params: QccNationalSearchParams): string {
  const query = new URLSearchParams();
  if (params.province && slugPattern.test(params.province)) query.set('province', params.province);
  if (params.city && params.province && slugPattern.test(params.province) && slugPattern.test(params.city)) query.set('city', params.city);
  for (const key of ['q', 'type', 'status'] as const) if (params[key]) query.set(key, params[key]);
  if (Number(params.page) > 1) query.set('page', String(params.page));
  return listPath + (query.size ? '?' + query : '');
}

export function safeNationalReturnPath(from: string | null): string {
  if (!from || from.length > 512 || !/^\/quanguo\/zhuti\/(?:\?[^#\r\n]*)?$/.test(from)) return listPath;
  const query = from.slice(listPath.length);
  if (!query) return listPath;
  const params = new URLSearchParams(query.slice(1));
  const allowed = new Set(['province', 'city', 'q', 'type', 'status', 'page']);
  const seen = new Set<string>();
  for (const [key, value] of params) {
    if (!allowed.has(key) || seen.has(key)) return listPath;
    if ((key === 'province' || key === 'city') && !slugPattern.test(value)) return listPath;
    if (key === 'page' && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) return listPath;
    seen.add(key);
  }
  if (seen.has('city') && !seen.has('province')) return listPath;
  return from;
}
