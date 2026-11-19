import { orgReplyAction } from "@/app/actions";
import { currentMerchant } from "@/lib/merchant";
import { listReports } from "@/lib/store";
import { fmtMDHM, remaining } from "@/lib/time";
import { Empty } from "@/components/ui";

export const metadata = { title: "报错回应" };

export default async function MerchantReports() {
  const p = await currentMerchant();
  const reports = listReports(p.id);
  const open = reports.filter((r) => r.status === "open");
  const done = reports.filter((r) => r.status === "resolved");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">报错回应</h1>
        <p className="m-0 text-body">家属对档案的报错。请在 24 小时内回应（计入报错响应榜），平台 48 小时内给结论；你的回应会显示给报错的家属。</p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">待处理（{open.length}）</h2>
        {open.length ? (
          open.map((r) => {
            const left = remaining(r.deadline);
            return (
              <div key={r.id} className="card flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <b className="text-[15px]">「{r.fieldLabel}」</b>
                  <span className="text-sub">
                    {r.id} · {fmtMDHM(r.createdAt)}
                  </span>
                  <span className={`chip ${left.urgent ? "bg-gradeD-bg text-gradeD" : "bg-gradeB-bg text-gradeB"}`}>平台结论 {left.text}</span>
                </div>
                <p className="m-0 text-body">{r.content}</p>
                {r.orgReply ? (
                  <p className="m-0 rounded-lg bg-page px-3 py-2 text-[14px]">你的回应：{r.orgReply}</p>
                ) : (
                  <form action={orgReplyAction} className="flex flex-col gap-2">
                    <input type="hidden" name="reportId" value={r.id} />
                    <textarea name="reply" rows={2} className="textarea" placeholder="说明实际情况；如果确实有误，写明正确的信息" />
                    <button className="btn-primary btn-sm self-start">提交回应</button>
                  </form>
                )}
              </div>
            );
          })
        ) : (
          <Empty>没有待处理的报错。</Empty>
        )}
      </section>
      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-lg font-semibold">已结案</h2>
          {done.map((r) => (
            <div key={r.id} className="card flex flex-wrap gap-x-3 p-3 text-[14px]">
              <b>「{r.fieldLabel}」</b>
              <span className="text-body">{r.content}</span>
              <span className={r.conclusion === "true" ? "text-gradeD" : "text-gradeA"}>{r.conclusion === "true" ? "属实，已更正" : "核实后原信息无误"}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
