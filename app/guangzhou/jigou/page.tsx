import { sitePath } from '@/lib/site-path';
import { Suspense } from 'react';
import { catalog, districts } from '@/lib/catalog';
import { DirectoryView } from '@/components/DirectoryView';
import { InstitutionList } from '@/components/InstitutionList';
import { PageTitle } from '@/components/DirectoryUi';
import { SourceNote } from '@/components/SourceNote';

export const metadata = { title: '找养老机构 · 按名称、行政区与地址检索' };

export default function DirectoryPage() {
  return <div className="flex flex-col gap-6">
    <PageTitle title="找养老机构" lead={<>广州官方名单收录的养老机构，每家一张档案。可按名称、区或地址检索；<br className="hidden lg:block" />备案床位、电话和预收费标记来自官方快照。</>} />
    <Suspense fallback={<div className="flex flex-col gap-5">
      <div className="notice"><p>正在加载检索功能，以下先显示原表前20家机构，尚未应用筛选条件。</p><p className="mt-2">若筛选一直未出现，请启用浏览器JavaScript后刷新；也可以<a href={sitePath(catalog.source.url)} className="underlink">查看官方名单</a>或<a href={sitePath("/data/guangzhou-institutions.v1.json")} className="underlink">完整公开数据</a>。</p></div>
      <p className="m-0 text-[15px]">共 <b>{catalog.institutions.length}</b> 家 · 原表前20家（未筛选）</p>
      <InstitutionList items={catalog.institutions.slice(0, 20)} />
    </div>}>
      <DirectoryView institutions={catalog.institutions} districts={districts} />
    </Suspense>
    <div className="card p-5"><SourceNote source={catalog.source} detailed /></div>
  </div>;
}
