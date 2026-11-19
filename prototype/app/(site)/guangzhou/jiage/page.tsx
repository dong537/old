import Link from "next/link";
import { listHomes, listServices } from "@/lib/store";
import { CARE_DESC, CARE_LABEL, CARE_TYPES } from "@/lib/site";
import { homePriceStats, servicePriceStats } from "@/lib/stats";
import { jiagePath } from "@/lib/paths";
import { Notice, PageTitle } from "@/components/ui";

export const metadata = { title: "广州养老院月费和上门服务价格参考" };

export default function JiageIndex() {
  const homes = listHomes();
  const items = servicePriceStats(listServices());
  return (
    <>
      <PageTitle
        title="价格参考"
        lead="广州养老机构按老人情况分档的月费中位数，和上门服务按项目的单价。只用已认领机构公开的完整费目，每个数都注明样本数。"
      />
      <Notice tone="warn">原型里的价格来自虚构的示例机构，只用来演示页面怎么算、怎么展示，不能当作广州的真实行情。</Notice>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARE_TYPES.map((c) => {
          const s = homePriceStats(homes, c).city;
          return (
            <Link key={c} href={jiagePath(c)} className="card flex flex-col gap-1 p-5 text-ink no-underline hover:border-brand">
              <span className="text-[13px] text-sub">{CARE_LABEL[c]}老人 · 月费中位数</span>
              <span className="text-[24px] font-semibold">{s.median ? `${s.median.toLocaleString("zh-CN")} 元` : "—"}</span>
              <span className="text-[13px] text-sub">
                {s.n} 家 · {s.min?.toLocaleString("zh-CN")}–{s.max?.toLocaleString("zh-CN")} 元
              </span>
              <span className="text-xs text-sub">{CARE_DESC[c]}</span>
            </Link>
          );
        })}
      </div>
      <Link href={jiagePath("shangmen")} className="card flex flex-col gap-2 p-5 text-ink no-underline hover:border-brand">
        <span className="text-[16px] font-semibold">上门服务单价 →</span>
        <span className="flex flex-wrap gap-2">
          {items.slice(0, 5).map((i) => (
            <span key={i.label} className="chip bg-page text-[13px] text-body">
              {i.label} 中位数 {i.median} 元/{i.unit}（{i.n} 家）
            </span>
          ))}
        </span>
      </Link>
    </>
  );
}
