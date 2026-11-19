import type {
  CareType,
  Claim,
  Custody,
  Entity,
  FeeRow,
  Followup,
  HistoryItem,
  Home,
  InfoField,
  Lead,
  Report,
  RiskNote,
  ServiceItem,
  ServiceProvider,
  Visit,
} from "./types";
import { CARE_LABEL } from "./site";
import { TTL, monthlyTotal } from "./rules";
import { addDays, daysFromNow, hoursFromNow } from "./time";

/**
 * 示例数据：机构、服务商、主体信息、探访和回访全部是虚构的。
 * 字段上的「来源名称」表示上线后这一项从哪里取，不代表这些机构真的出现在那份名单里。
 */

const ago = (d: number) => daysFromNow(-d);

export const SRC = {
  mca: { name: "全国养老服务信息平台", url: "https://yanglao.mca.gov.cn" },
  level: { name: "广州市民政局 养老机构等级评定结果公示", url: "https://mzj.gz.gov.cn" },
  yikang: { name: "广州市及各区民政局 颐康中心名单", url: "https://mzj.gz.gov.cn" },
  ltci: { name: "广州市医疗保险服务中心 长护险定点服务机构名单", url: "https://www.gz.gov.cn/zfjg/gzsylbzj/ybfw/content/post_10984980.html" },
  ltciReview: { name: "广州市医疗保险服务中心 长护险定点服务机构 2025 年度综合考核结果", url: "https://www.gz.gov.cn/zfjg/gzsylbzj/ybfw/content/post_10804799.html" },
  nhc: { name: "广州市卫生健康委员会 医疗机构执业登记", url: "https://wjw.gz.gov.cn" },
  credit: { name: "国家企业信用信息公示系统", url: "https://www.gsxt.gov.cn" },
  org: { name: "认领时提交的材料" },
  custody: { name: "认领时提交的存管协议，平台已核对开户银行" },
  visit: { name: "城市合伙人实地探访，平台抽检" },
};

function f(
  key: string,
  label: string,
  value: string,
  src: { name: string; url?: string },
  source: InfoField["source"],
  confirmedDaysAgo: number,
  ttlDays?: number,
  locked = false,
): InfoField {
  return { key, label, value, source, sourceName: src.name, sourceUrl: src.url, confirmedAt: ago(confirmedDaysAgo), ttlDays, locked };
}

/** 按基准价生成四档月费；multiplier 调整档次差异 */
function fees(care: CareType[], k = 1, meal = 950): FeeRow[] {
  const base: Record<CareType, { bed: number; nursing: number }> = {
    zili: { bed: 1800, nursing: 600 },
    banshineng: { bed: 1800, nursing: 1500 },
    shineng: { bed: 1900, nursing: 2600 },
    shizhi: { bed: 2100, nursing: 3200 },
  };
  const r = (n: number) => Math.round((n * k) / 50) * 50;
  return care.map((c) => ({ care: c, bed: r(base[c].bed), nursing: r(base[c].nursing), meal }));
}

function feeSummary(rows: FeeRow[]) {
  return rows
    .map((row) => {
      const t = monthlyTotal(row);
      return `${CARE_LABEL[row.care]} ${t !== undefined ? `${t.toLocaleString("zh-CN")} 元/月` : "部分费目未公开"}`;
    })
    .join("；");
}

function custodyText(c: Custody, what: string) {
  if (c.amount === 0 || c.status === "none") return `不收${what}`;
  return `${c.amount.toLocaleString("zh-CN")} 元，${c.status === "custodied" ? `由${c.bank ?? "银行"}第三方存管` : "未提供存管证明"}`;
}

function entity(fullName: string, code: string, type: string, legal: string, founded: string): Entity {
  return { fullName, creditCode: code, type, legalPerson: legal, foundedAt: founded, status: "存续", checkedAt: ago(6) };
}

function visit(id: string, daysAgo: number, audit: Visit["audit"], findings: string[], by = "城市合伙人 · 示例"): Visit {
  const date = ago(daysAgo);
  return { id, date, by, validUntil: addDays(date, TTL.visit), audit, findings, photos: 12 };
}

const NOTES: Record<"home" | "service", string[]> = {
  home: [
    "入住后月费和入住前说的一致，护理员换过一次，提前告知了",
    "护理等级调整前有书面评估，家属签字后才调整收费",
    "伙食和房间与参观时一致，夜间有人巡房",
    "收费单每月一张，费目和档案上一样",
    "入住 3 个月，没有额外收费",
    "生病时院内医生先看，需要转院会马上通知家属",
  ],
  service: [
    "护理员按约定时间上门，服务内容和订单一致",
    "长护险部分当场结算，自付金额和价目表一致",
    "每次上门都留了服务记录单，时长和实际一致",
    "换过一次护理员，提前一天告知了",
    "上门前电话确认，没有临时改时间",
    "助浴前量了血压，老人不舒服就改了日子，没收费",
  ],
};

/** 平台回访：kept 条「一致」，broken 是「不一致」的具体情况 */
function followups(
  prefix: string,
  care: CareType[],
  kept: number,
  broken: { note: string; fee?: string; care?: CareType }[],
  kind: "home" | "service" = "home",
): Followup[] {
  const notes = NOTES[kind];
  const out: Followup[] = [];
  for (let i = 0; i < kept; i++) {
    out.push({ id: `${prefix}-fu${i}`, date: ago(10 + i * 17), care: care[i % care.length], promiseKept: true, note: notes[i % notes.length] });
  }
  broken.forEach((b, i) =>
    out.push({ id: `${prefix}-fb${i}`, date: ago(24 + i * 31), care: b.care ?? care[(i + 1) % care.length], promiseKept: false, actualFee: b.fee, note: b.note }),
  );
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function history(items: [number, string, string][]): HistoryItem[] {
  return items.map(([d, text, by]) => ({ date: ago(d), text, by })).sort((a, b) => b.date.localeCompare(a.date));
}

const NO_CUSTODY: Custody = { amount: 0, status: "none" };
const bank = (amount: number, daysAgo = 40): Custody => ({ amount, status: "custodied", bank: "示例银行广州分行", checkedAt: ago(daysAgo) });

interface HomeInput {
  id: string;
  name: string;
  district: string;
  address: string;
  phone: string;
  ownership: Home["ownership"];
  beds: number;
  vacantBeds: number;
  careTypes: CareType[];
  level?: number;
  levelDaysLeft?: number;
  ltci: boolean;
  medical: Home["medical"];
  claimedDaysAgo?: number;
  verified?: boolean;
  feeK?: number;
  fees?: FeeRow[];
  feesDaysAgo?: number;
  vacancyDaysAgo?: number;
  deposit?: Custody;
  membership?: Custody;
  prepayMonths?: number;
  officialPrice?: string;
  visits?: Visit[];
  followups?: Followup[];
  risks?: RiskNote[];
  entity: Entity;
  leadBalance?: number;
  metrics?: Home["metrics"];
  intro?: string;
  history?: HistoryItem[];
}

function home(i: HomeInput): Home {
  const claimed = i.claimedDaysAgo !== undefined;
  const verified = claimed && i.verified !== false;
  const feeRows = claimed ? i.fees ?? fees(i.careTypes, i.feeK) : [];
  const deposit = i.deposit ?? NO_CUSTODY;
  const membership = i.membership ?? NO_CUSTODY;
  const feesAt = i.feesDaysAgo ?? 30;
  const levelUntil = i.level ? daysFromNow(i.levelDaysLeft ?? 600) : undefined;

  const fields: InfoField[] = [
    f("address", "地址", `广州市${i.district}区${i.address}`, SRC.mca, "official", 20),
    f("phone", "联系电话", i.phone, claimed ? SRC.org : SRC.mca, claimed ? "org" : "official", 20, 180, true),
    f("beds", "床位数", `${i.beds} 张`, SRC.mca, "official", 20, 180),
    f("ownership", "性质", i.ownership, SRC.mca, "official", 20),
    f(
      "level",
      "养老机构等级",
      i.level ? `${["一", "二", "三", "四", "五"][i.level - 1]}级` : "未参加等级评定",
      SRC.level,
      "official",
      45,
      undefined,
    ),
    f("ltci", "长护险定点（机构护理）", i.ltci ? "是" : "否", SRC.ltci, "official", 25, 180),
    f(
      "medical",
      "医疗条件",
      i.medical,
      i.medical === "内设医疗机构" ? SRC.nhc : i.medical === "与医院签约合作" ? SRC.org : SRC.mca,
      i.medical === "内设医疗机构" ? "official" : i.medical === "与医院签约合作" ? "org" : "official",
      60,
      TTL.medical,
    ),
    f("credit", "主体信用", i.risks?.length ? "有行政处罚记录" : "无经营异常、行政处罚和失信记录", SRC.credit, "official", 6, TTL.credit),
  ];
  if (claimed) {
    fields.push(
      f("vacancy", "空床", `${i.vacantBeds} 张`, SRC.org, "org", i.vacancyDaysAgo ?? 2, TTL.vacancy),
      f("fees", "收费明细", feeSummary(feeRows), i.visits?.some((v) => v.audit === "pass") ? SRC.visit : SRC.org, i.visits?.some((v) => v.audit === "pass") ? "platform" : "org", feesAt, TTL.price, true),
      f("deposit", "押金", custodyText(deposit, "押金"), deposit.status === "custodied" ? SRC.custody : SRC.org, deposit.status === "custodied" ? "platform" : "org", 40, TTL.custody, true),
      f("membership", "会员费", custodyText(membership, "会员费"), membership.status === "custodied" ? SRC.custody : SRC.org, membership.status === "custodied" ? "platform" : "org", 40, TTL.custody, true),
      f("prepay", "服务费预收", `最多预收 ${i.prepayMonths ?? 1} 个月`, SRC.org, "org", 40, TTL.custody, true),
    );
  }
  if (i.officialPrice) fields.push(f("officialPrice", "官方平台登记的入住价格", i.officialPrice, SRC.mca, "official", 20, TTL.price));

  return {
    id: i.id,
    kind: "home",
    city: "guangzhou",
    name: i.name,
    district: i.district,
    address: `广州市${i.district}区${i.address}`,
    phone: i.phone,
    sample: true,
    claimed,
    claimedAt: claimed ? ago(i.claimedDaysAgo!) : undefined,
    verified,
    fields,
    visits: i.visits ?? [],
    followups: i.followups ?? [],
    entity: i.entity,
    risks: i.risks ?? [],
    history: i.history ?? (claimed ? history([[i.claimedDaysAgo!, "机构完成认领，资质和存管协议已核验", "机构认领"]]) : []),
    leadBalance: claimed ? i.leadBalance ?? 5 : 0,
    metrics: i.metrics ?? { reports12m: 0, replied24h: 0 },
    intro: i.intro,
    ownership: i.ownership,
    beds: i.beds,
    vacantBeds: i.vacantBeds,
    careTypes: i.careTypes,
    level: i.level,
    levelValidUntil: levelUntil,
    ltci: i.ltci,
    medical: i.medical,
    fees: feeRows,
    feesConfirmedAt: ago(feesAt),
    deposit,
    membership,
    prepayMonths: i.prepayMonths ?? 1,
  };
}

interface ServiceInput {
  id: string;
  name: string;
  district: string;
  address: string;
  phone: string;
  orgType: ServiceProvider["orgType"];
  areas: string[];
  ltci: boolean;
  review?: ServiceProvider["ltciReview"];
  items: ServiceItem[];
  itemsDaysAgo?: number;
  staff: ServiceProvider["staff"];
  prepay: ServiceProvider["prepay"];
  medicalLicense?: boolean;
  claimedDaysAgo?: number;
  verified?: boolean;
  visits?: Visit[];
  followups?: Followup[];
  risks?: RiskNote[];
  entity: Entity;
  leadBalance?: number;
  metrics?: ServiceProvider["metrics"];
  intro?: string;
  history?: HistoryItem[];
}

function itemsSummary(items: ServiceItem[]) {
  return items.map((it) => `${it.name} ${it.price} 元/${it.unit}`).join("；");
}

function service(i: ServiceInput): ServiceProvider {
  const claimed = i.claimedDaysAgo !== undefined;
  const verified = claimed && i.verified !== false;
  const listSrc = i.orgType === "yikang" ? SRC.yikang : i.orgType === "ltci" ? SRC.ltci : SRC.credit;
  const itemsAt = i.itemsDaysAgo ?? 25;
  const fields: InfoField[] = [
    f("address", "地址", `广州市${i.district}区${i.address}`, listSrc, "official", 25),
    f("phone", "联系电话", i.phone, claimed ? SRC.org : listSrc, claimed ? "org" : "official", 25, 180, true),
    f("ltci", "长护险定点（居家护理）", i.ltci ? "是，服务类别：居家护理" : "否", SRC.ltci, "official", 25, 180),
    f("credit", "主体信用", i.risks?.length ? "有行政处罚记录" : "无经营异常、行政处罚和失信记录", SRC.credit, "official", 5, TTL.credit),
  ];
  if (i.review) fields.push(f("ltciReview", "长护险年度考核等次", `${i.review.year} 年度 · ${i.review.result}`, SRC.ltciReview, "official", 180));
  if (i.medicalLicense) fields.push(f("medicalLicense", "医疗机构执业登记", "护理站，已登记", SRC.nhc, "official", 60, TTL.medical));
  if (claimed) {
    fields.push(
      f("areas", "服务区域", i.areas.map((a) => `${a}区`).join("、"), SRC.org, "org", 30, 180),
      f("items", "服务项目与收费", itemsSummary(i.items), i.visits?.some((v) => v.audit === "pass") ? SRC.visit : SRC.org, i.visits?.some((v) => v.audit === "pass") ? "platform" : "org", itemsAt, TTL.price, true),
      f("staff", "护理员持证", `${i.staff.total} 人，其中 ${i.staff.certified} 人持养老护理员职业技能等级证书${i.staff.backgroundChecked ? "；入职前做过背景核查" : ""}`, { name: "认领时提交，平台核对证书原件" }, "platform", 50, 365),
      f("prepay", "预付款", i.prepay.takes ? `收预付款，最多预收 ${i.prepay.maxMonths} 个月${i.prepay.note ? `（${i.prepay.note}）` : ""}` : "不收预付款，按次结算", SRC.org, "org", 50, 365, true),
    );
  }
  return {
    id: i.id,
    kind: "service",
    city: "guangzhou",
    name: i.name,
    district: i.district,
    address: `广州市${i.district}区${i.address}`,
    phone: i.phone,
    sample: true,
    claimed,
    claimedAt: claimed ? ago(i.claimedDaysAgo!) : undefined,
    verified,
    fields,
    visits: i.visits ?? [],
    followups: i.followups ?? [],
    entity: i.entity,
    risks: i.risks ?? [],
    history: i.history ?? (claimed ? history([[i.claimedDaysAgo!, "服务商完成认领，资质和护理员证书已核验", "服务商认领"]]) : []),
    leadBalance: claimed ? i.leadBalance ?? 5 : 0,
    metrics: i.metrics ?? { reports12m: 0, replied24h: 0 },
    intro: i.intro,
    orgType: i.orgType,
    areas: i.areas,
    ltci: i.ltci,
    ltciReview: i.review,
    items: claimed ? i.items : [],
    itemsConfirmedAt: ago(itemsAt),
    staff: i.staff,
    prepay: i.prepay,
    medicalLicense: !!i.medicalLicense,
  };
}

const ALL: CareType[] = ["zili", "banshineng", "shineng", "shizhi"];

const HOME_VISIT = [
  "床位数和房间布局与档案一致",
  "前台张贴的收费表与档案一致",
  "当日在岗护理员与入住老人比例约 1:4",
  "消防通道畅通，房间有呼叫器",
];

export function seedHomes(): Home[] {
  return [
    home({
      id: "kangning",
      name: "天河康宁颐养院",
      district: "天河",
      address: "龙洞示例路 18 号",
      phone: "020-8000 0101",
      ownership: "民办",
      beds: 260,
      vacantBeds: 18,
      careTypes: ALL,
      level: 4,
      ltci: true,
      medical: "内设医疗机构",
      claimedDaysAgo: 210,
      feeK: 1.1,
      deposit: bank(20000),
      prepayMonths: 3,
      visits: [visit("v-kangning", 70, "pass", HOME_VISIT)],
      followups: followups("kangning", ALL, 7, [{ note: "入住第 2 个月多收了 300 元空调费，入住前没提，机构解释是夏季另收", fee: "失能 6,250 元/月", care: "shineng" }]),
      entity: entity("广州市天河区康宁颐养院（示例）", "52440106MJL000001X", "民办非企业单位", "陈示例", "2014-03-12"),
      leadBalance: 12,
      metrics: { reports12m: 4, replied24h: 4 },
      intro: "院内设护理院，失能、失智老人分区照护，可用长护险（机构护理）。",
      history: history([
        [210, "机构完成认领，资质和存管协议已核验", "机构认领"],
        [70, "城市合伙人实地探访，平台抽检通过", "平台核验"],
        [30, "收费明细由机构确认无变化", "机构确认"],
        [2, "空床更新为 18 张", "机构更新"],
      ]),
    }),
    home({
      id: "yuexiu-fuli",
      name: "越秀区社会福利院颐年楼",
      district: "越秀",
      address: "东风示例路 66 号",
      phone: "020-8000 0102",
      ownership: "公办",
      beds: 180,
      vacantBeds: 3,
      careTypes: ["banshineng", "shineng", "shizhi"],
      level: 3,
      ltci: true,
      medical: "与医院签约合作",
      claimedDaysAgo: 160,
      feeK: 0.9,
      deposit: bank(5000),
      followups: followups("yuexiu-fuli", ["banshineng", "shineng"], 6, []),
      entity: entity("广州市越秀区社会福利院（示例）", "12440104MB0000002Y", "事业单位", "李示例", "1998-06-01"),
      metrics: { reports12m: 2, replied24h: 1 },
      intro: "公办机构，优先接收特困、低保和失能老人，社会老人需排队。",
    }),
    home({
      id: "heyue",
      name: "海珠和悦护养中心",
      district: "海珠",
      address: "江南大道示例街 9 号",
      phone: "020-8000 0103",
      ownership: "公建民营",
      beds: 220,
      vacantBeds: 11,
      careTypes: ALL,
      level: 3,
      ltci: true,
      medical: "内设医疗机构",
      claimedDaysAgo: 300,
      feeK: 1.0,
      deposit: bank(10000),
      prepayMonths: 1,
      visits: [visit("v-heyue", 120, "pass", HOME_VISIT)],
      followups: followups("heyue", ALL, 5, [
        { note: "护理等级上调后，费用当月就涨了，没有书面评估" },
        { note: "说好的单人间后来调成了双人间", fee: "自理 3,500 元/月", care: "zili" },
      ]),
      entity: entity("广州市海珠区和悦护养中心（示例）", "52440105MJL000003Z", "民办非企业单位", "王示例", "2017-09-20"),
      metrics: { reports12m: 3, replied24h: 3 },
    }),
    home({
      id: "songhe",
      name: "白云松鹤养老院",
      district: "白云",
      address: "太和示例村 3 号",
      phone: "020-8000 0104",
      ownership: "民办",
      beds: 150,
      vacantBeds: 26,
      careTypes: ["zili", "banshineng", "shineng"],
      level: 2,
      ltci: false,
      medical: "与医院签约合作",
      claimedDaysAgo: 120,
      feeK: 0.8,
      deposit: bank(10000),
      followups: followups("songhe", ["zili", "banshineng"], 4, [{ note: "餐费从 900 元涨到 1,050 元，提前一个月通知了，但入住时说一年不涨" }]),
      entity: entity("广州市白云区松鹤养老院（示例）", "52440111MJL000004A", "民办非企业单位", "赵示例", "2012-01-08"),
      metrics: { reports12m: 1, replied24h: 1 },
    }),
    home({
      id: "lvyin",
      name: "番禺绿荫颐养社区",
      district: "番禺",
      address: "南村示例大道 200 号",
      phone: "020-8000 0105",
      ownership: "民办",
      beds: 420,
      vacantBeds: 40,
      careTypes: ALL,
      level: 4,
      ltci: true,
      medical: "内设医疗机构",
      claimedDaysAgo: 400,
      feeK: 1.3,
      deposit: bank(25000),
      membership: bank(100000),
      prepayMonths: 6,
      visits: [visit("v-lvyin", 150, "pass", [...HOME_VISIT.slice(0, 3), "会员费合同写明退费规则，与存管协议一致"])],
      followups: followups("lvyin", ALL, 6, []),
      entity: entity("广州市番禺区绿荫颐养服务有限公司（示例）", "91440113MA00000005", "有限责任公司", "孙示例", "2016-05-18"),
      metrics: { reports12m: 2, replied24h: 2 },
      intro: "社区型养老，自理和护理分楼，会员费按入住年限退还。",
    }),
    home({
      id: "xiangyang",
      name: "黄埔向阳长者之家",
      district: "黄埔",
      address: "大沙示例路 52 号",
      phone: "020-8000 0106",
      ownership: "民办",
      beds: 80,
      vacantBeds: 9,
      careTypes: ["zili", "banshineng"],
      ltci: false,
      medical: "无",
      claimedDaysAgo: 90,
      fees: [
        { care: "zili", bed: 1500, nursing: 500, meal: 850 },
        { care: "banshineng", bed: 1500, meal: 850, other: "护理费按评估定，入住前面谈" },
      ],
      deposit: bank(6000),
      followups: followups("xiangyang", ["zili"], 3, []),
      entity: entity("广州市黄埔区向阳长者之家（示例）", "52440112MJL000006B", "民办非企业单位", "周示例", "2019-11-02"),
    }),
    home({
      id: "jinxiu",
      name: "荔湾锦绣老年公寓",
      district: "荔湾",
      address: "芳村示例路 31 号",
      phone: "020-8000 0107",
      ownership: "民办",
      beds: 130,
      vacantBeds: 22,
      careTypes: ["zili", "banshineng", "shineng"],
      level: 2,
      ltci: false,
      medical: "与医院签约合作",
      claimedDaysAgo: 140,
      feeK: 1.05,
      deposit: bank(15000),
      membership: { amount: 80000, status: "not_custodied" },
      followups: followups("jinxiu", ["zili", "banshineng"], 3, [{ note: "退住时会员费只退了一半，合同里写得不清楚", fee: "会员费 80,000 元" }]),
      risks: [
        {
          kind: "行政处罚",
          agency: "广州市荔湾区民政局（示例）",
          date: "2026-06-18",
          text: "未按规定公示收费项目和标准，责令改正并警告。（示例记录）",
          link: "https://www.gsxt.gov.cn",
        },
      ],
      entity: entity("广州市荔湾区锦绣老年公寓有限公司（示例）", "91440103MA00000007", "有限责任公司", "吴示例", "2015-07-30"),
      metrics: { reports12m: 3, replied24h: 1 },
    }),
    home({
      id: "tianhe-anyang",
      name: "天河安养护理院",
      district: "天河",
      address: "车陂示例街 7 号",
      phone: "020-8000 0108",
      ownership: "民办",
      beds: 120,
      vacantBeds: 0,
      careTypes: ["banshineng", "shineng"],
      level: 3,
      ltci: true,
      medical: "内设医疗机构",
      officialPrice: "3,800–6,500 元/月",
      entity: entity("广州市天河区安养护理院（示例）", "52440106MJL000008C", "民办非企业单位", "郑示例", "2018-04-11"),
    }),
    home({
      id: "zengcheng-zhongxin",
      name: "增城区中心敬老院",
      district: "增城",
      address: "荔城示例路 1 号",
      phone: "020-8000 0109",
      ownership: "公办",
      beds: 200,
      vacantBeds: 0,
      careTypes: ["zili", "banshineng", "shineng"],
      level: 2,
      ltci: false,
      medical: "与医院签约合作",
      officialPrice: "2,600–4,200 元/月",
      entity: entity("广州市增城区中心敬老院（示例）", "12440118MB0000009D", "事业单位", "冯示例", "2003-10-15"),
    }),
    home({
      id: "huadu-yile",
      name: "花都怡乐养老中心",
      district: "花都",
      address: "新华示例路 88 号",
      phone: "020-8000 0110",
      ownership: "民办",
      beds: 160,
      vacantBeds: 30,
      careTypes: ["zili", "banshineng", "shineng"],
      level: 2,
      ltci: true,
      medical: "与医院签约合作",
      claimedDaysAgo: 260,
      feeK: 0.85,
      feesDaysAgo: 120,
      vacancyDaysAgo: 12,
      deposit: bank(8000, 200),
      followups: followups("huadu-yile", ["zili"], 2, []),
      entity: entity("广州市花都区怡乐养老服务有限公司（示例）", "91440114MA00000010", "有限责任公司", "陈示例", "2016-02-22"),
    }),
    home({
      id: "nansha-haibin",
      name: "南沙海滨颐养园",
      district: "南沙",
      address: "金洲示例大道 15 号",
      phone: "020-8000 0111",
      ownership: "民办",
      beds: 300,
      vacantBeds: 60,
      careTypes: ALL,
      level: 3,
      ltci: true,
      medical: "内设医疗机构",
      claimedDaysAgo: 180,
      feeK: 0.95,
      deposit: bank(10000),
      followups: followups("nansha-haibin", ALL, 4, [{ note: "实际收的护理费比档案上高 600 元", fee: "失能 5,800 元/月", care: "shineng" }]),
      entity: entity("广州市南沙区海滨颐养服务有限公司（示例）", "91440115MA00000011", "有限责任公司", "褚示例", "2020-08-08"),
      metrics: { reports12m: 2, replied24h: 0 },
    }),
    home({
      id: "conghua-jingyang",
      name: "从化区敬阳养老院",
      district: "从化",
      address: "街口示例路 5 号",
      phone: "020-8000 0112",
      ownership: "公办",
      beds: 90,
      vacantBeds: 0,
      careTypes: ["zili", "banshineng"],
      level: 2,
      ltci: false,
      medical: "无",
      officialPrice: "2,300–3,500 元/月",
      entity: entity("广州市从化区敬阳养老院（示例）", "12440117MB0000012E", "事业单位", "卫示例", "2006-03-03"),
    }),
    home({
      id: "yiyuan",
      name: "海珠忆园认知症照护中心",
      district: "海珠",
      address: "赤岗示例路 40 号",
      phone: "020-8000 0113",
      ownership: "民办",
      beds: 96,
      vacantBeds: 5,
      careTypes: ["shineng", "shizhi"],
      level: 3,
      ltci: true,
      medical: "内设医疗机构",
      claimedDaysAgo: 230,
      feeK: 1.15,
      deposit: bank(20000),
      followups: followups("yiyuan", ["shizhi"], 5, []),
      entity: entity("广州市海珠区忆园认知症照护中心（示例）", "52440105MJL000013F", "民办非企业单位", "蒋示例", "2019-05-27"),
      metrics: { reports12m: 1, replied24h: 1 },
      intro: "专做认知症照护，门禁和防走失系统，按失智程度分组照护。",
    }),
    home({
      id: "tianhe-xinyuan",
      name: "天河欣苑长者公寓",
      district: "天河",
      address: "五山示例路 23 号",
      phone: "020-8000 0114",
      ownership: "民办",
      beds: 110,
      vacantBeds: 14,
      careTypes: ["zili", "banshineng"],
      level: 2,
      ltci: false,
      medical: "与医院签约合作",
      claimedDaysAgo: 10,
      feeK: 1.2,
      deposit: bank(12000, 10),
      entity: entity("广州市天河区欣苑长者公寓有限公司（示例）", "91440106MA00000015", "有限责任公司", "沈示例", "2021-12-01"),
    }),
    home({
      id: "baiyun-kangtai",
      name: "白云康泰养老公寓",
      district: "白云",
      address: "嘉禾示例路 77 号",
      phone: "020-8000 0115",
      ownership: "民办",
      beds: 140,
      vacantBeds: 0,
      careTypes: ["zili", "banshineng", "shineng"],
      level: 1,
      ltci: false,
      medical: "无",
      officialPrice: "3,000–4,800 元/月",
      entity: entity("广州市白云区康泰养老公寓有限公司（示例）", "91440111MA00000016", "有限责任公司", "韩示例", "2017-03-19"),
    }),
  ];
}

const SERVICE_VISIT = [
  "护理员上门时出示了养老护理员职业技能等级证书",
  "按约定时间上门，服务前做了血压测量和风险告知",
  "服务时长和项目与订单一致",
  "收费与价目表一致，当场开具服务记录单",
];

export function seedServices(): ServiceProvider[] {
  return [
    service({
      id: "jiajian",
      name: "家健护理站",
      district: "海珠",
      address: "宝岗示例路 12 号",
      phone: "020-8000 0201",
      orgType: "ltci",
      areas: ["海珠", "越秀", "荔湾"],
      ltci: true,
      review: { year: 2025, result: "优秀" },
      medicalLicense: true,
      items: [
        { name: "上门护理（医疗护理）", unit: "次", price: 120, ltci: true, includes: "换药、导尿管护理、压疮护理等，由护士上门" },
        { name: "生活照料", unit: "小时", price: 60, ltci: true, includes: "协助进食、翻身、洗漱、如厕" },
        { name: "上门助浴", unit: "次", price: 168, ltci: false, includes: "2 人上门，自带助浴设备" },
        { name: "陪护", unit: "天", price: 260, ltci: false, includes: "白天 8 小时" },
      ],
      staff: { total: 36, certified: 30, backgroundChecked: true },
      prepay: { takes: false },
      claimedDaysAgo: 190,
      visits: [visit("v-jiajian", 60, "pass", SERVICE_VISIT, "城市合伙人体验服务 · 示例")],
      followups: followups("jiajian", ["shineng", "banshineng"], 6, [], "service"),
      entity: entity("广州市海珠区家健护理站有限公司（示例）", "91440105MA00000021", "有限责任公司", "杨示例", "2015-10-10"),
      leadBalance: 8,
      metrics: { reports12m: 2, replied24h: 2 },
      intro: "长护险定点的护理站，护士和护理员都可以上门，长护险居家护理可直接结算。",
    }),
    service({
      id: "huacheng-yikang",
      name: "天河示例街颐康中心",
      district: "天河",
      address: "华城示例路 6 号",
      phone: "020-8000 0202",
      orgType: "yikang",
      areas: ["天河"],
      ltci: true,
      review: { year: 2025, result: "良好" },
      items: [
        { name: "生活照料", unit: "小时", price: 50, ltci: true },
        { name: "上门助浴", unit: "次", price: 80, ltci: false, includes: "政府资助对象另有优惠" },
        { name: "助洁", unit: "小时", price: 45, ltci: false },
        { name: "康复指导", unit: "次", price: 100, ltci: false },
      ],
      staff: { total: 18, certified: 12, backgroundChecked: true },
      prepay: { takes: true, maxMonths: 3, note: "助浴套餐 10 次" },
      claimedDaysAgo: 150,
      followups: followups("huacheng-yikang", ["banshineng", "zili"], 4, [{ note: "助浴套餐还剩 4 次时护理员离职，改约等了两周" }], "service"),
      entity: entity("广州市天河区示例街颐康中心运营方（示例）", "52440106MJL000022G", "民办非企业单位", "朱示例", "2021-07-01"),
      metrics: { reports12m: 1, replied24h: 1 },
    }),
    service({
      id: "dongshan-yikang",
      name: "越秀示例街颐康中心",
      district: "越秀",
      address: "东山示例路 2 号",
      phone: "020-8000 0203",
      orgType: "yikang",
      areas: ["越秀"],
      ltci: false,
      items: [],
      staff: { total: 0, certified: 0, backgroundChecked: false },
      prepay: { takes: false },
      entity: entity("广州市越秀区示例街颐康中心运营方（示例）", "52440104MJL000023H", "民办非企业单位", "秦示例", "2021-09-15"),
    }),
    service({
      id: "baiyun-huli",
      name: "白云护理之家",
      district: "白云",
      address: "同和示例路 30 号",
      phone: "020-8000 0204",
      orgType: "ltci",
      areas: ["白云"],
      ltci: true,
      review: { year: 2025, result: "合格" },
      items: [],
      staff: { total: 0, certified: 0, backgroundChecked: false },
      prepay: { takes: false },
      entity: entity("广州市白云区护理之家服务有限公司（示例）", "91440111MA00000024", "有限责任公司", "尤示例", "2018-12-12"),
    }),
    service({
      id: "panyu-anxin",
      name: "番禺安心居家护理",
      district: "番禺",
      address: "市桥示例路 16 号",
      phone: "020-8000 0205",
      orgType: "ltci",
      areas: ["番禺"],
      ltci: true,
      review: { year: 2025, result: "不合格" },
      items: [
        { name: "生活照料", unit: "小时", price: 55, ltci: true },
        { name: "上门助浴", unit: "次", price: 150, ltci: false },
      ],
      staff: { total: 12, certified: 6, backgroundChecked: false },
      prepay: { takes: false },
      claimedDaysAgo: 100,
      followups: followups("panyu-anxin", ["shineng"], 1, [{ note: "约好的上门时间改了三次" }, { note: "服务记录单上的时长比实际多" }], "service"),
      entity: entity("广州市番禺区安心居家护理服务有限公司（示例）", "91440113MA00000025", "有限责任公司", "许示例", "2019-04-04"),
      metrics: { reports12m: 2, replied24h: 0 },
    }),
    service({
      id: "anju",
      name: "安居到家养老服务",
      district: "天河",
      address: "体育西示例路 101 号",
      phone: "020-8000 0206",
      orgType: "company",
      areas: ["天河", "海珠", "越秀"],
      ltci: false,
      items: [
        { name: "上门助浴", unit: "次", price: 198, ltci: false, includes: "2 人上门" },
        { name: "陪护", unit: "天", price: 300, ltci: false, includes: "白天 10 小时" },
        { name: "陪诊", unit: "次", price: 180, ltci: false, includes: "半天，含挂号取药" },
      ],
      staff: { total: 20, certified: 14, backgroundChecked: true },
      prepay: { takes: true, maxMonths: 6, note: "储值卡" },
      claimedDaysAgo: 80,
      followups: followups("anju", ["banshineng"], 3, [], "service"),
      entity: entity("广州安居到家养老服务有限公司（示例）", "91440106MA00000026", "有限责任公司", "何示例", "2020-06-06"),
      metrics: { reports12m: 1, replied24h: 1 },
    }),
    service({
      id: "panyu-lehe",
      name: "番禺乐和长者服务",
      district: "番禺",
      address: "大石示例路 8 号",
      phone: "020-8000 0207",
      orgType: "company",
      areas: ["番禺"],
      ltci: false,
      items: [],
      staff: { total: 0, certified: 0, backgroundChecked: false },
      prepay: { takes: false },
      entity: entity("广州市番禺区乐和长者服务有限公司（示例）", "91440113MA00000027", "有限责任公司", "吕示例", "2022-02-14"),
    }),
    service({
      id: "huangpu-kangyi",
      name: "黄埔康颐护理站",
      district: "黄埔",
      address: "鱼珠示例路 19 号",
      phone: "020-8000 0208",
      orgType: "ltci",
      areas: ["黄埔", "增城"],
      ltci: true,
      review: { year: 2025, result: "良好" },
      medicalLicense: true,
      items: [
        { name: "上门护理（医疗护理）", unit: "次", price: 110, ltci: true },
        { name: "生活照料", unit: "小时", price: 55, ltci: true },
      ],
      staff: { total: 15, certified: 13, backgroundChecked: true },
      prepay: { takes: false },
      claimedDaysAgo: 15,
      entity: entity("广州市黄埔区康颐护理站有限公司（示例）", "91440112MA00000028", "有限责任公司", "施示例", "2017-08-18"),
    }),
    service({
      id: "baiyun-xiangqin",
      name: "白云乡亲上门照护",
      district: "白云",
      address: "京溪示例路 66 号",
      phone: "020-8000 0209",
      orgType: "company",
      areas: ["白云", "天河"],
      ltci: false,
      items: [
        { name: "陪护", unit: "天", price: 240, ltci: false },
        { name: "助洁", unit: "小时", price: 40, ltci: false },
      ],
      itemsDaysAgo: 130,
      staff: { total: 9, certified: 4, backgroundChecked: true },
      prepay: { takes: false },
      claimedDaysAgo: 200,
      entity: entity("广州市白云区乡亲上门照护服务有限公司（示例）", "91440111MA00000029", "有限责任公司", "张示例", "2019-01-25"),
    }),
  ];
}

export function seedLeads(): Lead[] {
  type L = [string, Lead["kind"], string, Lead["care"], Lead["source"], string, number, Lead["status"]];
  const rows: L[] = [
    ["kangning", "visit", "陈女士", "shineng", "ai", "豆包", 0.2, "new"],
    ["kangning", "visit", "刘先生", "shizhi", "ai", "DeepSeek", 1.5, "contacted"],
    ["kangning", "visit", "黄女士", "banshineng", "search", "百度", 3, "visited"],
    ["kangning", "visit", "梁先生", "shineng", "ai", "Kimi", 5, "converted"],
    ["kangning", "visit", "何女士", "zili", "direct", "直接访问", 8, "visited"],
    ["kangning", "visit", "罗先生", "shineng", "ai", "腾讯元宝", 11, "lost"],
    ["kangning", "visit", "谢女士", "banshineng", "ai", "豆包", 15, "converted"],
    ["kangning", "visit", "邓先生", "shizhi", "search", "百度", 19, "contacted"],
    ["kangning", "visit", "冯女士", "shineng", "ai", "文心一言", 24, "visited"],
    ["kangning", "visit", "曾先生", "zili", "direct", "直接访问", 28, "lost"],
    ["jiajian", "assessment", "林女士", "shineng", "ai", "DeepSeek", 0.5, "new"],
    ["jiajian", "assessment", "郭先生", "banshineng", "ai", "豆包", 4, "converted"],
    ["jiajian", "assessment", "马女士", "shineng", "search", "百度", 9, "visited"],
    ["jiajian", "assessment", "高先生", "banshineng", "direct", "直接访问", 13, "converted"],
    ["jiajian", "assessment", "钟女士", "shineng", "ai", "Kimi", 21, "contacted"],
    ["heyue", "visit", "唐先生", "shineng", "ai", "豆包", 2, "contacted"],
    ["lvyin", "visit", "许女士", "zili", "search", "百度", 6, "visited"],
  ];
  const leads: Lead[] = rows.map(([providerId, kind, contactName, care, source, sourceDetail, d, status], i) => ({
    id: `YY-${1001 + i}`,
    providerId,
    kind,
    contactName,
    phone: `138****${String(1200 + i * 37).slice(-4)}`,
    care,
    needs: kind === "visit" ? "想先实地看看房间和护理区，了解长护险能不能用" : "想先上门评估，看每周需要几次护理",
    preferredDate: daysFromNow(3 + (i % 5)).slice(0, 10),
    source,
    sourceDetail,
    createdAt: daysFromNow(-d),
    status,
  }));
  // 一条待运营处理的申诉
  const appealed = leads.find((l) => l.id === "YY-1002");
  if (appealed) appealed.appeal = { reason: "同一家属重复预约", createdAt: hoursFromNow(-20), status: "pending" };
  const appealed2 = leads.find((l) => l.id === "YY-1015");
  if (appealed2) appealed2.appeal = { reason: "不在服务区域内", createdAt: hoursFromNow(-30), status: "pending" };
  return leads;
}

export function seedReports(): Report[] {
  return [
    {
      id: "BC-3001",
      providerId: "kangning",
      fieldKey: "vacancy",
      fieldLabel: "空床",
      content: "昨天打电话问，说失智区已经没有空床了，档案上还写有 18 张。",
      createdAt: hoursFromNow(-6),
      deadline: hoursFromNow(42),
      status: "open",
    },
    {
      id: "BC-3002",
      providerId: "nansha-haibin",
      fieldKey: "fees",
      fieldLabel: "收费明细",
      content: "失能护理费实际是 3,100 元/月，不是档案上的 2,450 元。",
      contact: "139****2201",
      createdAt: hoursFromNow(-30),
      deadline: hoursFromNow(18),
      status: "open",
    },
    {
      id: "BC-3003",
      providerId: "nansha-haibin",
      fieldKey: "fees",
      fieldLabel: "收费明细",
      content: "参观时说餐费另加 200 元，档案上没写。",
      createdAt: hoursFromNow(-12),
      deadline: hoursFromNow(36),
      orgReply: "餐费 200 元是可选的营养餐，正在补充到收费说明。",
      repliedAt: hoursFromNow(-4),
      status: "open",
    },
    {
      id: "BC-2990",
      providerId: "heyue",
      fieldKey: "phone",
      fieldLabel: "联系电话",
      content: "电话打不通。",
      createdAt: daysFromNow(-20),
      deadline: daysFromNow(-18),
      orgReply: "前台电话线路维修，已恢复。",
      repliedAt: daysFromNow(-20),
      status: "resolved",
      conclusion: "false",
      resolvedAt: daysFromNow(-19),
    },
  ];
}

export function seedClaims(): Claim[] {
  return [
    {
      id: "RL-501",
      providerId: "baiyun-kangtai",
      applicant: "韩示例（院长）",
      phone: "137****5501",
      docs: ["民办非企业单位登记证书 / 营业执照", "养老机构备案回执", "押金存管协议", "收费价目表"],
      createdAt: hoursFromNow(-28),
      status: "pending",
    },
    {
      id: "RL-502",
      providerId: "panyu-lehe",
      applicant: "吕示例（负责人）",
      phone: "136****7702",
      docs: ["营业执照", "护理员职业技能等级证书（7 人）", "服务价目表", "预付款说明（不收）"],
      createdAt: hoursFromNow(-9),
      status: "pending",
    },
  ];
}

/** 待抽检的探访记录：挂在对应机构的 visits 上，由运营抽检 */
export function pendingVisits(): { providerId: string; visit: Visit }[] {
  return [
    { providerId: "yuexiu-fuli", visit: visit("v-yuexiu-fuli", 3, "pending", ["排队名单在前台公示", "房间与档案一致", "收费表张贴在前台"]) },
    { providerId: "huacheng-yikang", visit: visit("v-huacheng", 2, "pending", SERVICE_VISIT.slice(0, 3), "城市合伙人体验服务 · 示例") },
  ];
}
