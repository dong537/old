import type { McaPublicIndexRecord } from '@/lib/mca-public-types';
import { filterMcaPreviewRecords } from '@/lib/mca-preview-ui';
import { mcaPublicListHref, mcaPublicReturnHref } from '@/lib/mca-public-ui';

export const directoryBudgets = [
  ['1000', '月费上限 ≤ 1,000 元'], ['2000', '月费上限 ≤ 2,000 元'],
  ['3000', '月费上限 ≤ 3,000 元'], ['4000', '月费上限 ≤ 4,000 元'],
  ['5000', '月费上限 ≤ 5,000 元'], ['6000', '月费上限 ≤ 6,000 元'],
  ['8000', '月费上限 ≤ 8,000 元'], ['10000', '月费上限 ≤ 10,000 元'],
  ['12000', '月费上限 ≤ 12,000 元'], ['15000', '月费上限 ≤ 15,000 元'],
  ['20000', '月费上限 ≤ 20,000 元'], ['30000', '月费上限 ≤ 30,000 元'],
  ['unknown', '月费未提供或需核对'],
] as const;
export const directoryServices = [
  ['respite', '喘息服务'], ['day', '日托服务'],
  ['community', '社区养老服务'], ['home', '居家养老上门服务'],
] as const;
export const directoryFilterKeys = ['budget', 'service'] as const;
type RelatedFilter = typeof directoryFilterKeys[number];
const root = '/quanguo/pingtai/';
const baseKeys = ['province', 'city', 'type', 'q', 'page'] as const;
type DirectoryRow = Pick<McaPublicIndexRecord,
  'mcaId' | 'name' | 'address' | 'regionPath' | 'facilityTypeLabel' |
  'listedMonthlyFeeMin' | 'listedMonthlyFeeMax' | 'conflictFields' | 'serviceCategoryLabel'>;

export function directoryFilterLabel(key: RelatedFilter, value: string): string {
  return (key === 'budget' ? directoryBudgets : directoryServices).find(([id]) => id === value)?.[1] ?? '';
}
export function directoryFilterValue(params: URLSearchParams, key: RelatedFilter): string {
  const values = params.getAll(key);
  return values.length === 1 && directoryFilterLabel(key, values[0]) ? values[0] : '';
}
export function serviceLabels(record: Pick<DirectoryRow, 'serviceCategoryLabel'>): string[] {
  const field = record.serviceCategoryLabel;
  return field.state === 'observed'
    ? [...new Set((field.value ?? '').split(/[、,，;；]/).map(label => label.trim()).filter(Boolean))]
    : [];
}
function reliableFeeUpper(row: DirectoryRow) {
  const lo = row.listedMonthlyFeeMin, hi = row.listedMonthlyFeeMax;
  return lo !== null && hi !== null && Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo &&
    !row.conflictFields.some(key => key === 'listedMonthlyFeeMin' || key === 'listedMonthlyFeeMax') ? hi : null;
}
export function filterPublicDirectory<T extends DirectoryRow>(rows: readonly T[], params: URLSearchParams) {
  const budget = directoryFilterValue(params, 'budget');
  const service = directoryFilterValue(params, 'service');
  const issues: string[] = [];
  if (params.getAll('budget').some(Boolean) && !budget) issues.push('月费条件无效或重复，已忽略。');
  if (params.getAll('service').some(Boolean) && !service) issues.push('服务条件无效或重复，已忽略。');
  if (!budget && !service) {
    const base = filterMcaPreviewRecords(rows, params);
    return { ...base, selected: { ...base.selected, budget, service }, issues: [...base.issues, ...issues] };
  }
  const baseParams = new URLSearchParams(params);
  baseParams.delete('page');
  const base = filterMcaPreviewRecords(rows, baseParams);
  const selected = { ...base.selected, budget, service };
  const wantedService = directoryFilterLabel('service', service);
  const eligible = rows.filter(row => {
    const [province, city] = (row.regionPath ?? '').split('/').map(part => part.trim()).filter(Boolean);
    if ((selected.province && selected.province !== province) || (selected.city && selected.city !== city) ||
        (selected.type && selected.type !== row.facilityTypeLabel) || (wantedService && !serviceLabels(row).includes(wantedService))) return false;
    if (!budget) return true;
    const upper = reliableFeeUpper(row);
    return budget === 'unknown' ? upper === null : upper !== null && upper <= Number(budget);
  });
  const resultParams = new URLSearchParams();
  if (selected.q) resultParams.set('q', selected.q);
  for (const page of params.getAll('page')) resultParams.append('page', page);
  const results = filterMcaPreviewRecords(eligible, resultParams);
  return { ...base, items: results.items, total: results.total, page: results.page, pageCount: results.pageCount,
    selected, issues: [...base.issues, ...issues, ...results.issues] };
}
export function publicDirectoryHref(params: URLSearchParams, page: number): string {
  const href = mcaPublicListHref(params, page);
  const url = new URL(href, 'https://eldercare.local');
  for (const key of directoryFilterKeys) {
    const value = directoryFilterValue(params, key);
    if (value) url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}
/** Add only the two public-directory-only filters; other routes use their original rules. */
export function publicDirectoryReturnHref(raw: string | null): string {
  if (!raw?.startsWith(root)) return mcaPublicReturnHref(raw);
  let url: URL;
  try { url = new URL(raw, 'https://eldercare.local'); } catch { return root; }
  if (url.origin !== 'https://eldercare.local' || url.pathname !== root || url.hash) return root;
  for (const [key, value] of url.searchParams) {
    if (![...baseKeys, ...directoryFilterKeys].some(allowed => allowed === key) ||
        url.searchParams.getAll(key).length !== 1 || value.length > (key === 'q' ? 80 : 64)) return root;
  }
  const page = url.searchParams.get('page');
  if (page !== null && !/^[1-9][0-9]{0,4}$/.test(page)) return root;
  for (const key of directoryFilterKeys) {
    if (url.searchParams.has(key) && !directoryFilterValue(url.searchParams, key)) return root;
  }
  return publicDirectoryHref(url.searchParams, page ? Number(page) : 1);
}

export const directoryResultsId = 'directory-results';
export const directoryConditions = ['province','city','type','q',...directoryFilterKeys] as const;
type DirectoryCondition = typeof directoryConditions[number];
export function removeDirectoryFilter(params: URLSearchParams, condition: DirectoryCondition): string {
  const query = new URLSearchParams(params);
  query.delete(condition);
  if (condition === 'province') query.delete('city');
  return publicDirectoryHref(query, 1) + '#' + directoryResultsId;
}
