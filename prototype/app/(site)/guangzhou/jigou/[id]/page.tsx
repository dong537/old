import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHANGED_SOURCE, CORRECTED_SOURCE, getHome, listReports } from "@/lib/store";
import { CARE_DESC, CARE_LABEL } from "@/lib/site";
import { DEPOSIT_MAX_BED_MONTHS, PREPAY_MAX_MONTHS, completeness, field, fieldState, gradeOf, levelLeft, monthlyTotal, riskFlags, yuan } from "@/lib/rules";
import { changhuxianPath, homePath, jigouPath, reportPath } from "@/lib/paths";
import { SOURCES } from "@/lib/content";
import { fmtDate } from "@/lib/time";
import { BookingForm } from "@/components/BookingForm";
import { JsonLd } from "@/components/JsonLd";
import { Toc, type TocItem } from "@/components/Toc";
import { EntityBox, FieldTable, FollowupList, GradeExplain, HistoryList, RiskBox, SourcesList, VisitList, buildRefs } from "@/components/profile";
import { ClaimTag, FieldStateTag, Notice, SampleTag, SectionTitle, SourceTag } from "@/components/ui";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const h = getHome((await params).id);
  if (!h) return {};
  return {
    title: `${h.name} · 收费、等级、长护险、存管状态`,
    description: `${h.name}（${h.district}区，${h.ownership}，${h.beds} 张床）的收费明细、等级、长护险定点、押金存管和探访记录，每项标来源和核对日期。`,
    robots: h.claimed ? undefined : { index: false },
  };
}

const n = (x?: number) => (x === undefined ? "未公开" : `${x.toLocaleString("zh-CN")}`);

export default async function HomeProfile({ params }: { params: Params }) {
  const h = getHome((await params).id);
  if (!h) notFound();
  const reports = listReports();
  const grade = gradeOf(h, reports);
  const risks = riskFlags(h);
  const { list: refs, n: refN } = buildRefs(h.fields);
  const comp = completeness(h);
  const feesField = field(h, "fees");
  const feeState = feesField ? fieldState(feesField, h.id, reports) : "ok";
  const left = levelLeft(h);
  const official = field(h, "officialPrice");
  const minBed = Math.min(...h.fees.map((f) => f.bed ?? Infinity));
  const depositCap = h.deposit.amount > 0 && Number.isFinite(minBed) ? minBed * DEPOSIT_MAX_BED_MONTHS : undefined;

  const toc: TocItem[] = [
    { id: "overview", label: "概况" },
    ...(risks.length ? [{ id: "risk", label: "风险提示", warn: true }] : []),
    { id: "fees", label: "收费明细" },
    { id: "custody", label: "存管状态" },
    { id: "level", label: "等级与资质" },
    { id: "medical", label: "医疗与长护险" },
    { id: "visits", label: "探访记录" },
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
          additionalType: "养老机构",
          name: h.name,
          address: { "@type": "PostalAddress", addressLocality: "广州市", addressRegion: "广东省", streetAddress: h.address },
          telephone: h.phone,
          description: `${h.ownership}养老机构，${h.beds} 张床，收住${h.careTypes.map((c) => CARE_LABEL[c]).join("、")}老人${h.ltci ? "，长护险定点" : ""}。`,
          ...(h.fees.length
            ? {
                makesOffer: h.fees
                  .filter((f) => monthlyTotal(f) !== undefined)
                  .map((f) => ({ "@type": "Offer", name: `${CARE_LABEL[f.care]}老人月费`, price: monthlyTotal(f), priceCurrency: "CNY", validFrom: fmtDate(h.feesConfirmedAt) })),
              }
            : {}),
        }}
      />
      <nav className="text-[13px] text-sub">
        <Link href={jigouPath()} className="text-sub">找养老机构</Link> / <Link href={jigouPath({ district: h.district })} className="text-sub">{h.district}区</Link> / {h.name}
      </nav>
      <Toc items={toc} variant="bar" reportHref={reportPath(h.id)} />
      <div className="flex items-start gap-6">
        <Toc items={toc} variant="side" reportHref={reportPath(h.id)} />
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <section id="overview" className="section">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="m-0 text-[26px] font-bold leading-tight">{h.name}</h1>
                <span className="text-body">
                  {h.address} · {h.ownership} · {h.beds} 张床
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <SampleTag />
                <ClaimTag claimed={h.claimed} verified={h.verified} />
              </div>
            </div>
            <GradeExplain grade={grade} />
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-page p-4 sm:grid-cols-4">
              <div className="flex flex-col">
                <span className="text-xs text-sub">收住</span>
                <span className="font-semibold">{h.careTypes.map((c) => CARE_LABEL[c]).join("、")}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-sub">空床</span>
                <span className="font-semibold">{h.claimed ? `${h.vacantBeds} 张` : "未知（未认领）"}</span>
                {field(h, "vacancy") && <FieldStateTag state={fieldState(field(h, "vacancy")!, h.id, reports)} />}
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-sub">等级</span>
                <span className="font-semibold">{h.level ? `${["一", "二", "三", "四", "五"][h.level - 1]}级` : "未参加评定"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-sub">长护险（机构护理）</span>
                <span className="font-semibold">{h.ltci ? "定点" : "非定点"}</span>
              </div>
            </div>
            {!h.claimed && (
              <Notice tone="warn">
                这家还没有认领，下面只有官方公示的字段：没有拆开的收费、存管状态和探访记录，也不能在线预约。是这家的工作人员？
                <Link href={`/claim?id=${h.id}`} className="ml-1 font-semibold">免费认领</Link>
              </Notice>
            )}
            {h.intro && (
              <div className="flex flex-col gap-1 rounded-lg border border-dashed border-line p-3">
                <span className="text-xs text-sub">机构自述（机构自己写的，平台没有核验，不进概况）</span>
                <span className="text-body">{h.intro}</span>
              </div>
            )}
            <p className="m-0 text-xs text-sub">
              信息完整度 {comp.done}/{comp.total} · 档案上每一项都标了来源和核对日期，点「这项有误」可以报错，平台 48 小时内给结论
            </p>
          </section>

          <RiskBox flags={risks} />

          <section id="fees" className="section">
            <SectionTitle
              title="收费明细"
              extra={
                feesField && (
                  <span className="flex items-center gap-2">
                    <SourceTag source={feesField.source} /> 核对于 {fmtDate(feesField.confirmedAt)}
                    <FieldStateTag state={feeState} />
                  </span>
                )
              }
            />
            {(feesField?.sourceName === CORRECTED_SOURCE || feesField?.sourceName === CHANGED_SOURCE) && (
              <Notice tone="ok">
                {feesField.sourceName === CORRECTED_SOURCE ? "平台核实后的收费（家属报错后核实" : "机构更新的收费（平台审核通过"}，{fmtDate(feesField.confirmedAt)}）：<b>{feesField.value}</b>。下表是原先的分项价目，机构补全分项后会替换。
              </Notice>
            )}
            {h.fees.length ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>老人情况</th>
                        <th className="text-right">床位费</th>
                        <th className="text-right">护理费</th>
                        <th className="text-right">餐费</th>
                        <th className="text-right">合计（元/月）</th>
                        <th>其他</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.fees.map((f) => {
                        const t = monthlyTotal(f);
                        return (
                          <tr key={f.care}>
                            <td>
                              <span className="font-semibold">{CARE_LABEL[f.care]}</span>
                              <span className="block text-xs text-sub">{CARE_DESC[f.care]}</span>
                            </td>
                            <td className="text-right">{n(f.bed)}</td>
                            <td className="text-right">{n(f.nursing)}</td>
                            <td className="text-right">{n(f.meal)}</td>
                            <td className="text-right font-semibold">{t !== undefined ? t.toLocaleString("zh-CN") : <span className="text-gradeD">费目没有全部公开</span>}</td>
                            <td className="text-[13px] text-body">{f.other ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="m-0 text-[13px] text-body">
                  护理费按入住评估的护理等级收。<b>入住后护理等级上调、费用跟着涨，是最常见的纠纷</b>：签约时问清楚谁来评估、多久评一次、调整前是否书面告知。
                </p>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-body">
                  机构还没有认领，没有拆开的收费。
                  {official && (
                    <>
                      官方平台登记的入住价格是 <b>{official.value}</b>
                      <span className="text-sub">（{official.sourceName}，核对于 {fmtDate(official.confirmedAt)}）</span>，不清楚包含哪些费目。
                    </>
                  )}
                </p>
              </div>
            )}
            <Link href={reportPath(h.id, "fees")} className="text-[13px]">
              收费和你问到的不一样？报错
            </Link>
          </section>

          <section id="custody" className="section">
            <SectionTitle title="押金、会员费和预收" extra={<a href={SOURCES.prepayOpinion.url} target="_blank" rel="noreferrer">依据：七部门预收费监管指导意见</a>} />
            {h.claimed ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "押金", c: h.deposit, extra: depositCap ? `上限：月床位费 ${yuan(minBed)} × ${DEPOSIT_MAX_BED_MONTHS} = ${yuan(depositCap)}` : undefined },
                  { label: "会员费", c: h.membership, extra: h.ownership !== "民办" ? `${h.ownership}机构不得收会员费` : undefined },
                ].map(({ label, c, extra }) => (
                  <div key={label} className="flex flex-col gap-1 rounded-lg border border-line p-4">
                    <span className="text-[13px] text-sub">{label}</span>
                    <span className="text-[17px] font-semibold">{c.amount > 0 ? yuan(c.amount) : `不收${label}`}</span>
                    {c.amount > 0 &&
                      (c.status === "custodied" ? (
                        <span className="text-[13px] text-gradeA">由{c.bank}第三方存管 · 平台核对于 {c.checkedAt ? fmtDate(c.checkedAt) : "—"}</span>
                      ) : (
                        <span className="text-[13px] font-semibold text-risk">没有提供存管证明</span>
                      ))}
                    {extra && <span className="text-xs text-sub">{extra}</span>}
                  </div>
                ))}
                <div className="flex flex-col gap-1 rounded-lg border border-line p-4">
                  <span className="text-[13px] text-sub">服务费预收</span>
                  <span className="text-[17px] font-semibold">最多 {h.prepayMonths} 个月</span>
                  <span className={`text-xs ${h.prepayMonths > PREPAY_MAX_MONTHS ? "font-semibold text-risk" : "text-sub"}`}>规定最长 {PREPAY_MAX_MONTHS} 个月</span>
                </div>
              </div>
            ) : (
              <p className="m-0 text-body">机构还没有认领，存管状态没有核验。交押金或会员费前，请要求机构出示商业银行的第三方存管协议。</p>
            )}
            <p className="m-0 text-[13px] text-sub">平台不经手任何资金。存管状态来自机构提交的存管协议，平台核对开户银行后标注，每 12 个月复核。</p>
          </section>

          <section id="level" className="section">
            <SectionTitle title="等级与资质" />
            {h.level && left !== undefined && (
              <p className="m-0 text-body">
                {["一", "二", "三", "四", "五"][h.level - 1]}级，证书有效期到 {fmtDate(h.levelValidUntil!)}（还有 {left} 天）。等级分一至五级，修订中的国标规定有效期 3 年、到期不复评自动失效。
                <a href={SOURCES.levelDraft.url} target="_blank" rel="noreferrer" className="ml-1 text-[13px]">
                  修订稿报道
                </a>
              </p>
            )}
            <FieldTable p={h} fields={[field(h, "level"), field(h, "ownership"), field(h, "beds"), field(h, "address"), field(h, "phone"), field(h, "vacancy")]} reports={reports} refN={refN} />
          </section>

          <section id="medical" className="section">
            <SectionTitle title="医疗与长护险" extra={<Link href={changhuxianPath()}>长护险怎么申请 →</Link>} />
            <FieldTable p={h} fields={[field(h, "medical"), field(h, "ltci")]} reports={reports} refN={refN} />
            <p className="m-0 text-[13px] text-body">
              {h.ltci ? "长护险定点机构可以用长护险结算机构护理费用；需要先通过失能评估。" : "这家不是长护险定点机构，护理费不能用长护险结算。"}
              {h.medical === "内设医疗机构" ? "内设医疗机构可以处理日常用药和常见病。" : h.medical === "与医院签约合作" ? "和医院签约合作，急症要转院。" : "院内没有医疗机构，看病要外出就医。"}
            </p>
          </section>

          <section id="visits" className="section">
            <SectionTitle title="探访记录" extra="城市合伙人实地看过，平台抽检后才计入 A 级" />
            <VisitList p={h} />
          </section>

          <section id="followups" className="section">
            <SectionTitle title="家属回访" extra="代替开放评价：老人基本不上网，评价攒不起来" />
            <FollowupList p={h} />
          </section>

          <section id="entity" className="section">
            <SectionTitle title="主体信息" />
            <EntityBox p={h} />
            <FieldTable p={h} fields={[field(h, "credit")]} reports={reports} refN={refN} />
          </section>

          <section id="history" className="section">
            <SectionTitle title="变更记录" />
            <HistoryList p={h} />
          </section>

          <section id="sources" className="section">
            <SectionTitle title="来源" />
            <SourcesList refs={refs} />
          </section>
        </div>
        <aside className="sticky top-4 hidden w-[320px] shrink-0 flex-col gap-4 lg:flex">
          <BookingForm providerId={h.id} kind="home" careTypes={h.careTypes} canBook={h.claimed && h.verified && h.leadBalance > 0} phone={h.phone} />
          <div className="card flex flex-col gap-1.5 p-4 text-[13px]">
            <Link href={reportPath(h.id)} className="font-semibold">信息有误？报错</Link>
            <span className="text-sub">平台 48 小时内给结论；同一项 2 条未结报错，等级降为 D。</span>
          </div>
        </aside>
      </div>
      <div className="lg:hidden">
        <BookingForm providerId={h.id} kind="home" careTypes={h.careTypes} canBook={h.claimed && h.verified && h.leadBalance > 0} phone={h.phone} />
      </div>
      <p className="m-0 text-[13px] text-sub">
        档案网址：{homePath(h.id)} · 付费不改变这家在列表和榜单里的位置
      </p>
    </>
  );
}
