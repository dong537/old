import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

export function Logo() {
  return <Link href="/" className="flex min-w-0 items-center gap-2.5 no-underline sm:gap-3" aria-label="养老信源，首页">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white sm:h-12 sm:w-12">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>
    </span>
    <span className="flex flex-col leading-tight"><span className="whitespace-nowrap text-[21px] font-bold tracking-[1px] text-brand sm:text-[24px]">养老信源<span className="ml-1.5 hidden align-middle text-[11px] font-normal tracking-normal text-sub sm:inline">（暂名）</span></span><span className="hidden text-xs text-sub sm:block">替爸妈选养老，先看可核验的事实</span></span>
  </Link>;
}

export function SectionTitle({ id, title, extra }: { id?: string; title: ReactNode; extra?: ReactNode }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id={id} className="m-0 text-lg font-semibold">{title}</h2>{extra && <span className="text-[13px] text-sub">{extra}</span>}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return <div className="flex flex-col gap-0.5"><span className="text-[13px] text-sub">{label}</span><span className="text-[22px] font-semibold leading-tight">{value}</span>{hint && <span className="text-xs text-sub">{hint}</span>}</div>;
}

export function PageTitle({ title, lead, extra }: { title: ReactNode; lead?: ReactNode; extra?: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-line pb-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="m-0 border-l-4 border-brand pl-4 text-[25px] font-bold leading-tight sm:text-[29px]">{title}</h1>{extra}</div>{lead && <p className="m-0 max-w-[860px] pl-5 text-[14px] leading-6 text-body sm:text-[15px]">{lead}</p>}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sub">{children}</div>;
}

export type RecordFact = { label: string; value: ReactNode | null };

/**
 * 列表卡片的事实行。
 *
 * 这些来源多数只有名称、地区、地址，床位/费用/星级整列缺失。原来每张卡片固定摊开
 * 四行「本来源未提供」，一屏只能看两条。这里把有值的事实做成可扫读的小块，
 * 缺失的合并成**一行**说明——字段名仍然逐项写出，不隐藏、不省略、不填 0。
 */
export function RecordFacts({ items, className = '' }: { items: readonly RecordFact[]; className?: string }) {
  const known = items.filter(item => item.value !== null && item.value !== undefined && item.value !== '');
  const missing = items.filter(item => !known.includes(item));
  if (items.length === 0) return null;
  return <div className={'flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-t border-hair pt-3 ' + className}>
    {known.map(item => <span key={item.label} className="inline-flex items-baseline gap-1.5 rounded-md bg-brand-tint/70 px-2 py-0.5">
      <span className="text-[12.5px] text-sub">{item.label}</span>
      <span className="text-[13.5px] font-semibold text-brand-ink">{item.value}</span>
    </span>)}
    {missing.length > 0 && <span className="text-[12.5px] leading-5 text-sub">本来源未提供：{missing.map(item => item.label).join('、')}</span>}
  </div>;
}

/** 读取名单时的骨架屏：比一行「正在加载」更能说明「马上就有内容」 */
export function ListSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return <div className="flex flex-col gap-3" role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }).map((_, index) => <div key={index} className="record-card animate-pulse p-5 motion-reduce:animate-none" aria-hidden="true">
      <div className="h-4 w-3/5 rounded bg-line" />
      <div className="mt-3 h-3 w-2/5 rounded bg-hair" />
      <div className="mt-2 h-3 w-4/5 rounded bg-hair" />
      <div className="mt-5 flex gap-2"><span className="h-6 w-24 rounded bg-hair" /><span className="h-6 w-24 rounded bg-hair" /></div>
    </div>)}
  </div>;
}

/**
 * 统一分页：首页 / 上一页 / 页码（带省略）/ 下一页 / 末页。
 * 各目录的 URL 构造不同，用 hrefFor 注入；页码规则与广州、省页现有实现保持一致，
 * 避免同一站里出现两种翻页手感。
 */
export function DirectoryPager({ page, pageCount, hrefFor, label, hint, linkProps }: {
  page: number; pageCount: number; hrefFor: (page: number) => string; label: string; hint?: string;
  linkProps?: AnchorHTMLAttributes<HTMLAnchorElement>;
}) {
  if (pageCount <= 1) return null;
  const visible = new Set<number>([1, pageCount, page]);
  for (const delta of [-1, 0, 1]) if (page + delta >= 1 && page + delta <= pageCount) visible.add(page + delta);
  const pages = [...visible].sort((a, b) => a - b);
  return <nav aria-label={label} className="flex flex-col items-center gap-2">
    <div className="flex flex-wrap items-center justify-center gap-2">
      {page > 1 && <a href={hrefFor(1)} rel="first" {...linkProps} className="btn-outline btn-sm px-3">首页</a>}
      {page > 1 && <a href={hrefFor(page - 1)} rel="prev" {...linkProps} className="btn-outline btn-sm px-3">上一页</a>}
      {pages.map((value, index) => <span key={value} className="inline-flex items-center gap-2">
        {index > 0 && value - pages[index - 1] > 1 && <span className="text-sub" aria-hidden="true">…</span>}
        <a href={hrefFor(value)} {...linkProps} aria-label={`第 ${value} 页`} aria-current={value === page ? 'page' : undefined}
          className={'flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 tabular ' + (value === page ? 'border-brand bg-brand font-semibold text-white hover:text-white' : 'border-line bg-white hover:border-brand')}>{value}</a>
      </span>)}
      {page < pageCount && <a href={hrefFor(page + 1)} rel="next" {...linkProps} className="btn-outline btn-sm px-3">下一页</a>}
      {page < pageCount && <a href={hrefFor(pageCount)} rel="last" {...linkProps} className="btn-outline btn-sm px-3">末页</a>}
    </div>
    <p className="m-0 text-center text-[13px] text-sub">第 {page} / {pageCount} 页{hint ? ` · ${hint}` : ''}</p>
  </nav>;
}
