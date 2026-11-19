import { listReports, listServices } from "@/lib/store";
import { toPublic } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/** 广州上门服务商，每个字段带来源和核对日期 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const reports = listReports();
  return Response.json({
    city: "广州",
    note: "原型阶段，全部是虚构示例（sample: true）。长护险年度考核等次来自广州市医疗保险服务中心公示。",
    count: listServices().length,
    items: listServices().map((s) => toPublic(s, reports, origin)),
  });
}
