import Link from "next/link";
import { resolveReportAction } from "@/app/actions";
import { getProvider, listReports } from "@/lib/store";
import { providerPath } from "@/lib/paths";
import { fmtMDHM, remaining } from "@/lib/time";
import { Empty } from "@/components/ui";

export const metadata = { title: "报错处理" };

export default function AdminReports() {
  const reports = listReports();
  const open = reports.filter((r) => r.status === "open");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">报错处理</h1>
        <p className="m-0 text-body">48 小时内给结论。属实就写正确的值，档案上这一项改为「平台核验」并记入变更记录；同一项的其他未结报错一并结案。</p>
      </div>
      {open.length ? (
        open.map((r) => {
          const p = getProvider(r.providerId);
          const fld = p?.fields.find((f) => f.key === r.fieldKey);
          const left = remaining(r.deadline);
          return (
            <div key={r.id} className="card flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                {p && (
                  <Link href={providerPath(p)} className="text-[15px] font-semibold">
                    {p.name}
                  </Link>
                )}
                <b>「{r.fieldLabel}」</b>
                <span className="text-sub">
                  {r.id} · {fmtMDHM(r.createdAt)}
                </span>
                <span className={`chip ${left.urgent ? "bg-gradeD-bg text-gradeD" : "bg-gradeB-bg text-gradeB"}`}>{left.text}</span>
              </div>
              <p className="m-0 text-[14px] text-sub">档案现值：{fld?.value}</p>
              <p className="m-0 text-body">家属：{r.content}</p>
              <p className="m-0 text-[14px]">{r.orgReply ? `机构回应：${r.orgReply}` : <span className="text-gradeD">机构还没有回应</span>}</p>
              <div className="flex flex-wrap items-center gap-2">
                <form action={resolveReportAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="conclusion" value="true" />
                  <input name="corrected" className="input h-9 w-[320px] text-[13px]" placeholder="正确的值" />
                  <button className="btn-primary btn-sm">属实，更正</button>
                </form>
                <form action={resolveReportAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="conclusion" value="false" />
                  <button className="btn-ghost btn-sm">不属实，保留原值</button>
                </form>
              </div>
            </div>
          );
        })
      ) : (
        <Empty>没有未结的报错。</Empty>
      )}
    </>
  );
}
