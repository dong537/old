import "server-only";

import type { Provider, Report } from "./types";
import { SOURCE_LABEL, gradeOf, riskFlags } from "./rules";
import { providerPath } from "./paths";
import { fmtDate } from "./time";

/** 公开 API 的一条记录：每个字段带来源和核对日期 */
export function toPublic(p: Provider, reports: Report[], origin: string) {
  return {
    id: p.id,
    kind: p.kind === "home" ? "养老机构" : "上门服务商",
    name: p.name,
    url: `${origin}${providerPath(p)}`,
    sample: p.sample,
    claimed: p.claimed && p.verified,
    grade: gradeOf(p, reports),
    risks: riskFlags(p).map((r) => ({ kind: r.kind, text: r.text, agency: r.agency, date: r.date, link: r.link })),
    fields: Object.fromEntries(
      p.fields.map((f) => [
        f.key,
        {
          label: f.label,
          value: f.value,
          source: SOURCE_LABEL[f.source],
          sourceName: f.sourceName,
          sourceUrl: f.sourceUrl,
          checkedAt: fmtDate(f.confirmedAt),
        },
      ]),
    ),
  };
}
