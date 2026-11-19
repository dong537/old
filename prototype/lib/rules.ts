import type { FieldState, Grade, Home, InfoField, Provider, Report, ServiceProvider, SourceType } from "./types";
import { addDays, daysUntil } from "./time";

export const GRADE_LABEL: Record<Grade, string> = {
  A: "A 已探访",
  B: "B 已核验",
  C: "C 仅官方信息",
  D: "D 待核实",
};

export const GRADE_DESC: Record<Grade, string> = {
  A: "已认领，资质已核验，实地探访（上门服务商为体验服务）在有效期内并通过平台抽检",
  B: "已认领，资质和存管状态（上门服务商为资质和预付款情况）都已核验",
  C: "还没认领，或认领审核中，只展示官方公示的字段",
  D: "有 2 条及以上未处理的报错，或有关键字段超过保鲜期",
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  official: "官方公示",
  platform: "平台核验",
  org: "机构提交",
  family: "家属反馈",
};

export const SOURCE_DESC: Record<SourceType, string> = {
  official: "政府部门公开的名单、公示或登记信息，按原文录入",
  platform: "平台核对过材料，或城市合伙人实地看过、平台抽检过",
  org: "机构或服务商认领后自己提交，由提交方负责",
  family: "平台回访入住或接受过服务的家属，尚未经机构确认",
};

/** 报错处理时限 */
export const REPORT_SLA_HOURS = 48;
/** 机构先回应的时限 */
export const ORG_REPLY_HOURS = 24;
/** 进入「即将过期」提醒的天数 */
export const EXPIRING_DAYS = 14;
/** 探访、体验服务有效期 */
export const VISIT_VALID_DAYS = 365;
/** 回访少于这个数不显示比例 */
export const FOLLOWUP_MIN = 5;
/** 七部门《关于加强养老机构预收费监管的指导意见》：服务费预收最长 12 个月 */
export const PREPAY_MAX_MONTHS = 12;
/** 同一文件：单个老人的押金最多是月床位费的 12 倍 */
export const DEPOSIT_MAX_BED_MONTHS = 12;

/** 保鲜期（天），方案里的建议值，上线前再定 */
export const TTL = {
  price: 90,
  vacancy: 7,
  credit: 30,
  custody: 365,
  medical: 365,
  visit: VISIT_VALID_DAYS,
};

export function expiresAt(f: InfoField): string | undefined {
  return f.ttlDays ? addDays(f.confirmedAt, f.ttlDays) : undefined;
}

export function openReportsFor(reports: Report[], providerId: string, fieldKey?: string) {
  return reports.filter(
    (r) => r.providerId === providerId && r.status === "open" && (fieldKey === undefined || r.fieldKey === fieldKey),
  );
}

export function fieldState(f: InfoField, providerId: string, reports: Report[]): FieldState {
  if (openReportsFor(reports, providerId, f.key).length > 0) return "disputed";
  if (f.pendingValue) return "pending";
  const exp = expiresAt(f);
  if (exp && f.ttlDays) {
    const left = daysUntil(exp);
    if (left <= 0) return "expired";
    if (left <= expiringWindow(f.ttlDays)) return "expiring";
  }
  return "ok";
}

/** 提醒窗口：一般到期前 14 天；空床这类保鲜期很短的字段，按保鲜期的 30% 算（7 天 → 2 天） */
export function expiringWindow(ttlDays: number) {
  return Math.min(EXPIRING_DAYS, Math.ceil(ttlDays * 0.3));
}

export function field(p: Provider, key: string) {
  return p.fields.find((f) => f.key === key);
}

/** 有效的探访：在有效期内，并且平台抽检通过 */
export function validVisit(p: Provider) {
  return p.visits.find((v) => v.audit === "pass" && daysUntil(v.validUntil) > 0);
}

/**
 * 可信度（沿用知底，口径按养老调整）：
 * - D：任一字段有 2 条及以上未处理报错，或有字段超过保鲜期
 * - C：未认领，或认领后资质还没核验
 * - A：已核验，且探访（体验服务）在有效期内并通过抽检
 * - B：其余已核验的
 * 风险提示不参与计算。
 */
export function gradeOf(p: Provider, reports: Report[]): Grade {
  const disputedHard = p.fields.some((f) => openReportsFor(reports, p.id, f.key).length >= 2);
  const expired = p.fields.some((f) => fieldState(f, p.id, reports) === "expired");
  if (disputedHard || expired) return "D";
  if (!p.claimed || !p.verified) return "C";
  if (validVisit(p)) return "A";
  return "B";
}

export interface RiskFlag {
  kind: string;
  text: string;
  agency?: string;
  date?: string;
  link?: string;
  /** 平台按规则判断出来的，而不是官方记录 */
  derived?: boolean;
}

/**
 * 风险提示：官方负面记录 + 按收费规则判断出的不合规情况。
 * 和 A–D 等级分开显示；有风险提示的不能进榜单。
 */
export function riskFlags(p: Provider): RiskFlag[] {
  const flags: RiskFlag[] = p.risks.map((r) => ({ ...r }));
  if (p.kind === "home") {
    if (p.ownership !== "民办" && p.membership.amount > 0) {
      flags.push({ kind: "不合规收取会员费", text: `${p.ownership}机构不得收取会员费，该机构登记收取会员费 ${yuan(p.membership.amount)}。`, derived: true });
    } else if (p.membership.amount > 0 && p.membership.status === "not_custodied") {
      flags.push({ kind: "会员费未存管", text: `收取会员费 ${yuan(p.membership.amount)}，但没有提供商业银行第三方存管证明。`, derived: true });
    }
    if (p.deposit.amount > 0 && p.deposit.status === "not_custodied") {
      flags.push({ kind: "押金未存管", text: `收取押金 ${yuan(p.deposit.amount)}，但没有提供商业银行第三方存管证明。`, derived: true });
    }
    const minBed = Math.min(...p.fees.map((f) => f.bed ?? Infinity));
    if (p.deposit.amount > 0 && Number.isFinite(minBed) && p.deposit.amount > minBed * DEPOSIT_MAX_BED_MONTHS) {
      flags.push({
        kind: "押金超过上限",
        text: `押金 ${yuan(p.deposit.amount)}，超过月床位费（${yuan(minBed)}）的 ${DEPOSIT_MAX_BED_MONTHS} 倍。`,
        derived: true,
      });
    }
    if (p.prepayMonths > PREPAY_MAX_MONTHS) {
      flags.push({ kind: "预收服务费超期", text: `服务费最多预收 ${p.prepayMonths} 个月，超过规定的 ${PREPAY_MAX_MONTHS} 个月。`, derived: true });
    }
  } else if (p.ltciReview?.result === "不合格") {
    flags.push({
      kind: "长护险年度考核不合格",
      text: `${p.ltciReview.year} 年度长护险定点服务机构综合考核结果为「不合格」。`,
      agency: "广州市医疗保险服务中心",
      derived: false,
    });
  }
  return flags;
}

/** 信息完整度：引导认领方补全，也是列表「综合」排序的因素之一 */
export function completeness(p: Provider) {
  const has = (k: string) => p.fields.some((f) => f.key === k && f.value);
  const items =
    p.kind === "home"
      ? [
          has("phone"),
          has("address"),
          has("vacancy"),
          p.fees.length > 0,
          p.fees.every((f) => f.bed !== undefined && f.nursing !== undefined && f.meal !== undefined),
          p.deposit.status !== "not_custodied" || p.deposit.amount === 0,
          p.medical !== "无" || has("medical"),
          !!p.intro,
          p.visits.length > 0,
        ]
      : [
          has("phone"),
          has("address"),
          p.areas.length > 0,
          p.items.length > 0,
          p.staff.total > 0,
          p.staff.backgroundChecked,
          p.prepay.takes === false || p.prepay.maxMonths !== undefined,
          !!p.intro,
          p.visits.length > 0,
        ];
  return { done: items.filter(Boolean).length, total: items.length };
}

/** 回访统计：不足 FOLLOWUP_MIN 条只给条数，不给比例 */
export function followupStats(p: Provider) {
  const n = p.followups.length;
  const kept = p.followups.filter((f) => f.promiseKept).length;
  return { n, kept, rate: n >= FOLLOWUP_MIN ? kept / n : undefined };
}

export function yuan(n: number) {
  return `${n.toLocaleString("zh-CN")} 元`;
}

/** 某个护理类型的月费合计 */
export function monthlyTotal(row: { bed?: number; nursing?: number; meal?: number }) {
  if (row.bed === undefined || row.nursing === undefined || row.meal === undefined) return undefined;
  return row.bed + row.nursing + row.meal;
}

/** 列表上显示的「月费起」：指定护理类型时取该档，否则取最低一档 */
export function feeFrom(h: Home, care?: string) {
  const rows = care ? h.fees.filter((f) => f.care === care) : h.fees;
  const totals = rows.map(monthlyTotal).filter((x): x is number => x !== undefined);
  return totals.length ? Math.min(...totals) : undefined;
}

export function isHome(p: Provider): p is Home {
  return p.kind === "home";
}

export function isService(p: Provider): p is ServiceProvider {
  return p.kind === "service";
}

/** 有效期还剩多少天，已过期为负数 */
export function levelLeft(h: Home) {
  return h.levelValidUntil ? daysUntil(h.levelValidUntil) : undefined;
}
