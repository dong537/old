import Link from "next/link";
import { decideFieldChangeAction } from "@/app/actions";
import { adminQueues } from "@/lib/admin";
import { providerPath } from "@/lib/paths";
import { Empty } from "@/components/ui";

export const metadata = { title: "信息修改" };

export default function AdminChanges() {
  const { changes } = adminQueues();
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">关键字段修改</h1>
        <p className="m-0 text-body">收费、存管、预付款、联系电话这类字段，机构修改后要核对材料。审核期间前台显示原值，并标「修改审核中」。</p>
      </div>
      {changes.length ? (
        changes.map(({ p, f }) => (
          <div key={`${p.id}-${f.key}`} className="card flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={providerPath(p)} className="font-semibold">
                {p.name}
              </Link>
              <b>「{f.label}」</b>
            </div>
            <p className="m-0 text-[14px] text-sub">原：{f.value}</p>
            <p className="m-0 text-body">新：{f.pendingValue}</p>
            <div className="flex gap-2">
              <form action={decideFieldChangeAction}>
                <input type="hidden" name="providerId" value={p.id} />
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="decision" value="approve" />
                <button className="btn-primary btn-sm">核对无误，生效</button>
              </form>
              <form action={decideFieldChangeAction}>
                <input type="hidden" name="providerId" value={p.id} />
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="decision" value="reject" />
                <button className="btn-ghost btn-sm">退回</button>
              </form>
            </div>
          </div>
        ))
      ) : (
        <Empty>没有待审核的修改。可以在机构后台「信息维护」里提交一条试试。</Empty>
      )}
    </>
  );
}
