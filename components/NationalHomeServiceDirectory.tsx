'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DirectoryPager } from './DirectoryUi';
import { filterHomeServices, homeServiceListHref, type NationalHomeServiceCatalog } from '@/lib/national-home-services';
import { mcaOfficialDetailHref, mcaPublicDetailHref } from '@/lib/mca-public-ui';
import { sitePath } from '@/lib/site-path';

export function NationalHomeServiceContent({ catalog, query }: { catalog: NationalHomeServiceCatalog; query: string }) {
  const result = filterHomeServices(catalog.records, new URLSearchParams(query));
  const [province, setProvince] = useState(result.selected.province);
  const [city, setCity] = useState(result.selected.city);
  const cities = filterHomeServices(catalog.records, new URLSearchParams(province ? { province } : {})).cities;
  const returnHref = homeServiceListHref(result.selected, result.page);
  const unknownFilters = [
    ...(province && !result.provinces.includes(province) ? [province] : []),
    ...(city && !cities.includes(city) ? [city] : []),
    ...(result.selected.item && !result.projects.includes(result.selected.item) ? [result.selected.item] : []),
  ];
  return <div className="flex min-w-0 flex-col gap-5">
    <div className="notice flex flex-col gap-2" role="note">
      <p className="m-0">全国查找入口，目前可筛选的资料来自{catalog.provinces.join('、')}，共 {catalog.records.length.toLocaleString('zh-CN')} 家列有上门／居家类别或上门项目的机构，尚不覆盖全国全部上门服务商。</p>
      <p className="m-0 text-sm">机构所在地不等于上门服务范围；项目、服务时间、收费及当前接单情况请向机构核对。来源：全国养老服务信息平台 · CSV 导出日期 <time dateTime={catalog.exportDate}>{catalog.exportDate}</time>。</p>
    </div>
    <form action={sitePath('/quanguo/shangmen/')} method="get" role="search" aria-label="筛选上门养老服务" className="filter-panel grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-4"><label htmlFor="home-service-q" className="text-sm font-semibold">机构名称、地址或服务项目</label><input id="home-service-q" type="search" name="q" defaultValue={result.selected.q} maxLength={80} className="field" placeholder="例如：生活照料、健康管理或机构名称" /></div>
      <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="home-service-province" className="text-sm font-semibold">省份</label><select id="home-service-province" name="province" className="field" value={province} onChange={event => { setProvince(event.target.value); setCity(''); }}><option value="">全部已采省份</option>{province && !result.provinces.includes(province) && <option value={province}>{province}（当前资料无记录）</option>}{result.provinces.map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="home-service-city" className="text-sm font-semibold">城市／区县</label><select id="home-service-city" name="city" className="field" value={city} onChange={event => setCity(event.target.value)} disabled={!province}><option value="">全部已采城市／区县</option>{city && !cities.includes(city) && <option value={city}>{city}（当前资料无记录）</option>}{cities.map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="home-service-item" className="text-sm font-semibold">服务项目</label><select id="home-service-item" name="item" className="field" defaultValue={result.selected.item}><option value="">全部列示项目</option>{result.selected.item && !result.projects.includes(result.selected.item) && <option value={result.selected.item}>{result.selected.item}（当前资料无记录）</option>}{result.projects.map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="flex flex-wrap items-end gap-2"><button type="submit" className="btn-primary">查找服务</button><a className="btn-outline" href={sitePath('/quanguo/shangmen/')}>清除条件</a></div>
    </form>
    {unknownFilters.length > 0 && <p className="notice m-0 text-sm" role="status">已保留链接中的筛选条件：{unknownFilters.join('、')}。当前资料无对应记录，可调整筛选或清除条件。</p>}
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="m-0 text-lg font-semibold">上门养老服务线索</h2><p className="m-0 text-sm text-sub" role="status">共 {result.total.toLocaleString('zh-CN')} 家 · 按机构名称排序</p></div>
    {result.total === 0 ? <div className="card p-6"><h3 className="m-0 text-lg font-semibold">没有符合条件的记录</h3><p className="mt-2 text-body">试着缩短关键词或调整地区。未收录不代表当地没有上门服务。</p><a className="btn-outline" href={sitePath('/quanguo/shangmen/')}>清除条件</a></div> : <ul aria-label="上门养老服务线索" className="m-0 flex list-none flex-col gap-3 p-0">
      {result.items.map(record => {
        const detailHref = sitePath(mcaPublicDetailHref(record.id) + '?from=' + encodeURIComponent(returnHref) + '#mca-public-service');
        return <li key={record.id}><article className="record-card"><div className="flex min-w-0 flex-col gap-3 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="m-0 min-w-0 break-words text-lg font-semibold leading-snug"><a className="text-ink no-underline hover:text-brand" href={detailHref}>{record.name}</a></h3><span className="tag shrink-0">机构提供的服务线索</span></div><p className="m-0 text-sm text-body">{record.area}</p><p className="m-0 break-words text-sm text-body">地址：{record.address ?? '来源未提供'}</p>
          <dl className="m-0 grid gap-3 border-t border-hair pt-3 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]"><dt className="text-sub">上门服务项目</dt><dd className="m-0 flex flex-wrap gap-2">{record.projects.length ? record.projects.map(project => <span className="tag" key={project}>{project}</span>) : '来源未提供具体项目，请联系机构确认'}</dd><dt className="text-sub">类别依据</dt><dd className="m-0 break-words">{record.categories.length ? record.categories.join('、') : '上门服务项目栏有记录，服务类别未列示上门／居家'}</dd></dl>
          <p className="m-0 text-xs text-sub">{record.collectorStatus === 'stale' ? '采集状态待刷新，需核对官网。' : ''}本页未核验当前服务能力、长护险定点资格或可约时间。</p>
        </div><footer className="record-evidence"><span>资料采集器时间 {record.updatedAtLocal}（时区未注明）</span><span className="flex flex-wrap gap-3"><a href={detailHref}>查看服务与联系信息 →</a><a href={mcaOfficialDetailHref(record.id)} target="_blank" rel="noopener noreferrer">官网原页 ↗</a></span></footer></article></li>;
      })}
    </ul>}
    <DirectoryPager label="上门服务分页" page={result.page} pageCount={result.pageCount} hrefFor={page => sitePath(homeServiceListHref(result.selected, page))} />
    <section className="card flex flex-col gap-2 p-5" aria-labelledby="home-service-method"><h2 id="home-service-method" className="m-0 text-lg font-semibold">收录口径与相关资料</h2><p className="m-0 text-sm text-body">只收录本批 CSV 中“服务类别”明示上门／居家，或“上门服务项目”有内容的机构。未根据机构名称、长护险标签或零元收费推断其能力，也不把未提供的收费写成免费。使用前请核对服务地址、人员、项目、价格和合同。</p><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><a href={sitePath('/quanguo/changhuxian/')}>长护险指南 →</a><a href={sitePath('/guangzhou/shangmen/')}>广州医保历史考核与公示记录 →</a><a href={sitePath('/quanguo/pingtai/')}>全部已收录机构资料 →</a></div></section>
  </div>;
}

export function NationalHomeServiceDirectory({ catalog }: { catalog: NationalHomeServiceCatalog }) {
  const searchParams = useSearchParams();
  return <NationalHomeServiceContent key={searchParams.toString()} catalog={catalog} query={searchParams.toString()} />;
}
