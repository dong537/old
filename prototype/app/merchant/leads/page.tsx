import { appealLeadAction, setLeadStatusAction } from "@/app/actions";
import { currentMerchant } from "@/lib/merchant";
import { listLeads } from "@/lib/store";
import { APPEAL_HOURS, APPEAL_REASONS, CARE_LABEL, LEAD_SOURCE_LABEL } from "@/lib/site";
import { fmtMDHM } from "@/lib/time";
import { Empty } from "@/components/ui";

export const metadata = { title: "预约线索" };

const STATUS: Record<string, string> = { new: "新预约", contacted: "已联系", visited: "已探访 / 已评估", converted: "已入住 / 已签约", lost: "没有继续" };

export default async function MerchantLeads() {
  const p = await currentMerchant();
  const leads = listLeads(p.id);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">预约线索</h1>
        <p className="m-0 text-body">
          每条预约只发给你一家。收到后 {APPEAL_HOURS} 小时内可以申诉，平台核实属实就退回额度。状态更新后，平台会按「已入住 / 已签约」回访家属。
        </p>
      </div>
      {leads.length ? (
        <div className="card table-wrap p-2">
          <table>
            <thead>
              <tr>
                <th>预约</th>
                <th>家属与需求</th>
                <th>来源</th>
                <th>状态</th>
                <th>申诉</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const age = (Date.now() - new Date(l.createdAt).getTime()) / 3600_000;
                return (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-col">
                        <b>{l.id}</b>
                        <span className="text-xs text-sub">{fmtMDHM(l.createdAt)}</span>
                        {l.status === "new" && <span className="chip mt-1 self-start bg-brand text-white">新</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span>
                          {l.contactName} · {l.phone}
                        </span>
                        <span className="text-[13px] text-body">
                          {CARE_LABEL[l.care]} · 希望 {l.preferredDate || "日期待定"}
                        </span>
                        {l.needs && <span className="text-[13px] text-sub">{l.needs}</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-[13px]">
                      {l.sourceDetail}
                      <span className="block text-xs text-sub">{LEAD_SOURCE_LABEL[l.source]}</span>
                    </td>
                    <td>
                      <form key={`${l.id}-${l.status}`} action={setLeadStatusAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="leadId" value={l.id} />
                        <select name="status" defaultValue={l.status} className="input h-9 w-[150px] text-[13px]">
                          {Object.entries(STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <button className="btn-ghost btn-sm">保存</button>
                      </form>
                    </td>
                    <td className="text-[13px]">
                      {l.appeal ? (
                        <span className={l.appeal.status === "approved" ? "text-gradeA" : l.appeal.status === "rejected" ? "text-gradeD" : "text-gradeB"}>
                          {l.appeal.status === "pending" ? "审核中" : l.appeal.status === "approved" ? "已退回额度" : "未通过"}
                          <span className="block text-xs text-sub">{l.appeal.reason}</span>
                        </span>
                      ) : age <= APPEAL_HOURS ? (
                        <form action={appealLeadAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="leadId" value={l.id} />
                          <select name="reason" className="input h-9 w-[150px] text-[13px]">
                            {APPEAL_REASONS.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                          <button className="btn-ghost btn-sm">申诉</button>
                        </form>
                      ) : (
                        <span className="text-sub">已过 {APPEAL_HOURS} 小时</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>还没有预约。</Empty>
      )}
    </>
  );
}
