import { sitePath } from '@/lib/site-path';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { catalog } from '@/lib/catalog';
import { WITHHELD_PHONE_MESSAGE } from '@/lib/phone-display';
import { CompanyInfo } from '@/components/CompanyInfo';
import { SectionTitle } from '@/components/DirectoryUi';
import { ProfileToc, type ProfileTocItem } from '@/components/ProfileToc';
import { SourceNote } from '@/components/SourceNote';
import { ReturnToList } from '@/components/ReturnToList';

export const dynamicParams = false;
export function generateStaticParams() { return catalog.institutions.map(({ id }) => ({ id })); }
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = catalog.institutions.find(institution => institution.id === id);
  return {
    title: item ? item.name + ' · ' + item.district + '机构档案' : '未找到机构档案',
    description: item ? item.name + '的广州官方公开名单记录：地址、备案床位和预收费标记；有可公开电话时一并展示。名单发布于' + catalog.source.publishedAt + '。' : undefined,
  };
}

export default async function InstitutionPage({ params }: Props) {
  const { id } = await params;
  const item = catalog.institutions.find(institution => institution.id === id);
  if (!item) notFound();

  const toc: ProfileTocItem[] = [
    { id: 'overview', label: '机构资料' },
    { id: 'sources', label: '来源与时间' },
    { id: 'custody', label: '预收费标记' },
    { id: 'company', label: '主体信息' },
    { id: 'checklist', label: '联系前核对' },
  ];
  const marks: Array<[string, boolean | null]> = [
    ['押金', item.deposit],
    ['会员费', item.membershipFee],
    ['养老服务费预收', item.advanceFee],
  ];
  const phone = item.phoneWithheld ? <span>{WITHHELD_PHONE_MESSAGE}</span> : item.phoneHref
    ? <a href={sitePath(item.phoneHref)} className="text-lg font-semibold">{item.phone}</a>
    : item.phone ? <span>{item.phone} <span className="text-[13px] font-normal text-caution">（待核实）</span></span>
      : <span>原表未提供电话</span>;

  return <>
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="text-[13px] text-sub">
      <a href={sitePath('/guangzhou/jigou/')} className="text-sub">广州机构名单</a> / <a href={sitePath('/guangzhou/jigou/?district=' + encodeURIComponent(item.district))} className="text-sub">{item.district}</a> / {item.name}
    </nav>
    <ProfileToc items={toc} variant="bar" />
    <div className="flex items-start gap-6">
      <ProfileToc items={toc} variant="side" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section id="overview" tabIndex={-1} className="section border-t-4 border-t-brand">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="eyebrow m-0">广州官方名单 · {item.district}</p>
              <h1 className="m-0 break-words text-[26px] font-bold leading-tight sm:text-[30px]">{item.name}</h1>
            </div>
            <span className="tag shrink-0">官方名单收录</span>
          </div>
          <dl className="m-0 grid gap-x-8 gap-y-4 border-t border-hair pt-4 text-[15px] sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2"><dt className="text-[13px] text-sub">名单所列地址</dt><dd className="m-0 break-words font-semibold">{item.address}</dd></div>
            <div><dt className="text-[13px] text-sub">所属行政区</dt><dd className="m-0 font-semibold">{item.district}</dd></div>
            <div><dt className="text-[13px] text-sub">备案床位</dt><dd className="m-0 font-semibold">{item.registeredBeds === null ? '原表未提供' : item.registeredBeds.toLocaleString('zh-CN') + ' 张'}</dd></div>
          </dl>
          <p className="m-0 text-[13px] text-sub">备案床位是名单记录数量，不代表当前空床；地址和经营状态请联系机构核实。</p>
          <div id="contact" className="flex flex-col gap-2 rounded-lg border border-brand-line bg-brand-tint p-4">
            <h2 className="m-0 text-[16px] font-semibold">联系机构核实</h2>
            <p className="m-0 break-words text-[16px]">{phone}</p>
            <p className="m-0 text-[13px] text-body">电话来自名单，接通情况未经本站核实。本站不收集联系资料，也未开放在线预约。</p>
            <a href={sitePath(catalog.source.url)} target="_blank" rel="noopener noreferrer" className="text-[13px]">打开广州官方名单核对 ↗</a>
          </div>
          {item.qualityNotes.length > 0 && <div id="risk" className="rounded-lg border border-caution-line bg-caution-bg p-4" role="note">
            <h2 className="m-0 text-[15px] font-semibold text-caution">原表资料待核对</h2>
            <ul className="mb-0 mt-2 list-disc space-y-1 pl-5 text-[14px] text-caution">{item.qualityNotes.map(note => <li key={note}>{note}</li>)}</ul>
            <p className="mb-0 mt-2 text-[13px] text-caution">这些是原表字段疑点，并非对机构服务质量或经营风险的认定。</p>
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hair pt-3 text-[13px] text-sub">
            <span>名单发布于 <time dateTime={catalog.source.publishedAt}>{catalog.source.publishedAt}</time> · 原表第 {item.sourceRow} 条</span>
            <Suspense fallback={<a href={sitePath('/guangzhou/jigou/')} className="underlink">← 返回机构名单</a>}><ReturnToList /></Suspense>
          </div>
        </section>

        <section id="sources" tabIndex={-1} className="section">
          <SectionTitle title="来源与资料时间" extra="[1] 广州市民政局公开名单" />
          <SourceNote source={catalog.source} detailed />
          <dl className="m-0 grid gap-3 border-t border-hair pt-4 text-[13px] sm:grid-cols-2">
            <div><dt className="text-sub">原始名单序号</dt><dd className="m-0">第 {item.sourceRow} 条</dd></div>
            <div><dt className="text-sub">本页档案编号</dt><dd className="m-0 font-mono">{item.id}</dd></div>
          </dl>
          <p className="m-0 text-[13px] text-sub">名单未提供当前月费、空床、机构性质与等级、医疗和长护险资格、实地探访或家属回访。未提供不等于“无”；本页也没有可核对的历史变更记录。</p>
          <a href={sitePath('/rules/')} className="text-[13px]">查看收录范围与字段说明 →</a>
        </section>

        <section id="custody" tabIndex={-1} className="section">
          <SectionTitle title="押金、会员费与预收" extra="名单原始标记" />
          <p id="fees" className="m-0 text-[14px] text-body">本名单未提供分项收费或月费金额。以下只表示原表中是否标记收取，不说明金额、条件或存管状态。</p>
          <dl className="m-0 grid gap-3 sm:grid-cols-3">{marks.map(([label, value]) => <div key={label} className="rounded-lg border border-line p-4">
            <dt className="text-[13px] text-sub">{label}</dt>
            <dd className="mb-0 mt-1 text-[17px] font-semibold">{value === null ? '原表未提供' : value ? '原表标记：是' : '原表标记：否'}</dd>
          </div>)}</dl>
          <p className="m-0 text-[13px] text-sub">“否”不等于全部服务免费；付款前请向机构索取书面价目和退费条款。</p>
        </section>

        <section id="company" tabIndex={-1} className="section"><div id="entity" tabIndex={-1} className="scroll-mt-16"><SectionTitle title="主体信息" /></div><CompanyInfo institutionId={item.id} /></section>

        <section id="checklist" tabIndex={-1} className="section">
          <SectionTitle title="联系与探访时，建议核对" />
          <ul className="m-0 list-disc space-y-2 pl-5 text-body"><li>能否接收老人的照护需求，当前是否有合适床位。</li><li>床位费、护理费、餐费、押金及其他费用，调价和退费如何约定。</li><li>实际服务场所、运营与签约主体是否一致，服务承诺是否写进合同。</li></ul>
          <p className="m-0 text-[13px] text-sub">本目录用于检索名单资料，不代替现场评估，也不构成服务质量承诺。</p>
        </section>
      </div>
    </div>
    <p className="m-0 break-words text-[13px] text-sub">档案网址：{sitePath('/guangzhou/jigou/' + item.id + '/')} · 展示名单快照，非机构服务质量评级。</p>
  </>;
}
