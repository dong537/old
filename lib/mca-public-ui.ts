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

/** A search suggestion only; matching names do not establish that two source rows are the same institution. */
export function mcaPublicNameSearchHref(name: string): string {
  const q = [...name.trim()].slice(0, 80).join('');
  return '/quanguo/pingtai/' + (q ? '?' + new URLSearchParams({ q }).toString() : '');
}

export { mcaOfficialDetailHref };
