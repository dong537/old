import { decideAppealAction } from "@/app/actions";
import { getProvider, listLeads } from "@/lib/store";
import { CARE_LABEL } from "@/lib/site";
import { fmtMDHM } from "@/lib/time";
import { Empty } from "@/components/ui";

export const metadata = { title: "线索申诉" };

export default function AdminAppeals() {
  const leads = listLeads().filter((l) => l.appeal);
  const pending = leads.filter((l) => l.appeal!.status === "pending");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">线索申诉</h1>
        <p className="m-0 text-body">机构对 48 小时内的线索提出申诉。核实属实就退回 1 条额度；空号要拨打确认，重复预约看同一手机号的记录。</p>
      </div>
      {pending.length ? (
        pending.map((l) => (
          <div key={l.id} className="card flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <b>{getProvider(l.providerId)?.name}</b>
              <span className="text-[13px] text-sub">
                {l.id} · 预约于 {fmtMDHM(l.createdAt)} · 申诉于 {fmtMDHM(l.appeal!.createdAt)}
              </span>
            </div>
            <p className="m-0 text-body">
              申诉理由：<b>{l.appeal!.reason}</b>
            </p>
            <p className="m-0 text-[14px] text-sub">
              {l.contactName} · {l.phone} · {CARE_LABEL[l.care]} · 来源 {l.sourceDetail}
            </p>
            <div className="flex gap-2">
              <form action={decideAppealAction}>
                <input type="hidden" name="leadId" value={l.id} />
                <input type="hidden" name="decision" value="approve" />
                <button className="btn-primary btn-sm">属实，退回额度</button>
              </form>
              <form action={decideAppealAction}>
                <input type="hidden" name="leadId" value={l.id} />
                <input type="hidden" name="decision" value="reject" />
                <button className="btn-ghost btn-sm">不属实</button>
              </form>
            </div>
          </div>
        ))
      ) : (
        <Empty>没有待处理的申诉。</Empty>
      )}
    </>
  );
}
