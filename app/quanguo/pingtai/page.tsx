import React, { Suspense } from 'react';
import Link from 'next/link';
import { McaPublicDirectoryView } from '@/components/McaPublicDirectoryView';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国养老机构资料 · 按地区、月费与服务查找',
  description: '查询全国养老服务信息平台的部分机构记录与已导入详情。来源为历史采集，不代表全国全量或当前在营。',
};

export default function McaPublicDirectoryPage() {
  const manifest = mcaCatalogLoader.getManifest();
  return <div className="flex min-w-0 flex-col gap-5">
    <nav aria-label="当前位置" className="flex flex-wrap items-center gap-2 text-[13px] text-sub"><span>当前位置：</span><Link href="/" className="no-underline hover:underline">首页</Link><span aria-hidden="true">›</span><span>全国养老机构查询</span></nav>
    <div className="min-w-0"><h1 className="m-0 text-[clamp(25px,2.7vw,32px)] font-semibold leading-snug text-ink">全国养老机构查询</h1><p className="m-0 mt-2 max-w-[900px] text-[14px] leading-6 text-body">先按地区或名称找机构，再用月费上限和平台列示服务缩小范围。每条记录标明资料来源与采集时间。收费、床位和服务请联系机构及官网核对。</p></div>
    <Suspense fallback={<div className="notice" role="status">正在载入平台采集记录…</div>}>
      <McaPublicDirectoryView manifest={manifest} />
    </Suspense>
    <p className="m-0 text-[13px] leading-6 text-sub">若列表加载失败，可直接<a href={sitePath('/data/mca-catalog/index.v1.json')} className="underlink">查看公开索引 JSON</a>，或到<a href="https://yanglao.mca.gov.cn/?#/index/institutionList" target="_blank" rel="noopener noreferrer" className="underlink">全国养老服务信息平台官网</a>查询。</p>
  </div>;
}
