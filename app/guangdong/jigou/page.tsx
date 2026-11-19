import { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { ProvinceDirectoryView } from '@/components/ProvinceDirectoryView';
import { provinceCatalog } from '@/lib/province-public';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '广东养老相关官方来源记录 · 21市检索',
  description: '按广东21个地级市检索官方来源中的养老相关原文条目，查看证据类型、来源日期和资料期。来源记录不等于独立或当前在营养老机构。',
};

const cities = [...new Set(provinceCatalog.records.map(record => record.city))].sort((a, b) => a.localeCompare(b, 'zh-CN'));

export default function ProvinceDirectoryPage() {
  return <div className="flex flex-col gap-6">
    <PageTitle title="广东养老相关官方来源记录" lead={<>按 21 市查看公开来源中的原文名称条目。每条是待核线索，既不等于独立机构，也不证明当前在营；城市来源覆盖不代表全市全量。</>} />
    <Suspense fallback={<div className="notice"><p>正在加载城市检索。若页面一直没有显示筛选，请启用浏览器 JavaScript 后刷新。</p><p className="mt-2">也可以<a href={sitePath('/data/guangdong-source-records.v1.json')} className="underlink">查看全部公开来源记录 JSON</a>。</p></div>}>
      <ProvinceDirectoryView records={provinceCatalog.records} cities={cities} />
    </Suspense>
    <div className="card p-5 text-[13px] text-sub"><p className="m-0">本站公开快照归档于 <time dateTime={provinceCatalog.archivedAt}>{provinceCatalog.archivedAt}</time>；归档日期不是每条来源的发布日期，也不是机构核验日期。不同城市与不同时期资料不能相加为当前机构总数。</p><a href={sitePath('/data/guangdong-source-records.v1.json')} className="underlink mt-2 inline-block">查看公开记录 JSON</a></div>
  </div>;
}
