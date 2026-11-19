/** 站内网址统一从这里生成；第一段是城市，沿用知底的规则 */
import type { Provider } from "./types";

const C = "/guangzhou";

export const cityPath = () => C;

function qs(params?: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const jigouPath = (params?: Record<string, string | undefined>) => `${C}/jigou${qs(params)}`;
export const homePath = (id: string) => `${C}/jigou/${id}`;
export const shangmenPath = (params?: Record<string, string | undefined>) => `${C}/shangmen${qs(params)}`;
export const servicePath = (id: string) => `${C}/shangmen/${id}`;
export const providerPath = (p: Pick<Provider, "id" | "kind">) => (p.kind === "home" ? homePath(p.id) : servicePath(p.id));
export const jiagePath = (type?: string) => `${C}/jiage${type ? `/${type}` : ""}`;
export const changhuxianPath = () => `${C}/changhuxian`;
export const bangdanPath = (tab?: "home" | "service") => `${C}/bangdan${tab === "service" ? "?tab=service" : ""}`;
export const reportPath = (id: string, field?: string) => `/report${qs({ id, field })}`;
