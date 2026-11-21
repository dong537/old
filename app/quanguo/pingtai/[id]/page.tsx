import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { McaPublicDetailView } from '@/components/McaPublicDetailView';
import { mcaPublicLoader } from '@/lib/mca-public-static';

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return mcaPublicLoader.getDetailIds().map(id => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const record = mcaPublicLoader.getIndex().records.find(item => item.mcaId === id && item.detailPath !== null);
  return record ? {
    title: (record.name ?? '机构观察记录') + ' · 民政部平台采集快照',
    description: '查看已采集的机构介绍、服务、床位、费用与逐字段来源状态；历史快照不代表当前在营或最新报价。',
  } : { title: '未找到平台采集详情' };
}

export default async function McaPublicDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = mcaPublicLoader.getDetail(id);
  const record = mcaPublicLoader.getIndex().records.find(item => item.mcaId === id);
  if (!detail || !record) notFound();
  return <McaPublicDetailView record={record} detail={detail} manifest={mcaPublicLoader.getManifest()} />;
}
