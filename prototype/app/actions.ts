"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as store from "@/lib/store";
import { APPEAL_REASONS, CARE_TYPES } from "@/lib/site";
import type { CareType, Lead, LeadSource } from "@/lib/types";

function refresh() {
  revalidatePath("/", "layout");
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** 出错时把填过的内容带回去：React 19 提交后会重置表单，不带回去家属就得重填 */
export type FormState = { ok?: boolean; error?: string; id?: string; deadline?: string; values?: Record<string, string> } | undefined;

function echo(fd: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, str(fd, k)]));
}

// ---------- 家属端 ----------

export async function submitLead(_prev: FormState, fd: FormData): Promise<FormState> {
  const providerId = str(fd, "providerId");
  const contactName = str(fd, "contactName");
  const phone = str(fd, "phone").replace(/\s|-/g, "");
  const care = str(fd, "care") as CareType;
  const values = echo(fd, ["contactName", "phone", "care", "preferredDate", "needs"]);
  if (!contactName) return { error: "请填写联系人称呼。", values };
  if (!/^1\d{10}$/.test(phone)) return { error: "请填写 11 位手机号。", values };
  if (!CARE_TYPES.includes(care)) return { error: "请选择老人的身体情况。", values };
  if (fd.get("consent") !== "on") return { error: "需要同意把护理需求提供给这家机构，才能提交预约。", values };
  const source = (["ai", "search", "direct"].includes(str(fd, "source")) ? str(fd, "source") : "direct") as LeadSource;
  const r = store.createLead({
    providerId,
    contactName,
    phone,
    care,
    needs: str(fd, "needs").slice(0, 200),
    preferredDate: str(fd, "preferredDate"),
    source,
    sourceDetail: str(fd, "sourceDetail") || "直接访问",
  });
  if (!r.ok) return { error: r.error, values };
  refresh();
  return { ok: true, id: r.lead.id };
}

export async function submitReport(_prev: FormState, fd: FormData): Promise<FormState> {
  const providerId = str(fd, "providerId");
  const fieldKey = str(fd, "fieldKey");
  const content = str(fd, "content");
  const p = store.getProvider(providerId);
  const fld = p?.fields.find((x) => x.key === fieldKey);
  const values = echo(fd, ["fieldKey", "content", "contact"]);
  if (!p || !fld) return { error: "请选择哪一项信息有误。", values };
  if (content.length < 4) return { error: "请写下正确的情况，最好附上你是怎么知道的。", values };
  const r = store.createReport({ providerId, fieldKey, fieldLabel: fld.label, content: content.slice(0, 500), contact: str(fd, "contact") || undefined });
  refresh();
  return { ok: true, id: r.id, deadline: r.deadline };
}

export async function submitClaim(_prev: FormState, fd: FormData): Promise<FormState> {
  const providerId = str(fd, "providerId");
  const applicant = str(fd, "applicant");
  const phone = str(fd, "phone");
  const docs = fd.getAll("docs").map(String);
  const values = { ...echo(fd, ["applicant", "phone"]), docs: docs.join("|") };
  if (!store.getProvider(providerId)) return { error: "请先选择要认领的机构或服务商。", values };
  if (!applicant || !phone) return { error: "请填写申请人和联系电话。", values };
  if (docs.length < 2) return { error: "至少要提交两项材料。", values };
  const c = store.createClaim({ providerId, applicant, phone, docs });
  if (!c) return { error: "这家已经认领，或已有认领申请在审核中。", values };
  refresh();
  return { ok: true, id: c.id };
}

// ---------- 机构后台 ----------

export async function switchMerchant(fd: FormData) {
  const id = str(fd, "id");
  if ((store.MERCHANT_ACCOUNTS as readonly string[]).includes(id)) (await cookies()).set("merchant", id, { path: "/" });
  refresh();
  redirect("/merchant");
}

export async function setLeadStatusAction(fd: FormData) {
  store.setLeadStatus(str(fd, "leadId"), str(fd, "status") as Lead["status"]);
  refresh();
}

export async function appealLeadAction(fd: FormData) {
  const reason = str(fd, "reason");
  if (APPEAL_REASONS.includes(reason)) store.appealLead(str(fd, "leadId"), reason);
  refresh();
}

export async function orgReplyAction(fd: FormData) {
  store.orgReply(str(fd, "reportId"), str(fd, "reply"));
  refresh();
}

export async function confirmFieldAction(fd: FormData) {
  store.confirmField(str(fd, "providerId"), str(fd, "key"));
  refresh();
}

export async function updateVacancyAction(fd: FormData) {
  store.updateVacancy(str(fd, "providerId"), Number(str(fd, "beds")));
  refresh();
}

export async function requestFieldChangeAction(fd: FormData) {
  store.requestFieldChange(str(fd, "providerId"), str(fd, "key"), str(fd, "value"));
  refresh();
}

// ---------- 运营后台 ----------

export async function decideClaimAction(fd: FormData) {
  store.decideClaim(str(fd, "id"), str(fd, "decision") === "approve", str(fd, "reason"));
  refresh();
}

export async function decideAppealAction(fd: FormData) {
  store.decideAppeal(str(fd, "leadId"), str(fd, "decision") === "approve");
  refresh();
}

export async function resolveReportAction(fd: FormData) {
  store.resolveReport(str(fd, "id"), str(fd, "conclusion") === "true" ? "true" : "false", str(fd, "corrected"));
  refresh();
}

export async function decideFieldChangeAction(fd: FormData) {
  store.decideFieldChange(str(fd, "providerId"), str(fd, "key"), str(fd, "decision") === "approve");
  refresh();
}

export async function auditVisitAction(fd: FormData) {
  store.auditVisit(str(fd, "providerId"), str(fd, "visitId"), str(fd, "decision") === "pass");
  refresh();
}
