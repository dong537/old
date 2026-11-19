import { sitePath } from '@/lib/site-path';
import { PageTitle } from '@/components/DirectoryUi';
import { ltciGuide } from '@/lib/ltci-guide';

export const metadata = { title: '广州长护险指南 · 申请评估与官方资料' };

function SourceCitations({ sourceIds }: { sourceIds: string[] }) {
  return <span className="ml-1 inline-flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-sub">
    {sourceIds.map((id) => {
      const source = ltciGuide.sources.find((item) => item.id === id);
      if (!source) return null;
      return <a key={id} className="underlink" href={sitePath('#source-' + id)}>{source.citationLabel} · 发布于 <time dateTime={source.publishedAt}>{source.publishedAt}</time></a>;
    })}
  </span>;
}

export default function ChanghuxianGuide() {
  return <div className="flex flex-col gap-6">
    <PageTitle
      title="广州长护险指南"
      lead="先核对参保与失能评估办理口径，再向医保经办机构确认当前待遇资格和服务机构。此页说明官方规定的申请评估流程，不估算报销金额，也不代替资格审核。"
    />

    <section aria-labelledby="application-steps" className="flex flex-col gap-4">
      <h2 id="application-steps" className="m-0 text-lg font-semibold">申请步骤</h2>
      <ol className="m-0 flex list-none flex-col divide-y divide-hair border-y border-line p-0">
        {ltciGuide.steps.map((item, index) => (
          <li key={item.title} className="grid gap-2 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint font-semibold text-brand-ink">{index + 1}</span>
            <div>
              <h3 className="m-0 text-base font-semibold">{item.title}</h3>
              <p className="m-0 mt-1 text-body">{item.body}<SourceCitations sourceIds={item.sourceIds} /></p>
            </div>
          </li>
        ))}
      </ol>
    </section>

    <section aria-label="常见问题" className="card flex flex-col divide-y divide-hair">
      {ltciGuide.faq.map((item) => (
        <details key={item.title} className="group px-5 py-4" open={item.title === '失能评估怎么申请？'}>
          <summary className="cursor-pointer text-[16px] font-semibold marker:text-brand">{item.title}</summary>
          <p className="m-0 mt-2 text-body">{item.body}<SourceCitations sourceIds={item.sourceIds} /></p>
        </details>
      ))}
    </section>

    <section aria-labelledby="official-records" className="flex flex-col gap-3">
      <h2 id="official-records" className="m-0 text-lg font-semibold">官方公开记录</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="card flex flex-col gap-3 p-5">
          <h3 className="m-0 text-base font-semibold">2025年度综合考核</h3>
          <p className="m-0 text-body">公布的是年度考核记录，含护理机构和设备机构。考核结果不能证明机构当前仍为定点，也不能证明其目前提供居家上门服务。<SourceCitations sourceIds={['annual-assessment']} /></p>
          <a className="underlink w-fit" href={sitePath("/guangzhou/shangmen/?recordType=annual-assessment")}>查年度考核记录</a>
        </article>
        <article className="card flex flex-col gap-3 p-5">
          <h3 className="m-0 text-base font-semibold">新增定点评估合格公示</h3>
          <p className="m-0 text-body">公示不等于服务协议正式生效，且该批公示为非全量名单。联系机构前仍应向医保经办机构核对当前协议和服务项目。<SourceCitations sourceIds={['designation-notice']} /></p>
          <a className="underlink w-fit" href={sitePath("/guangzhou/shangmen/?recordType=designation-notice")}>查新增定点公示记录</a>
        </article>
      </div>
    </section>

    <section aria-labelledby="guide-sources" className="flex flex-col gap-2">
      <h2 id="guide-sources" className="m-0 text-lg font-semibold">参考来源</h2>
      <ul className="m-0 flex flex-col gap-3 pl-5 text-[14px]">
        {ltciGuide.sources.map((source) => (
          <li key={source.id} id={`source-${source.id}`} className="scroll-mt-6">
            <a href={sitePath(source.url)} target="_blank" rel="noreferrer">{source.title}</a>
            <div className="text-sub">{source.publisher} · 发布：{source.publishedAt} · 核对：{source.accessedAt}</div>
            <p className="m-0 mt-1 text-sub">资料口径：{source.scope}</p>
          </li>
        ))}
      </ul>
    </section>
  </div>;
}
