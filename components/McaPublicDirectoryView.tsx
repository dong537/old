'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { mapMcaPreviewCard } from '@/lib/mca-preview-dto';
import type { McaPreviewResolved } from '@/lib/mca-preview-dto';
import { filterMcaPreviewRecords } from '@/lib/mca-preview-ui';
import { mcaOfficialDetailHref } from '@/lib/mca-preview-ui';
import { mcaPublicDetailHref, mcaPublicListHref } from '@/lib/mca-public-ui';
import type { McaCatalogIndex, McaCatalogIndexRecord, McaCatalogManifest } from '@/lib/mca-catalog-types';
import { summarizeMcaCatalog } from '@/lib/mca-catalog-scope';
import type { McaPublicIndexRecord, McaPublicManifest } from '@/lib/mca-public-types';
import { sitePath } from '@/lib/site-path';
import { DirectoryPager, ListSkeleton } from './DirectoryUi';

function resolvedText<T>(field: McaPreviewResolved<T>, format: (value: T) => string): string {
  if (field.state === 'conflict') return '观察值冲突，待核对';
  return field.value === null ? '采集快照未提供' : format(field.value);
}

function indexText(record: McaPublicIndexRecord, key: 'functionPositioningLabel' | 'platformTagsRaw'): string {
  if (record.conflictFields.includes(key)) return '观察值冲突，待核对';
  return record[key]?.trim() || '采集快照未提供';
}

function hasValidResolved(value: unknown, kind: 'text' | 'number'): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const field = value as Record<string, unknown>;
  if (!['observed', 'missing', 'conflict'].includes(String(field.state)) ||
      !Number.isSafeInteger(field.observationCount) || (field.observationCount as number) < 0) return false;
  if (field.state !== 'observed') return field.value === null;
  return (field.observationCount as number) > 0 && (kind === 'text' ?
    typeof field.value === 'string' && field.value.length > 0 :
    typeof field.value === 'number' && Number.isFinite(field.value) && field.value >= 0);
}

function hasValidObservedTimeRange(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const range = value as Record<string, unknown>;
  if (typeof range.earliest !== 'string' || typeof range.latest !== 'string') return false;
  const utc = /^\d{4}-\d{2}-\d{2}T.+(?:Z|\+00:00)$/;
  return utc.test(range.earliest) && utc.test(range.latest) &&
    Number.isFinite(Date.parse(range.earliest)) && Number.isFinite(Date.parse(range.latest)) &&
    Date.parse(range.earliest) <= Date.parse(range.latest);
}

function parseIndex(value: unknown, manifest: McaCatalogManifest): McaCatalogIndex {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('平台采集索引格式无效。');
  const index = value as Partial<McaCatalogIndex>;
  if (index.schemaVersion !== 1 || index.snapshotId !== manifest.snapshotId ||
      !Array.isArray(index.records) || index.records.length !== manifest.recordCount) {
    throw new Error('平台采集索引与快照清单不一致。');
  }
  const ids = new Set<string>();
  let withDetailCount = 0;
  let csvCount = 0;
  let staleCount = 0;
  for (const record of index.records) {
    if (!record || typeof record !== 'object' || typeof record.mcaId !== 'string' ||
        !/^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/.test(record.mcaId) || ids.has(record.mcaId) ||
        (record.detailPath !== null && (typeof record.detailPath !== 'string' || !/^details\/[a-f0-9]{64}\.v1\.json$/.test(record.detailPath))) ||
        record.hasDetail !== (record.detailPath !== null) ||
        !Number.isSafeInteger(record.listObservationCount) || record.listObservationCount < 0 ||
        !Number.isSafeInteger(record.detailObservationCount) || record.detailObservationCount < 0 ||
        (record.listObservationCount === 0 && record.detailObservationCount === 0) ||
        !hasValidResolved(record.listedContactPhone, 'text') ||
        !hasValidResolved(record.serviceCategoryLabel, 'text') ||
        !hasValidResolved(record.subsidyCode, 'text') ||
        !hasValidResolved(record.dayCareBeds, 'number') ||
        !hasValidResolved(record.fullCareBeds, 'number') ||
        (record.listObservationCount === 0 ? record.listObservedAtUtc !== null : !hasValidObservedTimeRange(record.listObservedAtUtc)) ||
        !Array.isArray(record.conflictFields)) throw new Error('平台采集索引包含无效机构记录。');
    if (record.sourceKind === 'csv') {
      if (!['ok', 'stale'].includes(record.collectorStatus) || !record.csvUpdatedAtLocal || !record.hasDetail) {
        throw new Error('CSV 机构采集状态或详情标记无效。');
      }
      csvCount++;
      if (record.collectorStatus === 'stale') staleCount++;
    } else if (record.sourceKind !== 'observed' || record.collectorStatus !== null || record.csvUpdatedAtLocal !== null) {
      throw new Error('平台采集索引来源无效。');
    }
    ids.add(record.mcaId);
    if (record.hasDetail) withDetailCount++;
  }
  if (withDetailCount !== manifest.detailCount || csvCount !== manifest.csvRowCount ||
      staleCount !== manifest.csvStaleCount) throw new Error('平台采集索引数量与目录清单不一致。');
  return index as McaCatalogIndex;
}

function FilterForm({ records, params, idPrefix }: { records: readonly McaPublicIndexRecord[]; params: URLSearchParams; idPrefix: string }) {
  const result = filterMcaPreviewRecords(records, params);
  const [province, setProvince] = useState(result.selected.province);
  const [city, setCity] = useState(result.selected.city);
  const [type, setType] = useState(result.selected.type);
  const draft = new URLSearchParams();
  if (province) draft.set('province', province);
  if (city) draft.set('city', city);
  const available = filterMcaPreviewRecords(records, draft);
  const fieldClass = 'min-w-0 border border-[#e4e9e4] bg-white px-3 py-2.5 focus-within:border-brand';
  const controlClass = 'mt-1 block h-9 w-full min-w-0 border-0 bg-transparent p-0 text-[15px] text-ink outline-none disabled:text-sub';
  return <form action={sitePath('/quanguo/pingtai/')} method="get" role="search" aria-label="检索民政部平台采集快照" className="grid min-w-0 grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-5">
    <div className={fieldClass}><label htmlFor={idPrefix + '-province'} className="block text-xs text-sub">省份</label>
      <select id={idPrefix + '-province'} name="province" className={controlClass} value={province} onChange={event => { setProvince(event.target.value); setCity(''); setType(''); }}>
        <option value="">全部省份</option>{result.provinces.map(value => <option key={value} value={value}>{value}</option>)}
      </select></div>
    <div className={fieldClass}><label htmlFor={idPrefix + '-city'} className="block text-xs text-sub">城市区域</label>
      <select id={idPrefix + '-city'} name="city" className={controlClass} value={city} disabled={!province} onChange={event => { setCity(event.target.value); setType(''); }}>
        <option value="">{province ? '全部城市' : '先选省份'}</option>{available.cities.map(value => <option key={value} value={value}>{value}</option>)}
      </select></div>
    <div className={fieldClass}><label htmlFor={idPrefix + '-type'} className="block text-xs text-sub">原平台设施类型</label>
      <select id={idPrefix + '-type'} name="type" className={controlClass} value={available.types.includes(type) ? type : ''} onChange={event => setType(event.target.value)}>
        <option value="">全部类型</option>{available.types.map(value => <option key={value} value={value}>{value}</option>)}
      </select></div>
    <div className={fieldClass}><label htmlFor={idPrefix + '-keyword'} className="block text-xs text-sub">检索关键词</label>
      <input id={idPrefix + '-keyword'} type="search" name="q" defaultValue={result.selected.q} maxLength={80} placeholder="名称或地址" className={controlClass} /></div>
    <button type="submit" className="min-h-[58px] bg-[#159d24] px-5 text-[17px] font-semibold text-white hover:bg-[#0c8120] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c8120] min-[480px]:col-span-2 lg:col-span-1 lg:min-h-[78px]">搜索机构</button>
  </form>;
}

function ScopeSummary({ manifest }: { manifest: McaPublicManifest | McaCatalogManifest }) {
  if ('csvRowCount' in manifest) {
    const scope = summarizeMcaCatalog(manifest);
    return <>收录 {scope.recordCount.toLocaleString('zh-CN')} 个不重复平台 ID · {scope.detailCount.toLocaleString('zh-CN')} 条有详情 · {scope.indexOnlyCount.toLocaleString('zh-CN')} 条仅有索引 · CSV 导入 {scope.csvRowCount.toLocaleString('zh-CN')} 行（{scope.csvStaleCount.toLocaleString('zh-CN')} 条待刷新）· CSV 导出日期 {scope.csvExportDate}，并非逐家资料截至日</>;
  }
  return <>已观察 {manifest.recordCount.toLocaleString('zh-CN')} 个平台 ID · 已采集 {manifest.withDetailCount.toLocaleString('zh-CN')} 条双端点详情 · 本批次最晚采集时间 <time dateTime={manifest.snapshotCapturedAtUtc}>{manifest.snapshotCapturedAtUtc}</time></>;
}

export function McaPublicDirectoryContent({ records, manifest, params }: {
  records: readonly McaPublicIndexRecord[]; manifest: McaPublicManifest | McaCatalogManifest; params: URLSearchParams;
}) {
  const result = filterMcaPreviewRecords(records, params);
  const selected = new URLSearchParams();
  for (const key of ['province', 'city', 'type', 'q'] as const) {
    if (result.selected[key]) selected.set(key, result.selected[key]);
  }
  return <div className="flex min-w-0 flex-col gap-5">
    <div className="min-w-0 rounded-[4px] bg-white p-3 shadow-[0_2px_9px_rgba(24,47,28,0.05)] sm:p-5">
      <FilterForm key={params.toString()} records={records} params={params} idPrefix="mca-public-search" />
      {(result.selected.province || result.selected.city || result.selected.type || result.selected.q) &&
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-body"><span>当前条件：</span>
          {[result.selected.province, result.selected.city, result.selected.type, result.selected.q].filter(Boolean).map(value => <span key={value} className="border border-[#dce8d9] bg-[#f1f8ee] px-2 py-1 text-brand-dark">{value}</span>)}
          <a href={sitePath('/quanguo/pingtai/')} className="ml-auto min-h-9 content-center underline-offset-4 hover:underline">清除条件</a>
        </div>}
    </div>
    {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath('/quanguo/pingtai/')} className="underlink">清除条件</a></div>}
    <p className="m-0 border-l-[3px] border-[#62a64b] bg-white px-4 py-3 text-[13px] leading-6 text-body" role="note">民政部平台的部分采集快照，记录不代表全国全量或当前在营。床位、费用和服务均为来源快照值，请到官网和机构核对。</p>
    <section className="min-w-0" aria-label="养老机构查询结果">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#dfe5de] pb-3"><div><h2 className="m-0 text-[20px] font-semibold text-ink">养老机构查询</h2><p className="m-0 mt-1 text-[12px] leading-5 text-sub"><ScopeSummary manifest={manifest} /></p></div><p className="m-0 text-sm text-body" role="status">匹配 <strong className="text-[20px] text-brand-dark">{result.total.toLocaleString('zh-CN')}</strong> 条 · 第 {result.page}/{result.pageCount} 页</p></div>
        {result.total === 0 ? <div className="card p-6"><h3 className="m-0 text-lg font-semibold">当前条件未找到记录</h3><p className="mt-2 text-body">缩短关键词或调整地区；未采到不代表当地没有机构。</p><a href={sitePath('/quanguo/pingtai/')} className="btn-outline">清除条件</a></div> :
          <ul className="m-0 grid min-w-0 list-none gap-3 p-0 lg:grid-cols-2" aria-label="民政部平台采集快照列表">{result.items.map(record => {
            const card = mapMcaPreviewCard(record);
            const csvRecord = 'sourceKind' in record && record.sourceKind === 'csv' ? record as McaCatalogIndexRecord : null;
            const detailHref = record.detailPath ? sitePath(mcaPublicDetailHref(record.mcaId) + '?from=' + encodeURIComponent(mcaPublicListHref(selected, result.page))) : null;
            const hasUsableFee = card.feeText !== null && !card.feeWarning && !card.feeText.includes('冲突');
            return <li key={record.mcaId} className="min-w-0"><article className="flex h-full min-w-0 flex-col overflow-hidden rounded-[4px] border border-[#e6eae5] bg-white transition-colors hover:border-[#b9d6b1]">
              <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="m-0 break-words text-[18px] font-semibold leading-snug text-ink">{detailHref ? <a href={detailHref} className="text-ink no-underline hover:text-brand">{card.displayName}</a> : card.displayName}</h3><p className="m-0 mt-2 text-[13px] text-sub">{card.displayRegion} <span aria-hidden="true">·</span> {card.displayType}</p></div><div className="max-w-full text-left sm:text-right"><p className={'m-0 break-words text-[17px] font-semibold leading-6 ' + (hasUsableFee ? 'text-[#e26016]' : 'text-sub')}>{card.feeText ?? '价格未提供'}</p><p className="m-0 text-[11px] text-sub">{hasUsableFee ? '月费用 · 来源快照' : '收费信息需核对'}</p></div></div>
                <p className="m-0 break-words text-[13px] leading-5 text-body">详细地址：{card.displayAddress}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#edf0ec] pt-3 text-[13px] text-body"><p className="m-0">平台列示床位：<strong className="font-medium text-ink">{card.bedsText}</strong></p><p className="m-0">护理型床位：<strong className="font-medium text-ink">{card.nursingBedsText}</strong></p></div>
                <details className="group border-t border-[#edf0ec] pt-2 text-[13px] text-body"><summary className="min-h-9 cursor-pointer list-none content-center font-medium text-brand-dark underline-offset-4 hover:underline focus-visible:outline-brand [&::-webkit-details-marker]:hidden">更多快照字段 <span className="inline-block transition-transform group-open:rotate-180" aria-hidden="true">⌄</span></summary><div className="grid gap-x-4 gap-y-2 pb-2 sm:grid-cols-2">{!csvRecord && <p className="m-0">星级原码：{card.starText ?? '采集快照未提供'}</p>}{(csvRecord || record.listObservationCount > 0) && <><p className="m-0">平台列表服务类别：{resolvedText(record.serviceCategoryLabel, String)}</p>{!csvRecord && <p className="m-0">补贴原码：{resolvedText(record.subsidyCode, String)}</p>}<p className="m-0">平台列示日托床位：{resolvedText(record.dayCareBeds, value => value.toLocaleString('zh-CN') + ' 个')}</p><p className="m-0">平台列示全托床位：{resolvedText(record.fullCareBeds, value => value.toLocaleString('zh-CN') + ' 个')}</p></>}<p className="m-0 break-words">功能定位原标签：{indexText(record, 'functionPositioningLabel')}</p><p className="m-0">平台评价：{card.evaluationText ?? '采集快照未提供'}</p><p className="m-0 break-words sm:col-span-2">平台标签原文（非资质认证）：{indexText(record, 'platformTagsRaw')}</p>{record.listObservationCount > 0 && <p className="m-0 break-all sm:col-span-2">平台列表联系电话原值：{resolvedText(record.listedContactPhone, String)} <span className="text-xs text-sub">（时效待核）</span></p>}</div></details>
                <p className="m-0 mt-auto text-xs text-sub">{csvRecord ? <>CSV 导出记录{csvRecord.collectorStatus === 'stale' ? ' · 采集状态待刷新，请核对官网' : ' · 机构状态未核'}</> : record.listObservationCount === 0 ? '仅详情观察 · 无列表观察' : record.detailPath ? '已采双端点详情' : '仅列表观察 · 尚未采集详情'}</p>
                {record.conflictFields.length > 0 && <p className="m-0 text-xs text-caution">{csvRecord ? '与历史索引有字段差异，详情以 CSV 来源为准。' : record.conflictFields.length + ' 项索引字段观察冲突，待核对。'}</p>}
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#edf0ec] bg-[#fafcfa] px-4 py-2 text-[12px] text-sub sm:px-5"><span className="min-w-0 break-all">平台 ID：{record.mcaId}{csvRecord ? <> · CSV 采集器时间 {csvRecord.csvUpdatedAtLocal}（时区未注明）</> : <> · 列表观察 {record.listObservationCount} 次{record.listObservedAtUtc && <> · 该机构列表最晚采集 <time dateTime={record.listObservedAtUtc.latest}>{record.listObservedAtUtc.latest}</time></>}</>}</span><span className="flex flex-wrap items-center gap-3 whitespace-nowrap">{detailHref && <a href={detailHref} className="font-semibold text-brand-dark no-underline hover:underline">查看机构详情 →</a>}<a href={mcaOfficialDetailHref(record.mcaId)} target="_blank" rel="noopener noreferrer" className="text-brand-dark no-underline hover:underline">官网原页 ↗</a></span></footer>
            </article></li>;
          })}</ul>}
        {result.total > 0 && <DirectoryPager label="平台记录分页" page={result.page} pageCount={result.pageCount} hrefFor={next => sitePath(mcaPublicListHref(selected, next))} />}
    </section>
  </div>;
}

export function McaPublicDirectoryView({ manifest }: { manifest: McaCatalogManifest }) {
  const params = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; records: McaCatalogIndexRecord[] }>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(sitePath('/data/mca-catalog/index.v1.json'), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('平台采集索引读取失败（HTTP ' + response.status + '）。');
      return parseIndex(await response.json(), manifest);
    }).then(index => { if (!controller.signal.aborted) setState({ status: 'ready', records: index.records }); })
      .catch(error => { if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '平台采集索引读取失败。' }); });
    return () => controller.abort();
  }, [manifest.snapshotId, attempt]);
  if (state.status === 'loading') return <ListSkeleton label="正在加载平台采集快照…" />;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button></div>;
  return <McaPublicDirectoryContent records={state.records} manifest={manifest} params={new URLSearchParams(params.toString())} />;
}
