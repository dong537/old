/** Filters for a validated MCA snapshot. Raw API keys and dictionary metadata are not records. */
export const mcaFacetKeys = [
  'type', 'operation', 'location', 'medical', 'admission', 'care',
  'cost', 'network', 'grade', 'ltci', 'medicalIntegration',
] as const;

export type McaFacetKey = typeof mcaFacetKeys[number];
export type McaFacetValue = string | readonly string[] | null;

export interface McaFilterRecord {
  mcaId: string;
  name: string;
  address: string | null;
  /** Include these only after the source's area hierarchy has been validated. */
  provinceCode: string | null;
  cityCode: string | null;
  /** An absent property means not collected; null means collected but unknown. */
  facets: Partial<Record<McaFacetKey, McaFacetValue>>;
}

export interface McaFilterOption { value: string; label: string }
export type McaFacetCatalog = Partial<Record<McaFacetKey, readonly McaFilterOption[]>>;
export interface McaVisibleFacet {
  options: (McaFilterOption & { count: number })[];
  unknownCount: number;
}
export interface McaSelectedFilters {
  province?: string;
  city?: string;
  q: string;
  filters: Partial<Record<McaFacetKey, string>>;
}
export interface McaFilterResult {
  items: McaFilterRecord[];
  total: number;
  page: number;
  pageCount: number;
  selected: McaSelectedFilters;
  facets: Partial<Record<McaFacetKey, McaVisibleFacet>>;
  issues: string[];
}

export const MCA_UNKNOWN_FILTER_VALUE = '__unknown__';
const pageSize = 20;
const areaCodePattern = /^\d{12}$/;

function queryValue(params: URLSearchParams, key: string, issues: string[]): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) {
    issues.push(`${key} 条件重复，已忽略。`);
    return undefined;
  }
  return values[0] || undefined;
}

function observedFacets(records: readonly McaFilterRecord[], catalog: McaFacetCatalog): McaFilterResult['facets'] {
  const visible: McaFilterResult['facets'] = {};
  for (const key of mcaFacetKeys) {
    const definitions = catalog[key];
    if (!definitions?.length) continue;
    const counts = new Map<string, number>();
    let unknownCount = 0;
    for (const record of records) {
      if (!Object.hasOwn(record.facets, key)) continue;
      const value = record.facets[key];
      if (value === null) {
        unknownCount++;
        continue;
      }
      if (value === undefined) continue;
      for (const code of new Set(Array.isArray(value) ? value : [value])) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    const options = definitions.filter(option => option.value !== MCA_UNKNOWN_FILTER_VALUE && counts.has(option.value))
      .map(option => ({ ...option, count: counts.get(option.value)! }));
    if (options.length) visible[key] = { options, unknownCount };
  }
  return visible;
}

function matchesFacet(record: McaFilterRecord, key: McaFacetKey, wanted: string): boolean {
  if (!Object.hasOwn(record.facets, key)) return false;
  const value = record.facets[key];
  if (wanted === MCA_UNKNOWN_FILTER_VALUE) return value === null;
  return Array.isArray(value) ? value.includes(wanted) : value === wanted;
}

/** Counts and options are based on actually observed, validated fields in the loaded snapshot. */
export function filterMcaRecords(records: readonly McaFilterRecord[], catalog: McaFacetCatalog, params: URLSearchParams): McaFilterResult {
  const issues: string[] = [];
  const requestedProvince = queryValue(params, 'province', issues);
  const province = requestedProvince && areaCodePattern.test(requestedProvince) && records.some(row => row.provinceCode === requestedProvince)
    ? requestedProvince : undefined;
  if (requestedProvince && !province) issues.push('province 地区无效或当前快照未覆盖，已忽略。');
  const requestedCity = queryValue(params, 'city', issues);
  const city = province && requestedCity && areaCodePattern.test(requestedCity) &&
    records.some(row => row.provinceCode === province && row.cityCode === requestedCity) ? requestedCity : undefined;
  if (requestedCity && !city) issues.push('city 地区无效或未选择对应省份，已忽略。');

  const requestedQ = queryValue(params, 'q', issues) ?? '';
  let q = requestedQ.trim().replace(/\s+/gu, ' ');
  if ([...q].length > 80) {
    q = [...q].slice(0, 80).join('');
    issues.push('关键词超过 80 个字符，已截取。');
  }
  const words = q.split(' ').filter(Boolean);
  const base = records.filter(row => (!province || row.provinceCode === province) && (!city || row.cityCode === city) &&
    words.every(word => [row.name, row.address].some(value => value?.replace(/\s+/gu, '').includes(word))));
  const facets = observedFacets(base, catalog);
  const selected: McaSelectedFilters = { province, city, q, filters: {} };
  for (const key of mcaFacetKeys) {
    const wanted = queryValue(params, key, issues);
    if (!wanted) continue;
    const available = facets[key];
    if (available && (available.options.some(option => option.value === wanted) ||
      (wanted === MCA_UNKNOWN_FILTER_VALUE && available.unknownCount > 0))) {
      selected.filters[key] = wanted;
    } else {
      issues.push(`${key} 条件无可核验数据或选项无效，已忽略。`);
    }
  }
  const matches = base.filter(row => mcaFacetKeys.every(key => {
    const wanted = selected.filters[key];
    return !wanted || matchesFacet(row, key, wanted);
  }));
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = queryValue(params, 'page', issues) ?? '1';
  let page = Number(requestedPage);
  if (!/^[1-9]\d*$/.test(requestedPage) || !Number.isSafeInteger(page)) {
    page = 1;
    issues.push('页码无效，已返回第 1 页。');
  } else if (page > pageCount) {
    page = pageCount;
    issues.push(`页码超出结果范围，已显示第 ${pageCount} 页。`);
  }
  return { items: matches.slice((page - 1) * pageSize, page * pageSize), total, page, pageCount, selected, facets, issues };
}
