import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container-site flex flex-1 flex-col gap-6 py-6">{children}</main>
      <footer className="mt-6 border-t border-line bg-white">
        <div className="container-site flex flex-wrap justify-between gap-6 py-6 text-xs text-sub">
          <span>
            {SITE.name}（{SITE.nameNote}）· 养老机构和上门服务的可信信源 · 平台不经手资金，不收入住返佣，付费不改变排序和榜单
          </span>
          <span className="flex flex-wrap gap-4">
            <Link href="/rules" className="text-sub">方法论</Link>
            <Link href="/rules#commitments" className="text-sub">我们不卖什么</Link>
            <Link href="/claim" className="text-sub">机构认领</Link>
            <Link href="/me" className="text-sub">报错与预约</Link>
            <Link href="/llms.txt" className="text-sub">llms.txt</Link>
            <Link href="/api/public/v1/jigou" className="text-sub">公开 API</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
