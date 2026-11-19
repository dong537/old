import { listHomes, listReports } from "@/lib/store";
import { toPublic } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/** 广州养老机构，每个字段带来源和核对日期 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const reports = listReports();
  return Response.json({
    city: "广州",
    note: "原型阶段，全部是虚构示例（sample: true）。可信度等级只说明信息可不可信；风险提示单独列出。",
    count: listHomes().length,
    items: listHomes().map((h) => toPublic(h, reports, origin)),
  });
}
