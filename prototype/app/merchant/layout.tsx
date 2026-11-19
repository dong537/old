import type { Metadata } from "next";
import Link from "next/link";
import { switchMerchant } from "@/app/actions";
import { currentMerchant } from "@/lib/merchant";
import { MERCHANT_ACCOUNTS, getProvider, listLeads, listReports } from "@/lib/store";
import { fieldState } from "@/lib/rules";
import { Logo } from "@/components/ui";
import { MerchantNav } from "@/components/MerchantNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { template: "%s · 机构后台", default: "机构后台" }, robots: { index: false } };

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const p = await currentMerchant();
  const reports = listReports(p.id);
  const counts = {
    leads: listLeads(p.id).filter((l) => l.status === "new").length,
    reports: reports.filter((r) => r.status === "open" && !r.orgReply).length,
    info: p.fields.filter((f) => ["expiring", "expired"].includes(fieldState(f, p.id, reports))).length,
  };
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="border-b border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo href="/merchant" size="sm" />
            <span className="border-l border-line pl-3 text-[15px] text-sub">机构后台</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-sub">示例账号：</span>
            {MERCHANT_ACCOUNTS.map((id) => {
              const a = getProvider(id)!;
              return (
                <form key={id} action={switchMerchant}>
                  <input type="hidden" name="id" value={id} />
                  <button
                    type="submit"
                    className={`chip cursor-pointer border px-2.5 py-1 text-[13px] ${a.id === p.id ? "border-brand bg-brand-tint font-semibold text-brand-ink" : "border-line bg-white text-ink"}`}
                  >
                    {a.name}（{a.kind === "home" ? "养老机构" : "上门服务"}）
                  </button>
                </form>
              );
            })}
            <Link href="/guangzhou" className="text-sub">
              回到前台
            </Link>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-wrap">
        <MerchantNav counts={counts} />
        <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-5 p-6">{children}</main>
      </div>
    </div>
  );
}
