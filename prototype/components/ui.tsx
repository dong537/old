import Link from "next/link";
import type { ReactNode } from "react";
import type { FieldState, Grade, SourceType } from "@/lib/types";
import { GRADE_DESC, GRADE_LABEL, SOURCE_DESC, SOURCE_LABEL } from "@/lib/rules";
import { SITE } from "@/lib/site";
import { HouseIcon, ShieldIcon } from "./icons";

const GRADE_STYLE: Record<Grade, string> = {
  A: "bg-gradeA-bg text-gradeA",
  B: "bg-gradeB-bg text-gradeB",
  C: "bg-gradeC-bg text-gradeC",
  D: "bg-gradeD-bg text-gradeD",
};

export function GradeBadge({ grade, large = false }: { grade: Grade; large?: boolean }) {
  return (
    <span title={GRADE_DESC[grade]} className={`chip font-semibold ${GRADE_STYLE[grade]} ${large ? "px-2.5 py-1 text-[13px]" : ""}`}>
      {grade === "A" && <ShieldIcon size={large ? 14 : 12} strokeWidth={2} />}
      {GRADE_LABEL[grade]}
    </span>
  );
}

const SOURCE_STYLE: Record<SourceType, string> = {
  official: "bg-official-bg text-official",
  platform: "bg-gradeA-bg text-gradeA",
  org: "bg-gradeB-bg text-gradeB",
  family: "bg-gradeC-bg text-gradeC",
};

export function SourceTag({ source }: { source: SourceType }) {
  return (
    <span title={SOURCE_DESC[source]} className={`chip ${SOURCE_STYLE[source]}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function RiskBadge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="chip border border-risk-line bg-risk-bg font-semibold text-risk">风险提示 {n}</span>;
}

export function SampleTag() {
  return (
    <span className="chip border border-dashed border-[#B5BAC1] text-sub" title="原型阶段的虚构数据">
      示例
    </span>
  );
}

export function ClaimTag({ claimed, verified }: { claimed: boolean; verified: boolean }) {
  if (claimed && verified) return <span className="chip bg-brand-tint text-brand-ink">已认领</span>;
  if (claimed) return <span className="chip bg-gradeD-bg text-gradeD">认领审核中</span>;
  return <span className="chip border border-dashed border-[#B5BAC1] text-gradeC">未认领</span>;
}

export const FIELD_STATE_TEXT: Record<FieldState, string> = {
  ok: "",
  expiring: "即将过期",
  expired: "已过保鲜期",
  disputed: "有报错，核实中",
  pending: "修改审核中",
};

export function FieldStateTag({ state }: { state: FieldState }) {
  if (state === "ok") return null;
  const cls =
    state === "expired" || state === "disputed"
      ? "bg-gradeD-bg text-gradeD"
      : state === "pending"
        ? "bg-gradeB-bg text-gradeB"
        : "bg-gradeD-soft text-gradeD";
  return <span className={`chip ${cls}`}>{FIELD_STATE_TEXT[state]}</span>;
}

export function Logo({ href = "/guangzhou", subtitle, size = "md", dark = false }: { href?: string; subtitle?: string; size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const box = size === "lg" ? "h-12 w-12 rounded-xl" : size === "md" ? "h-10 w-10 rounded-[10px]" : "h-8 w-8 rounded-lg";
  const icon = size === "lg" ? 26 : size === "md" ? 22 : 18;
  const title = size === "lg" ? "text-[24px]" : size === "md" ? "text-[20px]" : "text-[16px]";
  return (
    <Link href={href} className="flex items-center gap-3 no-underline">
      <span className={`flex items-center justify-center bg-brand text-white ${box}`}>
        <HouseIcon size={icon} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className={`font-bold tracking-[1px] ${title} ${dark ? "text-white" : "text-brand"}`}>
          {SITE.name}
          <span className={`ml-1.5 align-middle text-[11px] font-normal tracking-normal ${dark ? "text-admin-muted" : "text-sub"}`}>（{SITE.nameNote}）</span>
        </span>
        {subtitle && <span className={`text-xs ${dark ? "text-admin-muted" : "text-sub"}`}>{subtitle}</span>}
      </span>
    </Link>
  );
}

export function SectionTitle({ id, title, extra }: { id?: string; title: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="m-0 text-lg font-semibold">
        {title}
      </h2>
      {extra && <span className="text-[13px] text-sub">{extra}</span>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-sub">{label}</span>
      <span className="text-[22px] font-semibold leading-tight">{value}</span>
      {hint && <span className="text-xs text-sub">{hint}</span>}
    </div>
  );
}

export function PageTitle({ title, lead, extra }: { title: ReactNode; lead?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[26px] font-bold leading-tight">{title}</h1>
        {extra}
      </div>
      {lead && <p className="m-0 max-w-[820px] text-body">{lead}</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "risk" | "ok"; children: ReactNode }) {
  const cls = {
    info: "border-brand-line bg-brand-tint text-brand-ink",
    warn: "border-gradeD-line bg-gradeD-soft text-gradeD",
    risk: "border-risk-line bg-risk-bg text-risk",
    ok: "border-[#BFE3CC] bg-gradeA-bg text-gradeA",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-[14px] ${cls}`}>{children}</div>;
}

export function Placeholder({ label, className = "" }: { label: string; className?: string }) {
  return <div className={`flex items-center justify-center rounded-[10px] bg-hair text-center text-xs text-sub ${className}`}>{label}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sub">{children}</div>;
}
