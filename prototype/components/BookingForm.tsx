"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { submitLead } from "@/app/actions";
import { AI_REFERRERS, CARE_LABEL, CARE_TYPES, SEARCH_REFERRERS } from "@/lib/site";
import type { CareType, ProviderKind } from "@/lib/types";

/** 判断这次访问从哪里来：先看 ?src=，再看来源页 */
function detectSource(): { source: "ai" | "search" | "direct"; detail: string } {
  const src = new URLSearchParams(location.search).get("src")?.toLowerCase() ?? "";
  const ref = document.referrer.toLowerCase();
  for (const hay of [src, ref]) {
    if (!hay) continue;
    const ai = AI_REFERRERS.find((r) => hay.includes(r.match));
    if (ai) return { source: "ai", detail: ai.name };
    const se = SEARCH_REFERRERS.find((r) => hay.includes(r.match));
    if (se) return { source: "search", detail: se.name };
  }
  return { source: "direct", detail: "直接访问" };
}

export function BookingForm({
  providerId,
  kind,
  careTypes,
  canBook,
  phone,
}: {
  providerId: string;
  kind: ProviderKind;
  careTypes: CareType[];
  canBook: boolean;
  phone: string;
}) {
  const [state, action, pending] = useActionState(submitLead, undefined);
  const [src, setSrc] = useState({ source: "direct", detail: "直接访问" });
  useEffect(() => setSrc(detectSource()), []);
  const what = kind === "home" ? "预约探访" : "预约上门评估";
  const v = state?.values ?? {};

  if (!canBook) {
    return (
      <div className="card flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-semibold">{what}</h2>
        <p className="m-0 text-body">这家还没有认领，暂时不能在线预约。可以直接拨打登记电话：</p>
        <p className="m-0 text-lg font-semibold">{phone}</p>
        <p className="m-0 text-xs text-sub">电话来自官方公开名单。机构认领后，才会开放在线预约。</p>
      </div>
    );
  }

  if (state?.ok) {
    return (
      <div className="card flex flex-col gap-3 border-[#BFE3CC] p-5">
        <h2 className="m-0 text-lg font-semibold text-gradeA">预约已提交</h2>
        <p className="m-0 text-body">
          预约号 <b>{state.id}</b>。{kind === "home" ? "机构" : "服务商"}会在 1 个工作日内打电话和你约时间。这条预约只发给这一家，不会转给其他机构。
        </p>
        <p className="m-0 text-body">
          {kind === "home" ? "探访" : "评估"}之后，平台会回访你一次，问问{kind === "home" ? "收费和服务和介绍的是否一致" : "上门时间、服务和收费是否和约定一致"}。
        </p>
        <Link href="/me" className="font-semibold">在「我的预约」里查看 →</Link>
      </div>
    );
  }

  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-semibold">{what}</h2>
        <p className="m-0 text-[13px] text-sub">
          {kind === "home" ? "先到现场看房间、看护理区，再决定。" : "先请服务商上门看看老人情况，再定服务次数和价格。"}平台不收你任何费用，也不收机构的入住返佣。
        </p>
      </div>
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="source" value={src.source} />
      <input type="hidden" name="sourceDetail" value={src.detail} />
      <label className="flex flex-col gap-1">
        <span className="label">联系人称呼</span>
        <input name="contactName" defaultValue={v.contactName} className="input" placeholder="如：陈女士" maxLength={20} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">手机号</span>
        <input name="phone" defaultValue={v.phone} className="input" inputMode="numeric" placeholder="11 位手机号" maxLength={13} />
      </label>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="label mb-1">老人的身体情况</legend>
        <div className="flex flex-wrap gap-2">
          {CARE_TYPES.filter((c) => careTypes.includes(c)).map((c, i) => (
            <label key={c} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-tint">
              <input type="radio" name="care" value={c} defaultChecked={v.care ? v.care === c : i === 0} className="accent-brand" />
              {CARE_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="label">希望的日期</span>
        <input type="date" name="preferredDate" defaultValue={v.preferredDate} className="input" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">想了解什么（选填）</span>
        <textarea name="needs" defaultValue={v.needs} rows={2} className="textarea" maxLength={200} placeholder="如：能不能用长护险、晚上有没有护士" />
        <span className="text-xs text-sub">不用填病历和诊断。</span>
      </label>
      <label className="flex items-start gap-2 text-[13px] text-body">
        <input type="checkbox" name="consent" className="mt-1 accent-brand" />
        <span>
          我同意把联系方式和老人的身体情况提供给这一家{kind === "home" ? "机构" : "服务商"}，用于安排{kind === "home" ? "探访" : "上门评估"}。老人的健康情况属于敏感个人信息，平台只转给这一家，不做其他用途。
        </span>
      </label>
      {state?.error && <p className="m-0 text-[13px] text-risk">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "提交中…" : `提交${what}`}
      </button>
      <p className="m-0 text-xs text-sub">本次访问来源：{src.detail}（用于统计有多少家属是通过 AI 助手找到这里的）</p>
    </form>
  );
}
