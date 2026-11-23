import React, { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { McaPublicDirectoryView } from '@/components/McaPublicDirectoryView';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国养老机构资料 · 按地区、名称和设施类型查找',
  description: '查询全国养老服务信息平台的部分机构记录与已导入详情。来源为历史采集，不代表全国全量或当前在营。',
};

export default function McaPublicDirectoryPage() {
  const manifest = mcaCatalogLoader.getManifest();
  return <div className="flex flex-col gap-6">
    <PageTitle title="全国养老机构资料" lead="按地区、名称和设施类型查找机构；详情展示已取得的来源字段，收费、床位和服务请联系机构及官网核对。" />
    <Suspense fallback={<div className="notice" role="status">正在载入平台采集记录…</div>}>
      <McaPublicDirectoryView manifest={manifest} />
    </Suspense>
    <p className="m-0 text-sm text-sub">若列表加载失败，可直接<a href={sitePath('/data/mca-catalog/index.v1.json')} className="underlink">查看公开索引 JSON</a>，或到<a href="https://yanglao.mca.gov.cn/?#/index/institutionList" target="_blank" rel="noopener noreferrer" className="underlink">全国养老服务信息平台官网</a>查询。</p>
  </div>;
}
