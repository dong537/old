import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sitePath } from './site-path';
import type { ReferenceIndex, ReferenceIndexRecord, ReferenceManifest, ReferenceProvince } from './institution-reference-types';

const dataRoot = join(process.cwd(), 'public', 'data', 'qcc-institutions');
const approvedSnapshotId = 'v1-4ab89d0a078c4e13';
const approvedSourceSha256 = '6bc157e2695965ed8b1c85e82f6f8b7fa7d13102149f9f1512e9863b2489fd81';
const approvedRowCount = 41955;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const chunkPattern = /^chunk-\d{3,}\.v1\.json$/;

export interface ReferenceProvinceRouteParams {
  province: string;
  pagination: string[];
}

export interface ReferenceProvincePageData {
  manifest: ReferenceManifest;
  province: ReferenceProvince;
  page: number;
  pageCount: number;
  records: (ReferenceIndexRecord & { citySlug: string })[];
}

interface ReferenceStaticSnapshot {
  manifest: ReferenceManifest;
  indexes: ReferenceIndex[];
  provinceRecords: Map<string, (ReferenceIndexRecord & { citySlug: string })[]>;
}

let manifestCache: ReferenceManifest | null = null;
let snapshotCache: ReferenceStaticSnapshot | null = null;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function safeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function parseManifest(value: unknown): ReferenceManifest {
  if (!object(value) || !exactKeys(value, ['schemaVersion', 'snapshotId', 'receivedAt', 'rowCount', 'source', 'provinces']) ||
    value.schemaVersion !== 1 || typeof value.snapshotId !== 'string' || !/^v1-[a-z0-9-]+$/.test(value.snapshotId) ||
    typeof value.receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.receivedAt) ||
    !Number.isSafeInteger(value.rowCount) || !object(value.source) || !exactKeys(value.source, ['title', 'sha256', 'asOf']) ||
    typeof value.source.title !== 'string' || !value.source.title || typeof value.source.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.source.sha256) || value.source.asOf !== null ||
    !Array.isArray(value.provinces) || value.provinces.length === 0) throw new Error('全国来源快照清单格式无效。');

  const provinces = value.provinces;
  const provinceSlugs = new Set<string>();
  let total = 0;
  for (const province of provinces) {
    if (!object(province) || !exactKeys(province, ['slug', 'name', 'count', 'cities']) ||
      typeof province.slug !== 'string' || !slugPattern.test(province.slug) || provinceSlugs.has(province.slug) ||
      typeof province.name !== 'string' || !province.name || !safeCount(province.count) ||
      !Array.isArray(province.cities) || province.cities.length === 0) throw new Error('全国来源快照省级分组格式无效。');
    provinceSlugs.add(province.slug);

    const citySlugs = new Set<string>();
    let cityTotal = 0;
    for (const city of province.cities) {
      if (!object(city) || !exactKeys(city, ['slug', 'name', 'count', 'indexPath']) ||
        typeof city.slug !== 'string' || !slugPattern.test(city.slug) || citySlugs.has(city.slug) ||
        typeof city.name !== 'string' || !city.name || !safeCount(city.count) ||
        city.indexPath !== province.slug + '/' + city.slug + '/index.v1.json') throw new Error('全国来源快照城市分组或索引路径无效。');
      citySlugs.add(city.slug);
      cityTotal += city.count;
    }
    if (cityTotal !== province.count) throw new Error('全国来源快照省市计数不一致。');
    total += province.count;
  }
  if (total !== value.rowCount) throw new Error('全国来源快照省级计数不完整。');
  return value as unknown as ReferenceManifest;
}

function readManifest(): ReferenceManifest {
  if (manifestCache) return manifestCache;
  const raw = JSON.parse(readFileSync(join(dataRoot, 'manifest.v1.json'), 'utf8')) as unknown;
  manifestCache = parseManifest(raw);
  return manifestCache;
}

function validIndexRecord(value: unknown, rowLimit: number): value is ReferenceIndexRecord {
  return object(value) && exactKeys(value, ['id', 'sourceRow', 'name', 'region', 'address', 'beds', 'chunk']) &&
    typeof value.id === 'string' && slugPattern.test(value.id) &&
    Number.isSafeInteger(value.sourceRow) && (value.sourceRow as number) >= 2 && (value.sourceRow as number) <= rowLimit + 1 &&
    typeof value.name === 'string' && Boolean(value.name) && typeof value.region === 'string' && Boolean(value.region) &&
    (value.address === null || (typeof value.address === 'string' && Boolean(value.address))) &&
    Number.isSafeInteger(value.beds) && (value.beds as number) >= 0 &&
    typeof value.chunk === 'string' && chunkPattern.test(value.chunk);
}

function regionBelongsToProvince(region: string, province: ReferenceProvince): boolean {
  return region.startsWith(province.name) ||
    (province.name === '新疆维吾尔自治区' && region.startsWith('新疆生产建设兵团'));
}

function regionBelongsToCity(region: string, cityName: string): boolean {
  const normalize = (value: string) => value.replaceAll('（', '(').replaceAll('）', ')');
  return cityName === '地市未标' || normalize(region).includes(normalize(cityName));
}

export function validateReferenceStaticSnapshot(manifestValue: unknown, indexValues: unknown[]): asserts manifestValue is ReferenceManifest {
  const manifest = parseManifest(manifestValue);
  const expectedCities = new Map<string, { province: ReferenceProvince; city: ReferenceProvince['cities'][number] }>();
  for (const province of manifest.provinces) {
    for (const city of province.cities) expectedCities.set(province.slug + '/' + city.slug, { province, city });
  }
  if (indexValues.length !== expectedCities.size) throw new Error('全国来源城市索引未完整覆盖清单。');

  const indexesByCity = new Map<string, ReferenceIndex>();
  const ids = new Set<string>();
  const rows = new Set<number>();
  for (const value of indexValues) {
    if (!object(value) || !exactKeys(value, ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records']) ||
      value.schemaVersion !== 1 || typeof value.snapshotId !== 'string' || typeof value.provinceSlug !== 'string' ||
      typeof value.citySlug !== 'string' || !Array.isArray(value.records)) throw new Error('全国来源城市索引格式无效。');
    const key = value.provinceSlug + '/' + value.citySlug;
    const location = expectedCities.get(key);
    if (!location || indexesByCity.has(key)) throw new Error('全国来源城市索引地区无效或重复。');
    if (value.snapshotId !== manifest.snapshotId) throw new Error('全国来源城市索引与清单快照不一致。');
    if (value.records.length !== location.city.count ||
      !value.records.every(record => validIndexRecord(record, manifest.rowCount))) throw new Error('全国来源城市索引行数或字段格式无效。');

    for (const record of value.records as ReferenceIndexRecord[]) {
      if (record.id !== 'qi-' + approvedSourceSha256.slice(0, 12) + '-' + record.sourceRow) {
        throw new Error('全国来源行与既有记录 ID 不一致。');
      }
      if (ids.has(record.id)) throw new Error('全国来源线索 ID 重复。');
      if (rows.has(record.sourceRow)) throw new Error('全国来源工作表行重复或遗漏。');
      if (!regionBelongsToProvince(record.region, location.province) || !regionBelongsToCity(record.region, location.city.name)) {
        throw new Error('全国来源记录与省市索引地区不一致。');
      }
      ids.add(record.id);
      rows.add(record.sourceRow);
    }
    indexesByCity.set(key, value as unknown as ReferenceIndex);
  }

  if (indexesByCity.size !== expectedCities.size || ids.size !== manifest.rowCount || rows.size !== manifest.rowCount) {
    throw new Error('全国来源快照存在未覆盖的城市、ID 或工作表行。');
  }
  for (let sourceRow = 2; sourceRow <= manifest.rowCount + 1; sourceRow++) {
    if (!rows.has(sourceRow)) throw new Error('全国来源工作表行不连续，发现遗漏。');
  }
}

function readSnapshot(): ReferenceStaticSnapshot {
  if (snapshotCache) return snapshotCache;
  const manifest = getReferenceProvinceManifest();
  const indexes: ReferenceIndex[] = [];
  for (const province of manifest.provinces) {
    for (const city of province.cities) {
      indexes.push(JSON.parse(readFileSync(join(dataRoot, city.indexPath), 'utf8')) as ReferenceIndex);
    }
  }
  validateReferenceStaticSnapshot(manifest, indexes);
  const provinceRecords = new Map<string, (ReferenceIndexRecord & { citySlug: string })[]>();
  for (const index of indexes) {
    const records = provinceRecords.get(index.provinceSlug) ?? [];
    records.push(...index.records.map(record => ({ ...record, citySlug: index.citySlug })));
    provinceRecords.set(index.provinceSlug, records);
  }
  for (const records of provinceRecords.values()) records.sort((left, right) => left.sourceRow - right.sourceRow);
  snapshotCache = { manifest, indexes, provinceRecords };
  return snapshotCache;
}

export function getReferenceProvinceManifest(): ReferenceManifest {
  const manifest = readManifest();
  if (manifest.snapshotId !== approvedSnapshotId || manifest.rowCount !== approvedRowCount ||
    manifest.source.sha256 !== approvedSourceSha256 || manifest.provinces.length !== 31) {
    throw new Error('全国来源快照不是已审核公开版本。');
  }
  return manifest;
}

export function getReferenceProvinceRouteParams(manifest = getReferenceProvinceManifest()): ReferenceProvinceRouteParams[] {
  const routes: ReferenceProvinceRouteParams[] = [];
  for (const province of manifest.provinces) {
    const pageCount = Math.ceil(province.count / 20);
    routes.push({ province: province.slug, pagination: [] });
    for (let page = 2; page <= pageCount; page++) routes.push({ province: province.slug, pagination: ['page', String(page)] });
  }
  return routes;
}

export function referenceProvinceHref(provinceSlug: string): string {
  if (!slugPattern.test(provinceSlug)) throw new Error('省份参数无效。');
  return sitePath('/quanguo/cankao/sheng/' + provinceSlug + '/');
}

export function referenceProvincePageHref(provinceSlug: string, page: number): string {
  if (!slugPattern.test(provinceSlug) || !Number.isSafeInteger(page) || page < 1) throw new Error('省份或页码参数无效。');
  return sitePath('/quanguo/cankao/sheng/' + provinceSlug + (page === 1 ? '/' : '/page/' + page + '/'));
}

export function referenceProvinceRecordHref(provinceSlug: string, citySlug: string, id: string, page: number): string {
  if (!slugPattern.test(provinceSlug) || !slugPattern.test(citySlug) || !slugPattern.test(id) || !Number.isSafeInteger(page) || page < 1) {
    throw new Error('省市或记录参数无效。');
  }
  const from = '/quanguo/cankao/sheng/' + provinceSlug + (page === 1 ? '/' : '/page/' + page + '/');
  const query = new URLSearchParams({ province: provinceSlug, city: citySlug, id, from });
  return sitePath('/quanguo/cankao/detail/?' + query.toString());
}

export function getReferenceProvincePage(provinceSlug: string, page: number): ReferenceProvincePageData | null {
  if (!slugPattern.test(provinceSlug) || !Number.isSafeInteger(page) || page < 1) return null;
  const manifest = getReferenceProvinceManifest();
  const province = manifest.provinces.find(item => item.slug === provinceSlug);
  if (!province) return null;
  const pageCount = Math.ceil(province.count / 20);
  if (page > pageCount) return null;

  const snapshot = readSnapshot();
  const records = snapshot.provinceRecords.get(provinceSlug) ?? [];
  if (records.length !== province.count) throw new Error('省级来源线索记录数与清单不一致。');
  const start = (page - 1) * 20;
  return { manifest, province, page, pageCount, records: records.slice(start, start + 20) };
}
