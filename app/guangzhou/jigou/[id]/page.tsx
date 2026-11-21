import { sitePath } from '@/lib/site-path';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { catalog } from '@/lib/catalog';
import { mapGuangzhouInstitutionDetail } from '@/lib/institution-detail-dto';
import { WITHHELD_PHONE_MESSAGE } from '@/lib/phone-display';
import { CompanyInfo } from '@/components/CompanyInfo';
import { SectionTitle } from '@/components/DirectoryUi';
import { PublicInstitutionBottomNav, PublicInstitutionDetailSections, PublicInstitutionHero, PublicInstitutionSummary } from '@/components/PublicInstitutionDetailSections';
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
  const dto = mapGuangzhouInstitutionDetail(item);
  const marks: Array<[string, boolean | null]> = [
    ['押金', item.deposit], ['会员费', item.membershipFee], ['养老服务费预收', item.advanceFee],
  ];
  const toc = [
    { id: 'overview', label: '概况' },
    { id: 'fields', label: '基本信息' },
    { id: 'services', label: '服务信息' },
    { id: 'care', label: '机构养老' },
    { id: 'reviews', label: '用户评价' },
    { id: 'sources', label: '来源' },
    { id: 'custody', label: '预收费标记' },
    { id: 'company', label: '主体信息' },
    { id: 'checklist', label: '核对建议' },
  ];
  const phone = item.phoneWithheld ? <span>{WITHHELD_PHONE_MESSAGE}</span> : item.phoneHref && dto.profile.contactPhone.value
    ? <a href={sitePath(item.phoneHref)} className="font-semibold">{dto.profile.contactPhone.value}</a>
    : dto.profile.contactPhone.value ? <span>{dto.profile.contactPhone.value} <span className="text-[13px] text-caution">（待核实）</span></span>
      : <span>原表未提供电话</span>;

  return <div className="institution-detail-page">
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="flex flex-wrap gap-x-2 bg-[#F68A13] px-5 py-3 text-[13px] text-white sm:px-8">
      <a href={sitePath('/guangzhou/jigou/')} className="text-white hover:text-white">广州机构名单</a><span aria-hidden="true">›</span>
      <a href={sitePath('/guangzhou/jigou/?district=' + encodeURIComponent(item.district))} className="text-white hover:text-white">{item.district}</a><span aria-hidden="true">›</span><span>机构详情</span>
    </nav>

    <PublicInstitutionHero dto={dto} sourceLabel="广州市民政局公开名单 · 历史快照" sourceTitle={catalog.source.title + ' · 发布于 ' + catalog.source.publishedAt + ' · 原表第 ' + item.sourceRow + ' 条'} sourceDate={null} sourceHref={catalog.source.url} sourceLinkLabel="核对官方名单" returnHref="/guangzhou/jigou/" returnLink={<Suspense fallback={<a href={sitePath('/guangzhou/jigou/')} className="underlink">← 返回机构名单</a>}><ReturnToList /></Suspense>} contactPhoneNode={<span id="contact">{phone}</span>}>
      <p className="mb-0 mt-3 text-[13px] leading-6 text-body">广东省 · 广州市 · {item.district}。名单收录不证明当前在营、空床、报价或服务质量；电话接通情况未经本站核实。本站未开放在线预约。</p>
      {item.qualityNotes.length > 0 && <div id="risk" className="mt-4 border border-caution-line bg-caution-bg p-4 text-caution" role="note"><h2 className="m-0 text-[15px] font-semibold">原表资料待核对</h2><ul className="mb-0 mt-2 list-disc space-y-1 pl-5 text-[14px]">{item.qualityNotes.map(note => <li key={note}>{note}</li>)}</ul><p className="mb-0 mt-2 text-[13px]">这些是原表字段疑点，并非对机构服务质量或经营风险的认定。</p></div>}
    </PublicInstitutionHero>

    <PublicInstitutionSummary dto={dto} />
    <PublicInstitutionDetailSections dto={dto} />

    <section id="sources" tabIndex={-1} className="section">
      <SectionTitle title="来源与资料时间" extra="[1] 广州市民政局公开名单" />
      <SourceNote source={catalog.source} detailed />
      <dl className="m-0 grid gap-3 border-t border-hair pt-4 text-[13px] sm:grid-cols-2"><div><dt className="text-sub">原始名单序号</dt><dd className="m-0">第 {item.sourceRow} 条</dd></div><div><dt className="text-sub">本页档案编号</dt><dd className="m-0 font-mono">{item.id}</dd></div></dl>
      <p className="m-0 text-[13px] text-sub">名单未提供当前月费、空床、机构性质与等级、医疗和长护险资格、实地探访或家属回访。未提供不等于“无”；本页也没有可核对的历史变更记录。</p>
      <a href={sitePath('/rules/')} className="text-[13px]">查看收录范围与字段说明 →</a>
    </section>

    <section id="custody" tabIndex={-1} className="section"><SectionTitle title="押金、会员费与预收" extra="名单原始标记" />
      <p id="fees" className="m-0 text-[14px] text-body">本名单未提供分项收费或月费金额。以下只表示原表中是否标记收取，不说明金额、条件或存管状态。</p>
      <dl className="m-0 grid gap-3 sm:grid-cols-3">{marks.map(([label, value]) => <div key={label} className="border border-line bg-white p-4"><dt className="text-[13px] text-sub">{label}</dt><dd className="mb-0 mt-1 text-[17px] font-semibold">{value === null ? '原表未提供' : value ? '原表标记：是' : '原表标记：否'}</dd></div>)}</dl>
      <p className="m-0 text-[13px] text-sub">“否”不等于全部服务免费；付款前请向机构索取书面价目和退费条款。</p>
    </section>
    <section id="company" tabIndex={-1} className="section"><div id="entity" tabIndex={-1} className="scroll-mt-16"><SectionTitle title="主体信息" /></div><CompanyInfo institutionId={item.id} /></section>
    <section id="checklist" tabIndex={-1} className="section"><SectionTitle title="联系与探访时，建议核对" /><ul className="m-0 list-disc space-y-2 pl-5 text-body"><li>能否接收老人的照护需求，当前是否有合适床位。</li><li>床位费、护理费、餐费、押金及其他费用，调价和退费如何约定。</li><li>实际服务场所、运营与签约主体是否一致，服务承诺是否写进合同。</li></ul><p className="m-0 text-[13px] text-sub">本目录用于检索名单资料，不代替现场评估，也不构成服务质量承诺。</p></section>
    <p className="m-0 break-words text-[13px] text-sub">档案网址：{sitePath('/guangzhou/jigou/' + item.id + '/')} · 展示名单快照，非机构服务质量评级。</p>
    <PublicInstitutionBottomNav name={item.name} items={toc} />
  </div>;
}
