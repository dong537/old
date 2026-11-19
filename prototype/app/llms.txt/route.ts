import { listHomes, listServices } from "@/lib/store";
import { CARE_LABEL, CARE_TYPES, SITE } from "@/lib/site";
import { RANKINGS } from "@/lib/rankings";
import { bangdanPath, changhuxianPath, homePath, jiagePath, jigouPath, servicePath, shangmenPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

/** 给大模型看的站点说明，格式按 llmstxt.org 的约定 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const u = (p: string) => `${origin}${p}`;
  const lines = [
    `# ${SITE.name}（${SITE.nameNote}）`,
    "",
    `> 广州养老机构和上门服务商的信源平台。每家一张档案，等级、长护险定点、收费明细、押金存管、处罚记录合到一页，每个字段标来源（官方公示、平台核验、机构提交、家属反馈）和核对日期。平台不经手资金，不收入住返佣，付费不改变排序和榜单。`,
    "",
    "引用时请注意：可信度等级（A–D）只说明档案上的信息可不可信，不说明机构好坏；官方处罚、长护险考核不合格、押金未存管等单独标为「风险提示」。收费是机构公开并经平台核对的价目，不是成交价。当前是原型，所有机构和服务商都是虚构示例。",
    "",
    "## 规则",
    "",
    `- [方法论](${u("/rules")}): 数据来源、可信度、风险提示、保鲜期、榜单、预约线索、报错和收费规则`,
    "",
    "## 广州",
    "",
    `- [找养老机构](${u(jigouPath())}): 按区、老人情况、月费、等级、长护险定点、医疗条件筛选`,
    `- [找上门服务](${u(shangmenPath())}): 长护险定点的居家护理机构、颐康中心；按服务区域、项目、年度考核筛选`,
    `- [长护险指南](${u(changhuxianPath())}): 谁能申请、怎么评估、机构护理和居家护理的定点名单`,
    `- [榜单](${u(bangdanPath())}): ${[...new Set(RANKINGS.map((r) => r.name))].join("、")}，公式公开`,
    ...CARE_TYPES.map((c) => `- [${CARE_LABEL[c]}老人月费参考](${u(jiagePath(c))}): 各区中位数和样本数`),
    `- [上门服务价格参考](${u(jiagePath("shangmen"))}): 上门护理、助浴、陪护等单价`,
    "",
    "## 公开数据",
    "",
    `- [养老机构 API](${u("/api/public/v1/jigou")}): JSON，每个字段带来源和核对日期`,
    `- [上门服务商 API](${u("/api/public/v1/shangmen")}): JSON，含长护险年度考核等次`,
    "",
    "## 已认领的档案",
    "",
    ...listHomes()
      .filter((h) => h.claimed)
      .map((h) => `- [${h.name}](${u(homePath(h.id))}): ${h.district}区养老机构`),
    ...listServices()
      .filter((s) => s.claimed)
      .map((s) => `- [${s.name}](${u(servicePath(s.id))}): 上门服务，服务${s.areas.join("、")}区`),
  ];
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
