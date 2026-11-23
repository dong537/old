'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { QccIndex } from '@/lib/qcc-types';
import { isQccStatusCaution, loadQccIndex, qccListHref, qccStatusCategory, searchQccRecords } from '@/lib/qcc-search';
import type { QccSearchParams } from '@/lib/qcc-search';
import { sitePath } from '@/lib/site-path';
import { ListSkeleton } from './DirectoryUi';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; index: QccIndex };

function filterValues(index: QccIndex, key: 'city' | 'subjectType' | 'registrationStatus'): string[] {
  return [...new Set(index.records.map(record => record[key]).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function QccDirectoryResults({ index, query }: { index: QccIndex; query: QccSearchParams }) {
  const result = searchQccRecords(index.records, query);
  const cities = filterValues(index, 'city');
  const types = filterValues(index, 'subjectType');
  const statuses = [...new Set(index.records.map(record => qccStatusCategory(record.registrationStatus)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const hrefForPage = (page: number) => sitePath(qccListHref({ ...result, page }));
  const returnTo = qccListHref({ ...result, page: result.page });
  return <div className="flex flex-col gap-5">
    <div className="notice"><p className="m-0">这里是企查查高级搜索导出的广东登记主体宽口径结果，部分记录与养老服务的关联尚未核实。登记主体不等于养老机构，也不证明其正在提供养老服务。查询前请核对最新登记与服务状态。</p></div>
    <form key={[result.q, result.city, result.type, result.status].join('|')} action={sitePath('/guangdong/zhuti/')} method="get" role="search" aria-label="检索广东登记主体候选" className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(120px,160px))_auto] lg:items-end">
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="qcc-q" className="text-[13px] font-semibold">名称关键词</label><input id="qcc-q" name="q" type="search" defaultValue={result.q} maxLength={80} placeholder="输入登记主体名称" className="min-h-11 w-full rounded-lg border border-line px-3 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" /></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="qcc-city" className="text-[13px] font-semibold">城市</label><select id="qcc-city" name="city" defaultValue={result.city} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"><option value="">全部城市</option>{cities.map(city => <option key={city} value={city}>{city}</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="qcc-type" className="text-[13px] font-semibold">主体类型</label><select id="qcc-type" name="type" defaultValue={result.type} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"><option value="">全部类型</option>{types.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="qcc-status" className="text-[13px] font-semibold">登记状态类别</label><select id="qcc-status" name="status" defaultValue={result.status} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"><option value="">全部状态</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></div>
      <button type="submit" className="btn-primary min-h-11 px-5">检索主体</button>
    </form>
    {(result.q || result.city || result.type || result.status) && <p className="m-0 text-[13px] text-sub">当前条件：{[result.q, result.city, result.type, result.status].filter(Boolean).join(' · ')} · <a href={sitePath('/guangdong/zhuti/')} className="underlink">清空条件</a></p>}
    {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath('/guangdong/zhuti/')} className="underlink">查看全部登记主体</a></div>}
    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="m-0 text-[15px]" role="status" aria-live="polite">共 <b>{result.total}</b> 条登记主体记录</p><span className="text-[13px] text-sub">按导出行号顺序展示 · 同名不同代码分别保留</span></div>
    {result.total === 0 ? <div className="card p-8 text-center"><h2 className="m-0 text-lg font-semibold">没有找到登记主体</h2><p className="mt-2 text-body">缩短关键词或放宽城市、类型及状态条件后重试。</p><a href={sitePath('/guangdong/zhuti/')} className="btn-outline mt-3">查看全部登记主体</a></div> : <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="广东登记主体候选">
      {result.items.map(record => {
        const detailHref = '/guangdong/zhuti/detail/?id=' + encodeURIComponent(record.id) + '&from=' + encodeURIComponent(returnTo);
        const caution = isQccStatusCaution(record.registrationStatus);
        return <li key={record.id} className="min-w-0"><article className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="m-0 min-w-0 break-words text-[17px] font-semibold leading-snug"><a href={sitePath(detailHref)} className="text-ink no-underline hover:text-brand">{record.name}</a></h2><span className={'tag shrink-0 ' + (caution ? 'text-caution' : '')}>{record.registrationStatus || '登记状态未提供'}</span></div>
          <p className="m-0 text-[13px] text-sub">{record.city}{record.district ? ' · ' + record.district : ''} · {record.subjectType || '类型未提供'} · 导出第 {record.rowNumber} 行</p>
          <a href={sitePath(detailHref)} className="text-[13px]">查看登记详情 →</a>
        </article></li>;
      })}
    </ul>}
    {result.total > 0 && <nav aria-label="登记主体分页" className="flex flex-wrap items-center justify-center gap-2">
      {result.page > 1 && <a href={hrefForPage(result.page - 1)} className="btn-outline px-3 text-sm" rel="prev">上一页</a>}
      {Array.from({ length: result.pageCount }, (_, index) => index + 1).filter(page => page === 1 || page === result.pageCount || Math.abs(page - result.page) <= 1).map((page, index, visible) => <span key={page} className="inline-flex items-center gap-2">{index > 0 && page - visible[index - 1] > 1 && <span className="text-sub" aria-hidden="true">…</span>}<a href={hrefForPage(page)} aria-label={'第 ' + page + ' 页'} aria-current={page === result.page ? 'page' : undefined} className={'flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 ' + (page === result.page ? 'border-brand bg-brand font-semibold text-white hover:text-white' : 'border-line bg-white hover:border-brand')}>{page}</a></span>)}
      {result.page < result.pageCount && <a href={hrefForPage(result.page + 1)} className="btn-outline px-3 text-sm" rel="next">下一页</a>}
    </nav>}
    {result.total > 0 && <p className="m-0 text-center text-[13px] text-sub">第 {result.page} / {result.pageCount} 页 · 每页 20 条登记主体记录</p>}
    <div className="card p-5 text-[13px] text-sub"><p className="m-0">来源：企查查高级搜索导出快照，导出时间 <time dateTime={index.exportedAt}>{index.exportedAt}</time>。这不是实时登记或服务名录；原始文件 SHA-256：<span className="break-all font-mono">{index.sourceSha256}</span>。</p><a href={sitePath('/data/qcc/index.v1.json')} className="underlink mt-2 inline-block">查看公开索引 JSON</a></div>
  </div>;
}

export function QccDirectoryView() {
  const params = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadQccIndex(controller.signal).then(index => setState({ status: 'ready', index })).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '登记主体索引读取失败。' });
    });
    return () => controller.abort();
  }, [attempt]);
  if (state.status === 'loading') return <ListSkeleton label="正在加载登记主体索引…" />;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button></div>;
  return <QccDirectoryResults index={state.index} query={{ q: params.get('q') ?? '', city: params.get('city') ?? '', type: params.get('type') ?? '', status: params.get('status') ?? '', page: params.get('page') ?? '1' }} />;
}

