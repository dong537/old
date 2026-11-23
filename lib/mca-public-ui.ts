import { mcaOfficialDetailHref } from './mca-preview-ui';

export function mcaPublicDetailHref(mcaId: string): string {
  return '/quanguo/pingtai/' + encodeURIComponent(mcaId) + '/';
}

export function mcaPublicListHref(params: URLSearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const key of ['province', 'city', 'type', 'q']) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  if (page > 1) query.set('page', String(page));
  return '/quanguo/pingtai/' + (query.size ? '?' + query.toString() : '');
}

/** Return only to a known national directory, with that directory's own filter state. */
export function mcaPublicReturnHref(raw: string | null): string {
  const fallback = '/quanguo/pingtai/';
  if (!raw || !raw.startsWith('/quanguo/')) return fallback;
  let url: URL;
  try { url = new URL(raw, 'https://eldercare.local'); } catch { return fallback; }
  if (url.origin !== 'https://eldercare.local' || url.hash) return fallback;
  const routeKeys: Record<string, readonly string[]> = {
    '/quanguo/pingtai/': ['province', 'city', 'type', 'q', 'page'],
    '/quanguo/shangmen/': ['province', 'city', 'item', 'q', 'page'],
    '/quanguo/jiage/': ['province', 'city', 'q', 'page'],
  };
  const keys = routeKeys[url.pathname];
  if (!keys) return fallback;
  const allowed = new Set(keys);
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1 || value.length > (key === 'q' ? 80 : 64)) return fallback;
  }
  const pageRaw = url.searchParams.get('page');
  if (pageRaw !== null && !/^[1-9][0-9]{0,4}$/.test(pageRaw)) return fallback;
  if (url.pathname === fallback) return mcaPublicListHref(url.searchParams, pageRaw === null ? 1 : Number(pageRaw));
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value && !(key === 'page' && value === '1')) query.set(key, value);
  }
  return url.pathname + (query.size ? '?' + query.toString() : '');
}

/** A search suggestion only; matching names do not establish that two source rows are the same institution. */
export function mcaPublicNameSearchHref(name: string): string {
  const q = [...name.trim()].slice(0, 80).join('');
  return '/quanguo/pingtai/' + (q ? '?' + new URLSearchParams({ q }).toString() : '');
}

export { mcaOfficialDetailHref };
