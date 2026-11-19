import { findReferenceCity } from './institution-reference-search';
import { sitePath } from './site-path';
import type { ReferenceIndex, ReferenceManifest } from './institution-reference-types';
import type { InstitutionRegistryCityLinks, InstitutionRegistryLinksManifest, InstitutionRegistryTarget } from './institution-registry-types';

const root = '/data/qcc-institution-registry-links/';
const snapshotPattern = /^v1-[a-z0-9-]{1,80}$/;
const referenceIdPattern = /^qi-[a-f0-9]{12}-[1-9][0-9]*$/;
const nationalIdPattern = /^qcc-n-[a-f0-9]{20}$/;
const guangdongIdPattern = /^gd-qcc-[a-f0-9]{20}$/;
const provinceSlugPattern = /^p-[a-f0-9]{12}$/;
const citySlugPattern = /^c-[a-f0-9]{12}$/;
const controlPattern = /[\x00-\x1f\x7f]/u;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function safeText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !controlPattern.test(value);
}

function validManifest(value: unknown): value is InstitutionRegistryLinksManifest {
  if (!object(value) || !exactKeys(value, [
    'schemaVersion', 'snapshotId', 'referenceSnapshotId', 'nationalSnapshotId', 'guangdongSnapshotId',
    'referenceRowCount', 'eligibleReferenceCount', 'uniqueCodeHitCount', 'linkedReferenceCount',
    'crossProvinceHitCount', 'ambiguousReferenceCount', 'regionCount',
  ]) || value.schemaVersion !== 1 || !snapshotPattern.test(String(value.snapshotId)) ||
    !snapshotPattern.test(String(value.referenceSnapshotId)) ||
    !snapshotPattern.test(String(value.nationalSnapshotId)) ||
    !snapshotPattern.test(String(value.guangdongSnapshotId))) return false;
  if (!count(value.referenceRowCount) || !count(value.eligibleReferenceCount) ||
    !count(value.uniqueCodeHitCount) || !count(value.linkedReferenceCount) ||
    !count(value.crossProvinceHitCount) || !count(value.ambiguousReferenceCount) ||
    !count(value.regionCount)) return false;
  return value.eligibleReferenceCount <= value.referenceRowCount &&
    value.uniqueCodeHitCount + value.ambiguousReferenceCount <= value.eligibleReferenceCount &&
    value.linkedReferenceCount + value.crossProvinceHitCount === value.uniqueCodeHitCount;
}

function validTarget(value: unknown): value is InstitutionRegistryTarget {
  if (!object(value) || !exactKeys(value, [
    'kind', 'id', 'provinceSlug', 'citySlug', 'province', 'city', 'name',
  ]) || !safeText(value.province, 100) || !safeText(value.city, 100) ||
    !safeText(value.name, 500)) return false;
  if (value.kind === 'nationalRegistry') {
    return typeof value.id === 'string' && nationalIdPattern.test(value.id) &&
      typeof value.provinceSlug === 'string' && provinceSlugPattern.test(value.provinceSlug) &&
      typeof value.citySlug === 'string' && citySlugPattern.test(value.citySlug);
  }
  return value.kind === 'guangdongRegistry' && typeof value.id === 'string' &&
    guangdongIdPattern.test(value.id) && value.province === '广东省' &&
    value.provinceSlug === null && value.citySlug === null;
}

async function readJson(path: string, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(sitePath(path), { signal });
  if (!response.ok) throw new Error('登记主体代码候选读取失败（HTTP ' + response.status + '）。');
  try {
    return await response.json();
  } catch (cause) {
    throw new Error('登记主体代码候选文件不是有效 JSON。', { cause });
  }
}

export async function loadInstitutionRegistryLinksManifest(
  referenceManifest: ReferenceManifest, signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<InstitutionRegistryLinksManifest> {
  const [raw, national, guangdong] = await Promise.all([
    readJson(root + 'manifest.v1.json', signal, fetcher),
    readJson('/data/qcc-national/manifest.v1.json', signal, fetcher),
    readJson('/data/qcc/index.v1.json', signal, fetcher),
  ]);
  if (!validManifest(raw)) throw new Error('登记主体代码候选清单格式无效。');
  if (!object(national) || national.schemaVersion !== 1 ||
    !object(guangdong) || guangdong.schemaVersion !== 1 ||
    raw.referenceSnapshotId !== referenceManifest.snapshotId ||
    raw.nationalSnapshotId !== national.snapshotId || raw.guangdongSnapshotId !== guangdong.snapshotId) {
    throw new Error('登记主体代码候选与来源快照不一致。');
  }
  const regionCount = referenceManifest.provinces.reduce((sum, province) => sum + province.cities.length, 0);
  if (raw.referenceRowCount !== referenceManifest.rowCount || raw.regionCount !== regionCount) {
    throw new Error('登记主体代码候选清单计数与线索清单不一致。');
  }
  return raw;
}

export async function loadInstitutionRegistryCityLinks(
  linksManifest: InstitutionRegistryLinksManifest, referenceManifest: ReferenceManifest, index: ReferenceIndex,
  signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<InstitutionRegistryCityLinks> {
  if (linksManifest.referenceSnapshotId !== referenceManifest.snapshotId || index.snapshotId !== referenceManifest.snapshotId) {
    throw new Error('登记主体代码候选与线索快照不一致。');
  }
  const location = findReferenceCity(referenceManifest, index.provinceSlug, index.citySlug);
  if (!location || location.city.indexPath !== index.provinceSlug + '/' + index.citySlug + '/index.v1.json') {
    throw new Error('登记主体代码候选地区无效。');
  }
  const raw = await readJson(root + index.provinceSlug + '/' + index.citySlug + '/links.v1.json', signal, fetcher);
  if (!object(raw) || !exactKeys(raw, [
    'schemaVersion', 'snapshotId', 'referenceSnapshotId', 'provinceSlug', 'citySlug', 'links',
  ]) || raw.schemaVersion !== 1 || !Array.isArray(raw.links)) {
    throw new Error('登记主体代码候选城市文件格式无效。');
  }
  if (raw.snapshotId !== linksManifest.snapshotId || raw.referenceSnapshotId !== referenceManifest.snapshotId ||
    raw.provinceSlug !== index.provinceSlug || raw.citySlug !== index.citySlug) {
    throw new Error('登记主体代码候选城市文件快照或地区不一致。');
  }
  const knownIds = new Set(index.records.map(record => record.id));
  const seen = new Set<string>();
  for (const link of raw.links) {
    if (!object(link) || !exactKeys(link, ['referenceId', 'target']) ||
      typeof link.referenceId !== 'string' || !referenceIdPattern.test(link.referenceId) ||
      !knownIds.has(link.referenceId) || seen.has(link.referenceId) ||
      !validTarget(link.target) || link.target.province !== location.province.name) {
      throw new Error('登记主体代码候选引用或目标无效。');
    }
    seen.add(link.referenceId);
  }
  if (raw.links.length > linksManifest.linkedReferenceCount) {
    throw new Error('登记主体代码候选城市文件计数与清单不一致。');
  }
  return raw as unknown as InstitutionRegistryCityLinks;
}

export function institutionRegistryCandidateHref(target: InstitutionRegistryTarget): string {
  if (!validTarget(target)) throw new Error('登记主体代码候选目标格式无效。');
  if (target.kind === 'guangdongRegistry') {
    return sitePath('/guangdong/zhuti/detail/?' + new URLSearchParams({ id: target.id }));
  }
  return sitePath('/quanguo/zhuti/detail/?' + new URLSearchParams({
    province: target.provinceSlug!, city: target.citySlug!, id: target.id,
  }));
}
