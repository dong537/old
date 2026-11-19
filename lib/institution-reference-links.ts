import { findReferenceCity } from './institution-reference-search';
import type {
  ReferenceIndex, ReferenceLinksCityFile, ReferenceLinksManifest, ReferenceManifest,
  ReferenceOfficialMatch,
} from './institution-reference-types';
import { sitePath } from './site-path';

const dataRoot = '/data/qcc-institution-links/';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const controlPattern = /[\u0000-\u001f\u007f]/u;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function safeSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && slugPattern.test(value);
}

function safeSnapshot(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && slugPattern.test(value);
}

function safeText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !controlPattern.test(value);
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validLinksManifest(value: unknown): value is ReferenceLinksManifest {
  if (!object(value) || !exactKeys(value, [
    'schemaVersion', 'snapshotId', 'referenceSnapshotId', 'officialSnapshotId',
    'guangdongSnapshotId', 'linkedReferenceCount', 'matchCount', 'regionCount',
  ])) return false;
  return value.schemaVersion === 1 && safeSnapshot(value.snapshotId) &&
    safeSnapshot(value.referenceSnapshotId) && safeSnapshot(value.officialSnapshotId) &&
    safeSnapshot(value.guangdongSnapshotId) && count(value.linkedReferenceCount) &&
    count(value.matchCount) && count(value.regionCount) &&
    value.matchCount >= value.linkedReferenceCount &&
    (value.linkedReferenceCount === 0 ? value.matchCount === 0 && value.regionCount === 0 : value.regionCount > 0);
}

function validMatch(value: unknown): value is ReferenceOfficialMatch {
  if (!object(value) || !exactKeys(value, [
    'kind', 'id', 'provinceSlug', 'citySlug', 'city', 'sourceTitle',
  ]) || !safeSlug(value.id) || !safeText(value.city, 100) || !safeText(value.sourceTitle, 500)) return false;
  if (value.kind === 'nationalOfficial') return safeSlug(value.provinceSlug) && safeSlug(value.citySlug);
  return value.kind === 'guangdongOfficial' && value.provinceSlug === null && value.citySlug === null;
}

async function readJson(path: string, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(sitePath(path), { signal });
  if (!response.ok) throw new Error('官方来源候选关联读取失败（HTTP ' + response.status + '）。');
  try {
    return await response.json();
  } catch (cause) {
    throw new Error('官方来源候选关联文件不是有效 JSON。', { cause });
  }
}

export async function loadReferenceLinksManifest(
  referenceManifest: ReferenceManifest, signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<ReferenceLinksManifest> {
  const raw = await readJson(dataRoot + 'manifest.v1.json', signal, fetcher);
  if (!validLinksManifest(raw)) throw new Error('官方来源候选关联清单格式无效。');
  if (raw.referenceSnapshotId !== referenceManifest.snapshotId) throw new Error('官方来源候选关联与线索清单快照不一致。');
  const regionCount = referenceManifest.provinces.reduce((sum, province) => sum + province.cities.length, 0);
  if (raw.linkedReferenceCount > referenceManifest.rowCount || raw.regionCount > regionCount) {
    throw new Error('官方来源候选关联清单数量与线索清单不一致。');
  }
  return raw;
}

export async function loadReferenceCityLinks(
  linksManifest: ReferenceLinksManifest, referenceManifest: ReferenceManifest, index: ReferenceIndex,
  signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<ReferenceLinksCityFile> {
  if (linksManifest.referenceSnapshotId !== referenceManifest.snapshotId || index.snapshotId !== referenceManifest.snapshotId) {
    throw new Error('官方来源候选关联与线索清单快照不一致。');
  }
  const location = findReferenceCity(referenceManifest, index.provinceSlug, index.citySlug);
  if (!location || location.city.indexPath !== index.provinceSlug + '/' + index.citySlug + '/index.v1.json') {
    throw new Error('官方来源候选关联地区无效。');
  }
  const raw = await readJson(dataRoot + index.provinceSlug + '/' + index.citySlug + '/links.v1.json', signal, fetcher);
  if (!object(raw) || !exactKeys(raw, [
    'schemaVersion', 'snapshotId', 'referenceSnapshotId', 'provinceSlug', 'citySlug', 'links',
  ]) || raw.schemaVersion !== 1 || !Array.isArray(raw.links)) throw new Error('官方来源候选关联城市文件格式无效。');
  if (raw.snapshotId !== linksManifest.snapshotId || raw.referenceSnapshotId !== referenceManifest.snapshotId) {
    throw new Error('官方来源候选关联城市文件快照不一致。');
  }
  if (raw.provinceSlug !== index.provinceSlug || raw.citySlug !== index.citySlug) {
    throw new Error('官方来源候选关联城市文件地区不一致。');
  }
  const knownIds = new Set(index.records.map(item => item.id));
  const seenReferences = new Set<string>();
  let cityMatchCount = 0;
  for (const link of raw.links) {
    if (!object(link) || !exactKeys(link, ['referenceId', 'matches']) ||
      !safeSlug(link.referenceId) || !knownIds.has(link.referenceId) ||
      !Array.isArray(link.matches) || link.matches.length === 0 || seenReferences.has(link.referenceId)) {
      throw new Error('官方来源候选关联引用与城市索引不一致。');
    }
    seenReferences.add(link.referenceId);
    const seenMatches = new Set<string>();
    for (const match of link.matches) {
      if (!validMatch(match)) throw new Error('官方来源候选关联目标格式无效。');
      const key = match.kind + ':' + match.id + ':' + match.provinceSlug + ':' + match.citySlug;
      if (seenMatches.has(key)) throw new Error('官方来源候选关联目标重复。');
      seenMatches.add(key);
      cityMatchCount += 1;
    }
  }
  if (raw.links.length > linksManifest.linkedReferenceCount || cityMatchCount > linksManifest.matchCount) {
    throw new Error('官方来源候选关联城市文件数量与清单不一致。');
  }
  return raw as unknown as ReferenceLinksCityFile;
}

export function officialCandidateHref(match: ReferenceOfficialMatch): string {
  if (!validMatch(match)) throw new Error('官方来源候选关联目标格式无效。');
  if (match.kind === 'guangdongOfficial') return sitePath('/guangdong/jigou/' + match.id + '/');
  const query = new URLSearchParams({ province: match.provinceSlug!, city: match.citySlug!, id: match.id });
  return sitePath('/quanguo/laiyuan/detail/?' + query);
}
