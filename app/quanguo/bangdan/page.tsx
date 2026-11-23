import type { Metadata } from 'next';
import React from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { NationalRankingView } from '@/components/NationalRankingView';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';

export const metadata: Metadata = {
  title: '榜单 · 单项指标与发布条件',
  description: '了解养老机构与上门服务单项榜单的计算口径和发布条件。当前缺少可比报价、回访与报错处理证据，暂不发布排名。',
};

export default function NationalRankingPage() {
  const manifest = mcaCatalogLoader.getManifest();

  return <div className="flex flex-col gap-6">
    <PageTitle
      title="榜单"
      lead="只按可核验的单项事实发布榜单，逐项公开计算方法、资料时段和参与条件；收费、回访或响应证据不充分时不排列机构名次。"
    />
    <NationalRankingView
      snapshotDate={manifest.csvExportDate}
      recordCount={manifest.recordCount}
      csvRowCount={manifest.csvRowCount}
    />
  </div>;
}
