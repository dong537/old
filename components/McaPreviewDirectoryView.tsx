'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { filterMcaPreviewRecords, mcaOfficialDetailHref, mcaPreviewDetailHref } from '@/lib/mca-preview-ui';
import type { McaPreviewSearchResult } from '@/lib/mca-preview-ui';
import type { McaPreviewCardDto } from '@/lib/mca-preview-dto';
import { sitePath } from '@/lib/site-path';

export interface McaPreviewDirectoryProps {
  records: readonly McaPreviewCardDto[];
  snapshotId: string;
  capturedAt: string | null;
  withDetailCount: number;
  fieldPathCount: number;
}

function previewListPath(result: McaPreviewSearchResult<McaPreviewCardDto>, page: number): string {
  const query = new URLSearchParams();
  if (result.selected.province) query.set('province', result.selected.province);
  if (result.selected.city) query.set('city', result.selected.city);
  if (result.selected.type) query.set('type', result.selected.type);
  if (result.selected.q) query.set('q', result.selected.q);
  if (page > 1) query.set('page', String(page));
  return '/quanguo/mca-preview/' + (query.size ? '?' + query.toString() : '');
}

function previewListHref(result: McaPreviewSearchResult<McaPreviewCardDto>, page: number): string {
  return sitePath(previewListPath(result, page));
}

function Filters({ records, result, idPrefix }: { records: readonly McaPreviewCardDto[]; result: McaPreviewSearchResult<McaPreviewCardDto>; idPrefix: string }) {
  const [province, setProvince] = useState(result.selected.province);
  const [city, setCity] = useState(result.selected.city);
  const draft = new URLSearchParams();
  if (province) draft.set('province', province);
  if (city) draft.set('city', city);
  const available = filterMcaPreviewRecords(records, draft);
  const selectedType = available.types.includes(result.selected.type) ? result.selected.type : '';
  return <form action={sitePath('/quanguo/mca-preview/')} method="get" className="flex flex-col gap-4">
    {result.selected.q && <input type="hidden" name="q" value={result.selected.q} />}
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idPrefix + '-province'} className="text-sm font-semibold">省份</label>
      <select id={idPrefix + '-province'} name="province" className="field" value={province} onChange={event => { setProvince(event.target.value); setCity(''); }}>
        <option value="">全部已观察地区</option>
        {result.provinces.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idPrefix + '-city'} className="text-sm font-semibold">城市</label>
      <select id={idPrefix + '-city'} name="city" className="field" value={city} disabled={!province} onChange={event => setCity(event.target.value)}>
        <option value="">全部已观察城市</option>
        {available.cities.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idPrefix + '-type'} className="text-sm font-semibold">原平台设施类型</label>
      <select id={idPrefix + '-type'} name="type" className="field" defaultValue={selectedType} key={province + ':' + city + ':' + selectedType}>
        <option value="">全部有原标签类型</option>
        {available.types.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    <button type="submit" className="btn-primary w-full">应用筛选</button>
    <a href={sitePath('/quanguo/mca-preview/')} className="btn-ghost">清除全部条件</a>
  </form>;
}

/** Pure view kept separate from the URL reader so its output can be tested. */
export function McaPreviewDirectoryContent({ records, snapshotId, capturedAt, withDetailCount, fieldPathCount, params }: McaPreviewDirectoryProps & { params: URLSearchParams }) {
  const result = filterMcaPreviewRecords(records, params);
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
      <span className="break-all">快照：{snapshotId}</span><span>镜像封存时间：{capturedAt ?? '未提供'}</span>
      <span>已观察 {records.length.toLocaleString('zh-CN')} 个平台 ID</span>
      <span>双端点详情 {withDetailCount.toLocaleString('zh-CN')} 家</span>
      <span>保留 {fieldPathCount.toLocaleString('zh-CN')} 条 JSON 路径</span>
    </div>
    <form action={sitePath('/quanguo/mca-preview/')} method="get" role="search" aria-label="检索平台观察记录" className="filter-panel flex flex-col gap-3 sm:flex-row sm:items-end">
      {result.selected.province && <input type="hidden" name="province" value={result.selected.province} />}
      {result.selected.city && <input type="hidden" name="city" value={result.selected.city} />}
      {result.selected.type && <input type="hidden" name="type" value={result.selected.type} />}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5"><label htmlFor="mca-preview-keyword" className="text-sm font-semibold">机构名称或场所地址</label>
        <input id="mca-preview-keyword" type="search" name="q" defaultValue={result.selected.q} maxLength={80} placeholder="输入机构名称或地址" className="field"
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.repeat) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} /></div>
      <button type="submit" className="btn-primary shrink-0">检索</button>
    </form>
    {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath('/quanguo/mca-preview/')} className="underlink">清除条件</a></div>}
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
      <aside className="hidden lg:block" aria-label="观察字段筛选"><div className="filter-panel sticky top-4">
        <h2 className="mb-4 mt-0 text-base font-semibold">筛选观察记录</h2>
        <Filters key={'desktop:' + params.toString()} records={records} result={result} idPrefix="mca-desktop" />
      </div></aside>
      <div className="min-w-0 space-y-4">
        <details className="filter-panel lg:hidden"><summary className="cursor-pointer font-semibold">按地区和设施类型筛选</summary>
          <div className="mt-4"><Filters key={'mobile:' + params.toString()} records={records} result={result} idPrefix="mca-mobile" /></div>
        </details>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="m-0 text-lg font-semibold">观察记录</h2>
          <p className="m-0 text-sm text-sub" role="status" aria-live="polite">匹配 {result.total.toLocaleString('zh-CN')} 个平台 ID · 第 {result.page}/{result.pageCount} 页</p></div>
        {result.total === 0 ? <div className="card p-8"><h3 className="m-0 text-lg font-semibold">当前条件没有观察记录</h3>
          <p className="mt-2 text-body">可缩短关键词或调整地区；没有观察记录不代表当地不存在机构。</p>
          <a href={sitePath('/quanguo/mca-preview/')} className="btn-outline mt-3">清除条件</a></div> :
          <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="MCA 平台观察记录">
            {result.items.map(record => {
              const href = sitePath(mcaPreviewDetailHref(record.mcaId) + '?from=' + encodeURIComponent(previewListPath(result, result.page)));
              return <li key={record.mcaId} className="min-w-0"><article className="record-card">
                <div className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="m-0 min-w-0 break-words text-lg font-semibold leading-snug"><a href={href} className="text-ink no-underline hover:text-brand">{record.displayName}</a></h3>
                  <span className="tag">{record.displayType}</span></div>
                  <p className="m-0 text-sm text-body">{record.displayRegion}</p>
                  <p className="m-0 break-words text-sm text-body">详细地址：{record.displayAddress}</p>
                  {(record.starText || record.evaluationText) && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
                    {record.starText && <span>机构星级原码：{record.starText}</span>}
                    {record.evaluationText && <span>{record.evaluationText}</span>}
                  </div>}
                  <div className="grid gap-2 text-sm text-body sm:grid-cols-2">
                    <p className="m-0">机构床位：{record.bedsText}（平台列示）</p>
                    <p className="m-0">护理型床位：{record.nursingBedsText}（平台列示）</p>
                  </div>
                  {record.feeText && <p className="m-0 text-sm text-body">月费用范围：{record.feeText}{record.feeWarning && <span className="text-caution">；0 不代表免费</span>}</p>}
                  <div className="flex flex-wrap gap-2 text-xs"><span className="tag">{record.hasDetail ? '已存双端点详情' : '尚无双端点详情'}</span>
                    {record.conflictFields.length > 0 && <span className="rounded border border-caution-line bg-caution-bg px-2 py-0.5 text-caution">{record.conflictFields.length} 项字段冲突待核</span>}</div>
                </div>
                <footer className="record-evidence"><span>列表观察 {record.listObservationCount} 次 · 详情观察 {record.detailObservationCount} 次 · 来源及原值见详情</span>
                  <span className="flex flex-wrap gap-x-4 gap-y-2"><a href={href} className="font-semibold">查看档案与原字段 →</a>
                    <a href={mcaOfficialDetailHref(record.mcaId)} target="_blank" rel="noopener noreferrer">打开官网原页 ↗</a></span></footer>
              </article></li>;
            })}
          </ul>}
        {result.total > 0 && <nav aria-label="观察记录分页" className="flex flex-wrap items-center justify-center gap-3 text-sm">
          {result.page > 1 && <a href={previewListHref(result, result.page - 1)} rel="prev" className="btn-outline px-3">上一页</a>}
          <span>第 {result.page} / {result.pageCount} 页</span>
          {result.page < result.pageCount && <a href={previewListHref(result, result.page + 1)} rel="next" className="btn-outline px-3">下一页</a>}
        </nav>}
      </div>
    </div>
  </div>;
}

export function McaPreviewDirectoryView(props: McaPreviewDirectoryProps) {
  const params = useSearchParams();
  return <McaPreviewDirectoryContent {...props} params={new URLSearchParams(params.toString())} />;
}
