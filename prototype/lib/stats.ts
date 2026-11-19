import type { CareType, Home, Lead, Report, ServiceProvider } from "./types";
import { monthlyTotal } from "./rules";

export function median(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface PriceStat {
  label: string;
  n: number;
  median?: number;
  min?: number;
  max?: number;
}

function stat(label: string, xs: number[]): PriceStat {
  return { label, n: xs.length, median: median(xs), min: xs.length ? Math.min(...xs) : undefined, max: xs.length ? Math.max(...xs) : undefined };
}

/** 某个护理类型的月费：全市 + 分区；只用已认领机构公开的完整费目 */
export function homePriceStats(homes: Home[], care: CareType) {
  const pairs = homes
    .filter((h) => h.claimed)
    .flatMap((h) => h.fees.filter((f) => f.care === care).map((f) => ({ h, total: monthlyTotal(f) })))
    .filter((x): x is { h: Home; total: number } => x.total !== undefined);
  const byDistrict = new Map<string, number[]>();
  for (const { h, total } of pairs) byDistrict.set(h.district, [...(byDistrict.get(h.district) ?? []), total]);
  return {
    city: stat("全市", pairs.map((x) => x.total)),
    districts: [...byDistrict.entries()].map(([d, xs]) => stat(`${d}区`, xs)).sort((a, b) => (b.median ?? 0) - (a.median ?? 0)),
    homes: pairs.sort((a, b) => a.total - b.total),
  };
}

/** 上门服务按项目的单价 */
export function servicePriceStats(services: ServiceProvider[]) {
  const map = new Map<string, { unit: string; xs: number[]; ltci: number }>();
  for (const s of services.filter((x) => x.claimed)) {
    for (const it of s.items) {
      const key = `${it.name}|${it.unit}`;
      const cur = map.get(key) ?? { unit: it.unit, xs: [], ltci: 0 };
      cur.xs.push(it.price);
      if (it.ltci) cur.ltci += 1;
      map.set(key, cur);
    }
  }
  return [...map.entries()]
    .map(([key, v]) => ({ ...stat(key.split("|")[0], v.xs), unit: v.unit, ltci: v.ltci }))
    .sort((a, b) => b.n - a.n);
}

/** 北极星：来自 AI 的预约占比 */
export function aiShare(leads: Lead[]) {
  if (!leads.length) return undefined;
  return leads.filter((l) => l.source === "ai").length / leads.length;
}

/** 报错在 48 小时内处理完的比例 */
export function reportOnTimeRate(reports: Report[]) {
  const done = reports.filter((r) => r.status === "resolved" && r.resolvedAt);
  if (!done.length) return undefined;
  return done.filter((r) => r.resolvedAt! <= r.deadline).length / done.length;
}
