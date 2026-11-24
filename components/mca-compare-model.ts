import { publicDirectoryReturnHref } from './mca-public-directory-filters';

export type CompareSource = 'csv' | 'observed';
export interface ComparePick {
  id: string;
  name: string;
  source: CompareSource;
  detailPath: string | null;
  observedAt: string | null;
}
export const compareLimit = 3;
const idPattern = /^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/;
const detailPattern = /^details\/[a-f0-9]{64}\.v1\.json$/;

function validPick(value: unknown): value is ComparePick {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<ComparePick>;
  return typeof p.id === 'string' && idPattern.test(p.id) &&
    typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 250 &&
    (p.source === 'csv' || p.source === 'observed') &&
    (p.detailPath === null || typeof p.detailPath === 'string' && detailPattern.test(p.detailPath)) &&
    (p.observedAt === null || typeof p.observedAt === 'string' && p.observedAt.length <= 40);
}
export function parseComparePicks(raw: string | null): ComparePick[] {
  if (!raw || raw.length > 12000) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    const result: ComparePick[] = [];
    for (const p of values) {
      if (validPick(p) && !result.some(x => x.id === p.id)) {
        result.push({ id: p.id, name: p.name, source: p.source, detailPath: p.detailPath, observedAt: p.observedAt });
      }
      if (result.length === compareLimit) break;
    }
    return result;
  } catch { return []; }
}

export function toggleComparePick(picks: ComparePick[], pick: ComparePick): ComparePick[] {
  if (picks.some(item => item.id === pick.id)) return picks.filter(item => item.id !== pick.id);
  if (picks.length >= compareLimit || !validPick(pick)) return picks;
  return [...picks, pick];
}

export function compareHref(from: string | null): string {
  const back = publicDirectoryReturnHref(from);
  return '/quanguo/duibi/' + (back === '/quanguo/pingtai/' ? '' : '?' + new URLSearchParams({ from: back }));
}

export function compareDetailUrl(pick: ComparePick): string | null {
  if (!validPick(pick) || !pick.detailPath) return null;
  return '/data/' + (pick.source === 'csv' ? 'mca-catalog/' : 'mca-observed/') + pick.detailPath;
}

type FeeUnit = '元/月' | '元/天' | '元/次';
type FeeBound = number | null;
export const unknownValue = '采集快照未提供';
const noFullRange = '采集快照未提供完整区间';
export function compareFee(range: readonly [FeeBound, FeeBound] | null, unit: FeeUnit, state?: string): string {
  if (state === 'conflict') return '多次观察值冲突，待核对';
  if (!range) return unknownValue;
  const [lo, hi] = range;
  if (lo === null && hi === null) return unknownValue;
  if (lo === null || hi === null) return noFullRange;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo) return '区间异常，待核对';
  return lo.toLocaleString('zh-CN') + '–' + hi.toLocaleString('zh-CN') + ' ' + unit +
    (lo === 0 ? '（含来源原值 0，不代表免费）' : '');
}
export function displayCompareValue<T>(field: { state?: string; value?: T | null } | undefined, format: (value: T) => string): string {
  if (field?.state === 'conflict') return '多次观察值冲突，待核对';
  return field?.value == null ? unknownValue : format(field.value) || unknownValue;
}
export function compareBeds(value: number | null): string {
  return value === null || !Number.isFinite(value) || value < 0 ? unknownValue : value.toLocaleString('zh-CN') + ' 个';
}
