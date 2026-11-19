import { sitePath } from './site-path';
import type {
  ReferenceChunk, ReferenceCity, ReferenceDetailRecord, ReferenceIndex,
  ReferenceIndexRecord, ReferenceManifest, ReferenceProvince,
} from './institution-reference-types';
import { REFERENCE_SOURCE_FIELD_NAMES } from './institution-reference-types';

const dataRoot = '/data/qcc-institutions/';
const listPath = '/quanguo/cankao/';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const chunkPattern = /^chunk-\d{3,}\.v1\.json$/;
const creditPattern = /^[0-9A-HJ-NPQRTUWXY]{18}$/;
const creditChars = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const creditWeights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

export interface ReferenceSearchParams { province?: string; city?: string; q?: string; page?: string | number }
export interface ReferenceSearchItem extends ReferenceIndexRecord { citySlug: string }
export interface ReferenceSearchResult {
  items: ReferenceSearchItem[];
  total: number;
  page: number;
  pageCount: number;
  province: string;
  city: string;
  q: string;
  issues: string[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validCreditCode(value: unknown): value is string {
  if (typeof value !== 'string' || !creditPattern.test(value) || value === '000000000000000000') return false;
  const sum = creditWeights.reduce((total, weight, at) => total + creditChars.indexOf(value[at]) * weight, 0);
  return value[17] === creditChars[(31 - sum % 31) % 31];
}

function validManifest(value: unknown): value is ReferenceManifest {
  if (!object(value) || !exactKeys(value, ['schemaVersion', 'snapshotId', 'receivedAt', 'rowCount', 'source', 'provinces']) ||
    value.schemaVersion !== 1 || typeof value.snapshotId !== 'string' || !/^v1-[a-z0-9-]+$/.test(value.snapshotId) ||
    typeof value.receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.receivedAt) ||
    !count(value.rowCount) || !object(value.source) || !exactKeys(value.source, ['title', 'sha256', 'asOf']) ||
    typeof value.source.title !== 'string' || !value.source.title ||
    typeof value.source.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.source.sha256) || value.source.asOf !== null ||
    !Array.isArray(value.provinces) || value.provinces.length === 0) return false;
  const provinces = value.provinces;
  if (!provinces.every(province => object(province) && exactKeys(province, ['slug', 'name', 'count', 'cities']) &&
    typeof province.slug === 'string' && slugPattern.test(province.slug) &&
    typeof province.name === 'string' && Boolean(province.name) && count(province.count) &&
    Array.isArray(province.cities) && province.cities.length > 0 &&
    province.cities.every(city => object(city) && exactKeys(city, ['slug', 'name', 'count', 'indexPath']) &&
      typeof city.slug === 'string' && slugPattern.test(city.slug) &&
      typeof city.name === 'string' && Boolean(city.name) && count(city.count) &&
      city.indexPath === province.slug + '/' + city.slug + '/index.v1.json') &&
    new Set(province.cities.map(city => city.slug)).size === province.cities.length &&
    province.cities.reduce((sum, city) => sum + city.count, 0) === province.count)) return false;
  return new Set(provinces.map(province => province.slug)).size === provinces.length &&
    provinces.reduce((sum, province) => sum + province.count, 0) === value.rowCount;
}

function validIndexRecord(value: unknown, rowLimit: number): value is ReferenceIndexRecord {
  return object(value) && exactKeys(value, ['id', 'sourceRow', 'name', 'region', 'address', 'beds', 'chunk']) &&
    typeof value.id === 'string' && slugPattern.test(value.id) &&
    Number.isSafeInteger(value.sourceRow) && (value.sourceRow as number) >= 2 && (value.sourceRow as number) <= rowLimit + 1 &&
    typeof value.name === 'string' && Boolean(value.name) &&
    typeof value.region === 'string' && Boolean(value.region) &&
    (value.address === null || (typeof value.address === 'string' && Boolean(value.address))) &&
    count(value.beds) && typeof value.chunk === 'string' && chunkPattern.test(value.chunk);
}

function validDetailRecord(value: unknown, rowLimit: number): value is ReferenceDetailRecord {
  if (!object(value) || !exactKeys(value, ['id', 'sourceRow', 'name', 'region', 'address', 'beds', 'creditCode', 'codeStatus', 'sourceFields']) ||
    !validIndexRecord({
      id: value.id, sourceRow: value.sourceRow, name: value.name, region: value.region,
      address: value.address, beds: value.beds, chunk: 'chunk-001.v1.json',
    }, rowLimit) || !object(value.sourceFields) ||
    !exactKeys(value.sourceFields, [...REFERENCE_SOURCE_FIELD_NAMES]) ||
    !Object.values(value.sourceFields).every(field => field === null || typeof field === 'string' ||
      typeof field === 'number' && Number.isFinite(field))) return false;
  return value.codeStatus === 'valid' ? validCreditCode(value.creditCode) :
    (value.codeStatus === 'missing' || value.codeStatus === 'placeholder' || value.codeStatus === 'invalid') && value.creditCode === null;
}

async function readJson(path: string, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(sitePath(path), { signal });
  if (!response.ok) throw new Error('养老机构线索读取失败（HTTP ' + response.status + '）。');
  return response.json();
}

export async function loadReferenceManifest(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ReferenceManifest> {
  const raw = await readJson(dataRoot + 'manifest.v1.json', signal, fetcher);
  if (!validManifest(raw)) throw new Error('线索清单格式无效。');
  return raw;
}

export function findReferenceCity(manifest: ReferenceManifest, provinceSlug: string, citySlug: string): { province: ReferenceProvince; city: ReferenceCity } | null {
  if (!slugPattern.test(provinceSlug) || !slugPattern.test(citySlug)) return null;
  const province = manifest.provinces.find(item => item.slug === provinceSlug);
  const city = province?.cities.find(item => item.slug === citySlug);
  return province && city ? { province, city } : null;
}

export async function loadReferenceIndex(manifest: ReferenceManifest, provinceSlug: string, citySlug: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ReferenceIndex> {
  const location = findReferenceCity(manifest, provinceSlug, citySlug);
  if (!location || location.city.indexPath !== provinceSlug + '/' + citySlug + '/index.v1.json') throw new Error('省市地区参数无效。');
  const raw = await readJson(dataRoot + location.city.indexPath, signal, fetcher);
  if (!object(raw) || !exactKeys(raw, ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records']) ||
    raw.schemaVersion !== 1 || !Array.isArray(raw.records)) throw new Error('线索城市索引格式无效。');
  if (raw.snapshotId !== manifest.snapshotId) throw new Error('城市索引与清单快照不一致。');
  if (raw.provinceSlug !== provinceSlug || raw.citySlug !== citySlug) throw new Error('城市索引地区不一致。');
  if (raw.records.length !== location.city.count ||
    !raw.records.every(record => validIndexRecord(record, manifest.rowCount)) ||
    new Set(raw.records.map(record => record.id)).size !== raw.records.length ||
    new Set(raw.records.map(record => record.sourceRow)).size !== raw.records.length) throw new Error('线索城市索引格式无效。');
  return raw as unknown as ReferenceIndex;
}

export async function loadReferenceProvinceIndexes(manifest: ReferenceManifest, provinceSlug: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ReferenceIndex[]> {
  const province = manifest.provinces.find(item => item.slug === provinceSlug);
  if (!slugPattern.test(provinceSlug) || !province) throw new Error('省份参数无效。');
  const indexes: ReferenceIndex[] = [];
  for (let start = 0; start < province.cities.length; start += 6) {
    const batch = await Promise.all(province.cities.slice(start, start + 6).map(city =>
      loadReferenceIndex(manifest, provinceSlug, city.slug, signal, fetcher)));
    indexes.push(...batch);
  }
  return indexes;
}

export function findReferenceRecord(records: readonly ReferenceIndexRecord[], id: string): ReferenceIndexRecord | null {
  if (!slugPattern.test(id)) return null;
  return records.find(record => record.id === id && chunkPattern.test(record.chunk)) ?? null;
}

export async function loadReferenceChunk(manifest: ReferenceManifest, index: ReferenceIndex, filename: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ReferenceChunk> {
  const location = findReferenceCity(manifest, index.provinceSlug, index.citySlug);
  if (!location) throw new Error('省市地区参数无效。');
  if (!chunkPattern.test(filename)) throw new Error('详情分块文件名无效。');
  if (index.snapshotId !== manifest.snapshotId) throw new Error('城市索引与清单快照不一致。');
  const expected = index.records.filter(record => record.chunk === filename);
  if (!expected.length) throw new Error('详情分块未在城市索引中列出。');
  const path = dataRoot + location.city.indexPath.slice(0, -'index.v1.json'.length) + filename;
  const raw = await readJson(path, signal, fetcher);
  if (!object(raw) || !exactKeys(raw, ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records']) ||
    raw.schemaVersion !== 1 || !Array.isArray(raw.records)) throw new Error('线索详情格式无效。');
  if (raw.snapshotId !== manifest.snapshotId) throw new Error('详情分块与清单快照不一致。');
  if (raw.provinceSlug !== index.provinceSlug || raw.citySlug !== index.citySlug) throw new Error('详情分块地区不一致。');
  if (raw.records.length !== expected.length || !raw.records.every(record => validDetailRecord(record, manifest.rowCount)) ||
    raw.records.some((record, at) => {
      const item = expected[at];
      return !item || record.id !== item.id || record.sourceRow !== item.sourceRow || record.name !== item.name ||
        record.region !== item.region || record.address !== item.address || record.beds !== item.beds;
    })) throw new Error('线索详情与城市索引不一致。');
  return raw as unknown as ReferenceChunk;
}

function searchReferenceItems(records: ReferenceSearchItem[], params: ReferenceSearchParams, province: string, city: string): ReferenceSearchResult {
  const issues: string[] = [];
  let q = (params.q ?? '').trim().replace(/\s+/gu, ' ');
  if ([...q].length > 80) {
    q = [...q].slice(0, 80).join('');
    issues.push('搜索词最多80个字符，已截取前80个字符。');
  }
  const requestedPage = String(params.page ?? '1');
  let page = Number(requestedPage);
  if (!/^[1-9]\d*$/.test(requestedPage) || !Number.isSafeInteger(page)) {
    page = 1;
    issues.push('页码无效，已返回第1页。');
  }
  const words = q.split(' ').filter(Boolean);
  const matches = records.filter(record => words.every(word => [record.name, record.address, record.region].some(value => value?.replace(/\s+/gu, '').includes(word))));
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  if (page > pageCount) {
    page = pageCount;
    issues.push('页码超出结果范围，已显示第' + pageCount + '页。');
  }
  return { items: matches.slice((page - 1) * 20, page * 20), total, page, pageCount, province, city, q, issues };
}

export function searchReferenceRecords(index: ReferenceIndex, params: ReferenceSearchParams): ReferenceSearchResult {
  if (index.provinceSlug !== params.province || index.citySlug !== params.city) throw new Error('检索地区与城市索引不一致。');
  return searchReferenceItems(index.records.map(record => ({ ...record, citySlug: index.citySlug })), params, index.provinceSlug, index.citySlug);
}

export function searchReferenceProvinceRecords(manifest: ReferenceManifest, indexes: ReferenceIndex[], params: ReferenceSearchParams): ReferenceSearchResult {
  const province = manifest.provinces.find(item => item.slug === params.province);
  if (!province || params.city || indexes.length !== province.cities.length) throw new Error('检索省份与城市索引不一致。');
  const byCity = new Map(indexes.map(index => [index.citySlug, index]));
  if (byCity.size !== province.cities.length || province.cities.some(city => {
    const index = byCity.get(city.slug);
    return !index || index.snapshotId !== manifest.snapshotId || index.provinceSlug !== province.slug || index.records.length !== city.count;
  })) throw new Error('检索省份与城市索引不一致。');
  const records = province.cities.flatMap(city => byCity.get(city.slug)!.records.map(record => ({ ...record, citySlug: city.slug })));
  if (records.length !== province.count || new Set(records.map(record => record.sourceRow)).size !== records.length ||
    new Set(records.map(record => record.id)).size !== records.length) throw new Error('省级线索索引存在重复或缺失。');
  records.sort((a, b) => a.sourceRow - b.sourceRow);
  return searchReferenceItems(records, params, province.slug, '');
}

export function referenceListHref(params: ReferenceSearchParams): string {
  const query = new URLSearchParams();
  if (params.province && slugPattern.test(params.province)) query.set('province', params.province);
  if (params.city && params.province && slugPattern.test(params.province) && slugPattern.test(params.city)) query.set('city', params.city);
  if (params.q) query.set('q', params.q);
  if (Number(params.page) > 1) query.set('page', String(params.page));
  return listPath + (query.size ? '?' + query : '');
}

export function safeReferenceReturnPath(from: string | null): string {
  if (!from || from.length > 1536) return listPath;
  const provincePage = /^\/quanguo\/cankao\/sheng\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/page\/([1-9]\d*))?\/$/.exec(from);
  if (provincePage) return !provincePage[2] || Number.isSafeInteger(Number(provincePage[2])) ? from : listPath;
  if (!/^\/quanguo\/cankao\/(?:\?[^#\r\n]*)?$/.test(from)) return listPath;
  const query = from.slice(listPath.length);
  if (!query) return listPath;
  const params = new URLSearchParams(query.slice(1));
  const allowed = new Set(['province', 'city', 'q', 'page']);
  const seen = new Set<string>();
  for (const [key, value] of params) {
    if (!allowed.has(key) || seen.has(key)) return listPath;
    if ((key === 'province' || key === 'city') && (value.length > 80 || !slugPattern.test(value))) return listPath;
    if (key === 'q' && ([...value].length > 80 || /[\u0000-\u001f\u007f]/u.test(value))) return listPath;
    if (key === 'page' && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) return listPath;
    seen.add(key);
  }
  if (seen.has('city') && !seen.has('province')) return listPath;
  return from;
}
