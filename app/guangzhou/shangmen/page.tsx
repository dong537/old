import { sitePath } from '@/lib/site-path';
import { Suspense } from 'react';
import { ServiceDirectoryView } from '@/components/ServiceDirectoryView';
import { PageTitle } from '@/components/DirectoryUi';
import { serviceCatalog } from '@/lib/services';

export const metadata = {
  title: '广州养老服务公开记录 · 长护险年度考核与公示',
  description: '查找广州市医保发布的长护险年度考核记录与新增定点公示，逐条核对资料日期和官方来源。历史记录不等于当前全量有效名单。',
};

const fallbackRecords = serviceCatalog.records.slice(0, 20);

function LoadingDirectory() {
  return <div className="flex flex-col gap-5">
    <div className="notice"><p>筛选尚未应用；以下显示原始来源前20条记录。</p><p className="mt-2">可<a href={sitePath("/data/guangzhou-services.v1.json")} className="underlink">查看本地整理的公开数据</a>或<a href={sitePath(serviceCatalog.sources[0].url)} className="underlink">查看官方发布页面</a>。</p></div>
    <p>共 <b>{serviceCatalog.records.length}</b> 条公开记录</p>
    <ul aria-label="养老服务公开记录检索结果" className="m-0 flex list-none flex-col gap-3 p-0">{fallbackRecords.map(record => <li key={record.id} className="card p-5"><a href={sitePath(`/guangzhou/shangmen/${record.id}/`)} className="font-semibold">{record.name}</a><p className="mb-0">{record.address ?? '原表未提供地址'}</p></li>)}</ul>
  </div>;
}

export default function ServiceDirectoryPage() {
  return <div className="flex flex-col gap-6">
    <PageTitle title="养老服务公开记录" lead="搜索广州医保公开的年度考核记录与新增定点公示；资料日期和覆盖范围随记录核对。" />
    <Suspense fallback={<LoadingDirectory />}><ServiceDirectoryView catalog={serviceCatalog} /></Suspense>
  </div>;
}
