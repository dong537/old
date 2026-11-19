import Link from "next/link";
import { adminQueues } from "@/lib/admin";
import { listLeads, listProviders, listReports } from "@/lib/store";
import { gradeOf } from "@/lib/rules";
import { aiShare, reportOnTimeRate } from "@/lib/stats";
import type { Grade } from "@/lib/types";
import { GradeBadge, Stat } from "@/components/ui";

export const metadata = { title: "数据看板" };

export default function AdminHome() {
  const providers = listProviders();
  const reports = listReports();
  const leads = listLeads();
  const q = adminQueues();
  const ai = aiShare(leads);
  const onTime = reportOnTimeRate(reports);
  const grades = (["A", "B", "C", "D"] as Grade[]).map((g) => ({ g, homes: 0, services: 0 }));
  for (const p of providers) {
    const row = grades.find((x) => x.g === gradeOf(p, reports))!;
    if (p.kind === "home") row.homes += 1;
    else row.services += 1;
  }
  const converted = leads.filter((l) => l.status === "converted").length;
  return (
    <>
      <h1 className="m-0 text-[22px] font-bold">数据看板 · 广州</h1>
      <section className="card grid grid-cols-2 gap-5 p-5 lg:grid-cols-4">
        <Stat label="北极星：来自 AI 的预约占比" value={ai !== undefined ? `${Math.round(ai * 100)}%` : "—"} hint={`近 30 天预约 ${leads.length} 条`} />
        <Stat label="预约到入住或签约" value={leads.length ? `${Math.round((converted / leads.length) * 100)}%` : "—"} hint={`${converted} 条，经回访确认`} />
        <Stat
          label="核验覆盖率（B 级及以上）"
          value={`${Math.round((providers.filter((p) => ["A", "B"].includes(gradeOf(p, reports))).length / providers.length) * 100)}%`}
          hint="机构和服务商分开见下表"
        />
        <Stat label="报错 48 小时内结案" value={onTime !== undefined ? `${Math.round(onTime * 100)}%` : "—"} hint={`未结 ${q.reports.length} 条`} />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-semibold">可信度分布</h2>
          <table>
            <thead>
              <tr>
                <th>等级</th>
                <th className="text-right">养老机构</th>
                <th className="text-right">上门服务商</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((r) => (
                <tr key={r.g}>
                  <td>
                    <GradeBadge grade={r.g} />
                  </td>
                  <td className="text-right">{r.homes}</td>
                  <td className="text-right">{r.services}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-semibold">待处理</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
            {[
              ["/admin/claims", "认领审核", q.claims.length],
              ["/admin/reports", "报错处理（48 小时内结案）", q.reports.length],
              ["/admin/appeals", "线索申诉", q.appeals.length],
              ["/admin/visits", "探访和体验服务抽检", q.visits.length],
              ["/admin/changes", "关键字段修改", q.changes.length],
              ["/admin/freshness", "保鲜到期", q.freshness.length],
            ].map(([href, label, n]) => (
              <li key={href as string} className="flex justify-between">
                <Link href={href as string}>{label}</Link>
                <b>{n}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="m-0 text-[13px] text-sub">AI 引用率（每月用 100 个典型问题测豆包、DeepSeek、文心、Kimi、元宝）要接外部测试脚本，下一期做。</p>
    </>
  );
}
