import type { ProvinceSourceRecord } from './province-types';

export interface ProvinceSearchParams { q?: string; city?: string; page?: string | number }
export interface ProvinceSearchResult {
  items: ProvinceSourceRecord[];
  total: number;
  page: number;
  pageCount: number;
  q: string;
  city: string;
  issues: string[];
}

export function searchProvinceRecords(records: readonly ProvinceSourceRecord[], params: ProvinceSearchParams): ProvinceSearchResult {
  const issues: string[] = [];
  let q = (params.q ?? '').trim().replace(/\s+/gu, ' ');
  if ([...q].length > 80) {
    q = [...q].slice(0, 80).join('');
    issues.push('搜索词最多80个字符，已截取前80个字符。');
  }

  let city = params.city ?? '';
  if (city && !records.some(record => record.city === city)) {
    city = '';
    issues.push('城市参数无效，已恢复为全部城市。');
  }

  const requestedPage = String(params.page ?? '1');
  let page = Number(requestedPage);
  if (!/^[1-9]\d*$/.test(requestedPage) || !Number.isSafeInteger(page)) {
    page = 1;
    issues.push('页码无效，已返回第1页。');
  }

  const terms = q.split(' ').filter(Boolean);
  const matches = records.filter(record =>
    (!city || record.city === city) &&
    terms.every(term => [record.name, record.city].some(text => text.replace(/\s+/gu, '').includes(term))),
  );
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  if (page > pageCount) {
    page = pageCount;
    issues.push(`页码超出结果范围，已显示第${pageCount}页。`);
  }

  return { items: matches.slice((page - 1) * 20, page * 20), total, page, pageCount, q, city, issues };
}
