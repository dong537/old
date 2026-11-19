/**
 * 全站引用的外部来源。checked = 2026-11-08 打开原页核对过；
 * 没核对过的来自方案文档里的搜索摘要，对外使用前要打开原文核对。
 */
export const SOURCES = {
  prepayOpinion: {
    title: "民政部等七部门关于加强养老机构预收费监管的指导意见（2024-10-01 施行）",
    publisher: "商务部政策法规库",
    url: "https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=101117",
    checked: true,
  },
  custodyGuide: {
    title: "养老机构预收费存管工作指引解读（2025-11）",
    publisher: "华声在线",
    url: "https://m.voc.com.cn/xhn/news/202511/31006224.html",
    checked: false,
  },
  ltciNew: {
    title: "广州市长期护理保险新增定点评估合格服务机构名单的公示（2026.15）",
    publisher: "广州市医疗保险服务中心，2026-09-01",
    url: "https://www.gz.gov.cn/zfjg/gzsylbzj/ybfw/content/post_10984980.html",
    checked: true,
  },
  ltciReview: {
    title: "广州市长期护理保险定点服务机构 2025 年度综合考核结果",
    publisher: "广州市医疗保险服务中心，2026-05-09",
    url: "https://www.gz.gov.cn/zfjg/gzsylbzj/ybfw/content/post_10804799.html",
    checked: true,
  },
  ltciPolicy: {
    title: "国新办发布会：加快建立长期护理保险制度",
    publisher: "国家医疗保障局，2026-03",
    url: "https://www.nhsa.gov.cn/art/2026/3/26/art_14_20034.html",
    checked: false,
  },
  yikang: {
    title: "广东广州：把养老这件「大事」做成「家常事」",
    publisher: "中国老龄协会转央视网，2026-06-02",
    url: "https://www.cncaprc.gov.cn/xwllxw/771726.jhtml",
    checked: true,
  },
  mzjPlan: {
    title: "广州市民政局 2026 年工作计划",
    publisher: "广州市民政局，2026-02-14",
    url: "http://mzj.gz.gov.cn/zwgk/zfxxgkml/zfxxgkml/qt/ghjh/content/post_10694481.html",
    checked: true,
  },
  mcaPlatform: {
    title: "全国养老服务信息平台",
    publisher: "民政部",
    url: "https://yanglao.mca.gov.cn",
    checked: false,
  },
  levelDraft: {
    title: "民政部就养老机构等级划分国标修订稿征求意见",
    publisher: "21 经济网，2026-10",
    url: "https://www.21jingji.com/article/20261028/herald/2b1e9f48a2ff9d3fd5830a01caca1714.html",
    checked: false,
  },
} as const;

export type SourceKey = keyof typeof SOURCES;

/** 签约前看三件事：首页和机构档案共用 */
export const BEFORE_SIGNING = [
  {
    title: "押金、会员费有没有银行存管",
    text: "押金、会员费应当通过商业银行第三方存管等方式管理；押金最多是月床位费的 12 倍；公办、公建民营机构不得收会员费。档案的「存管状态」一栏可以逐家查。",
    source: "prepayOpinion" as SourceKey,
  },
  {
    title: "服务费预收不超过 12 个月",
    text: "养老机构的服务费最多预收 12 个月。要求一次交几年、交了才有床位的，先别签。",
    source: "prepayOpinion" as SourceKey,
  },
  {
    title: "护理等级上调，要有书面评估",
    text: "入住后护理等级上调、费用跟着涨，是最常见的纠纷。签约时问清楚：谁来评估、多久评一次、调整前是否书面告知。",
    source: undefined,
  },
];
