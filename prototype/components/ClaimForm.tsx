"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitClaim } from "@/app/actions";

const DOCS = {
  home: ["民办非企业单位登记证书 / 营业执照", "养老机构备案回执", "押金、会员费存管协议（收取的话）", "收费价目表（按护理类型分档）", "内设医疗机构执业许可证（有的话）"],
  service: ["营业执照", "护理员职业技能等级证书", "服务价目表", "预付款说明（收不收、最多预收多久）", "医疗机构执业登记（护理站）"],
};

export function ClaimForm({ providerId, providerName, kind }: { providerId: string; providerName: string; kind: "home" | "service" }) {
  const [state, action, pending] = useActionState(submitClaim, undefined);
  const v = state?.values;
  if (state?.ok) {
    return (
      <div className="card flex flex-col gap-2 p-6">
        <h2 className="m-0 text-lg font-semibold text-gradeA">认领申请已提交</h2>
        <p className="m-0 text-body">
          申请号 <b>{state.id}</b>。平台会核对材料，并拨打官方名单上的电话确认是本机构申请，一般 2 个工作日内出结果。
        </p>
        <p className="m-0 text-[13px] text-sub">原型演示：到 <Link href="/admin/claims">运营后台 · 认领审核</Link> 通过后，档案会变成 B 级并开放在线预约。</p>
      </div>
    );
  }
  return (
    <form action={action} className="card flex flex-col gap-4 p-6">
      <input type="hidden" name="providerId" value={providerId} />
      <h2 className="m-0 text-lg font-semibold">认领「{providerName}」</h2>
      <label className="flex flex-col gap-1">
        <span className="label">申请人和职务</span>
        <input name="applicant" defaultValue={v?.applicant} className="input" placeholder="如：张示例（院长）" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">联系电话</span>
        <input name="phone" defaultValue={v?.phone} className="input" placeholder="平台会回拨官方名单上的电话核实" />
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="label mb-1">提交的材料（原型里只勾选，不上传文件）</legend>
        {DOCS[kind].map((d, i) => (
          <label key={d} className="flex items-center gap-2 text-body">
            <input type="checkbox" name="docs" value={d} defaultChecked={v ? v.docs.split("|").includes(d) : i < 2} className="accent-brand" />
            {d}
          </label>
        ))}
      </fieldset>
      {state?.error && <p className="m-0 text-[13px] text-risk">{state.error}</p>}
      <button type="submit" className="btn-primary self-start" disabled={pending}>
        {pending ? "提交中…" : "提交认领申请"}
      </button>
      <p className="m-0 text-xs text-sub">认领免费。认领不改变排序；认领后能补全收费、回应报错、接收探访预约。</p>
    </form>
  );
}
