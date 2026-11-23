import type { Metadata } from 'next';
import { PageTitle } from '@/components/DirectoryUi';
import { personGuides, personGuideSnapshot, type PersonGuideItem } from '@/lib/person-guide';

export const metadata: Metadata = {
  title: '办事指南 · 在线办理事项说明',
  description: '全国养老服务信息平台「在线办理」栏目刊载的机构事项与个人事项办事指南：机构备案、等级评定、机构补贴、困难老年人集中照护补贴、入住预约、高龄津贴等。事项名称与实施主体来自官方接口，办理口径由本站按可核验政策补充。',
};

const badgeTone = (type: string) => {
  if (type === '即办件') return 'bg-brand-tint text-brand-ink';
  if (type === '承诺件') return 'bg-[#FFF0D0] text-[#7A5210]';
  if (type === '行政确认') return 'bg-[#E3ECFB] text-[#274B8C]';
  if (type === '行政给付') return 'bg-[#E9F3E6] text-[#2F5D2A]';
  if (type === '国家级') return 'bg-[#F3E9FB] text-[#5B2A8C]';
  if (type === '县级') return 'bg-[#FBE9E9] text-[#8C2A2A]';
  return 'bg-page text-ink-2';
};

function GuideCard({ item }: { item: PersonGuideItem }) {
  return (
    <li className="card flex min-w-0 flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[18px] font-semibold">{item.name}</h3>
            <span className="font-mono text-[12px] text-sub">事项编号 {item.code}</span>
            {!item.online && (
              <span className="rounded-md bg-[#FBE9E9] px-2 py-0.5 text-[12px] text-[#8C2A2A]">官方尚未提供在线办理</span>
            )}
          </div>

          {item.online ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {item.handleType && <span className={`rounded-md px-2 py-0.5 text-[12px] ${badgeTone(item.handleType)}`}>{item.handleType}</span>}
                {item.itemType && <span className={`rounded-md px-2 py-0.5 text-[12px] ${badgeTone(item.itemType)}`}>{item.itemType}</span>}
                {item.level && <span className={`rounded-md px-2 py-0.5 text-[12px] ${badgeTone(item.level)}`}>{item.level}</span>}
                <span className="rounded-md bg-page px-2 py-0.5 text-[12px] text-ink-2">{item.free ? '不收费' : '收费（以受理窗口为准）'}</span>
              </div>
              <p className="m-0 mt-2 text-[13px] text-sub">
                实施主体：{item.mainBody} · 发布时间：<time dateTime={item.publishedAt}>{item.publishedAt}</time>
              </p>
            </>
          ) : (
            <p className="m-0 mt-2 text-[13px] text-sub">实施主体：{item.mainBody}</p>
          )}
        </div>
      </div>

      <div className="border-t border-hair pt-4">
        <h4 className="m-0 text-[14px] font-semibold">办理口径（本站补充）</h4>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-[14px] leading-6 text-body">
          {item.guidance.map((g) => (
            <li key={g} className="flex gap-2">
              <span aria-hidden="true" className="shrink-0 text-brand">·</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>

      {item.online && item.officialMissing.length > 0 && (
        <p className="m-0 border-t border-hair pt-3 text-[12.5px] leading-5 text-sub">
          官方原页面未提供：{item.officialMissing.join('、')}。如需办理，请以{item.mainBody}公布的现行规定与窗口告知为准。
        </p>
      )}
    </li>
  );
}

export default function PersonGuidePage() {
  const orgItems = personGuides.filter((i) => i.category === '机构事项');
  const personalItems = personGuides.filter((i) => i.category === '个人事项');

  return (
    <div className="flex flex-col gap-8">
      <PageTitle
        title="办事指南"
        lead={
          <>
            收录全国养老服务信息平台「在线办理」栏目的机构事项与个人事项。
            事项名称、实施主体、事项类型、办件类型、行使层级、是否收费与发布时间均来自官方接口（{personGuideSnapshot.capturedAt} 快照）。
            官方原页面未刊载办理流程、材料、时限与收费标准，本页「办理口径」一栏是本站按可核验政策常识补充的说明，不代替官方受理窗口的一次性告知。
          </>
        }
        extra={
          <a className="text-[13px] text-sub underline-offset-4 hover:underline" href={personGuideSnapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
            查看平台原栏目 ↗
          </a>
        }
      />

      <section aria-labelledby="org-items" className="flex flex-col gap-4">
        <h2 id="org-items" className="m-0 text-[19px] font-semibold">机构事项</h2>
        <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label="机构事项列表">
          {orgItems.map((item) => <GuideCard key={item.code} item={item} />)}
        </ol>
      </section>

      <section aria-labelledby="personal-items" className="flex flex-col gap-4">
        <h2 id="personal-items" className="m-0 text-[19px] font-semibold">个人事项</h2>
        <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label="个人事项列表">
          {personalItems.map((item) => <GuideCard key={item.code} item={item} />)}
        </ol>
      </section>

      <section className="card flex flex-col gap-2 p-5" aria-label="来源与口径说明">
        <h2 className="m-0 text-[14px] font-semibold">来源与口径</h2>
        <p className="m-0 text-[13px] leading-6 text-sub">{personGuideSnapshot.note}</p>
        <p className="m-0 text-[12px] text-sub">
          数据来源：{personGuideSnapshot.source}；快照时间 {personGuideSnapshot.capturedAt}。
          事项是否仍可办理、办理口径是否变更，以民政部门最新公布为准。
        </p>
      </section>
    </div>
  );
}
