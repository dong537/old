import React from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { ltciGuide } from '@/lib/ltci-guide';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '长护险指南 · 申请评估与护理服务查找',
  description: '区分机构护理与居家护理，按当地医保规定核对资格、评估申请和服务机构。当前提供广州详细办理资料及有日期的官方来源。',
};

const faq = [
  { title: '先从哪里开始？', body: '先确认老人参保地及需要的护理安排，再向当地医保部门核对是否适用长期护理保险、失能评估如何办理，以及当前执行的待遇条件。不同地区的办理规则、服务范围和待遇不能互相套用。' },
  { title: '怎么申请失能评估？', body: '请从参保地医保部门的官方平台或经办窗口核对申请人、材料及评估渠道。目前本站可核对的详细办理资料为广州，包含申请步骤、评估流程与逐项来源；其他地区暂不提供未经核对的材料清单或办理时限。' },
  { title: '住机构和在家护理怎么选？', body: '先向医保经办机构确认当前协议定点机构及可提供的服务类别，再根据老人居住和照护安排选择机构护理或居家护理。机构出现在养老名录、收费栏或上门服务列表中，不能单独证明其具备当前长护险服务资格。' },
  { title: '能报多少费用？', body: '参保条件、评估结论、服务项目和结算规则须按当地现行政策及经办机构审核执行。本页不提供全国统一报销比例、额度或个人资格结论。' },
  { title: '看到定点公示或年度考核就能使用吗？', body: '需要继续核对当前服务协议和项目。本站保存的广州年度考核反映对应年度情况，新增评估合格公示也不等于服务协议已正式生效；使用前请向医保经办机构与服务机构确认。' },
];

export default function NationalLtciGuide() {
  return <div className="flex min-w-0 flex-col gap-6">
    <PageTitle title="长护险指南" lead="先核对参保地与失能评估办理口径，再找相应护理服务。全国入口按地区查资料，待遇和资格以当地医保部门审核为准。" />
    <div className="notice flex flex-col gap-2"><h2 className="m-0 text-base font-semibold">目前可查的详细办理资料：广州</h2><p className="m-0 text-sm text-body">本站目前只对广州办理流程保留了逐项官方来源，不把广州规则作为全国规则。其他地区请到当地医疗保障局官网或医保经办窗口核对。</p><a className="underlink w-fit" href={sitePath('/guangzhou/changhuxian/')}>查看广州申请步骤与官方资料 →</a></div>
    <section aria-label="长护险常见问题" className="card flex flex-col divide-y divide-hair">{faq.map((item, index) => <details key={item.title} className="px-5 py-4" open={index === 1}><summary className="cursor-pointer text-base font-semibold marker:text-brand">{item.title}</summary><p className="m-0 mt-2 text-body">{item.body}</p></details>)}</section>
    <section aria-label="按护理安排查找资料" className="grid gap-4 md:grid-cols-2">
      <article className="card flex flex-col gap-3 p-5"><h2 className="m-0 text-lg font-semibold">机构护理</h2><p className="m-0 text-body">准备入住养老机构或护理机构，先查机构档案与服务，再向参保地医保部门核对当前定点协议及待遇适用情况。</p><a className="underlink w-fit" href={sitePath('/quanguo/pingtai/')}>查找养老机构资料 →</a><p className="m-0 text-xs text-sub">机构目录不是全国长护险定点名单。</p></article>
      <article className="card flex flex-col gap-3 p-5"><h2 className="m-0 text-lg font-semibold">居家护理</h2><p className="m-0 text-body">老人住在家中，可先查列有上门／居家项目的机构，再确认当地长护险是否适用、机构能否承接以及服务范围。</p><a className="underlink w-fit" href={sitePath('/quanguo/shangmen/')}>查找上门养老服务线索 →</a><p className="m-0 text-xs text-sub">列有上门项目不代表属于长护险定点，也不证明当前可预约。</p></article>
    </section>
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="ltci-local-records"><h2 id="ltci-local-records" className="m-0 text-lg font-semibold">广州医保公开记录</h2><p className="m-0 text-sm text-body">年度考核和新增公示属于不同时间、不同环节的历史资料，查阅时请保留对应日期和资料范围。</p><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><a href={sitePath('/guangzhou/shangmen/?recordType=annual-assessment')}>2025年度综合考核记录 →</a><a href={sitePath('/guangzhou/shangmen/?recordType=designation-notice')}>新增定点评估合格公示记录 →</a></div></section>
    <section aria-labelledby="national-ltci-sources" className="flex flex-col gap-3"><h2 id="national-ltci-sources" className="m-0 text-lg font-semibold">已核对的地方来源</h2><ul className="m-0 flex flex-col gap-4 pl-5 text-sm">{ltciGuide.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><div className="mt-1 text-sub">适用地区：广州 · {source.publisher} · 发布于 <time dateTime={source.publishedAt}>{source.publishedAt}</time> · 核对日期 {source.accessedAt}</div><p className="m-0 mt-1 text-sub">{source.scope}</p></li>)}</ul></section>
  </div>;
}
