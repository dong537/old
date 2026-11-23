// 办事指南（对应全国养老服务信息平台「在线办理」栏目：个人办事指南 + 机构办事指南）
// 来源：yanglao.mca.gov.cn 的 /ylxxptapi/mhpt/mhItem/itemPage 与 /itemDetail 接口，
// 以及字典接口 /ylxxptapi/console/dsrpt/dict/typeWithapp（MH_ITEM_GUIDE_NAME 提供完整事项清单）。
// 快照时间与抓取时间写在本文件底部 snapshot 字段，结论可回溯到官方接口返回。

export type HandleType = '即办件' | '承诺件';
export type ItemType = '行政确认' | '行政给付' | '行政许可' | '行政检查' | '行政奖励' | '行政处罚' | '行政强制' | '行政征收';
export type ItemLevel = '国家级' | '省级' | '市级' | '县级' | '乡（镇、街道）级';

export interface PersonGuideItem {
  /** 事项分类：机构事项 / 个人事项 */
  category: '机构事项' | '个人事项';
  /** 官方事项编号（itemNameChild） */
  code: string;
  /** 事项名称 */
  name: string;
  /** 事项类型（MH_ITEM_TYPE）；官方未上线事项为 null */
  itemType: ItemType | null;
  /** 办件类型（MH_ITEM_HANDLE_TYPE）：即办件 / 承诺件；官方未上线事项为 null */
  handleType: HandleType | null;
  /** 行使层级（MH_LEVEL）；官方未上线事项为 null */
  level: ItemLevel | null;
  /** 实施主体 */
  mainBody: string;
  /** 是否收费（官方字段 ifFree：0=否/1=是）；官方未上线事项为 null */
  free: boolean | null;
  /** 官方发布时间 */
  publishedAt: string;
  /** 官方接口记录 id，可回查；官方未上线事项无 id */
  officialId: string | null;
  /** 官方是否已上线该事项（itemPage 接口是否返回了记录） */
  online: boolean;
  /** 本站补充的办理口径（可核验的政策常识，不编造具体时限/材料/金额） */
  guidance: string[];
  /** 官方平台原页面未提供哪些字段（这些字段在接口里为 null 或空） */
  officialMissing: string[];
}

const missingFields = ['办理流程', '申请材料', '受理条件', '承诺/法定办结时限', '收费标准', '法律依据', '办理地点', '咨询/投诉电话'];

export const personGuides: PersonGuideItem[] = [
  /* ============ 机构事项（官方已上线 3 项） ============ */
  {
    category: '机构事项',
    code: '0101',
    name: '机构备案申请',
    itemType: '行政确认',
    handleType: '即办件',
    level: '国家级',
    mainBody: '省、市、区民政部门',
    free: true,
    publishedAt: '2024-09-09',
    officialId: '561df4184f7647188c1b362453895199',
    online: true,
    guidance: [
      '养老机构依法登记后，应当向所在地县级以上民政部门办理备案。这是机构合法经营养老服务的登记类事项，不是等级或服务质量评价。',
      '备案主体通常是新设或变更的养老机构；具体材料、办理渠道和受理窗口，以机构所在地民政部门公布的一次性告知清单为准。',
      '备案完成后不等于获得星级或等级。等级评定是另一项独立事项，见「养老机构等级评定申请」。',
    ],
    officialMissing: missingFields,
  },
  {
    category: '机构事项',
    code: '0102',
    name: '养老机构等级评定申请',
    itemType: '行政给付',
    handleType: '承诺件',
    level: '国家级',
    mainBody: '省、市、区民政部门',
    free: true,
    publishedAt: '2024-09-10',
    officialId: 'abedb02e87c146b19d4457dba5166db2',
    online: true,
    guidance: [
      '等级评定是对养老机构服务质量的综合评价，通常按国家标准或地方细则分一至五级（或对应等次），由机构自愿申请。',
      '评定结果反映某一评定周期的水平，会过期、会被复查；选机构时不能只看等级，还应结合最近一期的检查、处罚与家属评价。',
      '本站机构档案里，凡未取得可核验评定结果的，一律标注「未取得可核验等级」，不替机构补等级。',
    ],
    officialMissing: missingFields,
  },
  {
    category: '机构事项',
    code: '0103',
    name: '养老服务机构补贴申请',
    itemType: '行政确认',
    handleType: '承诺件',
    level: '国家级',
    mainBody: '省、市、区民政部门',
    free: true,
    publishedAt: '2024-09-09',
    officialId: 'c4e3ade1fc5e4159b873003f5ac5f088',
    online: true,
    guidance: [
      '这是面向「养老服务机构」的补贴申请事项，与面向个人的「高龄津贴」「困难老年人集中照护补贴」不是同一件事。',
      '补贴种类、标准和申报条件由各地民政、财政部门按本地政策确定，差异较大，没有全国统一的金额。',
      '申报前应向机构登记所在地民政部门核对当年度可申请的补贴项目、材料和截止时间。',
    ],
    officialMissing: missingFields,
  },

  /* ============ 个人事项（官方已上线 3 项） ============ */
  {
    category: '个人事项',
    code: '0201',
    name: '困难老年人集中照护补贴',
    itemType: '行政给付',
    handleType: '承诺件',
    level: '国家级',
    mainBody: '民政部',
    free: true,
    publishedAt: '2024-09-09',
    officialId: '73e49dd2e6b8453fb83b239bbbaf6eaa',
    online: true,
    guidance: [
      '面向经济困难的失能老年人，资助其入住养老机构接受集中照护，属民政部门的社会救助/福利类给付。',
      '能否享受、补多少，取决于申请人是否符合本地认定的困难与失能条件，并入住符合条件的机构。',
      '申请资格由县级民政部门核定；本站不估金额，请以当地民政部门现行标准为准。',
    ],
    officialMissing: missingFields,
  },
  {
    category: '个人事项',
    code: '0202',
    name: '入住养老机构预约',
    itemType: '行政给付',
    handleType: '承诺件',
    level: '国家级',
    mainBody: '区/县民政部门',
    free: true,
    publishedAt: '2024-09-09',
    officialId: '7eb6120d06564027a20e4eb332926586',
    online: true,
    guidance: [
      '这是面向公众的入住预约咨询类事项，帮助对接有空床的养老机构，不等于机构对床位或价格的承诺。',
      '预约后仍要实地探访、核对合同与收费，再决定是否入住；空床和收费会随时间变化。',
      '本站不代理预约，机构档案里的电话、地址来自公开来源，请以机构实际回复为准。',
    ],
    officialMissing: missingFields,
  },
  {
    category: '个人事项',
    code: '0203',
    name: '高龄津贴',
    itemType: '行政给付',
    handleType: '承诺件',
    level: '县级',
    mainBody: '区/县民政部门',
    free: true,
    publishedAt: '2024-09-09',
    officialId: '49eb4c93f2fb43658bef0f7697ae923a',
    online: true,
    guidance: [
      '高龄津贴是对达到一定年龄老年人的普惠性给付，由县级民政部门发放，属最常见的个人办事事项。',
      '各地起付年龄、标准、发放方式不同，且同一城市也可能分区县执行；本站不写具体金额，避免引用过时数字。',
      '申请一般向户籍地（或常住地）的街道、社区或民政窗口提交，请以当地民政部门公布的条件为准。',
    ],
    officialMissing: missingFields,
  },

  /* ============ 个人事项（官方尚未上线，仅在字典里列出） ============ */
  {
    category: '个人事项',
    code: '0204',
    name: '护理补贴',
    itemType: null,
    handleType: null,
    level: null,
    mainBody: '民政部门（具体以当地公布为准）',
    free: null,
    publishedAt: '',
    officialId: null,
    online: false,
    guidance: [
      '面向经评估需要长期护理的困难老年人，用于补贴其护理费用；各地叫法不一（护理补贴、养老服务补贴等），标准也不同。',
      '官方平台尚未提供该事项的在线办理；具体能否申请、什么条件，请向户籍地民政部门咨询。',
    ],
    officialMissing: [],
  },
  {
    category: '个人事项',
    code: '0205',
    name: '服务补贴',
    itemType: null,
    handleType: null,
    level: null,
    mainBody: '民政部门（具体以当地公布为准）',
    free: null,
    publishedAt: '',
    officialId: null,
    online: false,
    guidance: [
      '用于补贴困难老年人购买居家养老服务（助餐、助洁、助浴等），是养老服务消费类补贴的一种。',
      '官方平台尚未提供该事项的在线办理；以当地民政部门公布的申领条件与渠道为准。',
    ],
    officialMissing: [],
  },
  {
    category: '个人事项',
    code: '0206',
    name: '助餐补贴',
    itemType: null,
    handleType: null,
    level: null,
    mainBody: '民政部门（具体以当地公布为准）',
    free: null,
    publishedAt: '',
    officialId: null,
    online: false,
    guidance: [
      '面向符合条件的老年人，在长者饭堂/助餐点就餐时给予补贴或优惠。',
      '官方平台尚未提供该事项的在线办理；是否覆盖、如何申领，以当地民政部门公布为准。',
    ],
    officialMissing: [],
  },
  {
    category: '个人事项',
    code: '0207',
    name: '康复辅具租赁',
    itemType: null,
    handleType: null,
    level: null,
    mainBody: '民政部门（具体以当地公布为准）',
    free: null,
    publishedAt: '',
    officialId: null,
    online: false,
    guidance: [
      '面向失能、半失能或术后康复人群，提供轮椅、护理床等康复辅助器具的租赁（部分可享受补贴）。',
      '官方平台尚未提供该事项的在线办理；租赁点与补贴政策以当地公布为准。',
    ],
    officialMissing: [],
  },
  {
    category: '个人事项',
    code: '0208',
    name: '家庭养老床位建设',
    itemType: null,
    handleType: null,
    level: null,
    mainBody: '民政部门（具体以当地公布为准）',
    free: null,
    publishedAt: '',
    officialId: null,
    online: false,
    guidance: [
      '把专业照护服务延伸到老年人家中，通过改造居家环境并接入服务机构，让老人在家接受类机构的照护。',
      '官方平台尚未提供该事项的在线办理；申请条件与服务内容以当地民政部门公布为准。',
    ],
    officialMissing: [],
  },
  {
    category: '个人事项',
    code: '0209',
    name: '家庭适老化改造',
    itemType: null,
    handleType: null,
    level: null,
    mainBody: '民政部门（具体以当地公布为准）',
    free: null,
    publishedAt: '',
    officialId: null,
    online: false,
    guidance: [
      '对老年人家庭进行地面防滑、加装扶手、无障碍改造等，降低居家跌倒等风险；部分项目可享受补贴。',
      '官方平台尚未提供该事项的在线办理；改造范围与补贴标准以当地公布为准。',
    ],
    officialMissing: [],
  },
  {
    category: '个人事项',
    code: '0210',
    name: '探访关爱',
    itemType: null,
    handleType: null,
    level: null,
    mainBody: '民政部门（具体以当地公布为准）',
    free: null,
    publishedAt: '',
    officialId: null,
    online: false,
    guidance: [
      '面向独居、空巢、留守等特殊困难老年人，由基层力量定期上门探访、掌握状况并提供必要帮助。',
      '官方平台尚未提供该事项的在线办理；纳入对象与探访安排以当地民政部门公布为准。',
    ],
    officialMissing: [],
  },
];

export const personGuideSnapshot = {
  /** 官方接口快照时间（数据发布侧的最后一条 releaseDate 在 2024-09，抓取时间为下方 capturedAt） */
  capturedAt: '2026-11-22',
  source: '全国养老服务信息平台「在线办理」栏目接口 /ylxxptapi/mhpt/mhItem/itemPage 及字典 /ylxxptapi/console/dsrpt/dict/typeWithapp（MH_ITEM_GUIDE_NAME）',
  sourceUrl: 'https://yanglao.mca.gov.cn/#/index/personGuideList',
  /** 官方已上线（itemPage 接口返回记录）的事项数 */
  onlineCount: 6,
  /** 字典列出的完整事项数（含尚未上线） */
  totalCount: 13,
  note:
    '官方平台的办事指南只刊载了事项名称、实施主体、事项类型、办件类型、行使层级、是否收费与发布时间；办理流程、申请材料、受理条件、办结时限、收费标准、法律依据、办理地点在接口中均为空（null）。字典里列了 13 项事项，但接口只返回了 6 项——另外 7 项（护理补贴、服务补贴、助餐补贴、康复辅具租赁、家庭养老床位建设、家庭适老化改造、探访关爱）官方尚未提供在线办理。本页「办理口径」一栏是本站按可核验的政策常识补充的说明，不编造具体时限、材料清单或金额，也不代替官方受理窗口的一次性告知。',
};
