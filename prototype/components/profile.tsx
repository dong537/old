import Link from "next/link";
import type { Grade, InfoField, Provider, Report } from "@/lib/types";
import { CARE_LABEL } from "@/lib/site";
import { FOLLOWUP_MIN, GRADE_DESC, type RiskFlag, expiresAt, fieldState, followupStats } from "@/lib/rules";
import { reportPath } from "@/lib/paths";
import { fmtDate } from "@/lib/time";
import { FieldStateTag, GradeBadge, Notice, SourceTag } from "./ui";
import { Ref } from "./Ref";

/** 页面底部来源列表：同一来源只编一个号 */
export function buildRefs(fields: InfoField[]) {
  const list: { name: string; url?: string }[] = [];
  const idx = new Map<string, number>();
  for (const f of fields) {
    if (!idx.has(f.sourceName)) {
      list.push({ name: f.sourceName, url: f.sourceUrl });
      idx.set(f.sourceName, list.length);
    }
  }
  return { list, n: (f: InfoField) => idx.get(f.sourceName)! };
}

export function FieldTable({
  p,
  fields,
  reports,
  refN,
}: {
  p: Provider;
  fields: (InfoField | undefined)[];
  reports: Report[];
  refN: (f: InfoField) => number;
}) {
  const rows = fields.filter((f): f is InfoField => !!f);
  if (!rows.length) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="w-[150px]">项目</th>
            <th>内容</th>
            <th className="w-[210px]">来源与核对日期</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const st = fieldState(f, p.id, reports);
            const exp = expiresAt(f);
            return (
              <tr key={f.key}>
                <td className="font-semibold">{f.label}</td>
                <td>
                  <div className="flex flex-col gap-1">
                    <span>
                      {f.value}
                      <Ref n={refN(f)} />
                    </span>
                    {f.pendingValue && <span className="text-xs text-gradeB">机构已提交修改：{f.pendingValue}（平台审核中，审核前显示原值）</span>}
                    <span className="flex flex-wrap items-center gap-2">
                      <FieldStateTag state={st} />
                      <Link href={reportPath(p.id, f.key)} className="text-xs text-sub hover:text-brand">
                        这项有误
                      </Link>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col gap-1 text-[13px]">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <SourceTag source={f.source} />
                      <span className="text-sub">核对于 {fmtDate(f.confirmedAt)}</span>
                    </span>
                    {exp && <span className="text-xs text-sub">保鲜期到 {fmtDate(exp)}</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RiskBox({ flags }: { flags: RiskFlag[] }) {
  if (!flags.length) return null;
  return (
    <div id="risk" className="flex scroll-mt-16 flex-col gap-3 rounded-xl border-2 border-risk-line bg-risk-bg p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold text-risk">风险提示（{flags.length}）</h2>
        <span className="text-[13px] text-risk">风险提示和可信度等级分开标：它不改变等级，但有风险提示的不能进榜单</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {flags.map((r, i) => (
          <li key={i} className="flex flex-col gap-0.5 rounded-lg bg-white/70 px-3 py-2.5">
            <span className="font-semibold text-risk">{r.kind}</span>
            <span className="text-body">{r.text}</span>
            <span className="text-xs text-sub">
              {r.derived
                ? "平台按《关于加强养老机构预收费监管的指导意见》和档案上的收费、存管信息判断"
                : [r.agency, r.date].filter(Boolean).join(" · ")}
              {r.link && (
                <>
                  {" · "}
                  <a href={r.link} target="_blank" rel="noreferrer">
                    官方原文
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GradeExplain({ grade }: { grade: Grade }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-body">
      <GradeBadge grade={grade} large />
      <span>{GRADE_DESC[grade]}</span>
      <Link href="/rules#grades" className="text-[13px]">等级怎么定</Link>
    </div>
  );
}

export function VisitList({ p }: { p: Provider }) {
  const what = p.kind === "home" ? "实地探访" : "体验服务";
  const shown = p.visits.filter((v) => v.audit !== "fail");
  if (!shown.length) {
    return <p className="m-0 text-body">还没有{what}记录。{p.claimed ? "平台会安排城市合伙人在认领后 90 天内完成首次" + what + "。" : "机构认领后才会安排。"}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {shown.map((v) => (
        <li key={v.id} className="flex flex-col gap-1.5 rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <b>{fmtDate(v.date)}</b>
            <span className="text-sub">{v.by}</span>
            {v.audit === "pass" ? (
              <span className="chip bg-gradeA-bg text-gradeA">平台抽检通过</span>
            ) : (
              <span className="chip bg-gradeD-bg text-gradeD">等待平台抽检，暂不计入等级</span>
            )}
            <span className="text-sub">有效期到 {fmtDate(v.validUntil)}</span>
          </div>
          <ul className="m-0 flex flex-col gap-0.5 pl-5 text-body">
            {v.findings.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <span className="text-xs text-sub">附照片 {v.photos} 张（原型里不展示），照片和记录都带拍摄日期</span>
        </li>
      ))}
    </ul>
  );
}

export function FollowupList({ p }: { p: Provider }) {
  const s = followupStats(p);
  const who = p.kind === "home" ? "入住家属" : "接受过服务的家属";
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-body">
        近 12 个月平台回访{who} <b>{s.n}</b> 条，其中 <b>{s.kept}</b> 条说
        {p.kind === "home" ? "服务和收费与入住前说的一致" : "上门时间、服务和收费与约定一致"}
        {s.rate !== undefined ? `（${Math.round(s.rate * 100)}%）` : `；不足 ${FOLLOWUP_MIN} 条，不显示比例`}。回访由平台打电话完成，机构不能删除或回复。
      </p>
      {s.n > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {p.followups.map((f) => (
            <li key={f.id} className="flex flex-col gap-0.5 border-t border-hair pt-2">
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-sub">{fmtDate(f.date)}</span>
                <span className="chip bg-page text-sub">{CARE_LABEL[f.care]}</span>
                {f.promiseKept ? <span className="chip bg-gradeA-bg text-gradeA">一致</span> : <span className="chip bg-gradeD-bg text-gradeD">不一致</span>}
                {f.actualFee && <span className="text-sub">实际：{f.actualFee}</span>}
              </span>
              <span className="text-body">{f.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EntityBox({ p }: { p: Provider }) {
  const e = p.entity;
  return (
    <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-body sm:grid-cols-[140px_1fr]">
      <dt className="text-sub">全称</dt>
      <dd className="m-0">{e.fullName}</dd>
      <dt className="text-sub">统一社会信用代码</dt>
      <dd className="m-0 font-mono text-[13px]">{e.creditCode}</dd>
      <dt className="text-sub">类型</dt>
      <dd className="m-0">{e.type}</dd>
      <dt className="text-sub">法定代表人</dt>
      <dd className="m-0">{e.legalPerson}</dd>
      <dt className="text-sub">成立日期</dt>
      <dd className="m-0">{e.foundedAt}</dd>
      <dt className="text-sub">登记状态</dt>
      <dd className="m-0">{e.status}</dd>
      <dt className="text-sub">核对</dt>
      <dd className="m-0 text-[13px] text-sub">
        {fmtDate(e.checkedAt)} 用公司全称在
        <a href="https://www.gsxt.gov.cn" target="_blank" rel="noreferrer">
          国家企业信用信息公示系统
        </a>
        定向检索，每 30 天复查一次
      </dd>
    </dl>
  );
}

export function HistoryList({ p }: { p: Provider }) {
  if (!p.history.length) return <p className="m-0 text-sub">暂无变更记录。</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
      {p.history.slice(0, 8).map((h, i) => (
        <li key={i} className="flex flex-wrap gap-x-3">
          <span className="w-[88px] shrink-0 text-sub">{fmtDate(h.date)}</span>
          <span className="flex-1 text-body">{h.text}</span>
          <span className="text-xs text-sub">{h.by}</span>
        </li>
      ))}
    </ol>
  );
}

export function SourcesList({ refs }: { refs: { name: string; url?: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 flex flex-col gap-1 pl-5 text-[14px] text-body">
        {refs.map((r, i) => (
          <li key={r.name} id={`ref-${i + 1}`} className="scroll-mt-20">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.name}
              </a>
            ) : (
              r.name
            )}
          </li>
        ))}
      </ol>
      <Notice>
        原型说明：这家是虚构示例，字段内容是编的。来源名称表示上线后这一项从哪里取，不代表这家真的出现在那份名单里。
      </Notice>
    </div>
  );
}
