import { sitePath } from './site-path';
import type { QccChunk, QccIndex, QccIndexRecord, QccLinks } from './qcc-types';
import { QCC_SOURCE_FIELD_NAMES } from './qcc-types';

export function isQccSourceFields(value: unknown): value is Record<string, string | number | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).length === QCC_SOURCE_FIELD_NAMES.length && QCC_SOURCE_FIELD_NAMES.every(header =>
    Object.hasOwn(fields, header) && (fields[header] === null || typeof fields[header] === 'string' ||
      (typeof fields[header] === 'number' && Number.isFinite(fields[header]))));
}

export function qccStatusCategory(status: string | null): string {
  return status?.split(/[（(]/u, 1)[0].trim() || '未提供';
}

export function isQccStatusCaution(status: string | null): boolean {
  const category = qccStatusCategory(status);
  return category !== '未提供' && !['存续', '在业', '正常'].includes(category);
}

export interface QccSearchParams {
  q?: string;
  city?: string;
  type?: string;
  status?: string;
  page?: string | number;
}

export interface QccSearchResult extends Required<Omit<QccSearchParams, 'page'>> {
  items: QccIndexRecord[];
  total: number;
  page: number;
  pageCount: number;
  issues: string[];
}

export function searchQccRecords(records: readonly QccIndexRecord[], params: QccSearchParams): QccSearchResult {
  const issues: string[] = [];
  let q = (params.q ?? '').trim().replace(/\s+/gu, ' ');
  if ([...q].length > 80) {
    q = [...q].slice(0, 80).join('');
    issues.push('搜索词最多 80 个字符，已截取前 80 个字符。');
  }
  const validate = (value: string | undefined, key: 'city' | 'subjectType' | 'registrationStatus', label: string) => {
    if (!value) return '';
    if (records.some(record => key === 'registrationStatus' ? qccStatusCategory(record.registrationStatus) === value : record[key] === value)) return value;
    issues.push(label + '参数无效，已恢复为全部。');
    return '';
  };
  const city = validate(params.city, 'city', '城市');
  const type = validate(params.type, 'subjectType', '主体类型');
  const status = validate(params.status, 'registrationStatus', '登记状态');

  const requestedPage = String(params.page ?? '1');
  let page = Number(requestedPage);
  if (!/^[1-9]\d*$/.test(requestedPage) || !Number.isSafeInteger(page)) {
    page = 1;
    issues.push('页码无效，已返回第 1 页。');
  }
  const terms = q.toLocaleLowerCase('zh-CN').split(' ').filter(Boolean);
  const matches = records.filter(record => {
    if (city && record.city !== city) return false;
    if (type && record.subjectType !== type) return false;
    if (status && qccStatusCategory(record.registrationStatus) !== status) return false;
    const fields = [record.name, record.city, record.district ?? ''].map(value => value.replace(/\s+/gu, '').toLocaleLowerCase('zh-CN'));
    return terms.every(term => fields.some(value => value.includes(term)));
  });
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  if (page > pageCount) {
    page = pageCount;
    issues.push('页码超出结果范围，已显示第 ' + pageCount + ' 页。');
  }
  return { items: matches.slice((page - 1) * 20, page * 20), total, page, pageCount, q, city, type, status, issues };
}

export function qccListHref(params: QccSearchParams): string {
  const query = new URLSearchParams();
  for (const key of ['q', 'city', 'type', 'status'] as const) {
    if (params[key]) query.set(key, params[key]);
  }
  if (Number(params.page) > 1) query.set('page', String(params.page));
  return '/guangdong/zhuti/' + (query.size ? '?' + query : '');
}

export function safeQccReturnPath(from: string | null): string {
  const fallback = '/guangdong/zhuti/';
  const national = '/quanguo/zhuti/';
  if (from && from.length <= 512 && /^\/quanguo\/zhuti\/\?[^#\r\n]*$/.test(from)) {
    const params = new URLSearchParams(from.slice(national.length + 1));
    const allowed = new Set(['province', 'city', 'q', 'type', 'status', 'page']);
    const seen = new Set<string>();
    for (const [key, value] of params) {
      if (!allowed.has(key) || seen.has(key)) return fallback;
      if (key === 'city' && (value.length > 80 || /[\/\\\u0000-\u001f]/u.test(value))) return fallback;
      if (key === 'q' && [...value].length > 80) return fallback;
      if ((key === 'type' || key === 'status') && value.length > 120) return fallback;
      if (key === 'page' && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) return fallback;
      seen.add(key);
    }
    return params.get('province') === 'guangdong' ? from : fallback;
  }
  if (!from || from.length > 512 || !/^\/guangdong\/zhuti\/(?:\?[^#\r\n]*)?$/.test(from)) return fallback;
  const query = from.slice(fallback.length);
  if (!query) return fallback;
  const params = new URLSearchParams(query.slice(1));
  const allowed = new Set(['q', 'city', 'type', 'status', 'page']);
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!allowed.has(key) || seen.has(key)) return fallback;
    seen.add(key);
  }
  return from;
}

export function findQccRecord(records: readonly QccIndexRecord[], id: string): QccIndexRecord | null {
  const record = records.find(item => item.id === id);
  return record && /^chunk-\d{3}\.v1\.json$/.test(record.chunk) ? record : null;
}

export function verifiedSourceForSubject(links: QccLinks, snapshotId: string, sourceRecordId: string, subjectId: string): string | null {
  if (!/^gd-src-\d{6}$/.test(sourceRecordId) || links.snapshotId !== snapshotId) return null;
  return subjectIdsForSource(links, sourceRecordId).includes(subjectId) ? sourceRecordId : null;
}
export function subjectIdsForSource(links: QccLinks, sourceRecordId: string): string[] {
  return links.links.find(item => item.sourceRecordId === sourceRecordId)?.subjectIds ?? [];
}



async function readQccJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(sitePath(path), { signal });
  if (!response.ok) throw new Error('登记主体数据读取失败（HTTP ' + response.status + '）。');
  return response.json();
}

export async function loadQccIndex(signal: AbortSignal): Promise<QccIndex> {
  const raw = await readQccJson('/data/qcc/index.v1.json', signal);
  if (!raw || typeof raw !== 'object') throw new Error('登记主体索引格式无效。');
  const data = raw as Partial<QccIndex>;
  if (data.schemaVersion !== 1 || typeof data.snapshotId !== 'string' || typeof data.exportedAt !== 'string' ||
    typeof data.sourceSha256 !== 'string' || !Array.isArray(data.records) ||
    !data.records.every(record => typeof record.id === 'string' && typeof record.name === 'string' &&
      typeof record.city === 'string' && typeof record.rowNumber === 'number' && typeof record.chunk === 'string')) {
    throw new Error('登记主体索引格式无效。');
  }
  return data as QccIndex;
}

export async function loadQccChunk(filename: string, snapshotId: string, signal: AbortSignal): Promise<QccChunk> {
  if (!/^chunk-\d{3}\.v1\.json$/.test(filename)) throw new Error('登记主体分块路径无效。');
  const raw = await readQccJson('/data/qcc/' + filename, signal);
  if (!raw || typeof raw !== 'object') throw new Error('登记主体详情格式无效。');
  const data = raw as Partial<QccChunk>;
  if (data.schemaVersion !== 1 || data.snapshotId !== snapshotId || !Array.isArray(data.records) ||
    !data.records.every(record => typeof record.id === 'string' && typeof record.rowNumber === 'number' && isQccSourceFields(record.sourceFields))) {
    throw new Error('登记主体详情与索引不一致。');
  }
  return data as QccChunk;
}

export async function loadQccLinks(signal: AbortSignal): Promise<QccLinks> {
  const raw = await readQccJson('/data/qcc/links.v1.json', signal);
  if (!raw || typeof raw !== 'object') throw new Error('候选关联格式无效。');
  const data = raw as Partial<QccLinks>;
  if (data.schemaVersion !== 1 || typeof data.snapshotId !== 'string' || !Array.isArray(data.links) ||
    !data.links.every(link => typeof link.sourceRecordId === 'string' && Array.isArray(link.subjectIds) &&
      link.subjectIds.every(id => typeof id === 'string'))) {
    throw new Error('候选关联格式无效。');
  }
  return data as QccLinks;
}

