import type { Home, Provider, ProviderKind, Report, ServiceProvider } from "./types";
import { FOLLOWUP_MIN, followupStats, gradeOf, monthlyTotal, riskFlags } from "./rules";
import { daysUntil } from "./time";

/** 同城同类可以参与排名的不足这个数，整个榜单不发布 */
export const MIN_ELIGIBLE = 5;
/** 认领满多少天才能上榜 */
export const MIN_CLAIMED_DAYS = 30;

export interface RankingDef {
  kind: string;
  for: ProviderKind;
  name: string;
  question: string;
  /** 页面上直接显示这段文字，改公式时说明跟着改 */
  method: string;
  score: (p: Provider, reports: Report[]) => number | undefined;
  display: (score: number) => string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const freshDays = (iso: string) => -daysUntil(iso);

function homeTransparency(h: Home): number {
  const tiers = h.fees.length;
  const full = h.fees.filter((f) => monthlyTotal(f) !== undefined).length;
  const custodyOk = [h.deposit, h.membership].every((c) => c.amount === 0 || c.status === "custodied");
  const fresh = freshDays(h.feesConfirmedAt) <= 30;
  // 同分时核对日期新的在前：减去一个不影响显示（四舍五入）的小数
  return (tiers ? (full / tiers) * 60 : 0) + (custodyOk ? 20 : 0) + (fresh ? 20 : 0) - freshDays(h.feesConfirmedAt) / 10000;
}

function serviceTransparency(s: ServiceProvider): number {
  const priced = s.items.length > 0 ? 50 : 0;
  // 每个项目都有「能不能用长护险」这一栏，有价目就算标注了
  const ltciMarked = s.items.length > 0 ? 10 : 0;
  const prepayClear = !s.prepay.takes || s.prepay.maxMonths !== undefined ? 20 : 0;
  const fresh = freshDays(s.itemsConfirmedAt) <= 30 ? 20 : 0;
  return priced + ltciMarked + prepayClear + fresh - freshDays(s.itemsConfirmedAt) / 10000;
}

export const RANKINGS: RankingDef[] = [
  {
    kind: "transparent",
    for: "home",
    name: "收费透明榜",
    question: "哪些机构把收费讲得最清楚？",
    method:
      "满分 100：按护理类型分档的床位费、护理费、餐费全部公开的档数占比 × 60；押金和会员费都已存管或不收 20；收费明细 30 天内核对过 20。同分时核对日期新的在前。",
    score: (p) => (p.kind === "home" ? homeTransparency(p) : undefined),
    display: (s) => `${Math.round(s)} 分`,
  },
  {
    kind: "kept",
    for: "home",
    name: "回访兑现榜",
    question: "入住以后，哪些机构说到做到？",
    method: `近 12 个月平台回访入住家属，问「服务和收费是否和入住前说的一致」，按「一致」的比例排序。回访不足 ${FOLLOWUP_MIN} 条不参与。`,
    score: (p) => (p.kind === "home" ? followupStats(p).rate : undefined),
    display: pct,
  },
  {
    kind: "response",
    for: "home",
    name: "报错响应榜",
    question: "家属报错以后，哪些机构回应最快？",
    method: "近 12 个月收到的家属报错中，24 小时内回应的比例；一条报错都没收到的不参与。同比例时收到报错多的在前。",
    score: (p) => (p.kind === "home" && p.metrics.reports12m > 0 ? p.metrics.replied24h / p.metrics.reports12m + p.metrics.reports12m / 1000 : undefined),
    display: (s) => pct(Math.floor(s * 100) / 100),
  },
  {
    kind: "kept",
    for: "service",
    name: "回访兑现榜",
    question: "哪些上门服务商说到做到？",
    method: `近 12 个月平台回访接受过服务的家属，问「上门时间、服务内容和收费是否和约定一致」，按「一致」的比例排序。回访不足 ${FOLLOWUP_MIN} 条不参与。`,
    score: (p) => (p.kind === "service" ? followupStats(p).rate : undefined),
    display: pct,
  },
  {
    kind: "transparent",
    for: "service",
    name: "收费透明榜",
    question: "哪些上门服务商把价格讲得最清楚？",
    method: "满分 100：服务项目逐项标价 50；逐项注明能不能用长护险 10；预付款收不收、最多预收多久写清楚 20；价目 30 天内核对过 20。",
    score: (p) => (p.kind === "service" ? serviceTransparency(p) : undefined),
    display: (s) => `${Math.round(s)} 分`,
  },
];

/** 没进榜的原因；空数组表示可以参与排名 */
export function whyNotEligible(p: Provider, reports: Report[]): string[] {
  const out: string[] = [];
  if (!p.claimed) out.push("还没有认领");
  else if (!p.verified) out.push("认领审核中");
  else if (p.claimedAt && -daysUntil(p.claimedAt) < MIN_CLAIMED_DAYS) out.push(`认领不满 ${MIN_CLAIMED_DAYS} 天`);
  const g = gradeOf(p, reports);
  if (g === "D") out.push("可信度为 D（有字段过期或多条报错未处理）");
  if (riskFlags(p).length) out.push("有风险提示");
  return out;
}

export function eligible(list: Provider[], reports: Report[]) {
  return list.filter((p) => whyNotEligible(p, reports).length === 0);
}

export interface RankingResult {
  def: RankingDef;
  published: boolean;
  poolSize: number;
  rows: { p: Provider; score: number }[];
}

export function computeRanking(def: RankingDef, all: Provider[], reports: Report[]): RankingResult {
  const pool = eligible(
    all.filter((p) => p.kind === def.for),
    reports,
  );
  const rows = pool
    .map((p) => ({ p, score: def.score(p, reports) }))
    .filter((r): r is { p: Provider; score: number } => r.score !== undefined)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, "zh-CN"));
  return { def, published: pool.length >= MIN_ELIGIBLE, poolSize: pool.length, rows };
}

export function rankingsFor(kind: ProviderKind) {
  return RANKINGS.filter((r) => r.for === kind);
}

/** 当前统计月，如「2026 年 11 月」 */
export function currentMonth() {
  const t = new Date(Date.now() + 8 * 3600_000);
  return `${t.getUTCFullYear()} 年 ${t.getUTCMonth() + 1} 月`;
}
