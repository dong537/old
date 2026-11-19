import Link from "next/link";
import { getProvider } from "@/lib/store";
import { providerPath } from "@/lib/paths";
import { ReportForm } from "@/components/ReportForm";
import { Empty, PageTitle } from "@/components/ui";

export const metadata = { title: "信息报错", robots: { index: false } };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ id?: string; field?: string }> }) {
  const { id, field } = await searchParams;
  const p = id ? getProvider(id) : undefined;
  if (!p) {
    return (
      <Empty>
        请从机构或服务商的档案页点「这项有误」进来。<Link href="/guangzhou/jigou">去找机构</Link>
      </Empty>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <PageTitle
        title={`报错：${p.name}`}
        lead="说清楚哪一项不对、正确的是什么、你是怎么知道的。机构先在 24 小时内回应，平台 48 小时内给结论。"
      />
      <ReportForm
        providerId={p.id}
        providerName={p.name}
        backHref={providerPath(p)}
        fields={p.fields.map((f) => ({ key: f.key, label: f.label, value: f.value }))}
        initialField={field}
      />
    </div>
  );
}
