import "server-only";

import { listClaims, listLeads, listProviders, listReports } from "./store";
import { fieldState } from "./rules";

/** 运营后台各队列，导航角标和各页面共用 */
export function adminQueues() {
  const providers = listProviders();
  const reports = listReports();
  return {
    claims: listClaims().filter((c) => c.status === "pending"),
    reports: reports.filter((r) => r.status === "open"),
    appeals: listLeads().filter((l) => l.appeal?.status === "pending"),
    visits: providers.flatMap((p) => p.visits.filter((v) => v.audit === "pending").map((v) => ({ p, v }))),
    changes: providers.flatMap((p) => p.fields.filter((f) => f.pendingValue).map((f) => ({ p, f }))),
    freshness: providers.flatMap((p) =>
      p.fields.map((f) => ({ p, f, st: fieldState(f, p.id, reports) })).filter((x) => x.st === "expired" || x.st === "expiring"),
    ),
  };
}
