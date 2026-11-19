"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitReport } from "@/app/actions";
import { fmtMDHM } from "@/lib/time";

export function ReportForm({
  providerId,
  providerName,
  backHref,
  fields,
  initialField,
}: {
  providerId: string;
  providerName: string;
  backHref: string;
  fields: { key: string; label: string; value: string }[];
  initialField?: string;
}) {
  const [state, action, pending] = useActionState(submitReport, undefined);
  const v = state?.values ?? {};

  if (state?.ok) {
    return (
      <div className="card flex flex-col gap-3 p-6">
        <h2 className="m-0 text-lg font-semibold text-gradeA">报错已提交</h2>
        <p className="m-0 text-body">
          报错号 <b>{state.id}</b>。我们会请{providerName}先在 24 小时内回应，平台在 {state.deadline ? fmtMDHM(state.deadline) : "48 小时"} 前给出结论。
        </p>
        <p className="m-0 text-body">核实期间，档案上这一项会标「有报错，核实中」。同一项有 2 条及以上没处理完的报错，这家的可信度会降为 D。</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/me" className="font-semibold">查看处理进度 →</Link>
          <Link href={backHref}>回到档案</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="card flex flex-col gap-4 p-6">
      <input type="hidden" name="providerId" value={providerId} />
      <label className="flex flex-col gap-1">
        <span className="label">哪一项有误</span>
        <select key={v.fieldKey ?? initialField} name="fieldKey" defaultValue={v.fieldKey ?? initialField} className="input">
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}：{f.value.length > 28 ? `${f.value.slice(0, 28)}…` : f.value}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">正确的情况是</span>
        <textarea name="content" defaultValue={v.content} rows={4} className="textarea" maxLength={500} placeholder="如：昨天打电话问，失能护理费是 3,100 元/月，不是档案上写的 2,450 元。" />
        <span className="text-xs text-sub">写清楚你是怎么知道的（电话问的、现场看的、收费单上写的），核实会快很多。</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">联系方式（选填）</span>
        <input name="contact" defaultValue={v.contact} className="input" placeholder="需要补充情况时联系你" maxLength={30} />
      </label>
      {state?.error && <p className="m-0 text-[13px] text-risk">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "提交中…" : "提交报错"}
        </button>
        <Link href={backHref} className="btn-ghost">取消</Link>
      </div>
    </form>
  );
}
