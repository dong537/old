import type { Metadata } from "next";
import Link from "next/link";
import { adminQueues } from "@/lib/admin";
import { AdminNav } from "@/components/AdminNav";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { template: "%s · 运营后台", default: "运营后台" }, robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const q = adminQueues();
  const counts = {
    claims: q.claims.length,
    reports: q.reports.length,
    appeals: q.appeals.length,
    visits: q.visits.length,
    changes: q.changes.length,
    freshness: q.freshness.length,
  };
  return (
    <div className="flex min-h-screen flex-wrap bg-page">
      <aside className="flex w-full flex-col gap-4 bg-admin-nav p-4 text-admin-text md:min-h-screen md:w-[208px]">
        <div className="px-1 pt-1">
          <Logo href="/admin" size="sm" dark subtitle="运营后台" />
        </div>
        <AdminNav counts={counts} />
        <Link href="/guangzhou" className="mt-auto px-3 text-xs text-admin-muted hover:text-white">
          ← 回到前台
        </Link>
      </aside>
      <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-5 p-6">{children}</main>
    </div>
  );
}
