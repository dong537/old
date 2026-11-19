import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHANGED_SOURCE, CORRECTED_SOURCE, getService, listReports } from "@/lib/store";
import { CARE_TYPES, ORG_TYPE_LABEL } from "@/lib/site";
import { completeness, field, fieldState, gradeOf, riskFlags } from "@/lib/rules";
import { changhuxianPath, reportPath, shangmenPath } from "@/lib/paths";
import { SOURCES } from "@/lib/content";
import { fmtDate } from "@/lib/time";
import { BookingForm } from "@/components/BookingForm";
import { JsonLd } from "@/components/JsonLd";
import { Toc, type TocItem } from "@/components/Toc";
import { EntityBox, FieldTable, FollowupList, GradeExplain, HistoryList, RiskBox, SourcesList, VisitList, buildRefs } from "@/components/profile";
import { ClaimTag, FieldStateTag, Notice, SampleTag, SectionTitle, SourceTag } from "@/components/ui";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const s = getService((await params).id);
  if (!s) return {};
  return {
    title: `${s.name} · 上门服务项目、价格、长护险考核`,
    description: `${s.name}（${ORG_TYPE_LABEL[s.orgType]}，服务${s.areas.join("、")}区）的服务项目与价格、长护险定点和年度考核、护理员持证情况，每项标来源和核对日期。`,
    robots: s.claimed ? undefined : { index: false },
  };
}

export default async function ServiceProfile({ params }: { params: Params }) {
  const s = getService((await params).id);
  if (!s) notFound();
  const reports = listReports();
  const grade = gradeOf(s, reports);
  const risks = riskFlags(s);
  const { list: refs, n: refN } = buildRefs(s.fields);
  const comp = completeness(s);
  const itemsField = field(s, "items");

  const toc: TocItem[] = [
    { id: "overview", label: "概况" },
    ...(risks.length ? [{ id: "risk", label: "风险提示", warn: true }] : []),
    { id: "items", label: "服务项目与收费" },
    { id: "ltci", label: "长护险与考核" },
    { id: "staff", label: "护理员" },
    { id: "prepay", label: "预付款" },
    { id: "visits", label: "体验服务" },
    { id: "followups", label: "家属回访" },
    { id: "entity", label: "主体信息" },
    { id: "history", label: "变更记录" },
    { id: "sources", label: "来源" },
  ];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          additionalType: "上门养老服务",
          name: s.name,
          address: { "@type": "PostalAddress", addressLocality: "广州市", addressRegion: "广东省", streetAddress: s.address },
          telephone: s.phone,
          areaServed: s.areas.map((a) => ({ "@type": "AdministrativeArea", name: `广州市${a}区` })),
          ...(s.items.length
            ? { makesOffer: s.items.map((i) => ({ "@type": "Offer", name: i.name, price: i.price, priceCurrency: "CNY", unitText: i.unit })) }
            : {}),
        }}
      />
      <nav className="text-[13px] text-sub">
        <Link href={shangmenPath()} className="text-sub">找上门服务</Link> / <Link href={shangmenPath({ area: s.district })} className="text-sub">{s.district}区</Link> / {s.name}
      </nav>
      <Toc items={toc} variant="bar" reportHref={reportPath(s.id)} />
      <div className="flex items-start gap-6">
        <Toc items={toc} variant="side" reportHref={reportPath(s.id)} />
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <section id="overview" className="section">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="m-0 text-[26px] font-bold leading-tight">{s.name}</h1>
                <span className="text-body">
                  {ORG_TYPE_LABEL[s.orgType]} · {s.address}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <SampleTag />
                <ClaimTag claimed={s.claimed} verified={s.verified} />
              </div>
            </div>
            <GradeExplain grade={grade} />
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-page p-4 sm:grid-cols-4">
              <div className="flex flex-col">
                <span className="text-xs text-sub">服务区域</span>
                <span className="font-semibold">{s.areas.map((a) => `${a}区`).join("、")}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-sub">长护险居家护理</span>
                <span className="font-semibold">{s.ltci ? "定点" : "非定点"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-sub">年度考核</span>
                <span className={`font-semibold ${s.ltciReview?.result === "不合格" ? "text-risk" : ""}`}>{s.ltciReview ? `${s.ltciReview.year} · ${s.ltciReview.result}` : "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-sub">护理员持证</span>
                <span className="font-semibold">{s.claimed ? `${s.staff.certified}/${s.staff.total} 人` : "未知"}</span>
              </div>
            </div>
            {!s.claimed && (
              <Notice tone="warn">
                这家还没有认领，下面只有官方名单上的字段：没有价目、护理员和预付款信息，也不能在线预约。是这家的工作人员？
                <Link href={`/claim?id=${s.id}`} className="ml-1 font-semibold">免费认领</Link>
              </Notice>
            )}
            {s.intro && (
              <div className="flex flex-col gap-1 rounded-lg border border-dashed border-line p-3">
                <span className="text-xs text-sub">服务商自述（服务商自己写的，平台没有核验）</span>
                <span className="text-body">{s.intro}</span>
              </div>
            )}
            <p className="m-0 text-xs text-sub">信息完整度 {comp.done}/{comp.total} · 每一项都标了来源和核对日期，点「这项有误」可以报错</p>
          </section>

          <RiskBox flags={risks} />

          <section id="items" className="section">
            <SectionTitle
              title="服务项目与收费"
              extra={
                itemsField && (
                  <span className="flex items-center gap-2">
                    <SourceTag source={itemsField.source} /> 核对于 {fmtDate(itemsField.confirmedAt)}
                    <FieldStateTag state={fieldState(itemsField, s.id, reports)} />
                  </span>
                )
              }
            />
            {(itemsField?.sourceName === CORRECTED_SOURCE || itemsField?.sourceName === CHANGED_SOURCE) && (
              <Notice tone="ok">
                {itemsField.sourceName === CORRECTED_SOURCE ? "平台核实后的价格（家属报错后核实" : "服务商更新的价格（平台审核通过"}，{fmtDate(itemsField.confirmedAt)}）：<b>{itemsField.value}</b>。下表是原先的分项价目，服务商补全分项后会替换。
              </Notice>
            )}
            {s.items.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>项目</th>
                      <th className="text-right">价格</th>
                      <th>长护险</th>
                      <th>包含</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((i) => (
                      <tr key={i.name}>
                        <td className="font-semibold">{i.name}</td>
                        <td className="whitespace-nowrap text-right">
                          {i.price} 元/{i.unit}
                        </td>
                        <td>{i.ltci ? <span className="chip bg-gradeA-bg text-gradeA">可用长护险结算</span> : <span className="text-sub">自费</span>}</td>
                        <td className="text-[13px] text-body">{i.includes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 text-body">{s.claimed ? "服务商还没有填价目。" : "服务商还没有认领，暂无价目。"}</p>
            )}
            <p className="m-0 text-[13px] text-body">
              用长护险结算的项目，自付部分按广州现行规定计算，以医保经办机构核定为准。
              <Link href={changhuxianPath()} className="ml-1">长护险指南</Link>
            </p>
            <Link href={reportPath(s.id, "items")} className="text-[13px]">价格和你问到的不一样？报错</Link>
          </section>

          <section id="ltci" className="section">
            <SectionTitle title="长护险定点与年度考核" extra={<a href={SOURCES.ltciReview.url} target="_blank" rel="noreferrer">考核结果原文</a>} />
            <FieldTable p={s} fields={[field(s, "ltci"), field(s, "ltciReview"), field(s, "medicalLicense")]} reports={reports} refN={refN} />
            <p className="m-0 text-[13px] text-sub">
              年度考核等次由广州市医疗保险服务中心公布，分优秀、良好、合格、不合格。「不合格」会放进风险提示；考核结果不改变 A–D 等级。
            </p>
          </section>

          <section id="staff" className="section">
            <SectionTitle title="护理员" />
            {s.claimed ? (
              <>
                <p className="m-0 text-body">
                  共 <b>{s.staff.total}</b> 人，其中 <b>{s.staff.certified}</b> 人持养老护理员职业技能等级证书。
                  {s.staff.backgroundChecked ? "服务商说明护理员入职前做过背景核查，平台抽查过记录。" : <span className="text-gradeD">服务商没有提供背景核查情况。</span>}
                </p>
                <FieldTable p={s} fields={[field(s, "staff")]} reports={reports} refN={refN} />
              </>
            ) : (
              <p className="m-0 text-body">还没有认领，护理员信息未知。</p>
            )}
            <p className="m-0 text-[13px] text-sub">平台不派单，也不推荐个人护工。上门时可以请护理员出示证书。</p>
          </section>

          <section id="prepay" className="section">
            <SectionTitle title="预付款" />
            {s.claimed ? (
              <>
                <p className="m-0 text-body">
                  {s.prepay.takes ? (
                    <>
                      收预付款，最多预收 <b>{s.prepay.maxMonths}</b> 个月{s.prepay.note ? `（${s.prepay.note}）` : ""}。
                    </>
                  ) : (
                    "不收预付款，按次结算。"
                  )}
                </p>
                <FieldTable p={s} fields={[field(s, "prepay")]} reports={reports} refN={refN} />
              </>
            ) : (
              <p className="m-0 text-body">还没有认领，预付款情况未知。</p>
            )}
            <Notice tone="warn">
              上门服务的套餐、储值卡是否适用养老机构的预收费存管规定，还在请律师确认。确认前，这里只标「收不收、最多预收多久」，不标存管状态。买套餐前，问清楚没用完能不能退。
            </Notice>
          </section>

          <section id="visits" className="section">
            <SectionTitle title="体验服务" extra="城市合伙人约一次真实服务，平台抽检后才计入 A 级" />
            <VisitList p={s} />
          </section>

          <section id="followups" className="section">
            <SectionTitle title="家属回访" />
            <FollowupList p={s} />
          </section>

          <section id="entity" className="section">
            <SectionTitle title="主体信息" />
            <EntityBox p={s} />
            <FieldTable p={s} fields={[field(s, "credit"), field(s, "address"), field(s, "phone"), field(s, "areas")]} reports={reports} refN={refN} />
          </section>

          <section id="history" className="section">
            <SectionTitle title="变更记录" />
            <HistoryList p={s} />
          </section>

          <section id="sources" className="section">
            <SectionTitle title="来源" />
            <SourcesList refs={refs} />
          </section>
        </div>
        <aside className="sticky top-4 hidden w-[320px] shrink-0 flex-col gap-4 lg:flex">
          <BookingForm providerId={s.id} kind="service" careTypes={CARE_TYPES} canBook={s.claimed && s.verified && s.leadBalance > 0} phone={s.phone} />
          <div className="card flex flex-col gap-1.5 p-4 text-[13px]">
            <Link href={reportPath(s.id)} className="font-semibold">信息有误？报错</Link>
            <span className="text-sub">平台 48 小时内给结论。</span>
          </div>
        </aside>
      </div>
      <div className="lg:hidden">
        <BookingForm providerId={s.id} kind="service" careTypes={CARE_TYPES} canBook={s.claimed && s.verified && s.leadBalance > 0} phone={s.phone} />
      </div>
    </>
  );
}
