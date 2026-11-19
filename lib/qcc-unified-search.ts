import type { QccIndex } from './qcc-types';
import { nationalListHref, type QccNationalSearchParams } from './qcc-national-search';

export const GUANGDONG_PROVINCE_SLUG = 'guangdong';

export function guangdongCityOptions(index: QccIndex): { slug: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of index.records) counts.set(record.city, (counts.get(record.city) ?? 0) + 1);
  return [...counts].sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
    .map(([name, count]) => ({ slug: name, name, count }));
}

export function unifiedQccListHref(params: QccNationalSearchParams): string {
  if (params.province !== GUANGDONG_PROVINCE_SLUG) return nationalListHref(params);
  const query = new URLSearchParams({ province: GUANGDONG_PROVINCE_SLUG });
  for (const key of ['city', 'q', 'type', 'status'] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  if (Number(params.page) > 1) query.set('page', String(params.page));
  return '/quanguo/zhuti/?' + query;
}
