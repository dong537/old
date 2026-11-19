export const MAX_COMPARE_ITEMS = 3;
const DIRECTORY_PATH = '/guangzhou/jigou/';

export interface CompareSelection { ids: string[]; issues: string[] }

export function parseCompareSelection(raw: string | null | undefined, knownIds: ReadonlySet<string>): CompareSelection {
  if (!raw) return { ids: [], issues: [] };
  if (raw.length > 512) return { ids: [], issues: ['对比链接过长，请重新选择机构。'] };
  const ids: string[] = [];
  const issues: string[] = [];
  let unknown = false;
  let excess = false;
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (!knownIds.has(id)) { unknown = true; continue; }
    if (ids.includes(id)) continue;
    if (ids.length === MAX_COMPARE_ITEMS) { excess = true; continue; }
    ids.push(id);
  }
  if (unknown) issues.push('对比链接中有未知机构，已跳过。');
  if (excess) issues.push(`一次最多对比${MAX_COMPARE_ITEMS}家机构，已保留前${MAX_COMPARE_ITEMS}家。`);
  return { ids, issues };
}

export function toggleCompareId(ids: readonly string[], id: string): { ids: string[]; issue?: string } {
  if (ids.includes(id)) return { ids: ids.filter((item) => item !== id) };
  if (ids.length >= MAX_COMPARE_ITEMS) return { ids: [...ids], issue: `一次最多对比${MAX_COMPARE_ITEMS}家机构，请先取消一家。` };
  return { ids: [...ids, id] };
}

function directoryFrom(raw: string | null | undefined): string | null {
  // An 80-character Unicode query may exceed 512 bytes once URL-encoded.
  if (!raw || raw.length > 2048 || !/^\/guangzhou\/jigou\/(?:\?[^#]*)?$/.test(raw)) return null;
  const original = new URLSearchParams(raw.split('?')[1] ?? '');
  const query = new URLSearchParams();
  for (const key of ['q', 'district', 'advanceFee', 'deposit', 'membershipFee', 'page']) {
    const value = original.get(key);
    if (value) query.set(key, value);
  }
  return DIRECTORY_PATH + (query.size ? `?${query}` : '');
}

export function directoryReturnUrl(from: string | null | undefined, ids: readonly string[]): string {
  const safe = directoryFrom(from) ?? DIRECTORY_PATH;
  const query = new URLSearchParams(safe.split('?')[1] ?? '');
  if (ids.length) query.set('compare', ids.join(','));
  return DIRECTORY_PATH + (query.size ? `?${query}` : '');
}

export function compareUrl(ids: readonly string[], from?: string | null): string {
  const query = new URLSearchParams({ ids: ids.join(',') });
  const safeFrom = directoryFrom(from);
  if (safeFrom) query.set('from', safeFrom);
  return `/guangzhou/duibi/?${query}`;
}
