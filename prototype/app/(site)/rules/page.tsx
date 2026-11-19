import Link from "next/link";
import type { Grade, SourceType } from "@/lib/types";
import { DEPOSIT_MAX_BED_MONTHS, EXPIRING_DAYS, FOLLOWUP_MIN, GRADE_DESC, ORG_REPLY_HOURS, PREPAY_MAX_MONTHS, REPORT_SLA_HOURS, SOURCE_DESC, TTL } from "@/lib/rules";
import { MIN_CLAIMED_DAYS, MIN_ELIGIBLE } from "@/lib/rankings";
import { APPEAL_HOURS, APPEAL_REASONS, SITE } from "@/lib/site";
import { SOURCES } from "@/lib/content";
import { GradeBadge, PageTitle, SourceTag } from "@/components/ui";

export const metadata = { title: "方法论：数据来源、可信度、风险提示、榜单和收费规则" };

const TOC = [
  ["commitments", "我们不卖什么"],
  ["scope", "收录范围"],
  ["sources", "数据来源"],
  ["grades", "可信度等级"],
  ["risk", "风险提示"],
  ["freshness", "保鲜期"],
  ["sorting", "列表排序"],
  ["rankings", "榜单"],
  ["leads", "预约与线索"],
  ["reports", "报错与申诉"],
  ["privacy", "个人信息"],
  ["fees", "平台怎么收费"],
] as const;

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="section">
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function Rules() {
  return (
    <>
      <PageTitle title="方法论" lead={`${SITE.name}怎么收数据、怎么定等级、怎么排榜单、怎么收费。规则改动会写在这一页，并注明生效日期。`} />
      <nav className="card flex flex-wrap gap-x-5 gap-y-2 p-4 text-[14px]">
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <Sec id="commitments" title="我们不卖什么">
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
          <li>
            <b>不收入住返佣，也不按上门服务订单抽成。</b>返佣会让推荐跟着佣金走，和「可信」直接冲突。这是我们和入住中介的主要区别。
          </li>
          <li>
            <b>不卖排序和榜单名次。</b>机构年费不含任何排序权益；榜单只看公式里的指标。
          </li>
          <li>
            <b>不卖评价和探访结论。</b>回访由平台打电话完成，机构不能删除；探访记录由城市合伙人提交、平台抽检。
          </li>
          <li>
            <b>不经手资金。</b>押金、会员费由商业银行第三方存管，服务费由家属直接付给机构或服务商。
          </li>
        </ul>
      </Sec>

      <Sec id="scope" title="收录范围（第一期，广州）">
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
          <li>注册登记的养老机构，全部建档；没认领的只展示官方公示的字段。</li>
          <li>
            上门服务商先收两类有官方名单的：长护险定点的居家护理机构，和颐康中心（全市 177 个，覆盖所有街镇
            <a href={SOURCES.yikang.url} target="_blank" rel="noreferrer">
              来源
            </a>
            ）。其他有营业执照的上门服务公司，认领并核验后再收录。
          </li>
          <li>个人护工、家政中介不收：陌生人入户，平台没法核验个人。</li>
          <li>社区日托、长者饭堂放到下一期。</li>
        </ul>
      </Sec>

      <Sec id="sources" title="数据来源">
        <p className="m-0 text-body">每个字段都标四类来源之一，以及最后核对日期。</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(Object.keys(SOURCE_DESC) as SourceType[]).map((s) => (
            <li key={s} className="flex flex-wrap items-center gap-2">
              <SourceTag source={s} />
              <span className="text-body">{SOURCE_DESC[s]}</span>
            </li>
          ))}
        </ul>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>来源</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["名称、地址、床位、性质", "全国养老服务信息平台"],
                ["养老机构等级", "广州市民政局 等级评定结果公示（记下有效期）"],
                ["长护险定点及服务类别", "广州市医疗保险服务中心 定点名单和新增定点公示"],
                ["长护险年度考核等次", "广州市医疗保险服务中心 年度综合考核结果"],
                ["内设医疗机构、护理站执业", "广州市卫生健康委员会 医疗机构执业登记"],
                ["主体信息、经营异常、行政处罚", "国家企业信用信息公示系统，用公司全称定向检索"],
                ["收费明细、上门价目", "机构认领时提交；探访或体验服务时核对"],
                ["押金、会员费存管", "机构提交的存管协议，平台核对开户银行"],
                ["护理员持证", "服务商提交，平台核对证书原件"],
                ["探访、体验服务、回访", "城市合伙人和平台自己采集"],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td className="font-semibold">{a}</td>
                  <td className="text-body">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec id="grades" title="可信度等级（A–D）">
        <p className="m-0 text-body">等级只说明档案上的信息可不可信，不说明机构好不好。沿用知底的规则，口径按养老调整：</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(["A", "B", "C", "D"] as Grade[]).map((g) => (
            <li key={g} className="flex flex-wrap items-center gap-2">
              <GradeBadge grade={g} />
              <span className="text-body">{GRADE_DESC[g]}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[13px] text-sub">D 优先：满足 D 的条件时，不管有没有探访都显示 D。</p>
      </Sec>

      <Sec id="risk" title="风险提示">
        <p className="m-0 text-body">风险提示放在档案顶部，和等级分开标：它不改变等级，但有风险提示的不能进榜单。只有两种来源：</p>
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
          <li>官方负面记录：行政处罚、经营异常、失信、长护险年度考核「不合格」。只引用官方原文并附链接。</li>
          <li>
            按
            <a href={SOURCES.prepayOpinion.url} target="_blank" rel="noreferrer">
              七部门预收费监管指导意见
            </a>
            判断的收费问题：公办、公建民营机构收会员费；押金或会员费没有第三方存管证明；押金超过月床位费的 {DEPOSIT_MAX_BED_MONTHS} 倍；服务费预收超过 {PREPAY_MAX_MONTHS} 个月。
          </li>
        </ul>
      </Sec>

      <Sec id="freshness" title="保鲜期">
        <p className="m-0 text-body">字段过了保鲜期没有重新确认，档案降为 D。到期前 {EXPIRING_DAYS} 天提醒机构确认；空床这类保鲜期很短的字段，按保鲜期的 30% 提前提醒（7 天的提前 2 天）。以下是建议值，上线前再定：</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th className="text-right">保鲜期</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["空床", TTL.vacancy],
                ["收费明细、上门价目", TTL.price],
                ["主体信用", TTL.credit],
                ["存管状态、预付款、医疗执业", TTL.custody],
                ["探访、体验服务", TTL.visit],
              ].map(([a, d]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td className="text-right">{d} 天</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec id="sorting" title="列表排序">
        <p className="m-0 text-body">「综合」排序依次看：可信度（A→D）、信息完整度、名称。付费不改变排序。也可以按月费从低到高排。</p>
      </Sec>

      <Sec id="rankings" title="榜单">
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
          <li>只做单项客观指标（收费透明、回访兑现、报错响应），公式写在每个榜单上。</li>
          <li>参与条件：已认领并核验、认领满 {MIN_CLAIMED_DAYS} 天、可信度 B 级及以上、没有风险提示。</li>
          <li>同城同类能参与的不足 {MIN_ELIGIBLE} 家，整个榜不发布。</li>
          <li>回访不足 {FOLLOWUP_MIN} 条的不进回访兑现榜，档案上也只显示条数、不显示比例。</li>
        </ul>
        <Link href="/guangzhou/bangdan">看本月榜单 →</Link>
      </Sec>

      <Sec id="leads" title="预约与线索">
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
          <li>家属的探访预约（机构）和上门评估预约（服务商）只发给那一家，是独享线索，不会转卖给其他机构。</li>
          <li>只有认领并核验过的机构能接预约；未认领的只显示官方登记电话。</li>
          <li>
            机构收到线索后 {APPEAL_HOURS} 小时内可以申诉，理由限于：{APPEAL_REASONS.join("、")}。平台核实属实，退回这条线索的额度。
          </li>
          <li>每条预约记录来源（AI 助手、搜索引擎、直接访问），机构后台能看到来自 AI 的比例。</li>
        </ul>
      </Sec>

      <Sec id="reports" title="报错与申诉">
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
          <li>
            任何人都可以对档案上的任何一项报错。机构先在 {ORG_REPLY_HOURS} 小时内回应，平台 {REPORT_SLA_HOURS} 小时内给结论。
          </li>
          <li>核实期间这一项标「有报错，核实中」；同一项有 2 条及以上没处理完的报错，档案降为 D。</li>
          <li>报错属实，平台改正这一项，并在变更记录里写明。机构对风险提示有异议，也走这个流程。</li>
        </ul>
      </Sec>

      <Sec id="privacy" title="个人信息">
        <p className="m-0 text-body">
          预约只收联系人、手机号和老人的身体情况（自理、半失能、失能、失智），不收病历和诊断。老人的健康情况属于敏感个人信息，提交前单独取得同意，只转给预约的那一家。上线前请律师评估。
        </p>
      </Sec>

      <Sec id="fees" title="平台怎么收费">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>项目</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-semibold">认领</td>
                <td className="text-body">免费。认领后可以补全信息、回应报错，赠送 5 条探访线索。</td>
              </tr>
              <tr>
                <td className="font-semibold">年费会员</td>
                <td className="text-body">数据看板、AI 来源流量报告、空床和可约时段实时更新、赠送线索。不含任何排序权益。</td>
              </tr>
              <tr>
                <td className="font-semibold">探访和上门评估线索包</td>
                <td className="text-body">预充值、按条扣费；独享，{APPEAL_HOURS} 小时内可申诉。</td>
              </tr>
              <tr>
                <td className="font-semibold">入住返佣、订单抽成</td>
                <td className="text-body">不收。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Sec>
    </>
  );
}
