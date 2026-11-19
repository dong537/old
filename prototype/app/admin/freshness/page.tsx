import Link from "next/link";
import { adminQueues } from "@/lib/admin";
import { expiresAt } from "@/lib/rules";
import { providerPath } from "@/lib/paths";
import { fmtDate } from "@/lib/time";
import { Empty, FieldStateTag } from "@/components/ui";

export const metadata = { title: "保鲜到期" };

export default function AdminFreshness() {
  const { freshness } = adminQueues();
  const sorted = [...freshness].sort((a, b) => (expiresAt(a.f) ?? "").localeCompare(expiresAt(b.f) ?? ""));
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">保鲜到期</h1>
        <p className="m-0 text-body">已过期或快到期的字段（一般到期前 14 天，空床到期前 2 天）。机构没有确认的，平台打电话提醒；官方字段到期的，重新按名单核对。过期字段会让档案降为 D。</p>
      </div>
      {sorted.length ? (
        <div className="card table-wrap p-2">
          <table>
            <thead>
              <tr>
                <th>档案</th>
                <th>字段</th>
                <th>状态</th>
                <th>到期日</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ p, f, st }) => (
                <tr key={`${p.id}-${f.key}`}>
                  <td>
                    <Link href={providerPath(p)}>{p.name}</Link>
                  </td>
                  <td>{f.label}</td>
                  <td>
                    <FieldStateTag state={st} />
                  </td>
                  <td>{fmtDate(expiresAt(f)!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>没有快到期的字段。</Empty>
      )}
    </>
  );
}
