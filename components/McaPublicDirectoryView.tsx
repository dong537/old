'use client';

import { CompareToggle, CompareTray } from './McaCompareControls';
import { RegionalGuideCard } from './RegionalGuideCard';

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { mapMcaPreviewCard } from '@/lib/mca-preview-dto';
import type { McaPreviewResolved } from '@/lib/mca-preview-dto';
import { filterMcaPreviewRecords } from '@/lib/mca-preview-ui';
import { mcaOfficialDetailHref } from '@/lib/mca-preview-ui';
import { mcaPublicDetailHref } from '@/lib/mca-public-ui';
import { directoryBudgets, directoryConditions, directoryFilterLabel, directoryResultsId, directoryServices, filterPublicDirectory, publicDirectoryHref, removeDirectoryFilter, serviceLabels } from './mca-public-directory-filters';
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

function FilterForm({ records, result, idPrefix }: {
  records: readonly McaPublicIndexRecord[]; result: ReturnType<typeof filterPublicDirectory<McaPublicIndexRecord>>; idPrefix: string;
}) {
  const [province, setProvince] = useState(result.selected.province);
  const [city, setCity] = useState(result.selected.city);
  const [type, setType] = useState(result.selected.type);
  const draft = new URLSearchParams();
  if (province) draft.set('province', province);
  if (city) draft.set('city', city);
  const available = filterMcaPreviewRecords(records, draft);
  const field = 'min-w-0';
  const control = 'input mt-1 w-full min-w-0';
  const group = 'm-0 grid min-w-0 grid-cols-1 gap-3 p-0 min-[360px]:grid-cols-2';
  return <form id="directory-filters" action={sitePath('/quanguo/pingtai/#' + directoryResultsId)} method="get" role="search" aria-label="检索民政部平台采集快照" className="grid min-w-0 gap-3">
    <fieldset className={group + ' lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]'}>
      <legend className="mb-3 p-0 text-base font-semibold text-ink">按地区或名称找机构</legend>
      <div className={field}><label htmlFor={idPrefix + '-province'} className="label">省份</label>
        <select id={idPrefix + '-province'} name="province" className={control} value={province} onChange={event => { setProvince(event.target.value); setCity(''); setType(''); }}>
          <option value="">全部省份</option>{result.provinces.map(value => <option key={value} value={value}>{value}</option>)}
        </select></div>
      <div className={field}><label htmlFor={idPrefix + '-city'} className="label">城市 / 地区</label>
        <select id={idPrefix + '-city'} name="city" className={control} value={city} disabled={!province} onChange={event => { setCity(event.target.value); setType(''); }}>
          <option value="">{province ? '全部城市' : '先选省份'}</option>{available.cities.map(value => <option key={value} value={value}>{value}</option>)}
        </select></div>
      <div className={field + ' min-[360px]:col-span-2 lg:col-span-1'}><label htmlFor={idPrefix + '-keyword'} className="label">机构名称或地址</label>
        <input id={idPrefix + '-keyword'} type="search" name="q" defaultValue={result.selected.q} maxLength={80} placeholder="例如：和平养老院" className={control} /></div>
      <button type="submit" className="btn-primary min-h-11 w-full self-end min-[360px]:col-span-2 sm:w-auto lg:col-span-1">查询机构</button>
    </fieldset>
    <details className="directory-more-filters min-w-0 border-t border-line">
      <summary className="w-fit cursor-pointer py-3 text-sm font-semibold text-brand-dark">
        更多筛选 <span className="ml-1 font-normal text-sub">月费、服务、类型</span>
      </summary>
      <fieldset className={group + ' lg:grid-cols-3'}>
        <legend className="sr-only">按费用、服务和类型缩小范围</legend>
        <div className={field}><label htmlFor={idPrefix + '-budget'} className="label">参考月费上限</label>
          <select id={idPrefix + '-budget'} name="budget" defaultValue={result.selected.budget} className={control + ' directory-budget-picker'}>
            <option value="">不限月费</option>{directoryBudgets.map(([value,label]) => <option key={value} value={value}>{value === 'unknown' ? '缺失或待核对' : label.replace('月费上限 ', '')}</option>)}
          </select></div>
        <div className={field}><label htmlFor={idPrefix + '-service'} className="label">平台列示服务</label>
          <select id={idPrefix + '-service'} name="service" defaultValue={result.selected.service} className={control}>
            <option value="">不限服务</option>{directoryServices.map(([value,label]) => <option key={value} value={value}>{value === 'home' ? '上门养老服务' : label}</option>)}
          </select></div>
        <div className={field + ' min-[360px]:col-span-2 lg:col-span-1'}><label htmlFor={idPrefix + '-type'} className="label">原平台设施类型</label>
          <select id={idPrefix + '-type'} name="type" className={control} value={available.types.includes(type) ? type : ''} onChange={event => setType(event.target.value)}>
            <option value="">全部类型</option>{available.types.map(value => <option key={value} value={value}>{value}</option>)}
          </select></div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-sub">月费按完整的历史区间上限筛选。服务按平台原标签筛选，不代表目前仍提供。</p>
        <button type="submit" className="btn-outline min-h-11 w-full sm:w-auto">应用筛选</button>
      </div>
    </details>
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
  const result = filterPublicDirectory(records, params);
  const selected = new URLSearchParams();
  for (const key of directoryConditions) {
    if (result.selected[key]) selected.set(key, result.selected[key]);
  }

  const queryKey = params.toString();
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#' + directoryResultsId) return;
    const target = resultRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [queryKey]);
  const conditions = directoryConditions.flatMap(key => {
    const value = selected.get(key);
    if (!value) return [];
    const label = key === 'budget' || key === 'service' ? directoryFilterLabel(key, value) : value;
    return [{ key, label }];
  });
  return <div className="flex min-w-0 flex-col gap-5">
    <div className="min-w-0 rounded-[4px] bg-white p-3 shadow-[0_2px_9px_rgba(24,47,28,0.05)] sm:p-5">
      <FilterForm key={queryKey} records={records} result={result} idPrefix="mca-public-search" />
    </div>
    {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath('/quanguo/pingtai/')} className="underlink">清除条件</a></div>}
    <p className="m-0 border-l-[3px] border-[#62a64b] bg-white px-4 py-3 text-[13px] leading-6 text-body" role="note">民政部平台的部分采集快照，记录不代表全国全量或当前在营。床位、费用和服务均为来源快照值，请到官网和机构核对。</p>
    <RegionalGuideCard province={result.selected.province} city={result.selected.city} />
    <CompareTray from={publicDirectoryHref(selected, result.page)} />
    <section ref={resultRef} id={directoryResultsId} tabIndex={-1} className="min-w-0 scroll-mt-6 focus:outline-none" aria-label="养老机构查询结果" aria-describedby="directory-result-count">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#dfe5de] pb-3"><div><h2 className="m-0 text-[20px] font-semibold text-ink">养老机构查询</h2><p className="m-0 mt-1 text-[12px] leading-5 text-sub"><ScopeSummary manifest={manifest} /></p></div><p id="directory-result-count" className="m-0 text-sm text-body" role="status">匹配 <strong className="text-[20px] text-brand-dark">{result.total.toLocaleString('zh-CN')}</strong> 条 · 第 {result.page}/{result.pageCount} 页</p><a href="#directory-filters" className="underlink inline-flex min-h-11 items-center text-sm md:ml-auto">修改筛选 ↑</a></div>
        {conditions.length > 0 &&
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-body"><span>当前条件：</span>
            {conditions.map(({ key, label }) => <a key={key} href={sitePath(removeDirectoryFilter(selected, key))}
              aria-label={'移除筛选：' + label} title={'移除 ' + label}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded border border-brand-line bg-brand-tint px-2.5 text-brand-dark no-underline hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
              <span className="min-w-0 break-words">{label}</span><span aria-hidden="true" className="shrink-0 text-base">×</span>
            </a>)}
            <a href={sitePath('/quanguo/pingtai/#' + directoryResultsId)} className="ml-auto inline-flex min-h-11 items-center underline-offset-4 hover:underline">清除条件</a>
          </div>}
        {result.total === 0 ? <div className="card p-6" data-directory-state="empty"><h3 className="m-0 text-lg font-semibold">当前条件未找到记录</h3><p className="mt-2 text-body">试试放宽月费或服务条件，或调整地区、关键词；未采到不代表当地没有机构。</p><a href="#directory-filters" className="btn-primary mr-3">调整筛选</a><a href={sitePath('/quanguo/pingtai/')} className="btn-outline">清除条件</a></div> :
          <ul className="m-0 grid min-w-0 list-none gap-5 p-0 lg:grid-cols-2 lg:gap-6" aria-label="民政部平台采集快照列表">{result.items.map(record => {
            const card = mapMcaPreviewCard(record);
            const services = serviceLabels(record);
            const csvRecord = 'sourceKind' in record && record.sourceKind === 'csv' ? record as Extract<McaCatalogIndexRecord, { sourceKind: 'csv' }> : null;
            const detailHref = record.detailPath ? sitePath(mcaPublicDetailHref(record.mcaId) + '?from=' + encodeURIComponent(publicDirectoryHref(selected, result.page))) : null;
            const feeState = !card.feeText ? 'missing' :
              card.feeText.includes('冲突') || (record.listedMonthlyFeeMin !== null && record.listedMonthlyFeeMax !== null && record.listedMonthlyFeeMin > record.listedMonthlyFeeMax) ? 'conflict' :
              card.feeWarning ? 'zero' : record.listedMonthlyFeeMin === null || record.listedMonthlyFeeMax === null ? 'partial' : 'complete';
            const feeText = feeState === 'missing' ? '价格未提供' : feeState === 'conflict' ? '费用资料有冲突' : card.feeText?.replace('（平台列示）', '');
            const feeHint = { complete: '平台列示 · 历史区间', missing: '采集快照没有可用月费', zero: '含来源原值 0，不代表免费', conflict: '请以机构书面报价为准', partial: '区间不完整，签约前请核对' }[feeState];
            return <li key={record.mcaId} className="min-w-0"><article className="card mca-directory-card flex h-full min-w-0 flex-col overflow-hidden transition-colors hover:border-brand-line">
              <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
                <header className="min-w-0 border-b border-line pb-3">
                  <h3 className="m-0 break-words text-xl font-semibold leading-snug text-ink">{detailHref ? <a href={detailHref} className="text-ink no-underline hover:text-brand">{card.displayName}</a> : card.displayName}</h3>
                  <p className="mb-0 mt-1.5 text-sm text-sub">{card.displayRegion} <span aria-hidden="true">·</span> {card.displayType}</p>
                  <p className="mb-0 mt-1 break-words text-[13px] leading-5 text-body">详细地址：{card.displayAddress}</p>
                </header>
                <div className="grid min-w-0 gap-3 min-[560px]:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
                  <div data-fee-state={feeState} className={'min-w-0 rounded border px-3 py-2.5 ' + (feeState === 'complete' ? 'border-brand-line bg-brand-tint/40' : feeState === 'missing' ? 'border-line bg-page' : 'border-caution-line bg-caution-bg')}>
                    <span className="block text-xs font-medium text-sub">参考月费</span>
                    <p className={'mb-0 mt-1 break-words font-semibold leading-snug ' + (feeState === 'complete' ? 'text-lg text-brand-dark' : 'text-sm text-ink')}>{feeText}</p>
                    <p className="mb-0 mt-1 text-xs leading-5 text-sub">{feeHint}</p>
                    {csvRecord?.collectorStatus === 'stale' && <span className="mt-1 inline-block rounded border border-caution-line px-1.5 text-xs font-semibold text-caution">资料待刷新</span>}
                  </div>
                  <div className="min-w-0 rounded border border-line px-3 py-2.5"><p className="m-0 break-words text-sm leading-6 text-body">平台列表服务类别：{services.length ? services.join('、') : resolvedText(record.serviceCategoryLabel, String)}</p></div>
                </div>
                <div className="min-w-0 border-l-[3px] border-brand-line bg-brand-tint/40 px-3 py-2.5" role="group" aria-label="这家机构的资料来源">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <strong className="text-[13px] text-ink">资料来源：全国养老服务信息平台</strong>
                    <a href={mcaOfficialDetailHref(record.mcaId)} target="_blank" rel="noopener noreferrer" className="underlink inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold">官网原页 ↗</a>
                  </div>
                  <p className="m-0 break-words text-xs leading-5 text-sub">{csvRecord ?
                    <>CSV 采集器时间 <time dateTime={csvRecord.csvUpdatedAtLocal}>{csvRecord.csvUpdatedAtLocal.replace('T', ' ')}</time>（时区未注明）</> :
                    record.listObservedAtUtc ? <>该机构列表最晚采集 <time dateTime={record.listObservedAtUtc.latest}>{record.listObservedAtUtc.latest.replace('T', ' ').slice(0, 16)}</time>（UTC）</> :
                    <>无列表采集时间，请到详情核对采集日期</>}</p>
                  <p className={'mb-0 mt-1 text-xs leading-5 ' + (csvRecord?.collectorStatus === 'stale' ? 'font-semibold text-caution' : 'text-sub')}>
                    {csvRecord ? (csvRecord.collectorStatus === 'stale' ? '资料待刷新 · 非当前报价' : '历史导出 · 机构状态未核') :
                      record.listObservationCount === 0 ? '仅详情观察 · 无列表观察' : record.detailPath ? '历史采集 · 有详情' : '仅列表观察 · 尚未采集详情'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#edf0ec] pt-3 text-[13px] text-body"><p className="m-0">平台列示床位：<strong className="font-medium text-ink">{card.bedsText}</strong></p><p className="m-0">护理型床位：<strong className="font-medium text-ink">{card.nursingBedsText}</strong></p></div>
                <details className="group border-t border-[#edf0ec] pt-2 text-[13px] text-body"><summary className="min-h-9 cursor-pointer list-none content-center font-medium text-brand-dark underline-offset-4 hover:underline focus-visible:outline-brand [&::-webkit-details-marker]:hidden">更多快照字段 <span className="inline-block transition-transform group-open:rotate-180" aria-hidden="true">⌄</span></summary><div className="grid gap-x-4 gap-y-2 pb-2 sm:grid-cols-2">{!csvRecord && <p className="m-0">星级原码：{card.starText ?? '采集快照未提供'}</p>}{(csvRecord || record.listObservationCount > 0) && <>{!csvRecord && <p className="m-0">补贴原码：{resolvedText(record.subsidyCode, String)}</p>}<p className="m-0">平台列示日托床位：{resolvedText(record.dayCareBeds, value => value.toLocaleString('zh-CN') + ' 个')}</p><p className="m-0">平台列示全托床位：{resolvedText(record.fullCareBeds, value => value.toLocaleString('zh-CN') + ' 个')}</p></>}<p className="m-0 break-words">功能定位原标签：{indexText(record, 'functionPositioningLabel')}</p><p className="m-0">平台评价：{card.evaluationText ?? '采集快照未提供'}</p><p className="m-0 break-words sm:col-span-2">平台标签原文（非资质认证）：{indexText(record, 'platformTagsRaw')}</p>{record.listObservationCount > 0 && <p className="m-0 break-all sm:col-span-2">平台列表联系电话原值：{resolvedText(record.listedContactPhone, String)} <span className="text-xs text-sub">（时效待核）</span></p>}</div></details>
                {record.conflictFields.length > 0 && <p className="m-0 text-xs text-caution">{csvRecord ? '与历史索引有字段差异，详情以 CSV 来源为准。' : record.conflictFields.length + ' 项索引字段观察冲突，待核对。'}</p>}
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#edf0ec] bg-[#fafcfa] px-4 py-2 text-[12px] text-sub sm:px-5"><span className="min-w-0 break-all">平台 ID：{record.mcaId}</span><span className="flex flex-wrap items-center gap-3 whitespace-nowrap"><CompareToggle pick={{ id: record.mcaId, name: card.displayName, source: csvRecord ? 'csv' : 'observed', detailPath: record.detailPath, observedAt: csvRecord?.csvUpdatedAtLocal ?? record.listObservedAtUtc?.latest ?? null }} />{detailHref && <a href={detailHref} className="font-semibold text-brand-dark no-underline hover:underline">查看机构详情 →</a>}</span></footer>
            </article></li>;
          })}</ul>}
        {result.total > 0 && <DirectoryPager label="平台记录分页" page={result.page} pageCount={result.pageCount} hrefFor={next => sitePath(publicDirectoryHref(selected, next))} />}
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
  if (state.status === 'loading') return <div data-directory-state="loading" aria-busy="true"><p className="notice">正在读取机构目录。筛选条件会保留，加载后会显示匹配机构。</p><ListSkeleton label="正在加载平台采集快照…" /></div>;
  if (state.status === 'error') return <div className="notice" role="alert" data-directory-state="error">
    <p className="m-0 font-semibold">这次没能加载机构目录</p><p className="mb-0 mt-1 text-sm text-body">可以重试，原筛选条件会保留。也可以先去官方平台查找。</p>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className="btn-primary" onClick={() => setAttempt(value => value + 1)}>重试加载</button>
    <a href="https://yanglao.mca.gov.cn/?#/index/institutionList" className="underlink inline-flex min-h-11 items-center" target="_blank" rel="noopener noreferrer">查看官方平台 ↗</a></div>
    <details className="mt-3 text-sm"><summary className="cursor-pointer">查看加载错误</summary><p className="m-0 mt-2 break-words">{state.message}</p></details>
  </div>;
  return <McaPublicDirectoryContent records={state.records} manifest={manifest} params={new URLSearchParams(params.toString())} />;
}
