"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Key = "claims" | "reports" | "appeals" | "visits" | "changes" | "freshness";
const ITEMS: { label: string; href: string; count?: Key }[] = [
  { label: "数据看板", href: "/admin" },
  { label: "认领审核", href: "/admin/claims", count: "claims" },
  { label: "报错处理", href: "/admin/reports", count: "reports" },
  { label: "线索申诉", href: "/admin/appeals", count: "appeals" },
  { label: "探访抽检", href: "/admin/visits", count: "visits" },
  { label: "信息修改", href: "/admin/changes", count: "changes" },
  { label: "保鲜到期", href: "/admin/freshness", count: "freshness" },
];

export function AdminNav({ counts }: { counts: Record<Key, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="运营后台" className="flex flex-row flex-wrap gap-1 md:flex-col">
      {ITEMS.map((it) => {
        const active = it.href === "/admin" ? path === it.href : path.startsWith(it.href);
        const n = it.count ? counts[it.count] : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 no-underline ${active ? "bg-white/10 font-semibold text-white" : "text-admin-text hover:bg-white/5 hover:text-white"}`}
          >
            {it.label}
            {n > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white">{n}</span>}
          </Link>
        );
      })}
      {["城市合伙人", "规则配置", "审计日志"].map((x) => (
        <span key={x} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-admin-muted" title="下一期开发">
          {x}
          <span className="ml-2 text-[11px] opacity-70">下一期</span>
        </span>
      ))}
    </nav>
  );
}
