import { createHash } from 'node:crypto';
import path from 'node:path';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';

export type InstitutionReferenceLock = {
  schemaVersion: 1;
  filename: string;
  sha256: string;
  bytes: number;
  rowCount: number;
};

const prefix = 'data/qcc-institutions/';
const manifestPath = prefix + 'manifest.v1.json';
const indexPattern = /^data\/qcc-institutions\/(p-[a-f0-9]{12})\/(c-[a-f0-9]{12})\/index\.v1\.json$/;
const chunkPattern = /^data\/qcc-institutions\/(p-[a-f0-9]{12})\/(c-[a-f0-9]{12})\/(chunk-\d{3}\.v1\.json)$/;
const indexFields = ['id', 'sourceRow', 'name', 'region', 'address', 'beds', 'chunk'];
const detailFields = ['id', 'sourceRow', 'name', 'region', 'address', 'beds', 'creditCode', 'codeStatus', 'sourceFields'];
const mobile = /(?<!\d)(?:(?:\+|00)86[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)/;
const landline = /(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)/;
const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const alphabet = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

function fail(message: string): never { throw new Error('全国机构线索投影' + message); }

function fields(value: unknown, expected: string[], where: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('结构错误：' + where);
  const obj = value as Record<string, unknown>;
  const actual = Object.keys(obj).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((item, index) => item !== allowed[index])) {
    fail('字段不在白名单：' + where);
  }
  return obj;
}

function publicText(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim() || mobile.test(value) || landline.test(value) || email.test(value)) {
    fail('文本无效或含联系信息：' + where);
  }
  return value;
}

function nullableText(value: unknown, where: string): string | null {
  return value === null ? null : publicText(value, where);
}

function safeCount(value: unknown, where: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('计数无效：' + where);
  return value as number;
}

function creditCodeValid(value: string): boolean {
  if (!/^[0-9A-Z]{18}$/.test(value) || /^0{18}$/.test(value)) return false;
  const digits = [...value].map(character => alphabet.indexOf(character));
  if (digits.some(digit => digit < 0)) return false;
  const sum = weights.reduce((total, weight, index) => total + weight * digits[index], 0);
  return (31 - sum % 31) % 31 === digits[17];
}

function slug(prefixPart: string, value: string): string {
  return prefixPart + '-' + createHash('sha256').update(value).digest('hex').slice(0, 12);
}

type Summary = {
  id: string; sourceRow: number; name: string; region: string;
  address: string | null; beds: number; chunk: string;
};

function summary(value: unknown, where: string, sourceSha: string, rowCount: number): Summary {
  const obj = fields(value, indexFields, where);
  const sourceRow = safeCount(obj.sourceRow, where + ' 来源行号');
  if (sourceRow < 2 || sourceRow > rowCount + 1 || obj.id !== 'qi-' + sourceSha.slice(0, 12) + '-' + sourceRow) {
    fail('来源行号或ID不一致：' + where);
  }
  const name = publicText(obj.name, where + ' 名称');
  const region = publicText(obj.region, where + ' 地区');
  const address = nullableText(obj.address, where + ' 地址');
  const beds = safeCount(obj.beds, where + ' 床位');
  if (typeof obj.chunk !== 'string' || !/^chunk-\d{3}\.v1\.json$/.test(obj.chunk)) {
    fail('分块路径无效：' + where);
  }
  return { id: obj.id as string, sourceRow, name, region, address, beds, chunk: obj.chunk };
}

function parseFile(files: ReadonlyMap<string, string>, file: string): unknown {
  const content = files.get(file);
  if (content === undefined) fail('缺失文件：' + file);
  try { return JSON.parse(content); }
  catch { fail('不是有效JSON：' + file); }
}

export function validateInstitutionReferenceFiles(
  files: ReadonlyMap<string, string>, lock?: InstitutionReferenceLock,
): void {
  const manifest = fields(parseFile(files, manifestPath),
    ['schemaVersion', 'snapshotId', 'receivedAt', 'rowCount', 'source', 'provinces'], manifestPath);
  if (manifest.schemaVersion !== 1) fail('manifest版本错误');
  const snapshotId = publicText(manifest.snapshotId, 'snapshotId');
  const receivedAt = publicText(manifest.receivedAt, 'receivedAt');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedAt) || Number.isNaN(Date.parse(receivedAt))) fail('接收日期无效');
  const rowCount = safeCount(manifest.rowCount, 'rowCount');
  const source = fields(manifest.source, ['title', 'sha256', 'asOf'], 'source');
  publicText(source.title, 'source title');
  if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256) || source.asOf !== null) {
    fail('来源哈希或资料期无效');
  }
  const sourceSha = source.sha256;
  if (lock && (lock.schemaVersion !== 1 || lock.filename !== '养老机构信息.xlsx' ||
    !Number.isSafeInteger(lock.bytes) || lock.bytes <= 0 ||
    lock.sha256 !== sourceSha || lock.rowCount !== rowCount)) fail('与锁定来源清单不一致');
  if (!Array.isArray(manifest.provinces) || !manifest.provinces.length) fail('省份清单缺失');
  if (lock && manifest.provinces.length !== 31) fail('大陆31省级地区未完整分组');

  const expectedIndexes = new Map<string, { province: string; city: string; count: number; p: string; c: string }>();
  const seenProvinces = new Set<string>();
  let provinceRows = 0;
  for (const rawProvince of manifest.provinces) {
    const province = fields(rawProvince, ['slug', 'name', 'count', 'cities'], 'province');
    const name = publicText(province.name, 'province name');
    const p = slug('p', name);
    if (province.slug !== p || seenProvinces.has(name)) fail('省份slug无效或重复');
    seenProvinces.add(name);
    const count = safeCount(province.count, 'province count');
    if (!Array.isArray(province.cities) || !province.cities.length) fail('城市列表缺失');
    const seenCities = new Set<string>();
    let cityRows = 0;
    for (const rawCity of province.cities) {
      const city = fields(rawCity, ['slug', 'name', 'count', 'indexPath'], 'city');
      const cityName = publicText(city.name, 'city name');
      const c = slug('c', name + '|' + cityName);
      if (city.slug !== c || seenCities.has(cityName)) fail('城市slug无效或重复');
      seenCities.add(cityName);
      const cityCount = safeCount(city.count, 'city count');
      const indexPath = p + '/' + c + '/index.v1.json';
      if (city.indexPath !== indexPath) fail('城市索引路径未经批准');
      expectedIndexes.set(prefix + indexPath, { province: name, city: cityName, count: cityCount, p, c });
      cityRows += cityCount;
    }
    if (cityRows !== count) fail('省市行数不一致：' + name);
    provinceRows += count;
  }
  if (provinceRows !== rowCount) fail('总行数不一致');

  const expectedChunks = new Map<string, Map<string, Summary>>();
  const seenRows = new Set<number>();
  const seenIds = new Set<string>();
  for (const [indexPath, location] of expectedIndexes) {
    const index = fields(parseFile(files, indexPath),
      ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records'], indexPath);
    if (index.schemaVersion !== 1 || index.snapshotId !== snapshotId ||
      index.provinceSlug !== location.p || index.citySlug !== location.c ||
      !Array.isArray(index.records) || index.records.length !== location.count) fail('地区索引不一致：' + indexPath);
    for (const rawRecord of index.records) {
      const record = summary(rawRecord, indexPath, sourceSha, rowCount);
      if (!(record.region.startsWith(location.province) ||
        location.province === '新疆维吾尔自治区' && record.region.startsWith('新疆生产建设兵团'))) {
        fail('地区与省份不一致：' + record.id);
      }
      if (seenRows.has(record.sourceRow) || seenIds.has(record.id)) fail('重复来源行或ID：' + record.id);
      seenRows.add(record.sourceRow); seenIds.add(record.id);
      const chunkPath = path.posix.join(path.posix.dirname(indexPath), record.chunk);
      let chunkRecords = expectedChunks.get(chunkPath);
      if (!chunkRecords) { chunkRecords = new Map(); expectedChunks.set(chunkPath, chunkRecords); }
      chunkRecords.set(record.id, record);
    }
  }
  if (seenRows.size !== rowCount) fail('来源行未被完整覆盖');

  const expectedFiles = new Set([manifestPath, ...expectedIndexes.keys(), ...expectedChunks.keys()]);
  if (files.size !== expectedFiles.size || [...files.keys()].some(file => !expectedFiles.has(file))) {
    fail('目录含未经批准文件或分块缺失');
  }
  for (const [chunkPath, records] of expectedChunks) {
    if (!chunkPattern.test(chunkPath)) fail('分块路径无效：' + chunkPath);
    const chunk = fields(parseFile(files, chunkPath),
      ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records'], chunkPath);
    const match = chunkPath.match(chunkPattern)!;
    if (chunk.schemaVersion !== 1 || chunk.snapshotId !== snapshotId ||
      chunk.provinceSlug !== match[1] || chunk.citySlug !== match[2] ||
      !Array.isArray(chunk.records) || chunk.records.length > 100 || chunk.records.length !== records.size) {
      fail('分块结构或快照不一致：' + chunkPath);
    }
    const seenChunkIds = new Set<string>();
    for (const rawDetail of chunk.records) {
      const detail = fields(rawDetail, detailFields, chunkPath);
      const sourceFields = fields(detail.sourceFields, [...REFERENCE_SOURCE_FIELD_NAMES], chunkPath + ' sourceFields');
      for (const [field, value] of Object.entries(sourceFields)) {
        if (value !== null && typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
          fail('原始来源字段类型无效：' + chunkPath + ' ' + field);
        }
      }
      const expected = records.get(String(detail.id));
      if (!expected || seenChunkIds.has(String(detail.id))) fail('分块记录缺失或重复：' + chunkPath);
      seenChunkIds.add(String(detail.id));
      for (const key of ['id', 'sourceRow', 'name', 'region', 'address', 'beds'] as const) {
        if (detail[key] !== expected[key]) fail('分块与索引不一致：' + chunkPath + ' ' + key);
      }
      if (!['valid', 'missing', 'placeholder', 'invalid'].includes(String(detail.codeStatus))) {
        fail('代码状态无效：' + chunkPath);
      }
      if (detail.codeStatus === 'valid') {
        if (typeof detail.creditCode !== 'string' || !creditCodeValid(detail.creditCode)) {
          fail('统一社会信用代码校验失败：' + chunkPath);
        }
      } else if (detail.creditCode !== null) fail('无效代码不得用于规范化匹配字段：' + chunkPath);
    }
  }
  for (const file of files.keys()) {
    if (file !== manifestPath && !indexPattern.test(file) && !chunkPattern.test(file)) fail('路径未经批准：' + file);
  }
}
