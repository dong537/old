'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DirectoryPager, Empty } from './DirectoryUi';
import { filterPriceReference, priceRangeText, priceReferenceHref, type PriceReferenceDataset, type PriceReferenceRecord } from '@/lib/price-reference';
import { mcaOfficialDetailHref, mcaPublicDetailHref } from '@/lib/mca-public-ui';
import { sitePath } from '@/lib/site-path';

function PriceFilters({ records, params }: { records: readonly PriceReferenceRecord[]; params: URLSearchParams }) {
  const initialProvince = params.get('province') ?? '';
  const initialCity = params.get('city') ?? '';
  const [province, setProvince] = useState(initialProvince);
  const [city, setCity] = useState(initialCity);
  useEffect(() => { setProvince(initialProvince); setCity(initialCity); }, [initialProvince, initialCity]);
  const provinces = [...new Set(records.map(record => record.province))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const cities = [...new Set(records.filter(record => !province || record.province === province).map(record => record.city).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return <form action={sitePath('/quanguo/jiage/')} method="get" className="filter-panel grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end" role="search" aria-label="筛选机构月费记录">
    <div><label className="label" htmlFor="price-keyword">机构名称或地址</label><input id="price-keyword" name="q" className="input" maxLength={80} defaultValue={params.get('q') ?? ''} placeholder="输入机构名称、区县或地址" /></div>
    <div><label className="label" htmlFor="price-province">省级地区</label><select id="price-province" name="province" className="input" value={province} onChange={event => { setProvince(event.target.value); setCity(''); }}>
      <option value="">已收录地区</option>{initialProvince && !provinces.includes(initialProvince) && <option value={initialProvince}>{initialProvince}（暂无月费记录）</option>}{provinces.map(value => <option key={value} value={value}>{value}</option>)}
    </select></div>
    <div><label className="label" htmlFor="price-city">城市 / 辖区</label><select id="price-city" name="city" className="input" value={city} onChange={event => setCity(event.target.value)}>
      <option value="">全部城市 / 辖区</option>{city && !cities.includes(city) && <option value={city}>{city}（暂无月费记录）</option>}{cities.map(value => <option key={value} value={value}>{value}</option>)}
    </select></div>
    <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" type="submit">查询月费</button><a href={sitePath('/quanguo/jiage/')} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">清除筛选</a></div>
  </form>;
}

export function PriceReferenceContent({ data, query }: { data: PriceReferenceDataset; query: string }) {
  const params = new URLSearchParams(query);
  const result = filterPriceReference(data.records, params);
  const returnHref = priceReferenceHref(params, result.page);
  return <div className="flex min-w-0 flex-col gap-5">
    <PriceFilters records={data.records} params={params} />
    <div className="results-heading"><h2 className="m-0 text-lg">机构月费明细</h2><p className="m-0 text-sm text-sub" role="status" aria-live="polite">找到 {result.total.toLocaleString('zh-CN')} 条{result.zeroRangeCount > 0 && <> · 其中 {result.zeroRangeCount} 条为来源 0–0 原值</>}</p></div>
    {result.total === 0 ? <Empty><p className="m-0">没有符合条件的月费记录。</p><p className="mb-0 mt-2 text-sm">试试缩短关键词，或<a href={sitePath('/quanguo/jiage/')} className="underlink">清除筛选</a>查看已收录样本。没有记录不代表当地没有机构。</p></Empty> : <>
      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6 border-b border-line px-5 pb-2 text-[13px] font-semibold text-sub lg:grid" aria-hidden="true"><span>机构与地区</span><span>平台列示月总费用</span><span>资料时间与来源</span></div>
      <ul className="m-0 grid list-none gap-3 p-0">{result.records.map(record => <li key={record.id}><article className="card grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0"><h3 className="m-0 text-base leading-7"><a href={sitePath(mcaPublicDetailHref(record.id) + '?' + new URLSearchParams({ from: returnHref }).toString())} className="text-ink no-underline hover:text-brand">{record.name}</a></h3><p className="mb-0 mt-1 text-sm text-sub">{record.region}</p><p className="mb-0 mt-1 text-sm text-body">{record.address ?? '来源未列示详细地址'}</p></div>
        <div className="min-w-0 border-t border-hair pt-3 lg:border-0 lg:pt-0"><p className="mb-1 mt-0 text-xs text-sub lg:sr-only">平台列示月总费用</p><p className="m-0 text-lg font-semibold text-brand-ink">{priceRangeText(record.min, record.max)}</p><p className="mb-0 mt-1 text-xs leading-5 text-sub">费用组成与适用照护需求请向机构确认。</p></div>
        <div className="min-w-0 border-t border-hair pt-3 text-xs text-sub lg:border-0 lg:pt-0"><p className="m-0 leading-5">采集器记录时间：<time>{record.updatedAt}</time>（时区未注明）</p>{record.needsRefresh && <p className="mb-0 mt-1 font-medium text-caution">资料待刷新，请优先核对官网。</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm"><a href={sitePath(mcaPublicDetailHref(record.id) + '?' + new URLSearchParams({ from: returnHref }).toString())} className="inline-flex min-h-11 items-center">查看详情 →</a><a href={mcaOfficialDetailHref(record.id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center">官网原页 ↗</a></div></div>
      </article></li>)}</ul>
      <DirectoryPager label="价格参考分页" page={result.page} pageCount={result.pageCount} hrefFor={page => sitePath(priceReferenceHref(params, page))} hint="每页 20 条 · 按来源索引顺序" />
    </>}
  </div>;
}

export function PriceReferenceView({ data }: { data: PriceReferenceDataset }) {
  const params = useSearchParams();
  return <PriceReferenceContent key={params.toString()} data={data} query={params.toString()} />;
}
