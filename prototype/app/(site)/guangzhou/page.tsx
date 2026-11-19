import Link from "next/link";
import { listHomes, listLeads, listProviders, listReports, listServices } from "@/lib/store";
import { CARE_LABEL, CARE_TYPES, DISTRICTS, SITE } from "@/lib/site";
import { gradeOf, riskFlags } from "@/lib/rules";
import { RANKINGS, computeRanking, currentMonth, MIN_ELIGIBLE } from "@/lib/rankings";
import { aiShare, homePriceStats, reportOnTimeRate } from "@/lib/stats";
import { BEFORE_SIGNING, SOURCES } from "@/lib/content";
import { bangdanPath, changhuxianPath, homePath, jiagePath, jigouPath, providerPath, shangmenPath } from "@/lib/paths";
import { JsonLd } from "@/components/JsonLd";
import { SectionTitle, Stat } from "@/components/ui";

export const metadata = { title: `广州养老机构和上门服务 · ${SITE.slogan}` };

export default function CityHome() {
  const homes = listHomes();
  const services = listServices();
  const all = listProviders();
  const reports = listReports();
  const leads = listLeads();
  const ai = aiShare(leads);
  const onTime = reportOnTimeRate(reports);
  const claimed = all.filter((p) => p.claimed && p.verified).length;
  const verifiedPlus = all.filter((p) => ["A", "B"].includes(gradeOf(p, reports))).length;
  const shineng = homePriceStats(homes, "shineng").city;

  const homeRanks = RANKINGS.filter((r) => r.for === "home").map((r) => computeRanking(r, all, reports));
  const serviceRanks = RANKINGS.filter((r) => r.for === "service").map((r) => computeRanking(r, all, reports));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE.name,
          description: SITE.description,
          inLanguage: "zh-CN",
        }}
      />
      <section className="card flex flex-col gap-5 bg-gradient-to-br from-white to-brand-tint p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] font-bold leading-tight sm:text-[32px]">替爸妈选养老，先看可核验的事实</h1>
          <p className="m-0 max-w-[760px] text-[16px] text-body">
            广州 {homes.length} 家养老机构、{services.length} 家上门服务商，一家一张档案。等级、长护险定点、收费明细、押金存管、处罚记录合到一页，每一项都标来源和核对日期。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={jigouPath()} className="btn-primary h-12 px-6 text-[16px]">
            找养老机构（住进去）
          </Link>
          <Link href={shangmenPath()} className="btn-outline h-12 px-6 text-[16px]">
            找上门服务（住在家）
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="text-sub">按老人情况找：</span>
          {CARE_TYPES.map((c) => (
            <Link key={c} href={jigouPath({ care: c })} className="chip border border-line bg-white px-3 py-1 text-[14px] text-ink no-underline hover:border-brand hover:text-brand">
              {CARE_LABEL[c]}
            </Link>
          ))}
          <Link href={jigouPath({ ltci: "1" })} className="chip border border-line bg-white px-3 py-1 text-[14px] text-ink no-underline hover:border-brand hover:text-brand">
            能用长护险
          </Link>
          <Link href={changhuxianPath()} className="text-[14px]">长护险怎么申请 →</Link>
        </div>
      </section>

      <section className="card grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="档案" value={`${all.length} 份`} hint={`机构 ${homes.length} · 上门服务商 ${services.length}`} />
        <Stat label="已认领并核验" value={`${claimed} 家`} hint={`B 级及以上 ${verifiedPlus} 家`} />
        <Stat label="失能老人月费中位数" value={shineng.median ? `${shineng.median.toLocaleString("zh-CN")} 元` : "—"} hint={<Link href={jiagePath("shineng")}>{shineng.n} 家公开了完整费目 →</Link>} />
        <Stat label="报错 48 小时内处理" value={onTime !== undefined ? `${Math.round(onTime * 100)}%` : "—"} hint={`未结 ${reports.filter((r) => r.status === "open").length} 条`} />
        <Stat label="来自 AI 助手的预约" value={ai !== undefined ? `${Math.round(ai * 100)}%` : "—"} hint={`近 30 天共 ${leads.length} 条预约`} />
      </section>

      <section id="commitments" className="flex flex-col gap-3 rounded-xl border border-brand-line bg-brand-tint p-5">
        <SectionTitle title="我们对家属的承诺" extra={<Link href="/rules#commitments">完整规则</Link>} />
        <ul className="m-0 grid gap-2 pl-5 text-[15px] text-brand-ink sm:grid-cols-2">
          <li>
            <b>不收入住返佣。</b>推荐不会跟着佣金走。
          </li>
          <li>
            <b>付费买不到排序。</b>机构年费不含任何排序和榜单权益。
          </li>
          <li>
            <b>平台不经手钱。</b>押金、会员费由银行存管，服务费直接付给机构。
          </li>
          <li>
            <b>负面信息只引官方原文。</b>处罚、考核不合格都附链接，机构可以申诉。
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title={`本月榜单 · ${currentMonth()}`} extra={<Link href={bangdanPath()}>全部榜单和计算方法 →</Link>} />
        <div className="grid gap-4 md:grid-cols-3">
          {homeRanks.map((r) => (
            <div key={r.def.name} className="card flex flex-col gap-2 p-4">
              <div className="flex flex-col">
                <span className="font-semibold">养老机构 · {r.def.name}</span>
                <span className="text-[13px] text-sub">{r.def.question}</span>
              </div>
              {r.published ? (
                <ol className="m-0 flex flex-col gap-1 pl-5 text-[14px]">
                  {r.rows.slice(0, 3).map((row) => (
                    <li key={row.p.id}>
                      <Link href={homePath(row.p.id)}>{row.p.name}</Link>
                      <span className="ml-2 text-sub">{r.def.display(row.score)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-[14px] text-sub">本月不发布：可以参与排名的只有 {r.poolSize} 家，不足 {MIN_ELIGIBLE} 家。</p>
              )}
            </div>
          ))}
        </div>
        <p className="m-0 text-[14px] text-sub">
          上门服务的 {serviceRanks.length} 个榜单本月不发布：可以参与排名的服务商只有 {serviceRanks[0]?.poolSize ?? 0} 家，不足 {MIN_ELIGIBLE} 家。
          <Link href={bangdanPath("service")} className="ml-1">看原因</Link>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="按区找" extra="括号里是上门服务商数（按服务区域算）" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {DISTRICTS.map((d) => {
            const nh = homes.filter((h) => h.district === d).length;
            const ns = services.filter((s) => s.areas.includes(d)).length;
            return (
              <Link key={d} href={jigouPath({ district: d })} className="card flex items-baseline justify-between px-4 py-3 text-ink no-underline hover:border-brand">
                <span className="font-semibold">{d}区</span>
                <span className="text-[13px] text-sub">
                  {nh} 家（{ns}）
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="签约前看三件事" extra="交钱之前，先把这三件事问清楚" />
        <div className="grid gap-4 md:grid-cols-3">
          {BEFORE_SIGNING.map((b) => (
            <div key={b.title} className="card flex flex-col gap-2 p-5">
              <h3 className="m-0 text-[16px] font-semibold">{b.title}</h3>
              <p className="m-0 text-body">{b.text}</p>
              {b.source && (
                <a href={SOURCES[b.source].url} target="_blank" rel="noreferrer" className="text-[13px]">
                  依据：{SOURCES[b.source].title}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link href={changhuxianPath()} className="card flex flex-col gap-1 p-5 text-ink no-underline hover:border-brand">
          <span className="text-[16px] font-semibold">广州长护险指南</span>
          <span className="text-body">谁能申请、怎么评估，住机构和在家护理各有哪些定点，能不能直接结算。</span>
        </Link>
        <Link href={jiagePath()} className="card flex flex-col gap-1 p-5 text-ink no-underline hover:border-brand">
          <span className="text-[16px] font-semibold">价格参考</span>
          <span className="text-body">各区按护理类型的月费中位数，上门护理、助浴、陪护的单价，都注明样本数。</span>
        </Link>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle title="最近更新的档案" />
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
          {all
            .flatMap((p) => p.history.slice(0, 1).map((h) => ({ p, h })))
            .sort((a, b) => b.h.date.localeCompare(a.h.date))
            .slice(0, 5)
            .map(({ p, h }) => (
              <li key={p.id} className="flex flex-wrap gap-x-3">
                <Link href={providerPath(p)}>{p.name}</Link>
                <span className="text-body">{h.text}</span>
                {riskFlags(p).length > 0 && <span className="text-risk">有风险提示</span>}
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
