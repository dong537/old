import Link from "next/link";
import type { ProviderKind } from "@/lib/types";
import { listProviders, listReports } from "@/lib/store";
import { gradeOf } from "@/lib/rules";
import { MIN_CLAIMED_DAYS, MIN_ELIGIBLE, computeRanking, currentMonth, rankingsFor, whyNotEligible } from "@/lib/rankings";
import { bangdanPath, providerPath } from "@/lib/paths";
import { JsonLd } from "@/components/JsonLd";
import { GradeBadge, Notice, PageTitle, SampleTag } from "@/components/ui";

export const metadata = { title: "广州养老机构和上门服务榜单 · 单项客观指标，公式公开" };

export default async function Bangdan({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab: ProviderKind = (await searchParams).tab === "service" ? "service" : "home";
  const all = listProviders();
  const reports = listReports();
  const results = rankingsFor(tab).map((def) => computeRanking(def, all, reports));
  const ofKind = all.filter((p) => p.kind === tab);
  const reasons = new Map<string, number>();
  for (const p of ofKind) for (const r of whyNotEligible(p, reports)) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  const pool = results[0]?.poolSize ?? 0;

  return (
    <>
      <JsonLd
        data={results
          .filter((r) => r.published)
          .map((r) => ({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `广州${tab === "home" ? "养老机构" : "上门服务"}${r.def.name} ${currentMonth()}`,
            description: r.def.method,
            itemListElement: r.rows.slice(0, 10).map((row, i) => ({ "@type": "ListItem", position: i + 1, name: row.p.name })),
          }))}
      />
      <PageTitle
        title={`榜单 · ${currentMonth()}`}
        lead="只做单项客观指标，每个榜的公式和数据时段写在榜单上。付费买不到名次；有风险提示、可信度为 D、认领不满 30 天的不参与；同城同类能参与的不足 5 家，整个榜不发布。"
      />
      <nav className="flex gap-2">
        {(["home", "service"] as const).map((k) => (
          <Link
            key={k}
            href={bangdanPath(k)}
            aria-current={k === tab ? "page" : undefined}
            className={`chip px-4 py-2 text-[15px] no-underline ${k === tab ? "bg-brand text-white hover:text-white" : "border border-line bg-white text-ink"}`}
          >
            {k === "home" ? "养老机构" : "上门服务"}
          </Link>
        ))}
      </nav>

      <Notice tone={pool >= MIN_ELIGIBLE ? "info" : "warn"}>
        {tab === "home" ? "养老机构" : "上门服务商"}共 {ofKind.length} 家，本月能参与排名的 <b>{pool}</b> 家
        {pool < MIN_ELIGIBLE ? `，不足 ${MIN_ELIGIBLE} 家，本月所有${tab === "home" ? "机构" : "上门服务"}榜单都不发布。` : "。"}
        没参与的原因：
        {[...reasons.entries()].map(([r, n]) => `${r} ${n} 家`).join("；") || "无"}。
      </Notice>

      <div className="grid gap-4 lg:grid-cols-3">
        {results.map((r) => (
          <section key={r.def.name} className="card flex flex-col gap-3 p-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 text-lg font-semibold">{r.def.name}</h2>
              <span className="text-body">{r.def.question}</span>
            </div>
            {r.published ? (
              r.rows.length ? (
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {r.rows.slice(0, 10).map((row, i) => (
                    <li key={row.p.id} className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${i < 3 ? "bg-brand text-white" : "bg-page text-sub"}`}>{i + 1}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <Link href={providerPath(row.p)} className="truncate">
                          {row.p.name}
                        </Link>
                        <span className="flex items-center gap-1.5 text-xs text-sub">
                          {row.p.district}区 <GradeBadge grade={gradeOf(row.p, reports)} /> <SampleTag />
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">{r.def.display(row.score)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-sub">能参与的机构都没有足够的数据。</p>
              )
            ) : (
              <p className="m-0 rounded-lg bg-page px-3 py-4 text-center text-body">
                本月不发布
                <span className="block text-[13px] text-sub">
                  能参与排名的只有 {r.poolSize} 家，不足 {MIN_ELIGIBLE} 家
                </span>
              </p>
            )}
            <details className="mt-auto border-t border-hair pt-3 text-[13px]">
              <summary className="cursor-pointer text-brand">怎么算的</summary>
              <p className="m-0 mt-2 text-body">{r.def.method}</p>
              <p className="m-0 mt-1 text-sub">
                数据时段：近 12 个月，每月 1 日更新。参与条件：已认领并核验、认领满 {MIN_CLAIMED_DAYS} 天、可信度 B 级及以上、没有风险提示。
              </p>
            </details>
          </section>
        ))}
      </div>
      <p className="m-0 text-[13px] text-sub">榜单里的机构是原型示例。往月存档、口碑类榜单（要攒够带凭证的回访后再上）在下一期。</p>
    </>
  );
}
