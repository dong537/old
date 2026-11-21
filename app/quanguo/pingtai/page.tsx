import React, { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { McaPublicDirectoryView } from '@/components/McaPublicDirectoryView';
import { mcaPublicLoader } from '@/lib/mca-public-static';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '民政部平台采集快照 · 全国养老机构线索',
  description: '按省市和设施类型检索全国养老服务信息平台的部分采集快照。列表与详情覆盖不同，不代表全国全量或当前在营。',
};

export default function McaPublicDirectoryPage() {
  const manifest = mcaPublicLoader.getManifest();
  return <div className="flex flex-col gap-6">
    <PageTitle title="民政部平台采集快照" lead="按地区、名称和设施类型查看已采集的机构记录；详情只展示已取得的来源字段，资料时点以每条快照为准。" />
    <Suspense fallback={<div className="notice" role="status">正在载入平台采集记录…</div>}>
      <McaPublicDirectoryView manifest={manifest} />
    </Suspense>
    <p className="m-0 text-sm text-sub">若列表加载失败，可直接<a href={sitePath('/data/mca-observed/index.v1.json')} className="underlink">查看公开索引 JSON</a>，或到<a href={manifest.sourcePage} target="_blank" rel="noopener noreferrer" className="underlink">全国养老服务信息平台官网</a>查询。</p>
  </div>;
}
