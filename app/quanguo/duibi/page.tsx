import React, { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { McaCompareView } from '@/components/McaCompareView';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';

export const metadata = {
  title: '养老机构对比',
  description: '并排核对所选养老机构的历史费用、平台列示服务和资料来源。',
  robots: { index: false, follow: true },
};

export default function McaComparePage() {
  const manifest = mcaCatalogLoader.getManifest();
  return <div className="mca-compare-page flex min-w-0 flex-col gap-4">
    <PageTitle title="养老机构对比" lead="把 2–3 家放在一起核对。月费、日费和按次费用分开列，不相加、不推算。" />
    <Suspense fallback={<p role="status">正在读取本页已选机构…</p>}>
      <McaCompareView snapshots={{ csv: manifest.snapshotId, observed: manifest.observedSnapshotId }} />
    </Suspense>
  </div>;
}
