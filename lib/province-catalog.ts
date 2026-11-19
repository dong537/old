import { parse } from 'csv-parse/sync';
import type { ProvinceCatalog, ProvinceSourceRecord } from './province-types';

export interface ApprovedProvinceSource {
  city: string;
  sourceUrl: string;
  evidenceType: string;
  expectedCount: number;
}

// 每市仅一份已审定的逐名来源。行数是来源观察数，不是独立或当前在营机构数。
export const APPROVED_PROVINCE_SOURCES: readonly ApprovedProvinceSource[] = [
  { city: '潮州', sourceUrl: 'https://www.chaozhou.gov.cn/zwgk/zdlyxxgk/shgy/shjz/content/post_3974489.html', evidenceType: '潮州市政府门户网站养老机构信息附件（2025快照）', expectedCount: 14 },
  { city: '东莞', sourceUrl: 'https://mzj.dg.gov.cn/ztzl/zdlyxxgkzl/yljg/content/post_4237162.html', evidenceType: '官方名录', expectedCount: 43 },
  { city: '佛山', sourceUrl: 'http://mz.foshan.gov.cn/zwgk/mzhxxgg/yljgjbxx/content/post_5943496.html', evidenceType: '佛山市民政局养老机构名录附件', expectedCount: 69 },
  { city: '广州', sourceUrl: 'https://www.haizhu.gov.cn/hzdt/ztlm/ylfw/yljg/content/post_11030812.html', evidenceType: '官方名录', expectedCount: 30 },
  { city: '河源', sourceUrl: 'http://www.heyuan.gov.cn/zwgk/zdlyxx/mzxx/yljgjbxx/content/post_704152.html', evidenceType: '官方名录', expectedCount: 39 },
  { city: '惠州', sourceUrl: 'https://mzj.huizhou.gov.cn/bmfw/ylet/content/post_5623687.html', evidenceType: '官方名录', expectedCount: 35 },
  { city: '江门', sourceUrl: 'https://www.jiangmen.gov.cn/bmpd/jmsmzj/zdlyxxgk/mzxxgk/yljgjbxx/content/post_3547469.html', evidenceType: '官方名录', expectedCount: 89 },
  { city: '揭阳', sourceUrl: 'http://www.puning.gov.cn/jypnmzj/gkmlpt/content/1/1049/post_1049702.html', evidenceType: '普宁市民政局养老机构信息正文表（2026快照）', expectedCount: 4 },
  { city: '茂名', sourceUrl: 'http://www.gaozhou.gov.cn/attachment/0/221/221868/1662631.xlsx', evidenceType: 'official_operating_institution_roster', expectedCount: 26 },
  { city: '梅州', sourceUrl: 'https://www.jiaoling.gov.cn/xxgk/xxgkzdly/mzxxgk/yljg/content/post_2941218.html', evidenceType: '官方名录', expectedCount: 5 },
  { city: '清远', sourceUrl: 'http://www.qingcheng.gov.cn/qcqzdlyxxgk/mzxx/content/post_2145584.html', evidenceType: '官方名录', expectedCount: 15 },
  { city: '汕头', sourceUrl: 'https://www.shantou.gov.cn/stsmzj/gkmlpt/content/2/2407/post_2407513.html', evidenceType: '官方名录', expectedCount: 42 },
  { city: '汕尾', sourceUrl: 'https://www.shanwei.gov.cn/swmz/ztzt/zdly/yljgjbxx/content/post_1261153.html', evidenceType: '官方名录', expectedCount: 11 },
  { city: '韶关', sourceUrl: 'https://www.sg.gov.cn/zw/zdlyxxgk/mzxx/yl/fw/content/post_2796817.html', evidenceType: '官方名录', expectedCount: 29 },
  { city: '深圳', sourceUrl: 'https://www.sz.gov.cn/szzt2010/zdlyzl/ggsy/mzxx/yljg/yljgjs/content/post_1312479.html', evidenceType: '官方名录', expectedCount: 95 },
  { city: '阳江', sourceUrl: 'http://www.yangchun.gov.cn/xxgk/zdlyxxgk/mzxx/yljgjbxx/content/post_983930.html', evidenceType: '阳春市民政局养老机构基本信息（季度子集）', expectedCount: 28 },
  { city: '云浮', sourceUrl: 'https://www.yunfu.gov.cn/yfmzj/gkmlpt/content/1/1994/post_1994203.html', evidenceType: '官方名录', expectedCount: 27 },
  { city: '湛江', sourceUrl: 'https://www.zhanjiang.gov.cn/zjsfw/bmdh/mzj/zwgk/gzdt/content/post_2100933.html', evidenceType: '湛江市民政局官方养老机构基本信息表', expectedCount: 51 },
  { city: '肇庆', sourceUrl: 'https://www.zhaoqing.gov.cn/zqsmzj/gkmlpt/content/3/3247/post_3247305.html', evidenceType: '官方名录', expectedCount: 75 },
  { city: '中山', sourceUrl: 'http://www.zs.gov.cn/mzj/ylfwly/ylfwxygl/content/post_2657554.html', evidenceType: '官方名录', expectedCount: 29 },
  { city: '珠海', sourceUrl: 'https://www.zhuhai.gov.cn/smzj/gkmlpt/content/3/3926/post_3926380.html', evidenceType: '官方名录', expectedCount: 25 },
];

const FIELDS = ['city', 'institution_name', 'source_url', 'source_published_at', 'source_as_of', 'source_file', 'evidence_type', 'details'];
const SNAPSHOT_ID = 'v1-aa3bf6d7cd70aaae';
const ARCHIVED_AT = '2026-11-15';
const EXPECTED_INPUT_ROWS = 2429;
const EXPECTED_PUBLIC_ROWS = 781;

function safeSourceUrl(value: string): void {
  if (value !== value.trim() || !/^https?:\/\//.test(value)) throw new Error('来源 URL 格式无效。');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('来源 URL 格式无效。'); }
  if (!url.hostname || url.username || url.password || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error('来源 URL 格式无效。');
  }
}

function sourceRows(csv: string): Record<string, string>[] {
  const cells = parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: false }) as string[][];
  if (!cells.length || cells[0].length !== FIELDS.length || FIELDS.some((field, index) => cells[0][index] !== field)) {
    throw new Error('省级来源 CSV 表头字段不符。');
  }
  return cells.slice(1).map((row) => Object.fromEntries(FIELDS.map((field, index) => [field, row[index]])));
}

function sourceDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(text);
  if (!match) throw new Error('来源发布日期格式无效。');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('来源发布日期格式无效。');
  }
  return text;
}

function sourceAsOf(value: string): string | null {
  const text = value.trim();
  if (!text || text.startsWith('未注明') || text.includes('未给独立统计截止日')) return null;
  return text;
}

function sourceStatus(details: string): string | null {
  let parsed: unknown;
  try { parsed = JSON.parse(details); } catch { throw new Error('来源详情 JSON 格式无效。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('来源详情 JSON 格式无效。');
  const status = (parsed as Record<string, unknown>).status_as_published;
  if (status === '暂未运营' || status === '暂停营业') return '来源当时标注：' + status;
  if (status === '停止接受新申请（原文标注）') return '来源当时标注：停止接受新申请';
  return null;
}

function sourceKey(source: Pick<ApprovedProvinceSource, 'city' | 'sourceUrl' | 'evidenceType'>): string {
  return JSON.stringify([source.city, source.sourceUrl, source.evidenceType]);
}

function projectRows(rows: Record<string, string>[], sources: readonly ApprovedProvinceSource[]): ProvinceSourceRecord[] {
  const approved = new Map<string, ApprovedProvinceSource>();
  const counts = new Map<string, number>();
  for (const source of sources) {
    if (!source.city.trim() || !source.evidenceType.trim() || !Number.isSafeInteger(source.expectedCount) || source.expectedCount < 1) {
      throw new Error('省级来源白名单城市、来源类型或行数无效。');
    }
    safeSourceUrl(source.sourceUrl);
    const key = sourceKey(source);
    if (approved.has(key)) throw new Error('省级来源白名单含重复城市、URL 和类型。');
    approved.set(key, source);
    counts.set(key, 0);
  }
  const records: ProvinceSourceRecord[] = [];
  for (const row of rows) {
    const key = sourceKey({ city: row.city, sourceUrl: row.source_url, evidenceType: row.evidence_type });
    if (!approved.has(key)) continue;
    if (!row.city.trim()) throw new Error('来源城市为空。');
    if (!row.institution_name.trim()) throw new Error('来源机构名称为空。');
    safeSourceUrl(row.source_url);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    records.push({
      id: 'gd-src-' + String(records.length + 1).padStart(6, '0'),
      city: row.city,
      name: row.institution_name,
      evidenceType: row.evidence_type,
      sourceUrl: row.source_url,
      sourcePublishedAt: sourceDate(row.source_published_at),
      sourceAsOf: sourceAsOf(row.source_as_of),
      sourceStatusNote: sourceStatus(row.details),
    });
  }
  for (const [key, source] of approved) {
    if (counts.get(key) !== source.expectedCount) {
      throw new Error('省级来源 ' + source.city + ' 的 URL、来源类型或行数不符，预期 ' + source.expectedCount + ' 行。');
    }
  }
  return records;
}

export function projectProvinceRows(csv: string, sources: readonly ApprovedProvinceSource[]): ProvinceSourceRecord[] {
  return projectRows(sourceRows(csv), sources);
}

export function buildProvinceCatalog(csv: string): ProvinceCatalog {
  const rows = sourceRows(csv);
  if (rows.length !== EXPECTED_INPUT_ROWS) throw new Error('冻结输入必须包含 2429 条来源记录。');
  if (APPROVED_PROVINCE_SOURCES.length !== 21 || new Set(APPROVED_PROVINCE_SOURCES.map((source) => source.city)).size !== 21) {
    throw new Error('省级来源白名单必须恰好覆盖广东 21 市。');
  }
  const records = projectRows(rows, APPROVED_PROVINCE_SOURCES);
  if (records.length !== EXPECTED_PUBLIC_ROWS) throw new Error('公开投影必须包含 781 条来源记录。');
  return { schemaVersion: 1, snapshotId: SNAPSHOT_ID, archivedAt: ARCHIVED_AT, records };
}
