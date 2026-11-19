import Link from 'next/link';
import type { ReactNode } from 'react';

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
  return <div className="flex flex-col gap-2"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="m-0 text-[26px] font-bold leading-tight">{title}</h1>{extra}</div>{lead && <p className="m-0 max-w-[820px] text-body">{lead}</p>}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sub">{children}</div>;
}
