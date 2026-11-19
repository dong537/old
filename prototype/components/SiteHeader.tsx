"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/ui";
import { SITE } from "@/lib/site";
import { bangdanPath, changhuxianPath, cityPath, jiagePath, jigouPath, shangmenPath } from "@/lib/paths";

const NAV = [
  { href: cityPath(), label: "首页", exact: true },
  { href: jigouPath(), label: "找养老机构" },
  { href: shangmenPath(), label: "找上门服务" },
  { href: changhuxianPath(), label: "长护险指南" },
  { href: jiagePath(), label: "价格参考" },
  { href: bangdanPath(), label: "榜单" },
  { href: "/rules", label: "方法论" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href.split("?")[0]));

  return (
    <header className="border-b border-line bg-white">
      <div className="border-b border-hair bg-page">
        <div className="container-site flex flex-wrap justify-between gap-3 py-1.5 text-xs text-sub">
          <span>原型 · 页面上的机构和服务商都是虚构示例 · 不收入住返佣，付费不改变排序</span>
          <div className="flex flex-wrap gap-5">
            <Link href="/me" className="text-sub hover:text-ink">我的预约与报错</Link>
            <Link href="/claim" className="text-sub hover:text-ink">机构认领</Link>
            <Link href="/merchant" className="text-sub hover:text-ink">机构后台</Link>
            <Link href="/admin" className="text-sub hover:text-ink">运营后台</Link>
          </div>
        </div>
      </div>
      <div className="container-site flex flex-wrap items-center gap-x-6 gap-y-3 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <Logo size="lg" subtitle={SITE.slogan} />
          <span className="chip border border-brand-line bg-brand-tint text-brand-ink" title="首批只开通广州">
            广州 · 首批开通
          </span>
        </div>
        <form
          role="search"
          className="flex min-w-0 flex-[1_1_320px] overflow-hidden rounded-[10px] border-2 border-brand bg-white"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(jigouPath({ q: q.trim() || undefined }));
          }}
        >
          <label htmlFor="site-q" className="sr-only">搜索养老机构和上门服务</label>
          <input
            id="site-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜机构、服务商、街道，如「海珠 失智」"
            className="h-11 min-w-0 flex-1 border-0 px-4 text-[15px] outline-none"
          />
          <button type="submit" className="bg-brand px-7 text-[15px] font-semibold text-white hover:bg-brand-dark">
            搜索
          </button>
        </form>
      </div>
      <nav aria-label="主导航" className="container-site flex gap-7 overflow-x-auto text-base">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n.href, n.exact) ? "page" : undefined}
            className={`shrink-0 border-b-[3px] py-3 no-underline ${
              isActive(n.href, n.exact) ? "border-brand font-semibold text-brand" : "border-transparent text-ink hover:text-brand"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
