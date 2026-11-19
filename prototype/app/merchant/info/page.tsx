import { confirmFieldAction, requestFieldChangeAction, updateVacancyAction } from "@/app/actions";
import { currentMerchant } from "@/lib/merchant";
import { listReports } from "@/lib/store";
import { expiresAt, fieldState } from "@/lib/rules";
import { fmtDate } from "@/lib/time";
import { FieldStateTag, SourceTag } from "@/components/ui";

export const metadata = { title: "信息维护" };

export default async function MerchantInfo() {
  const p = await currentMerchant();
  const reports = listReports();
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">信息维护</h1>
        <p className="m-0 text-body">
          有保鲜期的字段，到期前点「无变化」重新确认，否则档案降为 D。空床直接更新；收费、存管、预付款这类关键字段，修改后要平台审核，审核期间前台继续显示原值。官方公示的字段不能在这里改，有误请走报错。
        </p>
      </div>
      {p.kind === "home" && (
        <form action={updateVacancyAction} className="card flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="providerId" value={p.id} />
          <label className="flex flex-col gap-1">
            <span className="label">空床（共 {p.beds} 张）</span>
            <input name="beds" type="number" min={0} max={p.beds} defaultValue={p.vacantBeds} className="input w-[140px]" />
          </label>
          <button className="btn-primary">更新空床</button>
          <span className="text-[13px] text-sub">空床保鲜期 7 天：一周不更新，档案会降为 D。</span>
        </form>
      )}
      <div className="card table-wrap p-2">
        <table>
          <thead>
            <tr>
              <th>字段</th>
              <th>当前内容</th>
              <th>来源 / 保鲜期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {p.fields.map((f) => {
              const st = fieldState(f, p.id, reports);
              const exp = expiresAt(f);
              const official = f.source === "official";
              return (
                <tr key={f.key}>
                  <td className="font-semibold">{f.label}</td>
                  <td className="max-w-[360px]">
                    <span className="text-body">{f.value}</span>
                    {f.pendingValue && <span className="block text-xs text-gradeB">待审核：{f.pendingValue}</span>}
                  </td>
                  <td className="text-[13px]">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <SourceTag source={f.source} />
                      <FieldStateTag state={st} />
                    </span>
                    <span className="block text-xs text-sub">
                      核对于 {fmtDate(f.confirmedAt)}
                      {exp && ` · 到期 ${fmtDate(exp)}`}
                    </span>
                  </td>
                  <td className="text-[13px]">
                    {official ? (
                      <span className="text-sub">官方公示，按名单同步</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {exp && (
                          <form action={confirmFieldAction}>
                            <input type="hidden" name="providerId" value={p.id} />
                            <input type="hidden" name="key" value={f.key} />
                            <button className="btn-ghost btn-sm">无变化</button>
                          </form>
                        )}
                        {(f.key === "deposit" || f.key === "membership") && !f.pendingValue && (
                          <span className="text-xs text-sub">修改要上传新的存管协议（下一期开放）</span>
                        )}
                        {f.locked && !f.pendingValue && !["vacancy", "deposit", "membership"].includes(f.key) && (
                          <form action={requestFieldChangeAction} className="flex gap-1.5">
                            <input type="hidden" name="providerId" value={p.id} />
                            <input type="hidden" name="key" value={f.key} />
                            <input name="value" className="input h-9 w-[180px] text-[13px]" placeholder="新内容（需审核）" />
                            <button className="btn-ghost btn-sm">提交</button>
                          </form>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
