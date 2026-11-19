import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CareType } from "@/lib/types";
import { listHomes, listServices } from "@/lib/store";
import { CARE_DESC, CARE_LABEL, CARE_TYPES } from "@/lib/site";
import { homePriceStats, servicePriceStats } from "@/lib/stats";
import { homePath, jiagePath, jigouPath, shangmenPath } from "@/lib/paths";
import { fmtDate } from "@/lib/time";
import { JsonLd } from "@/components/JsonLd";
import { Notice, PageTitle } from "@/components/ui";

type Params = Promise<{ type: string }>;
const isCare = (t: string): t is CareType => (CARE_TYPES as string[]).includes(t);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const t = (await params).type;
  if (t === "shangmen") return { title: "广州上门养老服务价格参考：上门护理、助浴、陪护单价" };
  if (isCare(t)) return { title: `广州${CARE_LABEL[t]}老人养老院月费参考（按区）` };
  return {};
}

const yuan = (n?: number) => (n === undefined ? "—" : n.toLocaleString("zh-CN"));

export default async function JiageType({ params }: { params: Params }) {
  const t = (await params).type;
  const tabs = (
    <nav className="flex flex-wrap gap-2">
      {[...CARE_TYPES, "shangmen" as const].map((x) => (
        <Link
          key={x}
          href={jiagePath(x)}
          aria-current={x === t ? "page" : undefined}
          className={`chip px-3 py-1.5 text-[14px] no-underline ${x === t ? "bg-brand text-white hover:text-white" : "border border-line bg-white text-ink"}`}
        >
          {x === "shangmen" ? "上门服务" : `${CARE_LABEL[x]}老人`}
        </Link>
      ))}
    </nav>
  );
  const sampleNote = <Notice tone="warn">原型里的价格来自虚构的示例机构，只演示怎么算、怎么展示，不能当作广州的真实行情。</Notice>;

  if (t === "shangmen") {
    const items = servicePriceStats(listServices());
    return (
      <>
        <PageTitle title="广州上门服务价格参考" lead={`按项目统计已认领服务商公开的单价，共 ${items.length} 个项目。上门服务按次、按小时或按天收费，口径不同的不放在一起比。`} />
        {tabs}
        {sampleNote}
        <div className="card table-wrap p-2">
          <table>
            <thead>
              <tr>
                <th>项目</th>
                <th className="text-right">中位数</th>
                <th className="text-right">范围</th>
                <th className="text-right">样本</th>
                <th>可用长护险的家数</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.label}>
                  <td className="font-semibold">
                    <Link href={shangmenPath({ item: i.label })}>{i.label}</Link>
                  </td>
                  <td className="text-right">
                    {i.median} 元/{i.unit}
                  </td>
                  <td className="text-right text-body">
                    {i.min}–{i.max}
                  </td>
                  <td className="text-right">{i.n} 家</td>
                  <td>{i.ltci > 0 ? `${i.ltci} 家` : <span className="text-sub">都是自费</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[13px] text-sub">样本少于 3 家的项目只供参考。价格是服务商自报并经平台核对的价目，不是成交价；成交价来自回访，攒够样本后再公布。</p>
      </>
    );
  }

  if (!isCare(t)) notFound();
  const st = homePriceStats(listHomes(), t);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: `广州${CARE_LABEL[t]}老人养老机构月费（按区）`,
          description: `已认领机构公开的床位费、护理费、餐费合计，样本 ${st.city.n} 家。`,
          variableMeasured: "月费（元/月）",
          spatialCoverage: "广州市",
        }}
      />
      <PageTitle
        title={`广州${CARE_LABEL[t]}老人养老院月费`}
        lead={
          st.city.median
            ? `全市中位数 ${yuan(st.city.median)} 元/月，范围 ${yuan(st.city.min)}–${yuan(st.city.max)} 元，样本 ${st.city.n} 家。月费含床位费、护理费、餐费三项。`
            : "暂无样本。"
        }
      />
      {tabs}
      {sampleNote}
      <p className="m-0 text-body">{CARE_DESC[t]}。</p>
      <div className="card table-wrap p-2">
        <table>
          <thead>
            <tr>
              <th>区</th>
              <th className="text-right">中位数（元/月）</th>
              <th className="text-right">范围</th>
              <th className="text-right">样本</th>
            </tr>
          </thead>
          <tbody>
            {st.districts.map((d) => (
              <tr key={d.label}>
                <td className="font-semibold">
                  <Link href={jigouPath({ district: d.label.replace("区", ""), care: t })}>{d.label}</Link>
                </td>
                <td className="text-right">{yuan(d.median)}</td>
                <td className="text-right text-body">
                  {yuan(d.min)}–{yuan(d.max)}
                </td>
                <td className="text-right">
                  {d.n} 家{d.n < 3 && <span className="ml-1 text-xs text-gradeD">样本少，只供参考</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="m-0 text-lg font-semibold">参与统计的机构</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
        {st.homes.map(({ h, total }) => (
          <li key={h.id} className="flex flex-wrap gap-x-3">
            <Link href={homePath(h.id)}>{h.name}</Link>
            <span className="text-body">{total.toLocaleString("zh-CN")} 元/月</span>
            <span className="text-sub">{h.district}区 · 收费核对于 {fmtDate(h.feesConfirmedAt)}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[13px] text-sub">未认领的机构没有拆开的费目，不参与统计。价格是机构公开并经平台核对的价目，不是成交价；回访中家属报的实际月费会在样本足够后单独公布。</p>
    </>
  );
}
