import { notFound } from 'next/navigation';
import { McaPreviewDetailView } from '@/components/McaPreviewDetailView';
import { mapMcaPreviewDetail } from '@/lib/mca-preview-dto';
import { getMcaPreviewDetail, getMcaPreviewIds } from '@mca-preview-data';

export const metadata = {
  title: '全国平台机构记录 · 本机预览',
  description: '逐字段查看本机已封存的全国养老服务信息平台机构记录及来源。',
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  const ids = getMcaPreviewIds();
  // Next static export rejects an empty parameter list. This reserved ID resolves to 404.
  return (ids.length ? ids : ['unavailable']).map(id => ({ id }));
}

export default async function McaPreviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getMcaPreviewDetail(id);
  if (!data) notFound();
  return <McaPreviewDetailView dto={mapMcaPreviewDetail(data.record, data.detail, data.manifest.snapshotId)} />;
}
