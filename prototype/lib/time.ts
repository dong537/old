const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * HOUR).toISOString();
}

export function daysFromNow(d: number): string {
  return new Date(Date.now() + d * DAY).toISOString();
}

export function addDays(iso: string, d: number): string {
  return new Date(new Date(iso).getTime() + d * DAY).toISOString();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 日期一律按 UTC+8 显示，和服务器所在时区无关 */
function cst(iso: string): Date {
  return new Date(new Date(iso).getTime() + 8 * HOUR);
}

/** 2026-10-25 */
export function fmtDate(iso: string): string {
  const t = cst(iso);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 10-25 */
export function fmtMD(iso: string): string {
  const t = cst(iso);
  return `${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 10-25 14:20 */
export function fmtMDHM(iso: string): string {
  const t = cst(iso);
  return `${fmtMD(iso)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** 3 小时前 / 2 天前 */
export function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < HOUR) return "刚刚";
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  const d = Math.floor(diff / DAY);
  return d === 1 ? "昨天" : `${d} 天前`;
}

/** 剩 6 小时 / 剩 2 天 / 已超时 */
export function remaining(iso: string): { text: string; urgent: boolean; overdue: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { text: "已超时", urgent: true, overdue: true };
  if (diff < DAY) return { text: `剩 ${Math.max(1, Math.floor(diff / HOUR))} 小时`, urgent: diff < 12 * HOUR, overdue: false };
  return { text: `剩 ${Math.floor(diff / DAY)} 天`, urgent: false, overdue: false };
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
}
