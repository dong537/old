import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { McaCatalogDetailView, McaPublicDetailView } from '@/components/McaPublicDetailView';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';
import { mcaPublicLoader } from '@/lib/mca-public-static';
import { listPublishedInstitutionArticles } from '@/lib/institution-articles';

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return mcaCatalogLoader.getDetailIds().map(id => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const record = mcaCatalogLoader.getRecord(id);
  return record ? {
    title: (record.name ?? '机构观察记录') + ' · 全国养老机构资料',
    description: '查看机构介绍、服务、床位、费用及来源时间；历史采集不代表当前在营、空床或最新报价。',
  } : { title: '未找到平台采集详情' };
}

export default async function McaPublicDetailPage({ params }: Props) {
  const { id } = await params;
  const record = mcaCatalogLoader.getRecord(id);
  if (!record || !record.detailPath) notFound();
  const articles = listPublishedInstitutionArticles(id);
  if (record.sourceKind === 'csv') {
    const detail = mcaCatalogLoader.getCsvDetail(id);
    if (!detail) notFound();
    return <McaCatalogDetailView record={record} detail={detail} manifest={mcaCatalogLoader.getManifest()} articles={articles} />;
  }
  const detail = mcaPublicLoader.getDetail(id);
  if (!detail) notFound();
  return <McaPublicDetailView record={record} detail={detail} manifest={mcaPublicLoader.getManifest()} articles={articles} />;
}
