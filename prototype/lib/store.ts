import "server-only";

import type { CareType, Claim, Home, Lead, LeadSource, Provider, ProviderKind, Report, ReportConclusion, ServiceProvider } from "./types";
import { pendingVisits, seedClaims, seedHomes, seedLeads, seedReports, seedServices } from "./seed";
import { APPEAL_HOURS } from "./site";
import { ORG_REPLY_HOURS, REPORT_SLA_HOURS } from "./rules";
import { hoursFromNow } from "./time";

/** 报错属实后平台改正的字段，来源名称统一用这个，页面据此提示「平台核实后的值」 */
export const CORRECTED_SOURCE = "家属报错后平台核实更正";
/** 机构修改、平台审核通过的字段 */
export const CHANGED_SOURCE = "机构修改，平台审核通过";

/**
 * 内存数据库：用来跑通家属、机构、运营三端的流程，服务重启后恢复成示例数据。
 * 接真实后端时只需替换这个文件里的函数。
 */
interface DB {
  providers: Provider[];
  leads: Lead[];
  reports: Report[];
  claims: Claim[];
  seq: number;
}

const g = globalThis as unknown as { __yanglaoDb?: DB };

function db(): DB {
  if (!g.__yanglaoDb) {
    const providers: Provider[] = [...seedHomes(), ...seedServices()];
    for (const { providerId, visit } of pendingVisits()) providers.find((p) => p.id === providerId)?.visits.unshift(visit);
    g.__yanglaoDb = { providers, leads: seedLeads(), reports: seedReports(), claims: seedClaims(), seq: 5000 };
  }
  return g.__yanglaoDb;
}

function nextId(prefix: string) {
  const d = db();
  d.seq += 1;
  return `${prefix}-${d.seq}`;
}

const now = () => new Date().toISOString();

/** 机构后台可以切换的两个示例账号 */
export const MERCHANT_ACCOUNTS = ["kangning", "jiajian"] as const;
export type MerchantAccount = (typeof MERCHANT_ACCOUNTS)[number];

// ---------- 读取 ----------

export function listProviders(kind?: ProviderKind): Provider[] {
  return db().providers.filter((p) => !kind || p.kind === kind);
}

export function listHomes(): Home[] {
  return db().providers.filter((p): p is Home => p.kind === "home");
}

export function listServices(): ServiceProvider[] {
  return db().providers.filter((p): p is ServiceProvider => p.kind === "service");
}

export function getProvider(id: string): Provider | undefined {
  return db().providers.find((p) => p.id === id);
}

export function getHome(id: string): Home | undefined {
  const p = getProvider(id);
  return p?.kind === "home" ? p : undefined;
}

export function getService(id: string): ServiceProvider | undefined {
  const p = getProvider(id);
  return p?.kind === "service" ? p : undefined;
}

export function listLeads(providerId?: string): Lead[] {
  return db()
    .leads.filter((l) => !providerId || l.providerId === providerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listReports(providerId?: string): Report[] {
  return db()
    .reports.filter((r) => !providerId || r.providerId === providerId)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

export function listClaims(): Claim[] {
  return [...db().claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------- 家属端 ----------

export function createLead(input: {
  providerId: string;
  contactName: string;
  phone: string;
  care: CareType;
  needs: string;
  preferredDate: string;
  source: LeadSource;
  sourceDetail: string;
}): { ok: true; lead: Lead } | { ok: false; error: string } {
  const p = getProvider(input.providerId);
  if (!p) return { ok: false, error: "没有找到这家机构。" };
  if (!p.claimed) return { ok: false, error: "这家还没有认领，暂时不能在线预约。" };
  if (p.leadBalance <= 0) return { ok: false, error: "这家暂时不接受在线预约，请直接拨打电话。" };
  const lead: Lead = {
    id: nextId("YY"),
    ...input,
    kind: p.kind === "home" ? "visit" : "assessment",
    phone: input.phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
    createdAt: now(),
    status: "new",
    mine: true,
  };
  p.leadBalance -= 1;
  db().leads.push(lead);
  return { ok: true, lead };
}

export function createReport(input: { providerId: string; fieldKey: string; fieldLabel: string; content: string; contact?: string }): Report {
  const report: Report = {
    id: nextId("BC"),
    ...input,
    createdAt: now(),
    deadline: hoursFromNow(REPORT_SLA_HOURS),
    status: "open",
    mine: true,
  };
  db().reports.push(report);
  const p = getProvider(input.providerId);
  if (p?.claimed) p.metrics.reports12m += 1;
  return report;
}

// ---------- 机构后台 ----------

export function setLeadStatus(leadId: string, status: Lead["status"]) {
  const l = db().leads.find((x) => x.id === leadId);
  if (l) l.status = status;
}

/** 线索申诉：48 小时内，每条只能申诉一次 */
export function appealLead(leadId: string, reason: string) {
  const l = db().leads.find((x) => x.id === leadId);
  if (!l || l.appeal) return;
  if (Date.now() - new Date(l.createdAt).getTime() > APPEAL_HOURS * 3600_000) return;
  l.appeal = { reason, createdAt: now(), status: "pending" };
}

export function orgReply(reportId: string, reply: string) {
  const r = db().reports.find((x) => x.id === reportId);
  if (!r || r.status !== "open" || r.orgReply || !reply.trim()) return;
  r.orgReply = reply.trim();
  r.repliedAt = now();
  const p = getProvider(r.providerId);
  const hours = (Date.now() - new Date(r.createdAt).getTime()) / 3600_000;
  if (p && hours <= ORG_REPLY_HOURS) p.metrics.replied24h += 1;
}

/** 确认某项信息「无变化」，保鲜期从今天重新算 */
export function confirmField(providerId: string, key: string) {
  const p = getProvider(providerId);
  const fld = p?.fields.find((x) => x.key === key);
  if (!p || !fld) return;
  fld.confirmedAt = now();
  if (key === "fees" && p.kind === "home") p.feesConfirmedAt = fld.confirmedAt;
  if (key === "items" && p.kind === "service") p.itemsConfirmedAt = fld.confirmedAt;
  p.history.unshift({ date: fld.confirmedAt, text: `确认「${fld.label}」无变化`, by: "机构确认" });
}

/** 更新空床：日常字段，直接生效 */
export function updateVacancy(providerId: string, beds: number) {
  const p = getHome(providerId);
  const fld = p?.fields.find((x) => x.key === "vacancy");
  if (!p || !fld || !Number.isFinite(beds) || beds < 0 || beds > p.beds) return;
  p.vacantBeds = Math.round(beds);
  fld.value = `${p.vacantBeds} 张`;
  fld.confirmedAt = now();
  fld.source = "org";
  p.history.unshift({ date: fld.confirmedAt, text: `空床更新为 ${p.vacantBeds} 张`, by: "机构更新" });
}

/** 关键字段（收费、存管、预付款等）修改：进入待审核，审核期间页面继续显示原值 */
export function requestFieldChange(providerId: string, key: string, value: string) {
  const fld = getProvider(providerId)?.fields.find((x) => x.key === key);
  if (!fld || !value.trim()) return;
  fld.pendingValue = value.trim();
}

export function createClaim(input: { providerId: string; applicant: string; phone: string; docs: string[] }): Claim | undefined {
  const p = getProvider(input.providerId);
  if (!p || p.claimed) return;
  if (db().claims.some((c) => c.providerId === p.id && c.status === "pending")) return;
  const claim: Claim = { id: nextId("RL"), ...input, createdAt: now(), status: "pending", mine: true };
  db().claims.push(claim);
  return claim;
}

// ---------- 运营后台 ----------

export function decideClaim(id: string, approve: boolean, reason: string) {
  const c = db().claims.find((x) => x.id === id);
  if (!c || c.status !== "pending") return;
  c.status = approve ? "approved" : "rejected";
  c.reason = reason || undefined;
  c.decidedAt = now();
  if (!approve) return;
  const p = getProvider(c.providerId);
  if (!p) return;
  p.claimed = true;
  p.verified = true;
  p.claimedAt = c.decidedAt;
  p.leadBalance = 5;
  const phone = p.fields.find((x) => x.key === "phone");
  if (phone) {
    phone.source = "org";
    phone.sourceName = "认领时提交的材料";
    phone.sourceUrl = undefined;
    phone.confirmedAt = c.decidedAt;
  }
  p.history.unshift({ date: c.decidedAt, text: `${p.kind === "home" ? "机构" : "服务商"}完成认领，平台核验了提交的材料；赠送 5 条探访线索`, by: "认领审核通过" });
}

export function decideAppeal(leadId: string, approve: boolean) {
  const l = db().leads.find((x) => x.id === leadId);
  if (!l?.appeal || l.appeal.status !== "pending") return;
  l.appeal.status = approve ? "approved" : "rejected";
  l.appeal.decidedAt = now();
  const p = getProvider(l.providerId);
  if (approve && p) p.leadBalance += 1;
}

export function resolveReport(id: string, conclusion: ReportConclusion, corrected?: string) {
  const r = db().reports.find((x) => x.id === id);
  if (!r || r.status !== "open") return;
  r.status = "resolved";
  r.conclusion = conclusion;
  r.resolvedAt = now();
  const p = getProvider(r.providerId);
  if (!p) return;
  if (conclusion === "true") {
    const fld = p.fields.find((x) => x.key === r.fieldKey);
    if (fld) {
      if (corrected?.trim()) fld.value = corrected.trim();
      fld.source = "platform";
      fld.sourceName = CORRECTED_SOURCE;
      fld.sourceUrl = undefined;
      fld.confirmedAt = r.resolvedAt;
    }
    if (r.fieldKey === "vacancy" && p.kind === "home") {
      const n = parseInt(corrected ?? "", 10);
      if (Number.isFinite(n)) p.vacantBeds = n;
    }
    p.history.unshift({ date: r.resolvedAt, text: `「${r.fieldLabel}」经家属报错、平台核实后更正`, by: "报错处理结论" });
  } else {
    p.history.unshift({ date: r.resolvedAt, text: `家属报错「${r.fieldLabel}」，平台核实后确认原信息无误`, by: "报错处理结论" });
  }
  // 同一字段的其他未结报错一并结案
  for (const o of db().reports) {
    if (o !== r && o.providerId === r.providerId && o.fieldKey === r.fieldKey && o.status === "open") {
      o.status = "resolved";
      o.conclusion = conclusion;
      o.resolvedAt = r.resolvedAt;
    }
  }
}

export function decideFieldChange(providerId: string, key: string, approve: boolean) {
  const p = getProvider(providerId);
  const fld = p?.fields.find((x) => x.key === key && x.pendingValue);
  if (!p || !fld) return;
  const t = now();
  if (approve) {
    p.history.unshift({ date: t, text: `「${fld.label}」由「${fld.value}」改为「${fld.pendingValue}」`, by: "机构修改，平台审核通过" });
    fld.value = fld.pendingValue!;
    fld.confirmedAt = t;
    fld.source = "org";
    fld.sourceName = CHANGED_SOURCE;
    fld.sourceUrl = undefined;
    // 页面上有些内容按结构化字段展示，能解析的同步过去；收费和价目解析不了，页面另行提示新值
    const n = parseInt(fld.value.match(/\d+/)?.[0] ?? "", 10);
    if (key === "phone") p.phone = fld.value;
    if (key === "prepay" && p.kind === "home" && Number.isFinite(n)) p.prepayMonths = n;
    if (key === "prepay" && p.kind === "service") p.prepay = /不收/.test(fld.value) ? { takes: false } : { takes: true, maxMonths: Number.isFinite(n) ? n : undefined };
  }
  fld.pendingValue = undefined;
}

export function auditVisit(providerId: string, visitId: string, pass: boolean) {
  const p = getProvider(providerId);
  const v = p?.visits.find((x) => x.id === visitId);
  if (!p || !v || v.audit !== "pending") return;
  v.audit = pass ? "pass" : "fail";
  p.history.unshift({
    date: now(),
    text: pass ? `${p.kind === "home" ? "实地探访" : "体验服务"}记录通过平台抽检` : `${p.kind === "home" ? "实地探访" : "体验服务"}记录抽检不通过，需要重新探访`,
    by: "平台抽检",
  });
}
