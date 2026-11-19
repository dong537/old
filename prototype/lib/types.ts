export type Grade = "A" | "B" | "C" | "D";

/** 字段来源：官方公示 / 平台核验 / 机构提交 / 家属反馈 */
export type SourceType = "official" | "platform" | "org" | "family";

/** 单条信息的状态，由保鲜期、报错和待审核修改推导 */
export type FieldState = "ok" | "expiring" | "expired" | "disputed" | "pending";

/** 两类档案：养老机构（住养）和上门服务商（居家） */
export type ProviderKind = "home" | "service";

/** 护理类型，收费按这个分档 */
export type CareType = "zili" | "banshineng" | "shineng" | "shizhi";

export interface InfoField {
  key: string;
  label: string;
  value: string;
  source: SourceType;
  /** 来源名称，如「广州市民政局等级评定结果公示」 */
  sourceName: string;
  sourceUrl?: string;
  /** 最后一次核对时间（ISO） */
  confirmedAt: string;
  /** 保鲜期天数；不填表示长期有效 */
  ttlDays?: number;
  /** 关键字段：机构修改后要平台审核 */
  locked?: boolean;
  /** 已提交、待审核的新值 */
  pendingValue?: string;
}

/** 机构按护理类型分档的月收费（元/月） */
export interface FeeRow {
  care: CareType;
  bed?: number;
  nursing?: number;
  meal?: number;
  /** 其他固定月费的说明，如「空调费 80 元/月」 */
  other?: string;
}

/** 押金、会员费的存管状态 */
export interface Custody {
  /** 收的金额（元）；不收填 0 */
  amount: number;
  status: "custodied" | "not_custodied" | "none";
  bank?: string;
  checkedAt?: string;
}

/** 上门服务项目与价格 */
export interface ServiceItem {
  name: string;
  unit: "小时" | "次" | "天" | "月";
  price: number;
  /** 长护险居家护理能不能用 */
  ltci: boolean;
  includes?: string;
}

/** 实地探访（机构）或体验服务（上门服务商），由城市合伙人完成、平台抽检 */
export interface Visit {
  id: string;
  date: string;
  by: string;
  /** 有效期截止 */
  validUntil: string;
  /** 平台抽检：待抽检 / 通过 / 不通过 */
  audit: "pending" | "pass" | "fail";
  findings: string[];
  photos: number;
}

/** 平台回访入住或接受过服务的家属 */
export interface Followup {
  id: string;
  date: string;
  care: CareType;
  /** 服务和收费是否与入住（签约）前说的一致 */
  promiseKept: boolean;
  /** 家属报的实际月费或单价 */
  actualFee?: string;
  note: string;
}

/** 主体信息：来自国家企业信用信息公示系统，用公司全称定向检索 */
export interface Entity {
  fullName: string;
  creditCode: string;
  type: string;
  legalPerson: string;
  foundedAt: string;
  status: string;
  checkedAt: string;
}

/** 官方负面记录：只进「风险提示」，不改变 A–D 等级 */
export interface RiskNote {
  kind: string;
  agency: string;
  date: string;
  text: string;
  link?: string;
}

export interface HistoryItem {
  date: string;
  text: string;
  by: string;
}

interface ProviderBase {
  id: string;
  kind: ProviderKind;
  city: string;
  name: string;
  district: string;
  address: string;
  phone: string;
  /** 原型阶段全部是虚构示例 */
  sample: true;
  claimed: boolean;
  claimedAt?: string;
  /** 认领后资质（机构还包括存管）已核验 */
  verified: boolean;
  fields: InfoField[];
  visits: Visit[];
  followups: Followup[];
  entity: Entity;
  risks: RiskNote[];
  history: HistoryItem[];
  /** 探访线索包余额（条）；未认领为 0 */
  leadBalance: number;
  /** 近 12 个月收到的报错 / 24 小时内回应的报错 */
  metrics: { reports12m: number; replied24h: number };
  /** 机构自我介绍，单独标注，不进概况 */
  intro?: string;
}

export interface Home extends ProviderBase {
  kind: "home";
  ownership: "公办" | "公建民营" | "民办";
  beds: number;
  vacantBeds: number;
  careTypes: CareType[];
  /** 养老机构等级，一至五级；没评过不填 */
  level?: number;
  levelValidUntil?: string;
  /** 长护险定点（机构护理） */
  ltci: boolean;
  medical: "内设医疗机构" | "与医院签约合作" | "无";
  fees: FeeRow[];
  feesConfirmedAt: string;
  deposit: Custody;
  membership: Custody;
  /** 服务费最多预收几个月；监管上限 12 个月 */
  prepayMonths: number;
}

export type ServiceOrgType = "ltci" | "yikang" | "company";

export interface ServiceProvider extends ProviderBase {
  kind: "service";
  orgType: ServiceOrgType;
  /** 服务区域（区） */
  areas: string[];
  /** 长护险定点（居家护理） */
  ltci: boolean;
  /** 长护险年度考核等次 */
  ltciReview?: { year: number; result: "优秀" | "良好" | "合格" | "不合格" };
  items: ServiceItem[];
  itemsConfirmedAt: string;
  staff: { total: number; certified: number; backgroundChecked: boolean };
  /** 预付款：收不收、最多预收几个月 */
  prepay: { takes: boolean; maxMonths?: number; note?: string };
  /** 护理站等医疗机构执业登记 */
  medicalLicense: boolean;
}

export type Provider = Home | ServiceProvider;

export type LeadSource = "ai" | "search" | "direct";

export interface Lead {
  id: string;
  providerId: string;
  /** 探访预约（机构）/ 上门评估预约（服务商） */
  kind: "visit" | "assessment";
  contactName: string;
  phone: string;
  care: CareType;
  needs: string;
  preferredDate: string;
  source: LeadSource;
  /** 具体来源，如「豆包」「百度」 */
  sourceDetail: string;
  createdAt: string;
  status: "new" | "contacted" | "visited" | "converted" | "lost";
  appeal?: { reason: string; createdAt: string; status: "pending" | "approved" | "rejected"; decidedAt?: string };
  /** 示例：当前浏览者提交的预约，用于「我的」 */
  mine?: boolean;
}

export type ReportConclusion = "true" | "false";

export interface Report {
  id: string;
  providerId: string;
  fieldKey: string;
  fieldLabel: string;
  content: string;
  contact?: string;
  createdAt: string;
  deadline: string;
  orgReply?: string;
  repliedAt?: string;
  status: "open" | "resolved";
  conclusion?: ReportConclusion;
  resolvedAt?: string;
  mine?: boolean;
}

export interface Claim {
  id: string;
  providerId: string;
  applicant: string;
  phone: string;
  /** 提交的材料 */
  docs: string[];
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  reason?: string;
  decidedAt?: string;
  mine?: boolean;
}
