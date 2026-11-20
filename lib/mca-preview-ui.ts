import type { McaPreviewIndexRecord } from './mca-preview-types';

type SearchableRecord = Pick<McaPreviewIndexRecord, 'mcaId' | 'name' | 'address' | 'regionPath' | 'facilityTypeLabel'>;

export interface McaPreviewSelection { province: string; city: string; type: string; q: string }
export interface McaPreviewSearchResult<T extends SearchableRecord> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
  selected: McaPreviewSelection;
  provinces: string[];
  cities: string[];
  types: string[];
  issues: string[];
}

const PAGE_SIZE = 20;

function regionParts(path: string | null): string[] {
  return path?.split('/').map(part => part.trim()).filter(Boolean) ?? [];
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function one(params: URLSearchParams, key: string, issues: string[]): string {
  const values = params.getAll(key);
  if (values.length > 1) {
    issues.push(key + ' 条件重复，已忽略。');
    return '';
  }
  return values[0]?.trim() ?? '';
}

/** These filters use only observed, human-labelled preview fields. */
export function filterMcaPreviewRecords<T extends SearchableRecord>(records: readonly T[], params: URLSearchParams): McaPreviewSearchResult<T> {
  const issues: string[] = [];
  const provinces = uniqueSorted(records.map(row => regionParts(row.regionPath)[0]));
  const requestedProvince = one(params, 'province', issues);
  const province = provinces.includes(requestedProvince) ? requestedProvince : '';
  if (requestedProvince && !province) issues.push('省份不在当前观察快照中，已忽略。');
  const provinceRecords = province ? records.filter(row => regionParts(row.regionPath)[0] === province) : records;
  const cities = province ? uniqueSorted(provinceRecords.map(row => regionParts(row.regionPath)[1])) : [];
  const requestedCity = one(params, 'city', issues);
  const city = province && cities.includes(requestedCity) ? requestedCity : '';
  if (requestedCity && !city) issues.push('城市不在所选省份的观察记录中，已忽略。');
  const areaRecords = city ? provinceRecords.filter(row => regionParts(row.regionPath)[1] === city) : provinceRecords;
  const types = uniqueSorted(areaRecords.map(row => row.facilityTypeLabel));
  const requestedType = one(params, 'type', issues);
  const type = types.includes(requestedType) ? requestedType : '';
  if (requestedType && !type) issues.push('设施类型在当前范围无可核对原标签，已忽略。');
  let q = one(params, 'q', issues).replace(/\s+/gu, ' ');
  if ([...q].length > 80) {
    q = [...q].slice(0, 80).join('');
    issues.push('关键词超过 80 字，已截取。');
  }
  const words = q.toLocaleLowerCase('zh-CN').split(' ').filter(Boolean);
  const matched = areaRecords.filter(row => (!type || row.facilityTypeLabel === type) && words.every(word =>
    [row.name, row.address].some(value => value?.toLocaleLowerCase('zh-CN').includes(word)),
  ));
  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rawPage = one(params, 'page', issues);
  let page = 1;
  if (rawPage) {
    const numeric = Number(rawPage);
    if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(numeric)) issues.push('页码无效，已返回第 1 页。');
    else if (numeric > pageCount) { page = pageCount; issues.push('页码超出范围，已显示第 ' + pageCount + ' 页。'); }
    else page = numeric;
  }
  return {
    items: matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total, page, pageCount,
    selected: { province, city, type, q }, provinces, cities, types, issues,
  };
}

export function mcaPreviewDetailHref(mcaId: string): string {
  return '/quanguo/mca-preview/' + encodeURIComponent(mcaId) + '/';
}

export function mcaOfficialDetailHref(mcaId: string): string {
  return 'https://yanglao.mca.gov.cn/?#/index/orgServicesDetail?axbe0001=' + encodeURIComponent(mcaId) + '&parentRoute=institutionList&tagValue=3';
}

/** Accept only this preview's list route and reconstruct a small, known query. */
export function safeMcaPreviewReturnPath(from: string | null): string {
  const root = '/quanguo/mca-preview/';
  if (!from || !from.startsWith(root)) return root;
  try {
    const origin = 'https://preview.invalid';
    const parsed = new URL(from, origin);
    if (parsed.origin !== origin || parsed.pathname !== root || parsed.hash) return root;
    const clean = new URLSearchParams();
    for (const key of ['province', 'city', 'type', 'q', 'page']) {
      const values = parsed.searchParams.getAll(key);
      if (values.length !== 1 || !values[0] || [...values[0]].length > 80) continue;
      if (key === 'page' && !/^[1-9]\d*$/.test(values[0])) continue;
      clean.set(key, values[0]);
    }
    return root + (clean.size ? '?' + clean.toString() : '');
  } catch {
    return root;
  }
}
