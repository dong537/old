import Link from "next/link";
import { getProvider, listClaims, listProviders } from "@/lib/store";
import { ORG_TYPE_LABEL } from "@/lib/site";
import { providerPath } from "@/lib/paths";
import { ClaimForm } from "@/components/ClaimForm";
import { PageTitle, SampleTag } from "@/components/ui";
import { fmtMDHM } from "@/lib/time";

export const metadata = { title: "机构认领 · 免费", robots: { index: false } };

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const { id, q } = await searchParams;
  const pendingClaims = listClaims().filter((c) => c.status === "pending");
  const pending = new Set(pendingClaims.map((c) => c.providerId));
  const target = id ? getProvider(id) : undefined;
  const targetClaim = target ? pendingClaims.find((c) => c.providerId === target.id) : undefined;
  const unclaimed = listProviders().filter((p) => !p.claimed && (!q || p.name.includes(q) || p.district.includes(q)));

  return (
    <>
      <PageTitle
        title="机构认领"
        lead="广州注册登记的养老机构、长护险定点的居家护理机构和颐康中心，我们已经按官方名单建好了档案。认领免费，认领后能补全收费、回应报错、接收独享的探访预约。"
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <section className="card flex flex-col gap-3 p-5">
          <form className="flex gap-2">
            <input name="q" defaultValue={q} className="input" placeholder="搜机构名称或区" />
            <button className="btn-primary">查找</button>
          </form>
          <h2 className="m-0 text-[16px] font-semibold">未认领（{unclaimed.length}）</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {unclaimed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5">
                <span className="flex flex-col">
                  <Link href={providerPath(p)} className="font-semibold">
                    {p.name}
                  </Link>
                  <span className="flex items-center gap-1.5 text-[13px] text-sub">
                    {p.district}区 · {p.kind === "home" ? "养老机构" : ORG_TYPE_LABEL[p.orgType]} <SampleTag />
                  </span>
                </span>
                {pending.has(p.id) ? (
                  <span className="chip bg-gradeD-bg text-gradeD">已有认领申请在审核</span>
                ) : (
                  <Link href={`/claim?id=${p.id}`} className="btn-outline btn-sm">
                    认领
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[13px] text-sub">找不到？有营业执照的上门服务公司可以申请收录，平台核验后建档（原型里还没做这个入口）。</p>
        </section>
        <div className="flex flex-col gap-4">
          {target && targetClaim ? (
            <div className="card flex flex-col gap-2 p-5">
              <h2 className="m-0 text-[16px] font-semibold text-gradeA">「{target.name}」的认领申请在审核中</h2>
              <p className="m-0 text-body">
                申请号 <b>{targetClaim.id}</b>，提交于 {fmtMDHM(targetClaim.createdAt)}。平台会核对材料，并拨打官方名单上的电话确认，一般 2 个工作日内出结果。
              </p>
              <p className="m-0 text-[13px] text-sub">
                原型演示：到 <Link href="/admin/claims">运营后台 · 认领审核</Link> 通过后，档案会变成 B 级并开放在线预约。
              </p>
            </div>
          ) : target && !target.claimed ? (
            <ClaimForm providerId={target.id} providerName={target.name} kind={target.kind} />
          ) : (
            <div className="card flex flex-col gap-2 p-5 text-body">
              <h2 className="m-0 text-[16px] font-semibold">认领流程</h2>
              <ol className="m-0 flex flex-col gap-1 pl-5">
                <li>在左侧找到你的机构，点「认领」</li>
                <li>提交主体资质、价目表和存管协议</li>
                <li>平台核对材料，回拨官方名单上的电话确认</li>
                <li>通过后档案变为 B 级，开放在线预约，赠送 5 条线索</li>
                <li>城市合伙人上门探访（服务商为体验服务），抽检通过后变为 A 级</li>
              </ol>
              {target?.claimed && <p className="m-0 text-gradeA">「{target.name}」已经认领。</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
