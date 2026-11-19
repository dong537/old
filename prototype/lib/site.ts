import type { CareType, LeadSource, ServiceOrgType } from "./types";

/** 平台名称还没定，全站只从这里取 */
export const SITE = {
  name: "养老信源",
  nameNote: "暂名",
  slogan: "替爸妈选养老，先看可核验的事实",
  description:
    "养老信源平台：广州养老机构和上门服务商一家一张档案，每个字段标来源和核对日期；付费不改变排序，不收入住返佣。",
};

/** 首批只开通广州 */
export const CITY = { slug: "guangzhou", name: "广州" };

export const DISTRICTS = ["越秀", "海珠", "荔湾", "天河", "白云", "黄埔", "番禺", "花都", "南沙", "从化", "增城"];

export const CARE_LABEL: Record<CareType, string> = {
  zili: "自理",
  banshineng: "半失能",
  shineng: "失能",
  shizhi: "失智",
};

export const CARE_DESC: Record<CareType, string> = {
  zili: "生活能自理，主要需要照看和陪伴",
  banshineng: "部分日常活动需要协助，如洗澡、上下楼",
  shineng: "大部分日常活动需要他人照护，含卧床",
  shizhi: "认知障碍，需要专门的照护和防走失",
};

export const CARE_TYPES = Object.keys(CARE_LABEL) as CareType[];

export const ORG_TYPE_LABEL: Record<ServiceOrgType, string> = {
  ltci: "长护险定点居家护理机构",
  yikang: "颐康中心",
  company: "上门服务公司",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  ai: "AI 助手",
  search: "搜索引擎",
  direct: "直接访问",
};

/** 根据网址参数和来源页判断预约来自哪里；北极星指标就靠它 */
export const AI_REFERRERS: { match: string; name: string }[] = [
  { match: "doubao", name: "豆包" },
  { match: "deepseek", name: "DeepSeek" },
  { match: "yiyan", name: "文心一言" },
  { match: "kimi", name: "Kimi" },
  { match: "yuanbao", name: "腾讯元宝" },
  { match: "qianwen", name: "通义千问" },
];

export const SEARCH_REFERRERS: { match: string; name: string }[] = [
  { match: "baidu", name: "百度" },
  { match: "bing", name: "必应" },
  { match: "sogou", name: "搜狗" },
  { match: "so.com", name: "360 搜索" },
];

/** 预约线索可以申诉的理由 */
export const APPEAL_REASONS = ["电话打不通或是空号", "同一家属重复预约", "不在服务区域内", "不是本人预约"];

/** 线索申诉时限（小时） */
export const APPEAL_HOURS = 48;
