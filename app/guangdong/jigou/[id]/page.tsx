import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { QccCandidateLinks } from '@/components/QccCandidateLinks';
import { ProvinceCoverageNote } from '@/components/ProvinceCoverageNote';
import { ProvinceReturnToList } from '@/components/ProvinceReturnToList';
import { ProvinceSourceLink } from '@/components/ProvinceSourceLink';
import { SectionTitle } from '@/components/DirectoryUi';
import { ProfileToc, type ProfileTocItem } from '@/components/ProfileToc';
import { provinceCatalog } from '@/lib/province-public';
import { sitePath } from '@/lib/site-path';

export const dynamicParams = false;
export function generateStaticParams() { return provinceCatalog.records.map(record => ({ id: record.id })); }

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const record = provinceCatalog.records.find(item => item.id === id);
  return record ? {
    title: record.name + ' · 全国官方来源记录',
    description: record.city + '公开来源中的原文名称条目；展示证据类型、来源日期和原始链接，不作为当前在营或登记身份的证明。',
  } : { title: '未找到来源记录' };
}

export default async function ProvinceRecordPage({ params }: Props) {
  const { id } = await params;
  const record = provinceCatalog.records.find(item => item.id === id);
  if (!record) notFound();
  const nameKey = record.name.replace(/\s+/gu, '');
  const sameName = provinceCatalog.records.filter(item => item.city === record.city && item.name.replace(/\s+/gu, '') === nameKey);
  const toc: ProfileTocItem[] = [
    { id: 'overview', label: '概况' },
    { id: 'fields', label: '来源资料' },
    ...(sameName.length > 1 ? [{ id: 'same-name', label: '同名记录' }] : []),
    { id: 'sources', label: '来源' },
    { id: 'checklist', label: '核对建议' },
  ];
  const verification = <div className="card flex flex-col gap-3 p-5 text-[14px]">
    <h2 className="m-0 text-lg font-semibold">核对这条官方记录</h2>
    <p className="m-0 text-body">这条记录只提供原文名称、地区和来源信息，不能作为当前在营、空床或签约主体的证明。</p>
    <ProvinceSourceLink url={record.sourceUrl} />
    <a href={sitePath('#sources')} className="text-[13px]">查看来源与时间 →</a>
  </div>;

  return <>
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="text-[13px] text-sub"><a href={sitePath('/quanguo/laiyuan/')}>全国官方来源记录</a><span className="mx-2" aria-hidden="true">/</span><span>广东省 · {record.city}</span><span className="mx-2" aria-hidden="true">/</span>来源记录详情</nav>
    <ProfileToc items={toc} variant="bar" />
    <div className="flex items-start gap-6">
      <ProfileToc items={toc} variant="side" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section id="overview" tabIndex={-1} className="section flex flex-col gap-3"><div className="flex flex-col gap-2"><span className="tag w-fit">官方来源记录 · 待核线索</span><h1 className="m-0 break-words text-[28px] font-bold leading-tight sm:text-[32px]">{record.name}</h1><p className="m-0 text-body">广东省 · {record.city} · {record.evidenceType}</p><p className="m-0 text-body">这是官方来源中的一条原文名称记录。记录编号仅定位这份冻结快照，不是机构或登记主体的统一 ID。</p></div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-sub"><span>来源记录编号 {record.id}</span><Suspense fallback={<a href={sitePath('/quanguo/laiyuan/')} className="underlink text-sm">← 返回全国官方来源</a>}><ProvinceReturnToList /></Suspense></div>
        </section>
        <div className="lg:hidden">{verification}</div>
        <ProvinceCoverageNote city={record.city} />
        <section id="fields" tabIndex={-1} className="section"><SectionTitle title="原文条目" extra="仅展示这条公开来源已核准投影的字段" /><dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2">
      <div><dt className="text-sub">原文名称</dt><dd className="m-0 break-words font-semibold">{record.name}</dd></div>
      <div><dt className="text-sub">所属城市</dt><dd className="m-0">{record.city}</dd></div>
      <div><dt className="text-sub">证据类型</dt><dd className="m-0 break-words">{record.evidenceType}</dd></div>
      <div><dt className="text-sub">记录编号</dt><dd className="m-0 break-all font-mono">{record.id}</dd></div>
      <div><dt className="text-sub">来源发布日期</dt><dd className="m-0">{record.sourcePublishedAt ?? '原文未说明'}</dd></div>
      <div><dt className="text-sub">资料期</dt><dd className="m-0 break-words">{record.sourceAsOf ?? '原文未说明'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sub">原文状态提示</dt><dd className={'m-0 break-words ' + (record.sourceStatusNote ? 'text-caution' : '')}>{record.sourceStatusNote ?? '原文未说明'}。不能据此推断当前营业或服务状态。</dd></div>
        </dl></section>
        <QccCandidateLinks sourceRecordId={record.id} />
        {sameName.length > 1 && <section id="same-name" tabIndex={-1} className="section"><SectionTitle title="同城同名记录" extra={sameName.length + ' 条，尚未合并身份'} /><p className="m-0 text-body">同城同名不证明这些条目属于同一服务点或登记主体，请逐条核对来源。</p><ul className="m-0 list-disc space-y-1 pl-5 text-sm">{sameName.filter(item => item.id !== record.id).map(item => <li key={item.id}><a href={sitePath('/guangdong/jigou/' + item.id + '/')}>{item.id} · {item.evidenceType}</a></li>)}</ul></section>}
        <section id="sources" tabIndex={-1} className="section"><SectionTitle title="来源与时间" /><div className="flex flex-col gap-3 text-[14px]"><ProvinceSourceLink url={record.sourceUrl} /><p className="m-0 break-all text-sub">原始来源：{record.sourceUrl}</p><p className="m-0 text-sub">站内快照归档于 <time dateTime={provinceCatalog.archivedAt}>{provinceCatalog.archivedAt}</time>。归档日期不代替原文发布日期或资料期；部分记录缺少逐行原件校验或可定位源行号，请到原始来源核对。</p><a href={sitePath('/data/guangdong-source-records.v1.json')} className="underlink">查看站内公开记录 JSON</a></div></section>
        <section id="checklist" tabIndex={-1} className="section"><SectionTitle title="联系与探访前，建议核对" /><p className="m-0 text-body">原文条目也可能指长者、社区、居家服务中心或医院，不能统称已登记养老机构。联系或实地探访前，需再核实服务场所、登记身份及当前运营情况。本目录不提供实时空床、价格或预约。</p></section>
      </div>
      <aside className="sticky top-4 hidden w-[320px] shrink-0 flex-col gap-4 lg:flex">{verification}</aside>
    </div>
  </>;
}
