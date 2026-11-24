import type { McaCatalogCsvDetail } from '@/lib/mca-catalog-types';
import type { McaPublicDetailRecord } from '@/lib/mca-public-types';
import { sitePath } from '@/lib/site-path';
import { compareBeds, compareDetailUrl, compareFee, displayCompareValue, unknownValue, type ComparePick, type CompareSource } from './mca-compare-model';

export type CompareSnapshots = Record<CompareSource, string>;
export const compareRows = [
  ['region', '地区 / 机构类型'], ['total', '月总费用'], ['bed', '床位费'], ['care', '护理费'], ['meal', '膳食费'],
  ['services', '来源列示的服务'], ['capacity', '平台列示床位（非空床）'], ['nursing', '护理型床位（非空床）'],
  ['respite', '喘息服务日费'], ['day', '日托日费'], ['home', '上门服务按次费'],
  ['date', '资料时间'], ['status', '资料状态'],
] as const;
type Row = typeof compareRows[number][0];
export type CompareColumn = Record<Row, string>;
type Ready = { state: 'ready'; column: CompareColumn };
export type CompareResult = Ready | { state: 'index' | 'error' };

const text = (value: string | null | undefined) => value?.trim() || unknownValue;
const regionAndType = (region: string | null | undefined, kind: string | null | undefined) =>
  [region, kind].filter(part => part && part !== unknownValue).join(' · ') || unknownValue;

export async function loadCompareColumn(pick: ComparePick, snapshots: CompareSnapshots, signal: AbortSignal): Promise<CompareResult> {
  const url = compareDetailUrl(pick);
  if (!url) return { state: 'index' };
  const response = await fetch(sitePath(url), { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('detail not available');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object') throw new Error('invalid detail');
  const detail = value as McaCatalogCsvDetail | McaPublicDetailRecord;
  if (detail.schemaVersion !== 1 || detail.mcaId !== pick.id || detail.snapshotId !== snapshots[pick.source]) {
    throw new Error('detail and selection refer to different snapshots');
  }
  if (pick.source === 'csv') {
    if (!('sourceKind' in detail) || detail.sourceKind !== 'csv' || detail.fields?.org_id !== pick.id) throw new Error('CSV identity mismatch');
    const f = detail.fields;
    return { state: 'ready', column: {
      region: regionAndType(f.area, f.org_type),
      total: compareFee([f.fee_month_min, f.fee_month_max], '元/月'),
      bed: compareFee([f.fee_bed_min, f.fee_bed_max], '元/月'),
      care: compareFee([f.fee_care_min, f.fee_care_max], '元/月'),
      meal: compareFee([f.fee_meal_min, f.fee_meal_max], '元/月'),
      services: text(f.services?.filter(Boolean).join('、') || f.service_detail),
      capacity: compareBeds(f.total_beds), nursing: compareBeds(f.nursing_beds),
      respite: compareFee([f.cx_fee_day_min, f.cx_fee_day_max], '元/天'),
      day: compareFee([f.rt_fee_day_min, f.rt_fee_day_max], '元/天'),
      home: compareFee([f.home_fee_time_min, f.home_fee_time_max], '元/次'),
      date: f.updated_at ? f.updated_at.replace('T', ' ') + '（时区未注明）' : unknownValue,
      status: f.status === 'stale' ? '资料待刷新；机构情况未核验' : '历史导出；机构情况未核验',
    } };
  }
  if (!('platformDetail' in detail)) throw new Error('observed identity mismatch');
  const d = detail.platformDetail;
  const monthly = (code: string) => d.feeSummary.find(item => item.code === code)?.range;
  const monthlyText = (code: string) => { const fee = monthly(code); return compareFee(fee?.value ?? null, '元/月', fee?.state); };
  const when = detail.detailObservedAtUtc;
  const date = when.earliest === when.latest ? when.latest : when.earliest + ' 至 ' + when.latest;
  return { state: 'ready', column: {
    region: regionAndType(displayCompareValue(d.identity.region, text), displayCompareValue(d.identity.facilityType, text)),
    total: monthlyText('04'), bed: monthlyText('02'), care: monthlyText('01'), meal: monthlyText('03'),
    services: displayCompareValue(d.service.content, text),
    capacity: displayCompareValue(d.beds.total, compareBeds), nursing: displayCompareValue(d.beds.nursing, compareBeds),
    respite: compareFee(d.subServices.respite.fee.value, '元/天', d.subServices.respite.fee.state),
    day: compareFee(d.subServices.dayCare.fee.value, '元/天', d.subServices.dayCare.fee.state),
    home: compareFee(d.subServices.homeVisit.fee.value, '元/次', d.subServices.homeVisit.fee.state),
    date: date ? date + '（UTC）' : unknownValue,
    status: detail.conflictLabels.length ? '历史采集，部分字段有冲突；机构情况未核验' : '历史采集；机构情况未核验',
  } };
}
