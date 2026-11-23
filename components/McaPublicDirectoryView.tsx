'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { mapMcaPreviewCard } from '@/lib/mca-preview-dto';
import type { McaPreviewResolved } from '@/lib/mca-preview-dto';
import { filterMcaPreviewRecords } from '@/lib/mca-preview-ui';
import { mcaOfficialDetailHref } from '@/lib/mca-preview-ui';
import { mcaPublicDetailHref, mcaPublicListHref } from '@/lib/mca-public-ui';
import type { McaCatalogIndex, McaCatalogIndexRecord, McaCatalogManifest } from '@/lib/mca-catalog-types';
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
  const draft = new URLSearchParams();
  if (province) draft.set('province', province);
  if (city) draft.set('city', city);
  const available = filterMcaPreviewRecords(records, draft);
  return <form action={sitePath('/quanguo/pingtai/')} method="get" className="flex flex-col gap-3">
    {result.selected.q && <input type="hidden" name="q" value={result.selected.q} />}
    <label htmlFor={idPrefix + '-province'} className="text-sm font-semibold">省份</label>
    <select id={idPrefix + '-province'} name="province" className="field" value={province} onChange={event => { setProvince(event.target.value); setCity(''); }}>
      <option value="">全部已采地区</option>{result.provinces.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    <label htmlFor={idPrefix + '-city'} className="text-sm font-semibold">城市</label>
    <select id={idPrefix + '-city'} name="city" className="field" value={city} disabled={!province} onChange={event => setCity(event.target.value)}>
      <option value="">全部已采城市</option>{available.cities.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    <label htmlFor={idPrefix + '-type'} className="text-sm font-semibold">原平台设施类型</label>
    <select id={idPrefix + '-type'} name="type" className="field" defaultValue={available.types.includes(result.selected.type) ? result.selected.type : ''}>
      <option value="">全部类型</option>{available.types.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    <button type="submit" className="btn-primary">应用筛选</button>
    <a href={sitePath('/quanguo/pingtai/')} className="btn-ghost">清除条件</a>
  </form>;
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
    <p className="m-0 text-sm text-body" role="note">民政部平台的部分采集快照，记录不代表全国全量或当前在营。床位、费用和服务均为来源快照值，请到官网和机构核对。</p>
    <p className="m-0 text-[13px] text-sub">{'csvRowCount' in manifest ? <>收录 {manifest.recordCount.toLocaleString('zh-CN')} 个不重复平台 ID · 其中 CSV 导入 {manifest.csvRowCount.toLocaleString('zh-CN')} 条 · 可查看 {manifest.detailCount.toLocaleString('zh-CN')} 条详情 · CSV 导出日期 {manifest.csvExportDate}</> : <>已观察 {manifest.recordCount.toLocaleString('zh-CN')} 个平台 ID · 已采集 {manifest.withDetailCount.toLocaleString('zh-CN')} 条双端点详情 · 本批次最晚采集时间 <time dateTime={manifest.snapshotCapturedAtUtc}>{manifest.snapshotCapturedAtUtc}</time></>}</p>
    <form action={sitePath('/quanguo/pingtai/')} method="get" role="search" aria-label="检索民政部平台采集快照" className="filter-panel flex flex-col gap-3 sm:flex-row sm:items-end">
      {result.selected.province && <input type="hidden" name="province" value={result.selected.province} />}
      {result.selected.city && <input type="hidden" name="city" value={result.selected.city} />}
      {result.selected.type && <input type="hidden" name="type" value={result.selected.type} />}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5"><label htmlFor="mca-public-keyword" className="text-sm font-semibold">机构名称或地址</label><input id="mca-public-keyword" type="search" name="q" defaultValue={result.selected.q} maxLength={80} placeholder="输入机构名称或地址" className="field" /></div>
      <button type="submit" className="btn-primary shrink-0">检索</button>
    </form>
    {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath('/quanguo/pingtai/')} className="underlink">清除条件</a></div>}
    <div className="directory-workspace">
      <aside className="directory-sidebar hidden lg:block" aria-label="平台快照筛选"><div className="filter-panel"><h2 className="m-0 mb-4 text-base font-semibold">筛选观察记录</h2><FilterForm key={'desktop-' + params.toString()} records={records} params={params} idPrefix="mca-public-desktop" /></div></aside>
      <div className="directory-results">
        <details className="filter-panel lg:hidden"><summary className="cursor-pointer font-semibold">按地区和设施类型筛选</summary><div className="mt-4"><FilterForm key={'mobile-' + params.toString()} records={records} params={params} idPrefix="mca-public-mobile" /></div></details>
        <div className="results-heading"><h2 className="m-0 text-lg font-semibold">平台采集记录</h2><p className="m-0 text-sm text-sub" role="status">匹配 {result.total.toLocaleString('zh-CN')} 条 · 第 {result.page}/{result.pageCount} 页</p></div>
        {result.total === 0 ? <div className="card p-6"><h3 className="m-0 text-lg font-semibold">当前条件未找到记录</h3><p className="mt-2 text-body">缩短关键词或调整地区；未采到不代表当地没有机构。</p><a href={sitePath('/quanguo/pingtai/')} className="btn-outline">清除条件</a></div> :
          <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="民政部平台采集快照列表">{result.items.map(record => {
            const card = mapMcaPreviewCard(record);
            const csvRecord = 'sourceKind' in record && record.sourceKind === 'csv' ? record as McaCatalogIndexRecord : null;
            const detailHref = record.detailPath ? sitePath(mcaPublicDetailHref(record.mcaId) + '?from=' + encodeURIComponent(mcaPublicListHref(selected, result.page))) : null;
            return <li key={record.mcaId}><article className="record-card">
              <div className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="m-0 min-w-0 break-words text-lg font-semibold leading-snug">{detailHref ? <a href={detailHref} className="text-ink no-underline hover:text-brand">{card.displayName}</a> : card.displayName}</h3><span className="tag">{card.displayType}</span></div>
                <p className="m-0 text-sm text-body">{card.displayRegion}</p><p className="m-0 break-words text-sm text-body">详细地址：{card.displayAddress}</p>
                <div className="grid gap-x-6 gap-y-2 border-t border-hair pt-3 text-sm text-body sm:grid-cols-2"><p className="m-0">平台列示床位：{card.bedsText}</p><p className="m-0">护理型床位：{card.nursingBedsText}</p><p className="m-0">月费用：{card.feeText ?? '采集快照未提供'}</p>{!csvRecord && <p className="m-0">星级原码：{card.starText ?? '采集快照未提供'}</p>}{(csvRecord || record.listObservationCount > 0) && <><p className="m-0">平台列表服务类别：{resolvedText(record.serviceCategoryLabel, String)}</p>{!csvRecord && <p className="m-0">补贴原码：{resolvedText(record.subsidyCode, String)}</p>}<p className="m-0">平台列示日托床位：{resolvedText(record.dayCareBeds, value => value.toLocaleString('zh-CN') + ' 个')}</p><p className="m-0">平台列示全托床位：{resolvedText(record.fullCareBeds, value => value.toLocaleString('zh-CN') + ' 个')}</p></>}</div>
                <div className="grid gap-x-6 gap-y-2 text-sm text-body sm:grid-cols-2"><p className="m-0 break-words">功能定位原标签：{indexText(record, 'functionPositioningLabel')}</p><p className="m-0 break-words">平台评价：{card.evaluationText ?? '采集快照未提供'}</p></div>
                <p className="m-0 break-words text-sm text-body">平台标签原文（非资质认证）：{indexText(record, 'platformTagsRaw')}</p>
                {record.listObservationCount > 0 && <p className="m-0 break-all text-sm text-body">平台列表联系电话原值：{resolvedText(record.listedContactPhone, String)} <span className="text-xs text-sub">（时效待核）</span></p>}
                <p className="m-0 text-xs text-sub">{csvRecord ? <>CSV 导出记录{csvRecord.collectorStatus === 'stale' ? ' · 采集状态待刷新，请核对官网' : ' · 机构状态未核'}</> : record.listObservationCount === 0 ? '仅详情观察 · 无列表观察' : record.detailPath ? '已采双端点详情' : '仅列表观察 · 尚未采集详情'}</p>
                {record.conflictFields.length > 0 && <p className="m-0 text-xs text-caution">{csvRecord ? '与历史索引有字段差异，详情以 CSV 来源为准。' : record.conflictFields.length + ' 项索引字段观察冲突，待核对。'}</p>}
              </div>
              <footer className="record-evidence"><span>平台 ID：{record.mcaId}{csvRecord ? <> · CSV 采集器时间 {csvRecord.csvUpdatedAtLocal}（时区未注明）</> : <> · 列表观察 {record.listObservationCount} 次{record.listObservedAtUtc && <> · 该机构列表最晚采集 <time dateTime={record.listObservedAtUtc.latest}>{record.listObservedAtUtc.latest}</time></>}</>}</span><span className="flex flex-wrap gap-3">{detailHref && <a href={detailHref}>查看机构详情 →</a>}<a href={mcaOfficialDetailHref(record.mcaId)} target="_blank" rel="noopener noreferrer">打开官网原页 ↗</a></span></footer>
            </article></li>;
          })}</ul>}
        {result.total > 0 && <DirectoryPager label="平台记录分页" page={result.page} pageCount={result.pageCount} hrefFor={next => sitePath(mcaPublicListHref(selected, next))} />}
      </div>
    </div>
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
