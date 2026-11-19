import Link from "next/link";
import type { Grade, Home, ServiceProvider } from "@/lib/types";
import { CARE_LABEL, ORG_TYPE_LABEL } from "@/lib/site";
import { feeFrom, followupStats } from "@/lib/rules";
import { homePath, servicePath } from "@/lib/paths";
import { ClaimTag, GradeBadge, RiskBadge, SampleTag } from "./ui";

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warn" | "muted" }) {
  const c = tone === "good" ? "text-gradeA" : tone === "warn" ? "text-gradeD" : tone === "muted" ? "text-sub" : "text-ink";
  return (
    <span className="flex flex-col">
      <span className="text-xs text-sub">{label}</span>
      <span className={`text-[14px] font-semibold ${c}`}>{value}</span>
    </span>
  );
}

const custodyText = (h: Home) => {
  const items = [h.deposit, h.membership].filter((c) => c.amount > 0);
  if (!h.claimed) return { text: "未认领，未核验", tone: "muted" as const };
  if (!items.length) return { text: "不收押金和会员费", tone: "good" as const };
  if (items.every((c) => c.status === "custodied")) return { text: "已存管", tone: "good" as const };
  return { text: "有未存管的款项", tone: "warn" as const };
};

export function HomeCard({ h, grade, risks, care }: { h: Home; grade: Grade; risks: number; care?: string }) {
  const fee = feeFrom(h, care);
  const official = h.fields.find((f) => f.key === "officialPrice")?.value;
  const custody = custodyText(h);
  const fu = followupStats(h);
  return (
    <article className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-[17px] font-semibold">
            <Link href={homePath(h.id)} className="text-ink no-underline hover:text-brand">
              {h.name}
            </Link>
          </h3>
          <span className="text-[13px] text-sub">
            {h.district}区 · {h.ownership} · {h.beds} 张床 · 收住{h.careTypes.map((c) => CARE_LABEL[c]).join("、")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SampleTag />
          <ClaimTag claimed={h.claimed} verified={h.verified} />
          <GradeBadge grade={grade} />
          <RiskBadge n={risks} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Fact
          label={care ? `${CARE_LABEL[care as keyof typeof CARE_LABEL]}月费` : "月费"}
          value={fee !== undefined ? `${fee.toLocaleString("zh-CN")} 元起` : official ? `官方登记 ${official}` : "未公开"}
          tone={fee === undefined ? "muted" : undefined}
        />
        <Fact label="空床" value={h.claimed ? `${h.vacantBeds} 张` : "未知"} tone={!h.claimed ? "muted" : h.vacantBeds === 0 ? "warn" : undefined} />
        <Fact label="等级" value={h.level ? `${["一", "二", "三", "四", "五"][h.level - 1]}级` : "未评"} tone={h.level ? undefined : "muted"} />
        <Fact label="长护险" value={h.ltci ? "定点" : "非定点"} tone={h.ltci ? "good" : "muted"} />
        <Fact label="医疗" value={h.medical} tone={h.medical === "无" ? "muted" : undefined} />
        <Fact label="押金会员费" value={custody.text} tone={custody.tone} />
      </div>
      {fu.n > 0 && (
        <p className="m-0 text-[13px] text-sub">
          平台回访 {fu.n} 条，{fu.kept} 条说收费和服务与入住前一致
        </p>
      )}
    </article>
  );
}

export function ServiceCard({ s, grade, risks, item }: { s: ServiceProvider; grade: Grade; risks: number; item?: string }) {
  const shown = item ? s.items.filter((i) => i.name === item) : s.items.slice(0, 3);
  const fu = followupStats(s);
  return (
    <article className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-[17px] font-semibold">
            <Link href={servicePath(s.id)} className="text-ink no-underline hover:text-brand">
              {s.name}
            </Link>
          </h3>
          <span className="text-[13px] text-sub">
            {ORG_TYPE_LABEL[s.orgType]} · 服务{s.areas.map((a) => `${a}区`).join("、")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SampleTag />
          <ClaimTag claimed={s.claimed} verified={s.verified} />
          <GradeBadge grade={grade} />
          <RiskBadge n={risks} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="长护险居家护理" value={s.ltci ? "定点" : "非定点"} tone={s.ltci ? "good" : "muted"} />
        <Fact
          label="长护险年度考核"
          value={s.ltciReview ? `${s.ltciReview.year} · ${s.ltciReview.result}` : "—"}
          tone={s.ltciReview?.result === "不合格" ? "warn" : s.ltciReview ? undefined : "muted"}
        />
        <Fact label="护理员持证" value={s.claimed ? `${s.staff.certified}/${s.staff.total} 人` : "未知"} tone={s.claimed ? undefined : "muted"} />
        <Fact label="预付款" value={!s.claimed ? "未知" : s.prepay.takes ? `最多预收 ${s.prepay.maxMonths} 个月` : "不收"} tone={!s.claimed ? "muted" : s.prepay.takes ? "warn" : "good"} />
      </div>
      {shown.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {shown.map((i) => (
            <span key={i.name} className="chip bg-page text-[13px] text-body">
              {i.name} {i.price} 元/{i.unit}
              {i.ltci && <span className="text-gradeA">· 可用长护险</span>}
            </span>
          ))}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-sub">{s.claimed ? "暂无价目" : "未认领，暂无价目"}</p>
      )}
      {fu.n > 0 && (
        <p className="m-0 text-[13px] text-sub">
          平台回访 {fu.n} 条，{fu.kept} 条说上门时间、服务和收费与约定一致
        </p>
      )}
    </article>
  );
}
