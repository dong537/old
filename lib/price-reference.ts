import type { McaCatalogIndexRecord } from './mca-catalog-types';

export interface PriceReferenceRecord {
  id: string;
  name: string;
  address: string | null;
  province: string;
  city: string;
  region: string;
  min: number;
  max: number;
  updatedAt: string;
  needsRefresh: boolean;
}

export interface PriceReferenceDataset {
  csvRecordCount: number;
  unavailableCount: number;
  zeroRangeCount: number;
  staleRangeCount: number;
  records: PriceReferenceRecord[];
  provinces: { name: string; count: number }[];
}

/** Only complete, non-negative CSV monthly ranges participate; never fill missing values. */
export function buildPriceReference(source: readonly McaCatalogIndexRecord[]): PriceReferenceDataset {
  const csv = source.filter(record => record.sourceKind === 'csv');
  const records: PriceReferenceRecord[] = [];
  for (const item of csv) {
    const min = item.listedMonthlyFeeMin;
    const max = item.listedMonthlyFeeMax;
    if (min === null || max === null || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) continue;
    const region = item.regionPath?.split('/').filter(Boolean) ?? [];
    records.push({ id: item.mcaId, name: item.name ?? '来源未列示名称', address: item.address,
      province: region[0] ?? '地区未提供', city: region[1] ?? '',
      region: region.join(' · ') || item.regionLabel || '地区未提供',
      min, max, updatedAt: item.csvUpdatedAtLocal ?? '', needsRefresh: item.collectorStatus === 'stale' });
  }
  const provinceCounts = new Map<string, number>();
  for (const record of records) provinceCounts.set(record.province, (provinceCounts.get(record.province) ?? 0) + 1);
  return { csvRecordCount: csv.length, unavailableCount: csv.length - records.length,
    zeroRangeCount: records.filter(record => record.min === 0 && record.max === 0).length,
    staleRangeCount: records.filter(record => record.needsRefresh).length,
    records, provinces: [...provinceCounts].map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) };
}

export function filterPriceReference(records: readonly PriceReferenceRecord[], params: URLSearchParams) {
  const province = (params.get('province') ?? '').slice(0, 64);
  const city = (params.get('city') ?? '').slice(0, 64);
  const q = (params.get('q') ?? '').trim().slice(0, 80);
  const keyword = q.toLocaleLowerCase('zh-CN');
  const filtered = records.filter(record => (!province || record.province === province) &&
    (!city || record.city === city) && (!keyword ||
      [record.name, record.address, record.region].some(value => value?.toLocaleLowerCase('zh-CN').includes(keyword))));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const pageRaw = params.get('page') ?? '1';
  const page = Math.min(pageCount, /^[1-9]\d{0,4}$/.test(pageRaw) ? Number(pageRaw) : 1);
  return { records: filtered.slice((page - 1) * 20, page * 20), total: filtered.length,
    zeroRangeCount: filtered.filter(record => record.min === 0 && record.max === 0).length,
    page, pageCount, province, city, q };
}

export function priceReferenceHref(params: URLSearchParams, page = 1): string {
  const query = new URLSearchParams();
  for (const key of ['province', 'city', 'q']) {
    const value = params.get(key)?.trim().slice(0, key === 'q' ? 80 : 64);
    if (value) query.set(key, value);
  }
  if (Number.isSafeInteger(page) && page > 1 && page <= 99999) query.set('page', String(page));
  return '/quanguo/jiage/' + (query.size ? '?' + query.toString() : '');
}

export function priceRangeText(min: number, max: number): string {
  if (min === 0 && max === 0) return '0 元/月（来源原值，不代表免费）';
  const range = min === max ? min.toLocaleString('zh-CN') : min.toLocaleString('zh-CN') + '–' + max.toLocaleString('zh-CN');
  return range + ' 元/月' + (min === 0 ? '（含来源零值，请核实）' : '');
}
