import Link from "next/link";
import { auditVisitAction } from "@/app/actions";
import { adminQueues } from "@/lib/admin";
import { providerPath } from "@/lib/paths";
import { fmtDate } from "@/lib/time";
import { Empty } from "@/components/ui";

export const metadata = { title: "探访抽检" };

export default function AdminVisits() {
  const { visits } = adminQueues();
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">探访和体验服务抽检</h1>
        <p className="m-0 text-body">城市合伙人提交的实地探访（机构）和体验服务（上门服务商）记录。抽检通过后才计入 A 级；不通过的需要重新探访。</p>
      </div>
      {visits.length ? (
        visits.map(({ p, v }) => (
          <div key={v.id} className="card flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={providerPath(p)} className="font-semibold">
                {p.name}
              </Link>
              <span className="text-[13px] text-sub">
                {fmtDate(v.date)} · {v.by} · 照片 {v.photos} 张
              </span>
            </div>
            <ul className="m-0 flex flex-col gap-0.5 pl-5 text-body">
              {v.findings.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <form action={auditVisitAction}>
                <input type="hidden" name="providerId" value={p.id} />
                <input type="hidden" name="visitId" value={v.id} />
                <input type="hidden" name="decision" value="pass" />
                <button className="btn-primary btn-sm">抽检通过</button>
              </form>
              <form action={auditVisitAction}>
                <input type="hidden" name="providerId" value={p.id} />
                <input type="hidden" name="visitId" value={v.id} />
                <input type="hidden" name="decision" value="fail" />
                <button className="btn-ghost btn-sm">不通过，重新探访</button>
              </form>
            </div>
          </div>
        ))
      ) : (
        <Empty>没有待抽检的记录。</Empty>
      )}
    </>
  );
}
