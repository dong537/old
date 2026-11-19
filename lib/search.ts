import type { Institution } from './types';
import { districts } from './catalog';
export const feeFilterKeys = ['advanceFee', 'deposit', 'membershipFee'] as const;
export type FeeFilterKey = typeof feeFilterKeys[number];
export type FeeFilterValue = '' | 'yes' | 'no' | 'unknown';
export type FeeFilters = Record<FeeFilterKey, FeeFilterValue>;
export type FeeFacetCounts = Record<FeeFilterKey, Record<FeeFilterValue, number>>;
export interface SearchParams { q?: string; district?: string; page?: string | number; advanceFee?: string; deposit?: string; membershipFee?: string }
export interface SearchResult { items: Institution[]; total: number; page: number; pageCount: number; q: string; district: string; feeFilters: FeeFilters; issues: string[] }

const feeLabels: Record<FeeFilterKey, string> = { advanceFee: '预收养老服务费', deposit: '押金', membershipFee: '会员费' };
const feeOptions: FeeFilterValue[] = ['', 'yes', 'no', 'unknown'];

function normalizeFeeFilter(raw: string | undefined, key: FeeFilterKey, issues: string[]): FeeFilterValue {
  const value = raw ?? '';
  if (value === '' || value === 'yes' || value === 'no' || value === 'unknown') return value;
  issues.push(feeLabels[key] + '筛选参数无效，已恢复为全部。');
  return '';
}

export function searchInstitutions(institutions: Institution[], params: SearchParams): SearchResult {
  const issues: string[] = [];
  let q = (params.q ?? '').trim().replace(/\s+/gu, ' ');
  if ([...q].length > 80) { q = [...q].slice(0, 80).join(''); issues.push('搜索词最多80个字符，已截取前80个字符。'); }
  let district = params.district ?? '';
  if (district && !districts.includes(district)) { district = ''; issues.push('地区参数无效，已恢复为全部地区。'); }
  const feeFilters: FeeFilters = {
    advanceFee: normalizeFeeFilter(params.advanceFee, 'advanceFee', issues),
    deposit: normalizeFeeFilter(params.deposit, 'deposit', issues),
    membershipFee: normalizeFeeFilter(params.membershipFee, 'membershipFee', issues),
  };
  const requestedPage = String(params.page ?? '1');
  let page = Number(requestedPage);
  if (!/^[1-9]\d*$/.test(requestedPage) || !Number.isSafeInteger(page)) { page = 1; issues.push('页码无效，已返回第1页。'); }
  const terms = q.split(' ').filter(Boolean);
  const matches = institutions.filter((institution) =>
    (!district || institution.district === district)
    && terms.every((term) => [institution.name, institution.district, institution.address].some((text) => text.replace(/\s+/gu, '').includes(term)))
    && feeFilterKeys.every((key) => {
      const filter = feeFilters[key];
      const value = institution[key];
      return filter === '' || (filter === 'unknown' ? value === null : value === (filter === 'yes'));
    })
  ).sort((a, b) => a.sourceRow - b.sourceRow);
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  if (page > pageCount) { page = pageCount; issues.push(`页码超出结果范围，已显示第${pageCount}页。`); }
  return { items: matches.slice((page - 1) * 20, page * 20), total, page, pageCount, q, district, feeFilters, issues };
}

export function countFeeFacets(institutions: Institution[], params: SearchParams): FeeFacetCounts {
  const normalized = searchInstitutions(institutions, params);
  return Object.fromEntries(feeFilterKeys.map((key) => [
    key,
    Object.fromEntries(feeOptions.map((option) => [
      option,
      searchInstitutions(institutions, {
        q: normalized.q,
        district: normalized.district,
        ...normalized.feeFilters,
        [key]: option,
      }).total,
    ])),
  ])) as FeeFacetCounts;
}
