'use client';

import { useSearchParams } from 'next/navigation';
import type { ProvinceSourceRecord } from '@/lib/province-types';
import { searchProvinceRecords } from '@/lib/province-search';
import { sitePath } from '@/lib/site-path';
import { ProvinceCoverageNote } from './ProvinceCoverageNote';
import { ProvinceSourceLink } from './ProvinceSourceLink';

function nameKey(record: ProvinceSourceRecord) {
  return record.city + '\u0000' + record.name.replace(/\s+/gu, '');
}

export function ProvinceDirectoryView({ records, cities }: { records: ProvinceSourceRecord[]; cities: string[] }) {
  const params = useSearchParams();
  const result = searchProvinceRecords(records, {
    q: params.get('q') ?? '',
    city: params.get('city') ?? '',
    page: params.get('page') ?? '1',
  });
  const sameNameCounts = new Map<string, number>();
  for (const record of records) {
    const key = nameKey(record);
    sameNameCounts.set(key, (sameNameCounts.get(key) ?? 0) + 1);
  }
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (result.q) query.set('q', result.q);
    if (result.city) query.set('city', result.city);
    if (page > 1) query.set('page', String(page));
    return '/guangdong/jigou/' + (query.size ? '?' + query : '');
  };
  const returnTo = pageHref(result.page);

  return <div className="flex flex-col gap-5">
    <ProvinceCoverageNote city={result.city} />
    <form key={result.q + '|' + result.city} action={sitePath('/guangdong/jigou/')} method="get" role="search" aria-label="检索广东养老相关官方来源记录" className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_auto] sm:items-end">
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="province-q" className="text-[13px] font-semibold">名称关键词</label><input id="province-q" name="q" type="search" defaultValue={result.q} maxLength={80} placeholder="输入来源记录中的名称" className="min-h-11 w-full rounded-lg border border-line px-3 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" /></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="province-city" className="text-[13px] font-semibold">城市</label><select id="province-city" name="city" defaultValue={result.city} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"><option value="">全部城市</option>{cities.map(city => <option key={city} value={city}>{city}</option>)}</select></div>
      <button type="submit" className="btn-primary min-h-11 px-5">检索记录</button>
    </form>
    {(result.q || result.city) && <p className="m-0 text-[13px] text-sub">当前条件：{result.city || '全部城市'}{result.q ? ' · ' + result.q : ''} · <a href={sitePath('/guangdong/jigou/')} className="underlink">清空条件</a></p>}
    {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath('/guangdong/jigou/')} className="underlink">查看全部来源记录</a></div>}
    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="m-0 text-[15px]" role="status" aria-live="polite">共 <b>{result.total}</b> 条来源记录</p><span className="text-[13px] text-sub">按冻结来源顺序展示 · 同城同名不自动合并</span></div>
    {result.total === 0 ? <div className="card p-8 text-center"><h2 className="m-0 text-lg font-semibold">没有找到来源记录</h2><p className="mt-2 text-body">缩短名称关键词或选择全部城市后重试。</p><a href={sitePath('/guangdong/jigou/')} className="btn-outline mt-3">查看全部来源记录</a></div> : <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="广东养老相关公开来源记录">
      {result.items.map(record => {
        const sameName = sameNameCounts.get(nameKey(record)) ?? 1;
        const detailHref = '/guangdong/jigou/' + record.id + '/?from=' + encodeURIComponent(returnTo);
        return <li key={record.id} className="min-w-0"><article className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="m-0 min-w-0 break-words text-[17px] font-semibold leading-snug"><a href={sitePath(detailHref)} className="text-ink no-underline hover:text-brand">{record.name}</a></h2><span className="tag shrink-0">来源记录 · 待核线索</span></div>
          <p className="m-0 text-[13px] text-sub">{record.city} · 记录编号 {record.id}{sameName > 1 ? ' · 同城同名 ' + sameName + ' 条，未合并' : ''}</p>
          <dl className="m-0 grid gap-3 text-[13px] sm:grid-cols-3"><div><dt className="text-sub">证据类型</dt><dd className="m-0 break-words font-medium">{record.evidenceType}</dd></div><div><dt className="text-sub">来源发布日期</dt><dd className="m-0">{record.sourcePublishedAt ?? '原文未说明'}</dd></div><div><dt className="text-sub">资料期</dt><dd className="m-0">{record.sourceAsOf ?? '原文未说明'}</dd></div></dl>
          <p className={'m-0 break-words text-[13px] ' + (record.sourceStatusNote ? 'text-caution' : 'text-body')}>原文状态提示：{record.sourceStatusNote ?? '原文未说明'}。此处不核定当前状态。</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]"><a href={sitePath(detailHref)}>查看记录详情 →</a><ProvinceSourceLink url={record.sourceUrl} /></div>
        </article></li>;
      })}
    </ul>}
    {result.total > 0 && <nav aria-label="来源记录分页" className="flex flex-wrap items-center justify-center gap-2">
      {result.page > 1 && <a href={sitePath(pageHref(result.page - 1))} className="btn-outline px-3 text-sm" rel="prev">上一页</a>}
      {Array.from({ length: result.pageCount }, (_, index) => index + 1).filter(page => page === 1 || page === result.pageCount || Math.abs(page - result.page) <= 1).map((page, index, visible) => <span key={page} className="inline-flex items-center gap-2">{index > 0 && page - visible[index - 1] > 1 && <span className="text-sub" aria-hidden="true">…</span>}<a href={sitePath(pageHref(page))} aria-label={'第 ' + page + ' 页'} aria-current={page === result.page ? 'page' : undefined} className={'flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 ' + (page === result.page ? 'border-brand bg-brand font-semibold text-white hover:text-white' : 'border-line bg-white hover:border-brand')}>{page}</a></span>)}
      {result.page < result.pageCount && <a href={sitePath(pageHref(result.page + 1))} className="btn-outline px-3 text-sm" rel="next">下一页</a>}
    </nav>}
    {result.total > 0 && <p className="m-0 text-center text-[13px] text-sub">第 {result.page} / {result.pageCount} 页 · 每页 20 条来源记录</p>}
  </div>;
}
