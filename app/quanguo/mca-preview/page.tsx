import { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { McaPreviewDirectoryView } from '@/components/McaPreviewDirectoryView';
import { mapMcaPreviewCard } from '@/lib/mca-preview-dto';
import { getMcaPreviewCatalog } from '@mca-preview-data';

export const metadata = {
  title: '全国养老服务信息平台 · 已观察记录（本机预览）',
  description: '仅在本机查看已封存的全国养老服务信息平台采集快照；不是全国全量或实时在营机构名录。',
  robots: { index: false, follow: false },
};

export default function McaPreviewPage() {
  const catalog = getMcaPreviewCatalog();
  if (!catalog) return <div className="flex flex-col gap-5">
    <PageTitle title="全国平台已观察记录" lead="本机采集快照尚未生成，或当前不是私有开发预览。" />
    <div className="notice" role="status">请先运行私有 JSON 清洗命令，再通过本机开发预览查看。公开站点不会展示未经发布核验的采集原件。</div>
  </div>;

  const { manifest, index } = catalog;
  const capturedAt = manifest.sourceSnapshots.reduce((latest, source) =>
    (source.capturedAtUtc ?? '') > latest ? source.capturedAtUtc ?? '' : latest, '');
  return <div className="flex flex-col gap-5">
    <PageTitle title="全国平台已观察记录" lead="检索已采集的机构记录并核对来源；历史快照不代表全国全量或实时在营。" />
    <Suspense fallback={<div className="notice" role="status">正在载入本机观察记录筛选…</div>}>
      <McaPreviewDirectoryView records={index.records.map(mapMcaPreviewCard)} snapshotId={manifest.snapshotId} capturedAt={capturedAt || null}
        withDetailCount={manifest.withDetailCount} fieldPathCount={manifest.fieldPathCount} />
    </Suspense>
  </div>;
}
