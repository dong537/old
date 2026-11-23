import React, { Suspense } from 'react';
import { PageTitle, SectionTitle } from '@/components/DirectoryUi';
import { PriceReferenceContent, PriceReferenceView } from '@/components/PriceReferenceView';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';
import { buildPriceReference, priceReferenceHref } from '@/lib/price-reference';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国养老机构价格参考',
  description: '按地区查看全国养老服务信息平台已收录机构的月总费用区间，逐条核对资料时间和官网来源；仅为已采集样本，不是当地行情或成交价。',
};

export default function PriceReferencePage() {
  const manifest = mcaCatalogLoader.getManifest();
  const data = buildPriceReference(mcaCatalogLoader.getIndex().records);
  return <div className="flex min-w-0 flex-col gap-6">
    <PageTitle title="全国养老机构价格参考" lead="先按地区查看机构公开列示的月总费用，再打开详情核对服务内容和收费组成。这里是已采集资料中的费用区间，不是成交价，也不代表当地全部机构的行情。" extra={<a href="#price-method" className="underlink text-sm">数据怎么来的？</a>} />
    <div className="notice"><p className="m-0">资料导出日期：<time dateTime={manifest.csvExportDate}>{manifest.csvExportDate}</time>。当前月费样本来自北京市、天津市、河北省、山西省、内蒙古自治区，尚不覆盖全国。费用可能随房型、照护需求和服务项目变化，签约前请以机构书面报价为准。</p></div>
    <section aria-labelledby="price-samples-title" className="flex flex-col gap-3">
      <SectionTitle id="price-samples-title" title="按地区查看月费样本" extra={<>共 {data.records.length.toLocaleString('zh-CN')} 条完整月费区间 · {data.provinces.length} 个省级地区</>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{data.provinces.map(province => <a key={province.name} href={sitePath(priceReferenceHref(new URLSearchParams({ province: province.name })))} className="card flex min-w-0 flex-col gap-1 p-4 text-ink no-underline hover:border-brand"><span className="text-sm text-sub">{province.name}</span><strong className="text-xl">{province.count.toLocaleString('zh-CN')} 条</strong><span className="text-xs text-sub">已列示月总费 · 查看明细 →</span></a>)}</div>
    </section>
    <Suspense fallback={<PriceReferenceContent data={data} query="" />}><PriceReferenceView data={data} /></Suspense>
    <section id="price-method" className="section" aria-labelledby="price-method-title">
      <SectionTitle id="price-method-title" title="数据来源与计算方法" />
      <dl className="m-0 grid gap-5 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">来源与日期</dt><dd className="mb-0 ml-0 mt-1 text-body">全国养老服务信息平台的已导出详情，导出日期 {manifest.csvExportDate}。每条明细保留采集器记录时间和官网原页；采集时间不等于机构调价或资料发布日期。</dd></div>
        <div><dt className="font-semibold">样本如何计数</dt><dd className="mb-0 ml-0 mt-1 text-body">在 {data.csvRecordCount.toLocaleString('zh-CN')} 条 CSV 机构记录中，按平台 ID 逐家计数，仅纳入上下限完整、非负且上限不低于下限的月总费，共 {data.records.length.toLocaleString('zh-CN')} 条。另有 {data.unavailableCount.toLocaleString('zh-CN')} 条未提供可用完整区间，不补零、不纳入本页。</dd></div>
        <div><dt className="font-semibold">零值与待刷新资料</dt><dd className="mb-0 ml-0 mt-1 text-body">{data.zeroRangeCount} 条来源为 0–0，按原值显示，不代表免费；{data.staleRangeCount} 条月费样本的采集状态为待刷新，已逐条标注。其他记录也未核验为当前报价或在营状态。</dd></div>
        <div><dt className="font-semibold">可以比较什么</dt><dd className="mb-0 ml-0 mt-1 text-body">本页只比较同单位的月总费用（元/月），不把床位、护理和膳食费用相加，不推算照护档位或市场中位价。分项费用可在机构详情中核对；上门按次费、日托日费不混入月费。</dd></div>
      </dl>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-hair pt-4 text-sm"><a href={sitePath('/quanguo/pingtai/')} className="underlink">查看机构目录</a><a href="https://yanglao.mca.gov.cn/#/index/institutionList" target="_blank" rel="noopener noreferrer" className="underlink">全国养老服务信息平台官网 ↗</a><a href={sitePath('/rules/')} className="underlink">本站来源与方法</a></div>
    </section>
  </div>;
}
