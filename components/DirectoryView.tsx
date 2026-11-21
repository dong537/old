'use client';
import { sitePath } from '@/lib/site-path';

import { useSearchParams } from 'next/navigation';
import { useState, type ReactEventHandler } from 'react';
import type { Institution } from '@/lib/types';
import { countFeeFacets, feeFilterKeys, searchInstitutions } from '@/lib/search';
import { compareUrl, parseCompareSelection, toggleCompareId } from '@/lib/compare';
import { DirectoryFilters } from './DirectoryFilters';
import { Empty } from './DirectoryUi';
import { InstitutionList } from './InstitutionList';

export function DirectoryView({ institutions, districts }: { institutions: Institution[]; districts: string[] }) {
  const params = useSearchParams();
  const [compareIssue, setCompareIssue] = useState('');
  const result = searchInstitutions(institutions, {
    q: params.get('q') ?? '', district: params.get('district') ?? '', page: params.get('page') ?? '1',
    advanceFee: params.get('advanceFee') ?? '', deposit: params.get('deposit') ?? '', membershipFee: params.get('membershipFee') ?? '',
  });
  const knownIds = new Set(institutions.map((item) => item.id));
  const selection = parseCompareSelection(params.get('compare'), knownIds);
  const compare = selection.ids.join(',');
  const resetUrl = '/guangzhou/jigou/' + (compare ? '?' + new URLSearchParams({ compare }) : '');
  const selectedNames = selection.ids.map((id) => institutions.find((item) => item.id === id)?.name).filter(Boolean);
  const counts = Object.fromEntries(districts.map(district => [district, searchInstitutions(institutions, { q: result.q, district, ...result.feeFilters }).total]));
  const feeCounts = countFeeFacets(institutions, { q: result.q, district: result.district, ...result.feeFilters });
  const currentSelection = () => parseCompareSelection(new URLSearchParams(window.location.search).get('compare'), knownIds);
  const replaceCompare = (ids: readonly string[]) => {
    const query = new URLSearchParams(window.location.search);
    if (ids.length) query.set('compare', ids.join(','));
    else query.delete('compare');
    window.history.replaceState(null, '', sitePath('/guangzhou/jigou/' + (query.size ? '?' + query : '')));
  };
  const toggle = (id: string) => {
    const next = toggleCompareId(currentSelection().ids, id);
    if (next.issue) { setCompareIssue(next.issue); return; }
    setCompareIssue('');
    replaceCompare(next.ids);
  };
  const pageUrl = (page: number) => {
    const next = new URLSearchParams();
    if (result.q) next.set('q', result.q);
    if (result.district) next.set('district', result.district);
    for (const key of feeFilterKeys) if (result.feeFilters[key]) next.set(key, result.feeFilters[key]);
    if (page > 1) next.set('page', String(page));
    if (compare) next.set('compare', compare);
    return `/guangzhou/jigou/${next.size ? `?${next}` : ''}`;
  };
  const currentUrl = pageUrl(result.page);
  const syncSelection: ReactEventHandler<HTMLAnchorElement> = event => {
    const url = new URL(event.currentTarget.href);
    const ids = currentSelection().ids;
    if (ids.length) url.searchParams.set('compare', ids.join(','));
    else url.searchParams.delete('compare');
    event.currentTarget.href = url.pathname + url.search + url.hash;
  };
  const syncProfileReturn: ReactEventHandler<HTMLAnchorElement> = event => {
    const target = new URL(event.currentTarget.href);
    const from = new URL(currentUrl, window.location.origin);
    const ids = currentSelection().ids;
    if (ids.length) from.searchParams.set('compare', ids.join(','));
    else from.searchParams.delete('compare');
    target.searchParams.set('from', from.pathname + from.search);
    event.currentTarget.href = target.pathname + target.search + target.hash;
  };
  const syncCompareHref: ReactEventHandler<HTMLAnchorElement> = event => {
    event.currentTarget.href = sitePath(compareUrl(currentSelection().ids, currentUrl));
  };
  const navigationEvents = { onClick: syncSelection, onAuxClick: syncSelection, onContextMenu: syncSelection };
  return <div className="grid items-start gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="min-w-0 lg:sticky lg:top-4" aria-label="机构查询条件">
      <DirectoryFilters q={result.q} district={result.district} districts={districts} counts={counts} feeFilters={result.feeFilters} feeCounts={feeCounts} compare={compare} onNavigate={syncSelection} />
    </aside>
    <div className="flex min-w-0 flex-col gap-5">
    {result.issues.length > 0 && <div className="notice" role="status"><ul className="list-disc space-y-1 pl-5">{result.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p className="mt-2">可以调整条件或<a href={sitePath(resetUrl)} {...navigationEvents} className="underlink">清空筛选，查看全部机构</a>。</p></div>}
    {(selection.issues.length > 0 || compareIssue) && <div className="notice" role="status">{[...selection.issues, compareIssue].filter(Boolean).join(' ')}</div>}
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <span className="text-[15px]" role="status" aria-live="polite">找到 <b>{result.total}</b> 条官方名单记录</span>
      <span className="text-[13px] text-sub">按官方名单原表顺序 · 不代表服务质量推荐</span>
    </div>
    {selection.ids.length > 0 && <div className="rounded-lg border border-brand-line bg-brand-tint p-4 text-sm text-brand-ink" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 min-w-0 break-words">已选 {selection.ids.length} 家：{selectedNames.join('、')}</p>
        <div className="flex flex-wrap items-center gap-3">
          {selection.ids.length >= 2 ? <a href={sitePath(compareUrl(selection.ids, currentUrl))} onClick={syncCompareHref} onAuxClick={syncCompareHref} onContextMenu={syncCompareHref} className="btn-primary text-sm">对比已选机构</a> : <span>再选1家即可对比</span>}
          <button type="button" onClick={() => { replaceCompare([]); setCompareIssue(''); }} className="underlink">清空已选</button>
        </div>
      </div>
    </div>}
    {result.total === 0 ? <Empty>
      <h2 className="m-0 text-lg font-semibold">没有找到符合条件的机构</h2>
      <p className="mx-auto my-3 max-w-md">试试缩短机构名称、只输入街道名，或取消行政区筛选。本目录当前只收录广州官方名单中的机构。</p>
      <a href={sitePath(resetUrl)} {...navigationEvents} className="btn-outline">查看全部机构</a>
    </Empty> : <>
      <InstitutionList items={result.items} returnTo={currentUrl} selectedIds={selection.ids} onToggleCompare={toggle} onOpenProfile={syncProfileReturn} />
      <nav aria-label="检索结果分页" className="flex flex-wrap items-center justify-center gap-2">
        {result.page > 1 && <a href={sitePath(pageUrl(result.page - 1))} {...navigationEvents} className="btn-outline px-3 text-sm" rel="prev">上一页</a>}
        {Array.from({ length: result.pageCount }, (_, i) => i + 1).filter(p => p === 1 || p === result.pageCount || Math.abs(p - result.page) <= 1).map((p, index, visible) => <span key={p} className="inline-flex items-center gap-2">
          {index > 0 && p - visible[index - 1] > 1 && <span className="text-sub" aria-hidden="true">…</span>}
          <a href={sitePath(pageUrl(p))} {...navigationEvents} aria-label={`第 ${p} 页`} aria-current={p === result.page ? 'page' : undefined} className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 ${p === result.page ? 'border-brand bg-brand font-semibold text-white hover:text-white' : 'border-line bg-white hover:border-brand'}`}>{p}</a>
        </span>)}
        {result.page < result.pageCount && <a href={sitePath(pageUrl(result.page + 1))} {...navigationEvents} className="btn-outline px-3 text-sm" rel="next">下一页</a>}
      </nav>
      <p className="m-0 text-center text-[13px] text-sub">第 {result.page} / {result.pageCount} 页 · 每页 20 家</p>
    </>}
    <p className="m-0 text-[13px] text-sub">官方名单没有月费金额数据；押金和会员费仅为原表的是否收取标记，不含金额或存管状态。</p>
    </div>
  </div>;
}
