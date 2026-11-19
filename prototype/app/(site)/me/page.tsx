import Link from "next/link";
import { getProvider, listLeads, listReports } from "@/lib/store";
import { CARE_LABEL } from "@/lib/site";
import { providerPath } from "@/lib/paths";
import { fmtMDHM, remaining } from "@/lib/time";
import { Empty, PageTitle } from "@/components/ui";

export const metadata = { title: "我的预约与报错", robots: { index: false } };

const LEAD_STATUS = { new: "已提交，等机构联系", contacted: "机构已联系", visited: "已探访 / 已评估", converted: "已入住 / 已签约", lost: "没有继续" };

export default function Me() {
  const leads = listLeads().filter((l) => l.mine);
  const reports = listReports().filter((r) => r.mine);
  return (
    <>
      <PageTitle title="我的预约与报错" lead="原型里没有登录，这里显示你在这台服务器上提交过的预约和报错；服务重启后会清空。" />
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-semibold">预约</h2>
        {leads.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {leads.map((l) => {
              const p = getProvider(l.providerId);
              return (
                <li key={l.id} className="flex flex-col gap-0.5 border-t border-hair pt-3 first:border-0 first:pt-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <b>{l.kind === "visit" ? "探访预约" : "上门评估预约"}</b>
                    {p && <Link href={providerPath(p)}>{p.name}</Link>}
                    <span className="chip bg-brand-tint text-brand-ink">{LEAD_STATUS[l.status]}</span>
                  </span>
                  <span className="text-[13px] text-sub">
                    {l.id} · {fmtMDHM(l.createdAt)} 提交 · {CARE_LABEL[l.care]} · 希望 {l.preferredDate || "日期待定"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>还没有预约。在机构或服务商的档案页右侧可以预约探访或上门评估。</Empty>
        )}
      </section>
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-semibold">报错</h2>
        {reports.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {reports.map((r) => {
              const p = getProvider(r.providerId);
              const left = remaining(r.deadline);
              return (
                <li key={r.id} className="flex flex-col gap-1 border-t border-hair pt-3 first:border-0 first:pt-0">
                  <span className="flex flex-wrap items-center gap-2">
                    {p && <Link href={providerPath(p)}>{p.name}</Link>}
                    <span>「{r.fieldLabel}」</span>
                    {r.status === "open" ? (
                      <span className={`chip ${left.urgent ? "bg-gradeD-bg text-gradeD" : "bg-gradeB-bg text-gradeB"}`}>核实中 · {left.text}</span>
                    ) : (
                      <span className="chip bg-gradeA-bg text-gradeA">{r.conclusion === "true" ? "属实，已更正" : "核实后原信息无误"}</span>
                    )}
                  </span>
                  <span className="text-body">{r.content}</span>
                  {r.orgReply && <span className="text-[13px] text-body">机构回应：{r.orgReply}</span>}
                  <span className="text-[13px] text-sub">
                    {r.id} · {fmtMDHM(r.createdAt)} 提交
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>还没有报错。档案上每一项旁边都有「这项有误」。</Empty>
        )}
      </section>
    </>
  );
}
