"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Key = "leads" | "reports" | "info";
const ITEMS: { label: string; href?: string; count?: Key }[] = [
  { label: "工作台", href: "/merchant" },
  { label: "预约线索", href: "/merchant/leads", count: "leads" },
  { label: "报错回应", href: "/merchant/reports", count: "reports" },
  { label: "信息维护", href: "/merchant/info", count: "info" },
  { label: "线索包充值" },
  { label: "年费会员" },
];

export function MerchantNav({ counts }: { counts: Record<Key, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="机构后台" className="flex w-full flex-row flex-wrap gap-1 border-b border-line bg-white p-3 md:min-h-full md:w-[200px] md:flex-col md:border-b-0 md:border-r">
      {ITEMS.map((it) => {
        if (!it.href)
          return (
            <span key={it.label} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sub" title="下一期开发">
              {it.label}
              <span className="ml-2 text-[11px]">下一期</span>
            </span>
          );
        const active = it.href === "/merchant" ? path === it.href : path.startsWith(it.href);
        const n = it.count ? counts[it.count] : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 no-underline ${active ? "bg-brand-tint font-semibold text-brand-ink" : "text-ink hover:bg-page"}`}
          >
            {it.label}
            {n > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
