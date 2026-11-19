import { sitePath } from './site-path';
import type { NationalOfficialChunk, NationalOfficialCity, NationalOfficialDetailRecord, NationalOfficialIndex, NationalOfficialIndexRecord, NationalOfficialManifest, NationalOfficialProvince, NationalOfficialSource } from './national-official-types';

const root = '/data/national-official/';
const listPath = '/quanguo/laiyuan/';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const chunkPattern = /^chunk-\d{3,}\.v1\.json$/;

export interface OfficialSearchParams { province?: string; city?: string; q?: string; page?: string | number }
export interface OfficialSearchResult {
  items: NationalOfficialIndexRecord[];
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

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function nullableCount(value: unknown): value is number | null {
  return value === null || count(value);
}

function sourceOrdinalLimit(source: NationalOfficialSource): number {
  return source.id === 'zj-prov-20260902' ? 1147 : source.rowCount;
}

function validSource(value: unknown): value is NationalOfficialSource {
  return object(value) && typeof value.id === 'string' && slugPattern.test(value.id) &&
    typeof value.province === 'string' && value.province.length > 0 &&
    (value.city === null || (typeof value.city === 'string' && value.city.length > 0)) &&
    typeof value.scope === 'string' && value.scope.length > 0 &&
    typeof value.title === 'string' && value.title.length > 0 &&
    typeof value.url === 'string' && /^https:\/\/[a-z0-9.-]+\//i.test(value.url) &&
    (value.publishedAt === null || (typeof value.publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.publishedAt))) &&
    (value.asOf === null || (typeof value.asOf === 'string' &&
      (/^\d{4}-\d{2}-\d{2}$/.test(value.asOf) || /^[12]\d{3}年(?:0?[1-9]|1[0-2])月底$/.test(value.asOf)))) &&
    typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) && count(value.rowCount);
}

function validManifest(value: unknown): value is NationalOfficialManifest {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.snapshotId !== 'string' || !value.snapshotId ||
    typeof value.archivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.archivedAt) ||
    !count(value.rowCount) || !Array.isArray(value.sources) || !Array.isArray(value.provinces) ||
    value.sources.length === 0 || value.provinces.length === 0 || !value.sources.every(validSource)) return false;
  const sources = value.sources as NationalOfficialSource[];
  if (new Set(sources.map(source => source.id)).size !== sources.length ||
    sources.reduce((sum, source) => sum + source.rowCount, 0) !== value.rowCount) return false;
  const provinces = value.provinces;
  if (!provinces.every(province => object(province) && typeof province.slug === 'string' && slugPattern.test(province.slug) &&
    typeof province.name === 'string' && province.name.length > 0 && count(province.count) &&
    Array.isArray(province.cities) && province.cities.length > 0 &&
    province.cities.every(city => object(city) && typeof city.slug === 'string' && slugPattern.test(city.slug) &&
      typeof city.name === 'string' && city.name.length > 0 && count(city.count) &&
      city.indexPath === province.slug + '/' + city.slug + '/index.v1.json') &&
    new Set(province.cities.map(city => city.slug)).size === province.cities.length &&
    province.cities.reduce((sum, city) => sum + city.count, 0) === province.count)) return false;
  return new Set(provinces.map(province => province.slug)).size === provinces.length &&
    provinces.reduce((sum, province) => sum + province.count, 0) === value.rowCount;
}

function validIndexRecord(value: unknown, sources: ReadonlyMap<string, NationalOfficialSource>, province: string, city: string): value is NationalOfficialIndexRecord {
  if (!object(value) || typeof value.id !== 'string' || !slugPattern.test(value.id) ||
    typeof value.sourceId !== 'string' || !sources.has(value.sourceId) ||
    !Number.isSafeInteger(value.rowNumber) || (value.rowNumber as number) < 1 ||
    typeof value.name !== 'string' || !value.name || (value.address !== null && (typeof value.address !== 'string' || !value.address)) ||
    !nullableCount(value.beds) || typeof value.chunk !== 'string' || !chunkPattern.test(value.chunk)) return false;
  const source = sources.get(value.sourceId)!;
  return source.province === province && (source.city === null || source.city === city) && (value.rowNumber as number) <= sourceOrdinalLimit(source);
}

function validDetailRecord(value: unknown, sources: ReadonlyMap<string, NationalOfficialSource>, province: string, city: string): value is NationalOfficialDetailRecord {
  return object(value) && typeof value.id === 'string' && slugPattern.test(value.id) &&
    typeof value.sourceId === 'string' && sources.has(value.sourceId) &&
    sources.get(value.sourceId)!.province === province && (sources.get(value.sourceId)!.city === null || sources.get(value.sourceId)!.city === city) &&
    Number.isSafeInteger(value.rowNumber) && (value.rowNumber as number) >= 1 &&
    (value.rowNumber as number) <= sourceOrdinalLimit(sources.get(value.sourceId)!) &&
    typeof value.name === 'string' && Boolean(value.name) && (value.address === null || (typeof value.address === 'string' && Boolean(value.address))) &&
    nullableCount(value.beds) && nullableCount(value.residentCount) && nullableCount(value.staffCount) &&
    (value.services === null || typeof value.services === 'string');
}

async function readJson(path: string, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(sitePath(path), { signal });
  if (!response.ok) throw new Error('官方来源记录读取失败（HTTP ' + response.status + '）。');
  return response.json();
}

export async function loadOfficialManifest(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<NationalOfficialManifest> {
  const raw = await readJson(root + 'manifest.v1.json', signal, fetcher);
  if (!validManifest(raw)) throw new Error('官方来源清单格式无效。');
  return raw;
}

export function findOfficialCity(manifest: NationalOfficialManifest, provinceSlug: string, citySlug: string): { province: NationalOfficialProvince; city: NationalOfficialCity } | null {
  if (!slugPattern.test(provinceSlug) || !slugPattern.test(citySlug)) return null;
  const province = manifest.provinces.find(item => item.slug === provinceSlug);
  const city = province?.cities.find(item => item.slug === citySlug);
  return province && city ? { province, city } : null;
}

export async function loadOfficialIndex(manifest: NationalOfficialManifest, provinceSlug: string, citySlug: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<NationalOfficialIndex> {
  const location = findOfficialCity(manifest, provinceSlug, citySlug);
  if (!location || location.city.indexPath !== provinceSlug + '/' + citySlug + '/index.v1.json') throw new Error('省市地区参数无效。');
  const raw = await readJson(root + location.city.indexPath, signal, fetcher);
  if (!object(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.records)) throw new Error('官方来源城市索引格式无效。');
  if (raw.snapshotId !== manifest.snapshotId) throw new Error('城市索引与清单快照不一致。');
  if (raw.provinceSlug !== provinceSlug || raw.citySlug !== citySlug) throw new Error('城市索引地区不一致。');
  const sources = new Map(manifest.sources.map(source => [source.id, source]));
  if (raw.records.length !== location.city.count || !raw.records.every(record => validIndexRecord(record, sources, location.province.name, location.city.name)) ||
    new Set(raw.records.map(record => record.id)).size !== raw.records.length) throw new Error('官方来源城市索引格式无效。');
  return raw as unknown as NationalOfficialIndex;
}

export function findOfficialRecord(records: readonly NationalOfficialIndexRecord[], id: string): NationalOfficialIndexRecord | null {
  if (!slugPattern.test(id)) return null;
  return records.find(record => record.id === id && chunkPattern.test(record.chunk)) ?? null;
}

export async function loadOfficialChunk(manifest: NationalOfficialManifest, index: NationalOfficialIndex, filename: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<NationalOfficialChunk> {
  const location = findOfficialCity(manifest, index.provinceSlug, index.citySlug);
  if (!location) throw new Error('省市地区参数无效。');
  if (!chunkPattern.test(filename)) throw new Error('详情分块文件名无效。');
  if (index.snapshotId !== manifest.snapshotId) throw new Error('城市索引与清单快照不一致。');
  const path = root + location.city.indexPath.slice(0, -'index.v1.json'.length) + filename;
  const raw = await readJson(path, signal, fetcher);
  if (!object(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.records)) throw new Error('官方来源详情格式无效。');
  if (raw.snapshotId !== manifest.snapshotId) throw new Error('详情分块与清单快照不一致。');
  if (raw.provinceSlug !== index.provinceSlug || raw.citySlug !== index.citySlug) throw new Error('详情分块地区不一致。');
  const sources = new Map(manifest.sources.map(source => [source.id, source]));
  const expected = index.records.filter(record => record.chunk === filename);
  if (raw.records.length !== expected.length || !raw.records.every(record => validDetailRecord(record, sources, location.province.name, location.city.name)) ||
    raw.records.some((record, at) => {
      const item = expected[at];
      return !item || record.id !== item.id || record.sourceId !== item.sourceId || record.rowNumber !== item.rowNumber ||
        record.name !== item.name || record.address !== item.address || record.beds !== item.beds;
    })) throw new Error('官方来源详情与城市索引不一致。');
  return raw as unknown as NationalOfficialChunk;
}

export function searchOfficialRecords(index: NationalOfficialIndex, params: OfficialSearchParams): OfficialSearchResult {
  if (index.provinceSlug !== params.province || index.citySlug !== params.city) throw new Error('检索地区与城市索引不一致。');
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
  const matches = index.records.filter(record => words.every(word => [record.name, record.address].some(value => value?.replace(/\s+/gu, '').includes(word))));
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  if (page > pageCount) {
    page = pageCount;
    issues.push('页码超出结果范围，已显示第' + pageCount + '页。');
  }
  return { items: matches.slice((page - 1) * 20, page * 20), total, page, pageCount, province: index.provinceSlug, city: index.citySlug, q, issues };
}

export function officialListHref(params: OfficialSearchParams): string {
  const query = new URLSearchParams();
  if (params.province && slugPattern.test(params.province)) query.set('province', params.province);
  if (params.city && params.province && slugPattern.test(params.province) && slugPattern.test(params.city)) query.set('city', params.city);
  if (params.q) query.set('q', params.q);
  if (Number(params.page) > 1) query.set('page', String(params.page));
  return listPath + (query.size ? '?' + query : '');
}

export function safeOfficialReturnPath(from: string | null): string {
  if (!from || from.length > 1536 || !/^\/quanguo\/laiyuan\/(?:\?[^#\r\n]*)?$/.test(from)) return listPath;
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
