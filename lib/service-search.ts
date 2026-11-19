import type { ServiceRecord } from './service-types';

export const SERVICE_DISTRICTS = ['越秀区', '海珠区', '荔湾区', '天河区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '从化区', '增城区'];
export const SERVICE_GRADES = ['优秀', '良好', '合格', '不合格', '无等次'];
export const RECORD_TYPE_LABELS = { 'annual-assessment': '年度考核记录', 'designation-notice': '新增定点公示' } as const;

export interface ServiceFilters { q: string; district: string; recordType: string; grade: string }
interface ServiceParams extends Partial<ServiceFilters> { page?: string | number }
export interface ServiceSearchResult {
  filters: ServiceFilters; items: ServiceRecord[]; total: number; page: number; pageCount: number; issues: string[];
}

function parseFilters(params: ServiceParams, issues: string[]): ServiceFilters {
  let q = (params.q ?? '').trim().replace(/\s+/gu, ' ');
  if ([...q].length > 80) { q = [...q].slice(0, 80).join(''); issues.push('搜索词最多80个字符，已截取前80个字符。'); }
  let district = params.district ?? '';
  if (district && !SERVICE_DISTRICTS.includes(district)) { district = ''; issues.push('所属区参数无效，已恢复为全部区。'); }
  let recordType = params.recordType ?? '';
  if (recordType && !Object.hasOwn(RECORD_TYPE_LABELS, recordType)) { recordType = ''; issues.push('资料类型无效，已恢复为全部类型。'); }
  let grade = params.grade ?? '';
  if (grade && !SERVICE_GRADES.includes(grade)) { grade = ''; issues.push('考核等次无效，已恢复为全部等次。'); }
  if (recordType === 'designation-notice' && grade) { grade = ''; issues.push('新增定点公示未列考核等次，已清除该筛选。'); }
  return { q, district, recordType, grade };
}

function parsePage(value: string | number | undefined, issues: string[]): number {
  const text = String(value ?? '1');
  const page = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(page)) { issues.push('页码无效，已返回第1页。'); return 1; }
  return page;
}

export function searchServices(records: readonly ServiceRecord[], params: ServiceParams): ServiceSearchResult {
  const issues: string[] = [];
  const filters = parseFilters(params, issues);
  let page = parsePage(params.page, issues);
  const terms = filters.q.toLocaleLowerCase('zh-CN').split(' ').filter(Boolean);
  const matches = records.filter(record =>
    (!filters.district || record.district === filters.district) &&
    (!filters.recordType || record.recordType === filters.recordType) &&
    (!filters.grade || record.assessmentGrade === filters.grade) &&
    terms.every(term => [
      record.name,
      record.address,
      record.district,
      record.providerType,
      record.assessmentGrade,
      record.serviceCategory,
      record.serviceItems,
    ].some(value => value?.replace(/\s+/gu, '').toLocaleLowerCase('zh-CN').includes(term))),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / 20));
  if (page > pageCount) { page = pageCount; issues.push(`页码超出结果范围，已显示第${pageCount}页。`); }
  return { filters, items: matches.slice((page - 1) * 20, page * 20), total: matches.length, page, pageCount, issues };
}

export function serviceListHref(params: ServiceParams = {}): string {
  const filters = parseFilters(params, []);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const page = parsePage(params.page, []);
  if (page > 1) query.set('page', String(page));
  return '/guangzhou/shangmen/' + (query.size ? '?' + query : '');
}

export function serviceReturnHref(from: string | null | undefined): string {
  const base = '/guangzhou/shangmen/';
  if (!from || !/^\/guangzhou\/shangmen\/(?:\?|$)/u.test(from)) return base;
  const url = new URL(from, 'https://directory.invalid');
  if (url.hash || [...url.searchParams.keys()].some(key => !['q', 'district', 'recordType', 'grade', 'page'].includes(key))) return base;
  const params = Object.fromEntries(url.searchParams);
  const issues: string[] = [];
  const filters = parseFilters(params, issues);
  const page = parsePage(params.page, issues);
  return issues.length ? base : serviceListHref({ ...filters, page });
}
