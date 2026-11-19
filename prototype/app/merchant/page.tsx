import Link from "next/link";
import { currentMerchant } from "@/lib/merchant";
import { listLeads, listProviders, listReports } from "@/lib/store";
import { LEAD_SOURCE_LABEL } from "@/lib/site";
import { GRADE_DESC, completeness, fieldState, gradeOf, riskFlags } from "@/lib/rules";
import { computeRanking, rankingsFor, whyNotEligible } from "@/lib/rankings";
import { aiShare } from "@/lib/stats";
import { providerPath } from "@/lib/paths";
import { GradeBadge, Notice, Stat } from "@/components/ui";

export const metadata = { title: "工作台" };

export default async function MerchantHome() {
  const p = await currentMerchant();
  const reports = listReports();
  const mine = listReports(p.id);
  const leads = listLeads(p.id);
  const grade = gradeOf(p, reports);
  const comp = completeness(p);
  const ai = aiShare(leads);
  const converted = leads.filter((l) => l.status === "converted").length;
  const why = whyNotEligible(p, reports);
  const ranks = rankingsFor(p.kind).map((d) => computeRanking(d, listProviders(), reports));
  const stale = p.fields.filter((f) => ["expiring", "expired"].includes(fieldState(f, p.id, reports)));
  const bySource = new Map<string, number>();
  for (const l of leads) bySource.set(l.sourceDetail, (bySource.get(l.sourceDetail) ?? 0) + 1);
  const max = Math.max(1, ...bySource.values());

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[22px] font-bold">{p.name}</h1>
        <Link href={providerPath(p)}>看前台档案 →</Link>
      </div>

      <section className="card grid grid-cols-2 gap-5 p-5 lg:grid-cols-5">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-sub">可信度</span>
          <GradeBadge grade={grade} large />
          <span className="text-xs text-sub">{GRADE_DESC[grade]}</span>
        </div>
        <Stat label="信息完整度" value={`${comp.done}/${comp.total}`} hint={<Link href="/merchant/info">去补全</Link>} />
        <Stat label="近 30 天预约" value={`${leads.length} 条`} hint={`已入住 / 签约 ${converted} 条`} />
        <Stat label="来自 AI 助手" value={ai !== undefined ? `${Math.round(ai * 100)}%` : "—"} hint="平台的北极星指标" />
        <Stat label="线索余额" value={`${p.leadBalance} 条`} hint="充值在下一期" />
      </section>

      {riskFlags(p).length > 0 && <Notice tone="risk">你的档案有 {riskFlags(p).length} 条风险提示，暂时不能进榜单。对风险提示有异议，可以在档案上对这一项报错申诉。</Notice>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-semibold">预约从哪里来</h2>
          <p className="m-0 text-[13px] text-sub">家属点开档案时，平台记录来源：AI 助手引用了你的档案、搜索引擎、或直接访问。</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {[...bySource.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, n]) => {
                const src = leads.find((l) => l.sourceDetail === name)!.source;
                return (
                  <li key={name} className="flex items-center gap-3 text-[14px]">
                    <span className="w-[88px] shrink-0">{name}</span>
                    <span className="h-3 flex-1 rounded bg-hair">
                      <span className={`block h-3 rounded ${src === "ai" ? "bg-brand" : src === "search" ? "bg-gradeB" : "bg-[#B5BAC1]"}`} style={{ width: `${(n / max) * 100}%` }} />
                    </span>
                    <span className="w-[90px] shrink-0 text-right text-sub">
                      {n} 条 · {LEAD_SOURCE_LABEL[src]}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="m-0 text-lg font-semibold">榜单位置</h2>
          {why.length ? (
            <p className="m-0 text-body">本月没有参与排名：{why.join("；")}。</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
              {ranks.map((r) => {
                const idx = r.rows.findIndex((row) => row.p.id === p.id);
                return (
                  <li key={r.def.name} className="flex justify-between gap-3">
                    <span>{r.def.name}</span>
                    <span className="text-body">
                      {!r.published ? `本月不发布（能参与的只有 ${r.poolSize} 家）` : idx >= 0 ? `第 ${idx + 1} 名 · ${r.def.display(r.rows[idx].score)}` : "数据不足，未参与"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="m-0 text-xs text-sub">名次只看公式里的指标，年费和线索包都买不到名次。</p>
        </section>
      </div>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-semibold">待办</h2>
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
          {leads.filter((l) => l.status === "new").length > 0 && (
            <li>
              <Link href="/merchant/leads">{leads.filter((l) => l.status === "new").length} 条新预约</Link>，请尽快联系家属
            </li>
          )}
          {mine.filter((r) => r.status === "open" && !r.orgReply).length > 0 && (
            <li>
              <Link href="/merchant/reports">{mine.filter((r) => r.status === "open" && !r.orgReply).length} 条报错</Link>等你回应（24 小时内回应计入报错响应榜）
            </li>
          )}
          {stale.map((f) => (
            <li key={f.key}>
              「{f.label}」{fieldState(f, p.id, reports) === "expired" ? "已过保鲜期，档案降为 D" : "快到保鲜期"}，<Link href="/merchant/info">去确认</Link>
            </li>
          ))}
          {p.visits.every((v) => v.audit !== "pass") && <li>还没有通过抽检的{p.kind === "home" ? "实地探访" : "体验服务"}，完成后可升为 A 级</li>}
        </ul>
      </section>
    </>
  );
}
