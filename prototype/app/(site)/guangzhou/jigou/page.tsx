import Link from "next/link";
import type { Grade, Home } from "@/lib/types";
import { listHomes, listReports, listServices } from "@/lib/store";
import { CARE_LABEL, CARE_TYPES, DISTRICTS } from "@/lib/site";
import { completeness, feeFrom, gradeOf, riskFlags } from "@/lib/rules";
import { jigouPath, shangmenPath } from "@/lib/paths";
import { HomeCard } from "@/components/cards";
import { FilterRows, applyFilters, countBy } from "@/components/FilterRows";
import { JsonLd } from "@/components/JsonLd";
import { Empty, PageTitle } from "@/components/ui";

export const metadata = { title: "广州养老机构 · 按区、护理类型、价格和长护险筛选" };

const PRICE_CAPS = ["4000", "5000", "6000", "8000"];
const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 };

type SP = Record<string, string | undefined>;

export default async function JigouList({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params: SP = {
    q: sp.q?.trim() || undefined,
    district: sp.district,
    care: sp.care,
    price: sp.price,
    level: sp.level,
    ltci: sp.ltci,
    medical: sp.medical,
    grade: sp.grade,
  };
  const sort = sp.sort === "price" ? "price" : "default";
  const reports = listReports();
  const homes = listHomes();
  const gradeMap = new Map(homes.map((h) => [h.id, gradeOf(h, reports)]));

  // 关键词按空格拆开，每个词都要命中名称、区、地址或护理类型之一，如「海珠 失智」
  const match = (h: Home, q: string) => {
    const hay = [h.name, h.district, h.address, h.entity.fullName, ...h.careTypes.map((c) => CARE_LABEL[c])].join(" ");
    return q.split(/\s+/).every((w) => hay.includes(w));
  };
  const filters: Record<string, (h: Home, v: string) => boolean> = {
    q: (h, v) => match(h, v),
    district: (h, v) => h.district === v,
    care: (h, v) => h.careTypes.includes(v as Home["careTypes"][number]),
    price: (h, v) => {
      const fee = feeFrom(h, params.care);
      return fee !== undefined && fee <= Number(v);
    },
    level: (h, v) => (h.level ?? 0) >= Number(v),
    ltci: (h) => h.ltci,
    medical: (h, v) => (v === "inside" ? h.medical === "内设医疗机构" : h.medical !== "无"),
    grade: (h, v) => (v === "AB" ? ["A", "B"].includes(gradeMap.get(h.id)!) : gradeMap.get(h.id) === v),
  };

  const list = applyFilters(homes, filters, params).sort((a, b) => {
    if (sort === "price") return (feeFrom(a, params.care) ?? Infinity) - (feeFrom(b, params.care) ?? Infinity);
    const ga = GRADE_ORDER[gradeMap.get(a.id)!] - GRADE_ORDER[gradeMap.get(b.id)!];
    if (ga) return ga;
    const ca = completeness(b).done - completeness(a).done;
    return ca || a.name.localeCompare(b.name, "zh-CN");
  });
  const c = (key: string, value: string) => countBy(homes, filters, params, key, value);

  const defs = [
    { key: "district", label: "区域", options: DISTRICTS.map((d) => ({ value: d, label: d, count: c("district", d) })) },
    { key: "care", label: "老人情况", options: CARE_TYPES.map((t) => ({ value: t, label: CARE_LABEL[t], count: c("care", t) })) },
    { key: "price", label: "月费", options: PRICE_CAPS.map((p) => ({ value: p, label: `${Number(p).toLocaleString("zh-CN")} 元以内`, count: c("price", p) })) },
    { key: "level", label: "机构等级", options: ["3", "4", "5"].map((l) => ({ value: l, label: `${["", "", "", "三", "四", "五"][Number(l)]}级及以上`, count: c("level", l) })) },
    {
      key: "ltci",
      label: "长护险",
      options: [{ value: "1", label: "长护险定点", count: c("ltci", "1") }],
    },
    {
      key: "medical",
      label: "医疗",
      options: [
        { value: "inside", label: "内设医疗机构", count: c("medical", "inside") },
        { value: "any", label: "有医疗保障（含签约医院）", count: c("medical", "any") },
      ],
    },
    {
      key: "grade",
      label: "可信度",
      options: [
        { value: "AB", label: "B 级及以上", count: c("grade", "AB") },
        { value: "A", label: "A 已探访", count: c("grade", "A") },
        { value: "D", label: "D 待核实", count: c("grade", "D") },
      ],
    },
  ];

  const serviceHits = params.q ? listServices().filter((s) => [s.name, s.district, ...s.areas, ...s.items.map((i) => i.name)].some((x) => x.includes(params.q!))).length : 0;
  const sortHref = (s: string) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    if (s !== "default") u.set("sort", s);
    const qs = u.toString();
    return jigouPath() + (qs ? `?${qs}` : "");
  };

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "广州养老机构",
          numberOfItems: list.length,
          itemListElement: list.slice(0, 20).map((h, i) => ({ "@type": "ListItem", position: i + 1, name: h.name, url: `/guangzhou/jigou/${h.id}` })),
        }}
      />
      <PageTitle
        title="找养老机构"
        lead="广州注册登记的养老机构，每家一张档案。没认领的只展示官方公示的字段；认领并核验后，才有拆开的收费、存管状态和在线预约。"
      />
      <FilterRows base={jigouPath()} params={params} defs={defs} />
      {serviceHits > 0 && (
        <p className="m-0 text-[14px]">
          上门服务里也有 {serviceHits} 家和「{params.q}」有关：<Link href={shangmenPath({ q: params.q })}>去看看 →</Link>
        </p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[15px]">
          共 <b>{list.length}</b> 家
        </span>
        <span className="flex flex-wrap items-center gap-3 text-[13px] text-sub">
          排序：
          <Link href={sortHref("default")} className={sort === "default" ? "font-semibold" : "text-sub"}>
            综合
          </Link>
          <Link href={sortHref("price")} className={sort === "price" ? "font-semibold" : "text-sub"}>
            月费从低到高
          </Link>
          <Link href="/rules#sorting" className="text-sub" title="可信度 → 信息完整度 → 名称；付费不影响">
            综合排序怎么排？
          </Link>
        </span>
      </div>
      {list.length ? (
        <div className="flex flex-col gap-3">
          {list.map((h) => (
            <HomeCard key={h.id} h={h} grade={gradeMap.get(h.id)!} risks={riskFlags(h).length} care={params.care} />
          ))}
        </div>
      ) : (
        <Empty>
          没有符合条件的机构。<Link href={jigouPath()}>清空条件</Link>
        </Empty>
      )}
      <p className="m-0 text-[13px] text-sub">综合排序依次看可信度、信息完整度、名称，付费不影响排序。月费按所选护理类型计算，含床位费、护理费、餐费。</p>
    </>
  );
}
