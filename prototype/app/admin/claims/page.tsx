import Link from "next/link";
import { decideClaimAction } from "@/app/actions";
import { getProvider, listClaims } from "@/lib/store";
import { providerPath } from "@/lib/paths";
import { fmtMDHM } from "@/lib/time";
import { Empty } from "@/components/ui";

export const metadata = { title: "认领审核" };

export default function AdminClaims() {
  const claims = listClaims();
  const pending = claims.filter((c) => c.status === "pending");
  const done = claims.filter((c) => c.status !== "pending");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">认领审核</h1>
        <p className="m-0 text-body">核对材料，并回拨官方名单上的电话确认是本机构申请。通过后档案变为 B 级、开放在线预约、赠送 5 条线索。</p>
      </div>
      {pending.length ? (
        pending.map((c) => {
          const p = getProvider(c.providerId);
          if (!p) return null;
          return (
            <div key={c.id} className="card flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex flex-wrap items-baseline gap-2">
                  <b className="text-[16px]">{p.name}</b>
                  <span className="text-[13px] text-sub">
                    {c.id} · {fmtMDHM(c.createdAt)} · {p.kind === "home" ? "养老机构" : "上门服务商"}
                  </span>
                </span>
                <Link href={providerPath(p)} className="text-[13px]">看档案</Link>
              </div>
              <div className="grid gap-3 text-[14px] sm:grid-cols-2">
                <div>
                  <span className="text-sub">申请人：</span>
                  {c.applicant} · {c.phone}
                </div>
                <div>
                  <span className="text-sub">官方名单电话：</span>
                  {p.phone}（回拨核实）
                </div>
              </div>
              <ul className="m-0 flex flex-wrap gap-2 p-0">
                {c.docs.map((d) => (
                  <li key={d} className="chip list-none bg-page text-[13px] text-body">
                    {d}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <form action={decideClaimAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button className="btn-primary btn-sm">通过</button>
                </form>
                <form action={decideClaimAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <input name="reason" className="input h-9 w-[280px] text-[13px]" placeholder="不通过的原因（会发给申请人）" />
                  <button className="btn-ghost btn-sm">不通过</button>
                </form>
              </div>
            </div>
          );
        })
      ) : (
        <Empty>没有待审核的认领。</Empty>
      )}
      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-lg font-semibold">已处理</h2>
          {done.map((c) => (
            <div key={c.id} className="card flex flex-wrap gap-x-3 p-3 text-[14px]">
              <b>{getProvider(c.providerId)?.name}</b>
              <span className={c.status === "approved" ? "text-gradeA" : "text-gradeD"}>{c.status === "approved" ? "已通过" : `未通过：${c.reason ?? "—"}`}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
