import type { ReferenceProvince } from './institution-reference-types';
import type { NationalOfficialProvince } from './national-official-types';

export interface OfficialCoverageRegion {
  name: string;
  referenceSlug: string;
  referenceCount: number;
  officialSlug: string | null;
  officialRowCount: number;
}

export interface OfficialCoverage {
  regions: OfficialCoverageRegion[];
  officialRegionCount: number;
  pendingRegionCount: number;
  officialRowCount: number;
  referenceRowCount: number;
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateRegion(name: string, slug: string, count: number, label: string): void {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() ||
    typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !validCount(count)) throw new Error(label + '地区名称、链接或计数无效。');
}

/** Counts source rows and reference clues separately; neither is an institution total. */
export function buildOfficialCoverage(
  referenceProvinces: readonly ReferenceProvince[],
  officialProvinces: readonly NationalOfficialProvince[],
  guangdongCount: number,
): OfficialCoverage {
  if (!Array.isArray(referenceProvinces) || referenceProvinces.length === 0 ||
    !Array.isArray(officialProvinces) || !validCount(guangdongCount)) {
    throw new Error('地区快照或广东来源计数无效。');
  }

  const referenceNames = new Set<string>();
  const referenceSlugs = new Set<string>();
  let referenceRowCount = 0;
  for (const province of referenceProvinces) {
    validateRegion(province.name, province.slug, province.count, '线索');
    if (referenceNames.has(province.name) || referenceSlugs.has(province.slug)) throw new Error('线索快照存在重复省级地区。');
    referenceNames.add(province.name);
    referenceSlugs.add(province.slug);
    referenceRowCount += province.count;
  }
  if (!Number.isSafeInteger(referenceRowCount)) throw new Error('线索行计数无效。');

  const officialByName = new Map<string, NationalOfficialProvince>();
  const officialSlugs = new Set<string>();
  let officialRowCount = guangdongCount;
  for (const province of officialProvinces) {
    validateRegion(province.name, province.slug, province.count, '官方来源');
    if (province.name === '广东省' || province.slug === 'guangdong') throw new Error('广东官方来源应仅由独立快照计数，不能重复。');
    if (officialByName.has(province.name) || officialSlugs.has(province.slug)) throw new Error('官方来源快照存在重复省级地区。');
    if (!referenceNames.has(province.name)) throw new Error('官方来源地区无法匹配线索快照：' + province.name);
    officialByName.set(province.name, province);
    officialSlugs.add(province.slug);
    officialRowCount += province.count;
  }
  if (!Number.isSafeInteger(officialRowCount)) throw new Error('官方来源行计数无效。');
  if (guangdongCount > 0 && !referenceNames.has('广东省')) throw new Error('广东官方来源地区无法匹配线索快照。');

  const regions = referenceProvinces.map(province => {
    const official = officialByName.get(province.name);
    const guangdong = province.name === '广东省' && guangdongCount > 0;
    return {
      name: province.name,
      referenceSlug: province.slug,
      referenceCount: province.count,
      officialSlug: guangdong ? 'guangdong' : official && official.count > 0 ? official.slug : null,
      officialRowCount: guangdong ? guangdongCount : official?.count ?? 0,
    };
  });
  const officialRegionCount = regions.filter(region => region.officialSlug !== null).length;
  return {
    regions,
    officialRegionCount,
    pendingRegionCount: regions.length - officialRegionCount,
    officialRowCount,
    referenceRowCount,
  };
}

/** Fail static generation when the coverage view disagrees with its frozen inputs. */
export function assertOfficialCoverageSnapshot(
  coverage: OfficialCoverage,
  referenceManifestRows: number,
  nationalOfficialManifestRows: number,
  guangdongSourceRows: number,
): void {
  if (coverage.regions.length !== 31) throw new Error('全国官方来源覆盖必须包含 31 个省级地区。');
  if (!validCount(referenceManifestRows) || referenceManifestRows === 0 ||
    coverage.referenceRowCount !== referenceManifestRows) {
    throw new Error('全国机构线索行数与清单快照不一致。');
  }
  if (!validCount(nationalOfficialManifestRows) || nationalOfficialManifestRows === 0 ||
    !validCount(guangdongSourceRows) || guangdongSourceRows === 0 ||
    !Number.isSafeInteger(nationalOfficialManifestRows + guangdongSourceRows) ||
    coverage.officialRowCount !== nationalOfficialManifestRows + guangdongSourceRows) {
    throw new Error('全国官方来源行数与省外、广东两份快照不一致。');
  }
}
