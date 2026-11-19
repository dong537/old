import Link from "next/link";
import type { Grade, ServiceProvider } from "@/lib/types";
import { listReports, listServices } from "@/lib/store";
import { DISTRICTS, ORG_TYPE_LABEL } from "@/lib/site";
import { completeness, gradeOf, riskFlags } from "@/lib/rules";
import { shangmenPath } from "@/lib/paths";
import { SOURCES } from "@/lib/content";
import { ServiceCard } from "@/components/cards";
import { FilterRows, applyFilters, countBy } from "@/components/FilterRows";
import { Empty, Notice, PageTitle } from "@/components/ui";

export const metadata = { title: "广州上门养老服务 · 长护险居家护理、助浴、陪护" };

const ITEMS = ["上门护理（医疗护理）", "生活照料", "上门助浴", "助洁", "陪护", "陪诊", "康复指导"];
const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 };
type SP = Record<string, string | undefined>;

export default async function ShangmenList({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params: SP = {
    q: sp.q?.trim() || undefined,
    area: sp.area,
    item: sp.item,
    ltci: sp.ltci,
    review: sp.review,
    type: sp.type,
    prepay: sp.prepay,
    grade: sp.grade,
  };
  const reports = listReports();
  const all = listServices();
  const gradeMap = new Map(all.map((s) => [s.id, gradeOf(s, reports)]));
  const filters: Record<string, (s: ServiceProvider, v: string) => boolean> = {
    q: (s, v) => {
      const hay = [s.name, s.district, ...s.areas, ...s.items.map((i) => i.name), ORG_TYPE_LABEL[s.orgType]].join(" ");
      return v.split(/\s+/).every((w) => hay.includes(w));
    },
    area: (s, v) => s.areas.includes(v),
    item: (s, v) => s.items.some((i) => i.name === v),
    ltci: (s) => s.ltci,
    review: (s) => s.ltciReview?.result === "优秀" || s.ltciReview?.result === "良好",
    type: (s, v) => s.orgType === v,
    prepay: (s) => s.claimed && !s.prepay.takes,
    grade: (s, v) => (v === "AB" ? ["A", "B"].includes(gradeMap.get(s.id)!) : gradeMap.get(s.id) === v),
  };
  const list = applyFilters(all, filters, params).sort(
    (a, b) => GRADE_ORDER[gradeMap.get(a.id)!] - GRADE_ORDER[gradeMap.get(b.id)!] || completeness(b).done - completeness(a).done || a.name.localeCompare(b.name, "zh-CN"),
  );
  const c = (key: string, value: string) => countBy(all, filters, params, key, value);
  const defs = [
    { key: "area", label: "服务区域", options: DISTRICTS.map((d) => ({ value: d, label: d, count: c("area", d) })) },
    { key: "item", label: "服务项目", options: ITEMS.map((i) => ({ value: i, label: i, count: c("item", i) })) },
    {
      key: "type",
      label: "类型",
      options: (Object.keys(ORG_TYPE_LABEL) as ServiceProvider["orgType"][]).map((t) => ({ value: t, label: ORG_TYPE_LABEL[t], count: c("type", t) })),
    },
    {
      key: "ltci",
      label: "长护险",
      options: [{ value: "1", label: "长护险定点（居家护理）", count: c("ltci", "1") }],
    },
    {
      key: "review",
      label: "年度考核",
      options: [{ value: "good", label: "良好及以上", count: c("review", "good") }],
    },
    { key: "prepay", label: "预付款", options: [{ value: "none", label: "不收预付款", count: c("prepay", "none") }] },
    {
      key: "grade",
      label: "可信度",
      options: [
        { value: "AB", label: "B 级及以上", count: c("grade", "AB") },
        { value: "A", label: "A 已体验", count: c("grade", "A") },
      ],
    },
  ];

  return (
    <>
      <PageTitle
        title="找上门服务"
        lead="老人住在家里，请人上门护理、助浴、陪护。第一期先收两类有官方名单的服务商：长护险定点的居家护理机构和颐康中心；其他有营业执照的上门服务公司，认领并核验后再收录。"
      />
      <Notice>
        个人护工和家政中介不收录：陌生人入户，平台没法核验个人。广州全市有颐康中心 177 个，覆盖所有街镇
        <a href={SOURCES.yikang.url} target="_blank" rel="noreferrer" className="ml-1">
          （来源）
        </a>
        ；长护险定点名单和年度考核等次来自广州市医疗保险服务中心的公示。
      </Notice>
      <FilterRows base={shangmenPath()} params={params} defs={defs} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[15px]">
          共 <b>{list.length}</b> 家
        </span>
        <Link href="/rules#sorting" className="text-[13px] text-sub">
          排序依次看可信度、信息完整度、名称；付费不影响
        </Link>
      </div>
      {list.length ? (
        <div className="flex flex-col gap-3">
          {list.map((s) => (
            <ServiceCard key={s.id} s={s} grade={gradeMap.get(s.id)!} risks={riskFlags(s).length} item={params.item} />
          ))}
        </div>
      ) : (
        <Empty>
          没有符合条件的服务商。<Link href={shangmenPath()}>清空条件</Link>
        </Empty>
      )}
    </>
  );
}
