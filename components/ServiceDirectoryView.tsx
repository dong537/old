'use client';
import { sitePath } from '@/lib/site-path';

import { useSearchParams } from 'next/navigation';
import { Empty } from '@/components/DirectoryUi';
import { RECORD_TYPE_LABELS, searchServices, serviceListHref, type ServiceFilters } from '@/lib/service-search';
import type { ServiceCatalog, ServiceRecord } from '@/lib/service-types';

function FilterRow({ field, label, value, choices, filters }: { field: 'district' | 'recordType' | 'grade'; label: string; value: string; choices: { value: string; label: string }[]; filters: ServiceFilters }) {
  return <div role="group" aria-label={label} className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
    <span className="w-[72px] shrink-0 text-[13px] text-sub">{label}</span>
    {[{ value: '', label: '全部' }, ...choices].map(choice => {
      const active = choice.value === value;
      const nextFilters = { ...filters, [field]: choice.value, page: 1, ...(field === 'recordType' && choice.value === 'designation-notice' ? { grade: '' } : {}) };
      return <a key={choice.value} href={sitePath(serviceListHref(nextFilters))}
        aria-current={active ? 'true' : undefined} className={`chip min-h-11 items-center px-3 py-1 text-[14px] no-underline ${active ? 'bg-brand text-white hover:text-white' : 'text-ink hover:text-brand'}`}>
        {choice.label}
      </a>;
    })}
  </div>;
}

function RecordCard({ record, source, returnTo }: { record: ServiceRecord; source: ServiceCatalog['sources'][number]; returnTo: string }) {
  const profileHref = '/guangzhou/shangmen/' + record.id + '/?from=' + encodeURIComponent(returnTo);
  const serviceDescription = record.recordType === 'annual-assessment'
    ? '此表未区分服务类别'
    : record.serviceCategory ?? '原表未提供';
  return <li className="min-w-0">
    <article className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 break-words text-[17px] font-semibold leading-snug"><a href={sitePath(profileHref)} className="text-ink no-underline hover:text-brand">{record.name}</a></h2>
          <span className="text-[13px] text-sub">{record.district ?? '所属区原文未提供'}{record.districtBasis === 'address-text' ? '（按地址文字整理）' : ''} · {record.providerType ?? (record.recordType === 'designation-notice' ? '新增定点评估合格公示' : '考核类型原文未提供')}</span>
        </div>
        <span className={'tag shrink-0 ' + (record.recordType === 'designation-notice' ? 'border-caution-line bg-caution-bg text-caution' : '')}>{RECORD_TYPE_LABELS[record.recordType]}</span>
      </div>
      <dl className="m-0 grid gap-3 text-[14px] sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-xs text-sub">服务地址</dt><dd className="m-0 break-words font-semibold">{record.address ?? '原表未提供'}</dd></div>
        <div><dt className="text-xs text-sub">服务类别 / 项目</dt><dd className="m-0 break-words font-semibold">{serviceDescription}{record.serviceItems ? ' · ' + record.serviceItems : ''}</dd></div>
        {record.assessmentGrade && <div><dt className="text-xs text-sub">考核等次</dt><dd className="m-0 font-semibold">{record.assessmentGrade}</dd></div>}
      </dl>
      <footer aria-label="来源与核对" className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-3 text-[13px]">
        <span className="flex min-w-0 flex-col gap-1 break-words text-sub"><span className="font-medium text-ink">{source.title}</span><span>资料期 {source.period} · 发布于 <time dateTime={source.publishedAt}>{source.publishedAt}</time> · 原始记录第 {record.sourceRow} 条</span></span>
        <span className="flex flex-wrap gap-x-4 gap-y-1"><a href={sitePath(profileHref)} className="inline-flex min-h-11 items-center font-semibold">核对字段与来源 →</a><a href={sitePath(source.url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center">打开官方原文核对 ↗</a></span>
      </footer>
    </article>
  </li>;
}

export function ServiceDirectoryView({ catalog }: { catalog: ServiceCatalog }) {
  const params = useSearchParams();
  const result = searchServices(catalog.records, {
    q: params.get('q') ?? '', district: params.get('district') ?? '',
    recordType: params.get('recordType') ?? '', grade: params.get('grade') ?? '', page: params.get('page') ?? '1',
  });
  const sourceById = new Map(catalog.sources.map(source => [source.id, source]));
  const href = (page: number) => serviceListHref({ ...result.filters, page });
  const items = result.items;
  const areas = [...new Set(catalog.records.map(record => record.district).filter((value): value is string => value !== null))];

  return <div className="flex flex-col gap-6">
    <section className="card flex flex-col gap-2.5 p-4" aria-label="筛选养老服务公开记录">
      <form method="get" action={sitePath('/guangzhou/shangmen/')} role="search" aria-label="搜索养老服务公开记录" className="flex flex-wrap gap-2 border-b border-hair pb-3">
        <label className="sr-only" htmlFor="service-q">搜索机构、地址或服务项目</label>
        <input id="service-q" name="q" type="search" maxLength={80} defaultValue={result.filters.q} placeholder="搜机构、地址、类型或服务项目" className="input min-w-[180px] flex-1" />
        {result.filters.district && <input type="hidden" name="district" value={result.filters.district} />}
        {result.filters.recordType && <input type="hidden" name="recordType" value={result.filters.recordType} />}
        {result.filters.grade && <input type="hidden" name="grade" value={result.filters.grade} />}
        <button type="submit" className="btn-primary">搜索记录</button>
      </form>
      <FilterRow field="recordType" label="资料类型" value={result.filters.recordType} filters={result.filters} choices={Object.entries(RECORD_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
      <FilterRow field="district" label="所属区" value={result.filters.district} filters={result.filters} choices={areas.map(value => ({ value, label: value.replace(/区$/u, '') }))} />
      {result.filters.recordType !== 'designation-notice' && catalog.records.some(record => record.assessmentGrade) && <FilterRow field="grade" label="考核等次" value={result.filters.grade} filters={result.filters} choices={['优秀', '良好', '合格', '不合格', '无等次'].filter(value => catalog.records.some(record => record.assessmentGrade === value)).map(value => ({ value, label: value }))} />}
      {(result.filters.q || result.filters.district || result.filters.recordType || result.filters.grade) && <div className="border-t border-hair pt-2"><a href={sitePath("/guangzhou/shangmen/")} className="text-[13px] text-sub">清空筛选</a></div>}
    </section>
    {result.issues.length > 0 && <div className="notice" role="status"><ul className="m-0 list-disc space-y-1 pl-5">{result.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><a href={sitePath("/guangzhou/shangmen/")} className="underlink">清空筛选并查看全部记录</a></div>}
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <span className="text-[15px]" role="status" aria-live="polite">共 <b>{result.total}</b> 条记录</span>
      <span className="text-[13px] text-sub">按原始来源与行号排序 · 不合并同名记录</span>
    </div>
    <p className="m-0 border-l-2 border-brand bg-brand-tint px-4 py-3 text-[13px] text-body" role="note">查询官方历史记录，不代表当前有效资格、全量名单或服务质量推荐。年度考核与新增定点公示口径不同；资料期和原文可在每条记录中核对。<a href={sitePath("/guangzhou/changhuxian/")} className="ml-2 underlink">长护险申请指南 →</a></p>
    {result.total === 0 ? <Empty><h2 className="m-0 text-lg font-semibold">没有符合条件的记录</h2><p className="my-2">试试缩短搜索词，或清空资料类型、所属区和考核等次。</p><a href={sitePath("/guangzhou/shangmen/")} className="btn-outline">查看全部记录</a></Empty> : <>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="养老服务公开记录检索结果">
        {items.map(record => <RecordCard key={record.id} record={record} source={sourceById.get(record.sourceId)!} returnTo={href(result.page)} />)}
      </ul>
      <nav aria-label="检索结果分页" className="flex flex-wrap items-center justify-center gap-2">
        {result.page > 1 && <a href={sitePath(href(result.page - 1))} rel="prev" className="btn-outline px-3 text-sm">上一页</a>}
        {Array.from({ length: result.pageCount }, (_, index) => index + 1).filter(page => page === 1 || page === result.pageCount || Math.abs(page - result.page) <= 1).map((page, index, visible) => <span key={page} className="inline-flex items-center gap-2">
          {index > 0 && page - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}
          <a href={sitePath(href(page))} aria-label={`第 ${page} 页`} aria-current={page === result.page ? 'page' : undefined} className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 ${page === result.page ? 'border-brand bg-brand font-semibold text-white hover:text-white' : 'border-line bg-white hover:border-brand'}`}>{page}</a>
        </span>)}
        {result.page < result.pageCount && <a href={sitePath(href(result.page + 1))} rel="next" className="btn-outline px-3 text-sm">下一页</a>}
      </nav>
      <p className="m-0 text-center text-[13px] text-sub">第 {result.page} / {result.pageCount} 页 · 每页 20 条</p>
    </>}
    <details className="card p-4 text-[14px] text-body">
      <summary className="min-h-11 cursor-pointer font-semibold text-ink">资料来源与使用范围（{catalog.sources.length} 项）</summary>
      <ul className="m-0 mt-3 flex flex-col gap-2 pl-5">{catalog.sources.map(source => <li key={source.id}><a href={sitePath(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a> · {source.publisher} · 发布于 <time dateTime={source.publishedAt}>{source.publishedAt}</time> · {source.period}<p className="m-0 text-[13px] text-sub">{source.limitations}</p></li>)}</ul>
      <a href={sitePath("/data/guangzhou-services.v1.json")} className="mt-3 inline-block">查看本地整理的公开JSON快照（含原始来源元数据）</a>
    </details>
  </div>;
}
