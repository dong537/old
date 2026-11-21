import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { validateInstitutionReferenceFiles, type InstitutionReferenceLock } from './check-qcc-institutions-output';
import { validateInstitutionReferenceLinks } from './check-qcc-institution-links-output';
import { validateInstitutionRegistryLinks } from './check-qcc-institution-registry-links-output';
import { QCC_SOURCE_FIELD_NAMES } from '../lib/qcc-types';
import { REFERENCE_SOURCE_FIELD_NAMES } from '../lib/institution-reference-types';
import { validateMcaObservedOutput } from './check-mca-observed-output';

// These belong only to the local ChaQiGO preview, even when QCC registration fields are published.
const privateMarkers = [
  'companyCreditCode', 'paidInCapital', 'enterpriseType', 'candidateName',
  'relationshipVerified', 'institutionStatuses', '实缴资本', '登记机关',
];
const mcaPrivateMarkers = [
  'private_mca_observed_institutions', 'data/private/generated/mca-observed-catalog',
  'mca-private-raw-20261119',
];
const allowedMcaPreviewFiles = new Set([
  'quanguo/mca-preview/index.html', 'quanguo/mca-preview/index.txt',
  'quanguo/mca-preview/unavailable/index.html', 'quanguo/mca-preview/unavailable/index.txt',
]);
const qccPath = /^data\/qcc\/(?:index\.v1\.json|links\.v1\.json|chunk-\d{3}\.v1\.json)$/;
const qccIndexFields = ['id', 'rowNumber', 'name', 'city', 'district', 'subjectType', 'registrationStatus', 'chunk'];
const qccDetailFields = [
  'id', 'rowNumber', 'name', 'city', 'district', 'subjectType', 'registrationStatus',
  'creditCode', 'codeValidity', 'legalRepresentative', 'establishedAt', 'registeredCapital',
  'organizationCode', 'registrationNo', 'taxId', 'businessTerm', 'insuredPersons', 'insuredYear',
  'nationalIndustry', 'address', 'mailingAddress', 'businessScope', 'formerName', 'englishName', 'companySize',
  'sourceFields',
];
const qccLinkFields = ['sourceRecordId', 'subjectIds'];
const nationalManifestPath = 'data/qcc-national/manifest.v1.json';
const nationalIndexPath = /^data\/qcc-national\/(p-[a-f0-9]{12})\/(c-[a-f0-9]{12})\/index\.v1\.json$/;
const nationalChunkPath = /^data\/qcc-national\/(p-[a-f0-9]{12})\/(c-[a-f0-9]{12})\/(chunk-\d{3}\.v1\.json)$/;
const nationalIndexFields = [
  'id', 'rowNumber', 'sourceId', 'name', 'province', 'city', 'district',
  'subjectType', 'registrationStatus', 'chunk',
];
const nationalDetailFields = [
  'id', 'rowNumber', 'sourceId', 'name', 'province', 'city', 'district',
  'subjectType', 'registrationStatus', 'creditCode', 'codeValidity',
  'legalRepresentative', 'establishedAt', 'registeredCapital', 'organizationCode',
  'registrationNo', 'taxId', 'businessTerm', 'insuredPersons', 'insuredYear',
  'nationalIndustry', 'address', 'mailingAddress', 'businessScope', 'formerName',
  'englishName', 'companySize',
  'sourceFields',
];
const nationalMobile = /(?<!\d)(?:(?:\+|00)86[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)/;
const nationalEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const officialLandline = /(?<!\d)\(?0\d{2,3}\)?[\s-]*\d{7,8}(?!\d)/;
const qccContactSourceFields = new Set(['有效手机号', '更多电话', '邮箱']);
// A phone-shaped number in an identifier, amount or count remains source data.
// Email addresses are never valid values for these exemptions.
const qccPhoneExemptSourceFields = new Set([
  '统一社会信用代码', '纳税人识别号', '注册号', '组织机构代码',
  '注册资本', '参保人数', '参保人数所属年报', '企业规模', '注册地址邮编', '通信地址邮编',
]);
const referencePhoneExemptSourceFields = new Set(['统一社会信用代码', '行政区划代码', '床位数', '经度', '纬度']);
const qccPhoneExemptFields = new Set([
  'id', 'sourceId', 'rowNumber', 'taxId', 'organizationCode', 'registrationNo',
  'registeredCapital', 'insuredPersons', 'insuredYear', 'companySize',
]);

function containsContact(value: string | number, phoneExempt = false): boolean {
  const normalized = String(value).normalize('NFKC');
  return nationalEmail.test(normalized) ||
    (!phoneExempt && (nationalMobile.test(normalized) || officialLandline.test(normalized)));
}
const officialManifestPath = 'data/national-official/manifest.v1.json';
const officialIndexPath = /^data\/national-official\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\/index\.v1\.json$/;
const officialChunkPath = /^data\/national-official\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\/(chunk-\d{3}\.v1\.json)$/;
const officialIndexFields = ['id', 'sourceId', 'rowNumber', 'name', 'address', 'beds', 'chunk'];
const officialDetailFields = ['id', 'sourceId', 'rowNumber', 'name', 'address', 'beds', 'residentCount', 'staffCount', 'services'];

type NationalCity = { slug: string; name: string; count: number; indexPath: string };
type NationalProvince = { slug: string; name: string; count: number; cities: NationalCity[] };
type NationalSource = { id: string; filename: string; sha256: string; rowCount: number };
type NationalManifest = {
  schemaVersion: 1; snapshotId: string; exportedAt: string; rowCount: number;
  sourceFiles: NationalSource[]; provinces: NationalProvince[];
};
type NationalSourceLock = Pick<NationalManifest, 'schemaVersion' | 'exportedAt' | 'rowCount' | 'sourceFiles'>;
type NationalRecordIdentity = {
  id: string; sourceId: string; rowNumber: number; name: string; province: string;
  city: string; district: string | null; subjectType: string | null;
  registrationStatus: string | null;
};
type NationalIndexSummary = {
  snapshotId: string; provinceSlug: string; citySlug: string;
  records: (NationalRecordIdentity & { chunk: string })[];
};
type NationalChunkSummary = {
  snapshotId: string; provinceSlug: string; citySlug: string;
  records: (NationalRecordIdentity & { creditCode: string | null; codeValidity: string | null })[];
};
type OfficialSource = {
  id: string; province: string; city: string | null; scope: string; title: string; url: string;
  publishedAt: string | null; asOf: string | null; sha256: string; rowCount: number;
};
type OfficialCity = { slug: string; name: string; count: number; indexPath: string };
type OfficialManifest = {
  schemaVersion: 1; snapshotId: string; archivedAt: string; rowCount: number;
  sources: OfficialSource[];
  provinces: { slug: string; name: string; count: number; cities: OfficialCity[] }[];
};
type OfficialSourceLock = {
  schemaVersion: 1; sources: { id: string; filename: string; sha256: string; bytes: number; rowCount: number }[];
};
type OfficialRecordIdentity = {
  id: string; sourceId: string; rowNumber: number; name: string; address: string | null; beds: number | null;
};
type OfficialIndexSummary = {
  snapshotId: string; provinceSlug: string; citySlug: string;
  records: (OfficialRecordIdentity & { chunk: string })[];
};
type OfficialChunkSummary = {
  snapshotId: string; provinceSlug: string; citySlug: string; records: OfficialRecordIdentity[];
};

function assertFields(value: unknown, fields: string[], location: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('QCC投影结构错误：' + location);
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('QCC投影字段不在白名单：' + location);
  }
}

function validateQccValues(record: Record<string, unknown>, location: string): void {
  for (const [key, value] of Object.entries(record)) {
    if (key === 'sourceFields') {
      validateSourceFields(value, QCC_SOURCE_FIELD_NAMES, location);
      continue;
    }
    if (value === null) continue;
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('QCC投影字段类型错误：' + location);
    const phoneExempt = qccPhoneExemptFields.has(key) ||
      (key === 'creditCode' && typeof value === 'string' && /^[0-9A-Z]{18}$/.test(value));
    if (containsContact(value, phoneExempt)) {
      throw new Error('QCC投影包含联系信息，停止发布：' + location);
    }
  }
}

function validateSourceFields(value: unknown, fields: readonly string[], location: string): void {
  assertFields(value, [...fields], location + ' 原始字段');
  if (!Object.values(value).every(item => item === null || typeof item === 'string' ||
    (typeof item === 'number' && Number.isFinite(item)))) {
    throw new Error('原始投影字段类型错误：' + location);
  }
  if (fields === QCC_SOURCE_FIELD_NAMES) {
    for (const [key, item] of Object.entries(value)) {
      if (qccContactSourceFields.has(key)) {
        if (item !== null && item !== '' && item !== '-' && item !== '[已遮蔽]') {
          throw new Error('原始投影联系信息必须遮蔽：' + location + ' ' + key);
        }
      } else if ((typeof item === 'string' || typeof item === 'number') &&
        containsContact(item, qccPhoneExemptSourceFields.has(key))) {
        throw new Error('原始投影联系信息必须遮蔽：' + location + ' ' + key);
      }
    }
  } else if (fields === REFERENCE_SOURCE_FIELD_NAMES) {
    for (const [key, item] of Object.entries(value)) {
      if ((typeof item === 'string' || typeof item === 'number') &&
        containsContact(item, referencePhoneExemptSourceFields.has(key))) {
        throw new Error('原始投影联系信息必须遮蔽：' + location + ' ' + key);
      }
    }
  }
}

function validateReferenceContacts(content: string, location: string): void {
  const data = JSON.parse(content) as Record<string, unknown>;
  if (!Array.isArray(data.records)) return;
  for (const record of data.records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    for (const key of ['name', 'region', 'address']) {
      const value = (record as Record<string, unknown>)[key];
      if ((typeof value === 'string' || typeof value === 'number') && containsContact(value)) {
        throw new Error('全国机构线索投影包含联系信息，停止发布：' + location + ' ' + key);
      }
    }
  }
}

// The exemption belongs only to the authorized raw cells of approved detail chunks.
// All normalized fields and every other output file still undergo the original scan.
function withoutSourceFields(content: string, fields: readonly string[], location: string): string {
  const data = JSON.parse(content) as Record<string, unknown>;
  if (!Array.isArray(data.records)) throw new Error('原始投影记录结构错误：' + location);
  return JSON.stringify({ ...data, records: data.records.map((record: unknown) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('原始投影记录结构错误：' + location);
    const { sourceFields, ...normalized } = record as Record<string, unknown>;
    validateSourceFields(sourceFields, fields, location);
    return normalized;
  }) });
}

function assertSafeCount(value: unknown, location: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('QCC全国投影计数无效：' + location);
}

function assertPublicText(value: unknown, location: string, phoneExempt = false): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || containsContact(value, phoneExempt)) {
    throw new Error('QCC全国投影包含无效或联系信息：' + location);
  }
}

function validateNationalValues(record: Record<string, unknown>, location: string): void {
  validateQccValues(record, location);
  for (const [key, value] of Object.entries(record)) {
    if (key === 'creditCode' && value !== null && typeof value !== 'string') {
      throw new Error('QCC全国投影代码字段类型无效：' + location);
    }
    if (typeof value === 'number' && ['name', 'province', 'city', 'district', 'subjectType',
      'registrationStatus', 'legalRepresentative', 'address', 'mailingAddress', 'businessScope',
      'formerName', 'englishName', 'nationalIndustry'].includes(key)) {
      throw new Error('QCC全国投影自由文本字段类型无效：' + location + ' ' + key);
    }
  }
}

function nationalIdentity(record: Record<string, unknown>): NationalRecordIdentity {
  const requiredStrings = ['id', 'sourceId', 'name', 'province', 'city'];
  for (const key of requiredStrings) {
    if (typeof record[key] !== 'string' || !(record[key] as string).trim()) throw new Error('QCC全国记录标识无效：' + key);
  }
  if (!Number.isSafeInteger(record.rowNumber) || Number(record.rowNumber) < 3) throw new Error('QCC全国来源行号无效');
  for (const key of ['district', 'subjectType', 'registrationStatus']) {
    if (record[key] !== null && typeof record[key] !== 'string') throw new Error('QCC全国登记字段类型无效：' + key);
  }
  return {
    id: record.id as string, sourceId: record.sourceId as string, rowNumber: record.rowNumber as number,
    name: record.name as string, province: record.province as string, city: record.city as string,
    district: record.district as string | null, subjectType: record.subjectType as string | null,
    registrationStatus: record.registrationStatus as string | null,
  };
}

function validateNationalManifest(data: unknown): NationalManifest {
  assertFields(data, ['schemaVersion', 'snapshotId', 'exportedAt', 'rowCount', 'sourceFiles', 'provinces'], nationalManifestPath);
  if (data.schemaVersion !== 1 || !Array.isArray(data.sourceFiles) || !Array.isArray(data.provinces)) {
    throw new Error('QCC全国manifest结构错误');
  }
  assertPublicText(data.snapshotId, 'snapshotId');
  assertPublicText(data.exportedAt, 'exportedAt');
  assertSafeCount(data.rowCount, 'rowCount');
  const sourceIds = new Set<string>();
  let sourceRows = 0;
  for (const source of data.sourceFiles) {
    assertFields(source, ['id', 'filename', 'sha256', 'rowCount'], 'sourceFiles');
    assertPublicText(source.id, 'sourceId', true);
    if (!/^(?:qcc-)?source-[a-z0-9-]+$/.test(source.id)) throw new Error('QCC全国来源ID无效');
    assertPublicText(source.filename, 'source filename');
    if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error('QCC全国来源哈希无效');
    assertSafeCount(source.rowCount, 'source rowCount');
    if (sourceIds.has(source.id)) throw new Error('QCC全国重复来源ID');
    sourceIds.add(source.id);
    sourceRows += source.rowCount;
  }
  if (sourceRows !== data.rowCount) throw new Error('QCC全国来源行数不一致');
  const provinceSlugs = new Set<string>();
  let provinceRows = 0;
  for (const province of data.provinces) {
    assertFields(province, ['slug', 'name', 'count', 'cities'], 'provinces');
    if (typeof province.slug !== 'string' || !/^p-[a-f0-9]{12}$/.test(province.slug) || provinceSlugs.has(province.slug)) {
      throw new Error('QCC全国省份slug无效或重复');
    }
    provinceSlugs.add(province.slug);
    assertPublicText(province.name, 'province name');
    assertSafeCount(province.count, 'province count');
    if (!Array.isArray(province.cities)) throw new Error('QCC全国城市列表无效');
    let cityRows = 0;
    const citySlugs = new Set<string>();
    for (const city of province.cities) {
      assertFields(city, ['slug', 'name', 'count', 'indexPath'], 'cities');
      if (typeof city.slug !== 'string' || !/^c-[a-f0-9]{12}$/.test(city.slug) || citySlugs.has(city.slug)) {
        throw new Error('QCC全国城市slug无效或重复');
      }
      citySlugs.add(city.slug);
      assertPublicText(city.name, 'city name');
      assertSafeCount(city.count, 'city count');
      const expected = province.slug + '/' + city.slug + '/index.v1.json';
      if (city.indexPath !== expected) throw new Error('QCC全国城市索引路径未经批准');
      cityRows += city.count;
    }
    if (cityRows !== province.count) throw new Error('QCC全国省市行数不一致');
    provinceRows += province.count;
  }
  if (provinceRows !== data.rowCount) throw new Error('QCC全国总行数不一致');
  return data as NationalManifest;
}

function validateNationalIndex(data: unknown, location: string, match: RegExpMatchArray): NationalIndexSummary {
  assertFields(data, ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records'], location);
  if (data.schemaVersion !== 1 || data.provinceSlug !== match[1] || data.citySlug !== match[2] ||
    !Array.isArray(data.records)) throw new Error('QCC全国城市索引结构错误：' + location);
  assertPublicText(data.snapshotId, 'index snapshotId');
  const records: NationalIndexSummary['records'] = [];
  for (const record of data.records) {
    assertFields(record, nationalIndexFields, location);
    validateNationalValues(record, location);
    if (typeof record.chunk !== 'string' || !/^chunk-\d{3}\.v1\.json$/.test(record.chunk)) {
      throw new Error('QCC全国城市索引记录无效：' + location);
    }
    records.push({ ...nationalIdentity(record), chunk: record.chunk });
  }
  return { snapshotId: data.snapshotId as string, provinceSlug: match[1], citySlug: match[2], records };
}

function validateNationalChunk(data: unknown, location: string, match: RegExpMatchArray): NationalChunkSummary {
  assertFields(data, ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records'], location);
  if (data.schemaVersion !== 1 || data.provinceSlug !== match[1] || data.citySlug !== match[2] ||
    !Array.isArray(data.records) || data.records.length > 100) {
    throw new Error('QCC全国详情分块结构错误：' + location);
  }
  assertPublicText(data.snapshotId, 'chunk snapshotId');
  const records: NationalChunkSummary['records'] = [];
  for (const record of data.records) {
    assertFields(record, nationalDetailFields, location);
    validateNationalValues(record, location);
    records.push({ ...nationalIdentity(record), creditCode: record.creditCode as string | null,
      codeValidity: record.codeValidity as string | null });
  }
  return { snapshotId: data.snapshotId as string, provinceSlug: match[1], citySlug: match[2], records };
}

function assertOfficialFields(value: unknown, fields: string[], location: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('官方来源投影结构错误：' + location);
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('官方来源投影字段不在白名单：' + location);
  }
}

function officialText(value: unknown, location: string): string {
  if (typeof value !== 'string' || !value.trim() || containsContact(value)) {
    throw new Error('官方来源投影含无效文本或联系信息：' + location);
  }
  return value;
}

function officialNullableText(value: unknown, location: string): string | null {
  return value === null ? null : officialText(value, location);
}

function officialNumber(value: unknown, location: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('官方来源投影数量无效：' + location);
  if (nationalMobile.test(String(value))) throw new Error('官方来源投影数量含手机号格式联系信息：' + location);
  return value as number;
}

function officialSlug(value: unknown, location: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('官方来源投影地区slug无效：' + location);
  }
  return value;
}

function officialDate(value: unknown, location: string): string {
  const date = officialText(value, location);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error('官方来源投影日期无效：' + location);
  }
  return date;
}

function officialPeriod(value: unknown, location: string): string {
  if (typeof value === 'string' && /^[12]\d{3}年(?:0?[1-9]|1[0-2])月底$/.test(value)) return value;
  return officialDate(value, location);
}

function validateOfficialManifest(data: unknown): OfficialManifest {
  assertOfficialFields(data, ['schemaVersion', 'snapshotId', 'archivedAt', 'rowCount', 'sources', 'provinces'], officialManifestPath);
  if (data.schemaVersion !== 1 || !Array.isArray(data.sources) || !Array.isArray(data.provinces)) {
    throw new Error('官方来源manifest结构错误');
  }
  officialText(data.snapshotId, 'snapshotId');
  officialDate(data.archivedAt, 'archivedAt');
  officialNumber(data.rowCount, 'manifest rowCount');
  const sourceIds = new Set<string>();
  let sourceRows = 0;
  for (const source of data.sources) {
    assertOfficialFields(source, ['id', 'province', 'city', 'scope', 'title', 'url', 'publishedAt', 'asOf', 'sha256', 'rowCount'], 'sources');
    const id = officialText(source.id, 'source id');
    if (!/^[a-z0-9-]+$/.test(id) || sourceIds.has(id)) throw new Error('官方来源ID无效或重复');
    sourceIds.add(id);
    for (const key of ['province', 'scope', 'title']) officialText(source[key], 'source ' + key);
    if (source.city !== null) officialText(source.city, 'source city');
    if (typeof source.url !== 'string') throw new Error('官方来源URL无效');
    let url: URL;
    try { url = new URL(source.url); } catch { throw new Error('官方来源URL无效'); }
    const approvedOpenData = id === 'sc-dz-20260814' && url.origin === 'https://www.dazhoudata.cn' &&
      url.pathname === '/oportal/catalog/8295bd1137254b6699c69992f30de94d' && !url.search && !url.hash;
    const dazhouCounties: Record<string, { catalogId: string; county: string; title: string; publishedAt: string }> = {
      'sc-dz-xuanhan-20260722': { catalogId: '98c83f7a84a0488290df5a2025ad6932', county: '宣汉县', title: '宣汉县养老机构信息', publishedAt: '2024-10-30' },
      'sc-dz-wanyuan-20260722': { catalogId: '567ef5ba62324c16a39e16dfe43094bd', county: '万源市', title: '万源市养老机构信息', publishedAt: '2022-04-21' },
      'sc-dz-dazhu-20260722': { catalogId: '2bba3e7042374a84bf1c479e066a5c0f', county: '大竹县', title: '大竹县养老机构信息', publishedAt: '2024-10-30' },
      'sc-dz-kaijiang-20260722': { catalogId: '3583b17b10e544e080458b8107e9364c', county: '开江县', title: '开江县养老机构地址信息', publishedAt: '2021-12-07' },
    };
    const dazhouCounty = dazhouCounties[id];
    const approvedDazhouCounty = Boolean(dazhouCounty) && url.origin === 'https://www.dazhoudata.cn' &&
      url.pathname === '/oportal/catalog/' + dazhouCounty.catalogId && !url.search && !url.hash;
    if (dazhouCounty && (!approvedDazhouCounty || source.province !== '四川省' || source.city !== '达州' ||
      source.title !== dazhouCounty.title || source.publishedAt !== dazhouCounty.publishedAt || source.asOf !== null ||
      !String(source.scope).includes('仅达州市' + dazhouCounty.county) ||
      !String(source.scope).includes('来源第N条按冻结预览位次，不等于原表序号') ||
      !String(source.scope).includes('不代表全市或该区县当前在营全量') ||
      !String(source.scope).includes('仅展示名称与地址'))) {
      throw new Error('达州区县官方来源URL或范围未经批准');
    }
    const approvedPanzhihua = id === 'sc-pzh-20260901' && url.origin === 'https://pzhdata.cn' &&
      url.pathname === '/oportal/catalog/43f1109ec4c04fde854889873395d4cd' && !url.search && !url.hash;
    if (id === 'sc-pzh-20260901' && (!approvedPanzhihua || source.province !== '四川省' ||
      source.city !== '攀枝花' || source.title !== '攀枝花市_市民政局_养老机构信息一览表' ||
      source.publishedAt !== '2026-09-01' || source.asOf !== null ||
      !String(source.scope).includes('床位数100张以上') ||
      !String(source.scope).includes('不代表全市全量或当前在营'))) {
      throw new Error('攀枝花官方来源URL或范围未经批准');
    }
    const approvedLuxi = id === 'sd-hz-luxi-20250627' && url.origin === 'https://data.sd.gov.cn' &&
      url.pathname === '/portal/catalog/CD7009EDC99348728AAAD80F06AE1BFE' && !url.search && !url.hash;
    if (id === 'sd-hz-luxi-20250627' && !approvedLuxi) throw new Error('官方来源URL未经批准');
    const approvedTaian = id === 'sd-taian-20250724' && url.origin === 'https://data.sd.gov.cn' &&
      url.pathname === '/portal/catalog/19223520c2494a94af3ccbacfc17cf91' && !url.search && !url.hash;
    if (id === 'sd-taian-20250724' && (!approvedTaian || source.province !== '山东省' ||
      source.city !== '泰安' || source.title !== '泰安市养老机构信息' ||
      source.publishedAt !== '2025-07-29' || source.asOf !== null ||
      !String(source.scope).includes('2025-07-24 版本文件93条') ||
      !String(source.scope).includes('2026-08-01 版本仅10行'))) {
      throw new Error('泰安官方来源URL或历史范围未经批准');
    }
    const approvedJinan = id === 'sd-jinan-20250721' && url.origin === 'https://data.sd.gov.cn' &&
      url.pathname === '/portal/catalog/7900f7ace36c4faca8a17b5af1d9d784' && !url.search && !url.hash;
    if (id === 'sd-jinan-20250721' && (!approvedJinan || source.province !== '山东省' ||
      source.city !== '济南' || source.title !== '济南市养老机构基本信息数据' ||
      source.publishedAt !== '2023-08-21' || source.asOf !== null ||
      !String(source.scope).includes('2025-07-21版本CSV的135条历史来源行') ||
      !String(source.scope).includes('2023年08月至2024年05月') ||
      !String(source.scope).includes('2026-07-21版本仅20行') ||
      !String(source.scope).includes('不能据此推断其余机构停业'))) {
      throw new Error('济南官方来源URL或历史范围未经批准');
    }
    const approvedWeifang = id === 'sd-weifang-20261110' && url.origin === 'https://data.sd.gov.cn' &&
      url.pathname === '/portal/catalog/4e8ac605705540028fe52860b69a386a' && !url.search && !url.hash;
    if (id === 'sd-weifang-20261110' && (!approvedWeifang || source.province !== '山东省' ||
      source.city !== '潍坊' || source.title !== '养老机构信息' ||
      source.publishedAt !== '2026-08-11' || source.asOf !== '2025-04-10' ||
      !String(source.scope).includes('2025-04-10逐行统计时间') ||
      !String(source.scope).includes('不证明当前在营'))) {
      throw new Error('潍坊官方来源URL或历史范围未经批准');
    }
    const approvedTianjin = id === 'tj-nankai-20220411' && url.origin === 'https://open.data.tj.gov.cn' &&
      url.pathname === '/sjjk/45e4998327f34ddd8dab66770999e631.htm' && !url.search && !url.hash;
    if (id === 'tj-nankai-20220411' && (!approvedTianjin || source.title !== '南开区养老机构' ||
      !String(source.scope).includes('天津市信息资源统一开放平台') ||
      !String(source.scope).includes('来源第N条按冻结预览顺序，不等于原表序号'))) {
      throw new Error('天津官方来源URL或归属未经批准');
    }
    const approvedZhejiang = id === 'zj-prov-20260902' && url.origin === 'https://data.zjzwfw.gov.cn' &&
      url.pathname === '/dopServer/index.html' && !url.search &&
      url.hash === '#/dataCatalogDetail?id=hjiVC2086lVfI5xHiciluQ%3D%3D';
    if (id === 'zj-prov-20260902' && (!approvedZhejiang || source.province !== '浙江省' ||
      source.city !== null || source.title !== '养老机构信息' || source.publishedAt !== null ||
      source.asOf !== null || source.rowCount !== 674 ||
      !String(source.scope).includes('浙江省数据开放平台') ||
      !String(source.scope).includes('2026-11-17下载') ||
      !String(source.scope).includes('数据开放授权许可使用协议约束'))) {
      throw new Error('浙江官方来源URL、范围或授权标注未经批准');
    }
    if (url.protocol !== 'https:' || (!url.hostname.endsWith('.gov.cn') && url.hostname !== 'gov.cn' && !approvedOpenData && !approvedDazhouCounty && !approvedPanzhihua) ||
      url.username || url.password) throw new Error('官方来源URL未经批准');
    if (source.publishedAt !== null) officialDate(source.publishedAt, 'source publishedAt');
    if (source.asOf !== null) officialPeriod(source.asOf, 'source asOf');
    if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error('官方来源哈希无效');
    const count = officialNumber(source.rowCount, 'source rowCount');
    if (count === 0) throw new Error('官方来源行数为零');
    sourceRows += count as number;
  }
  if (sourceRows !== data.rowCount) throw new Error('官方来源行数与manifest不一致');
  const provinces = new Set<string>();
  let provinceRows = 0;
  for (const province of data.provinces) {
    assertOfficialFields(province, ['slug', 'name', 'count', 'cities'], 'provinces');
    const provinceSlug = officialSlug(province.slug, 'province');
    if (provinces.has(provinceSlug)) throw new Error('官方来源省份重复');
    provinces.add(provinceSlug);
    officialText(province.name, 'province name');
    const count = officialNumber(province.count, 'province count');
    if (!Array.isArray(province.cities)) throw new Error('官方来源城市列表无效');
    const cities = new Set<string>();
    let cityRows = 0;
    for (const city of province.cities) {
      assertOfficialFields(city, ['slug', 'name', 'count', 'indexPath'], 'cities');
      const citySlug = officialSlug(city.slug, 'city');
      if (cities.has(citySlug)) throw new Error('官方来源城市重复');
      cities.add(citySlug);
      officialText(city.name, 'city name');
      cityRows += officialNumber(city.count, 'city count') as number;
      if (city.indexPath !== `${provinceSlug}/${citySlug}/index.v1.json`) {
        throw new Error('官方来源索引路径未经批准');
      }
    }
    if (cityRows !== count) throw new Error('官方来源省市行数不一致');
    provinceRows += count as number;
  }
  if (provinceRows !== data.rowCount) throw new Error('官方来源总行数不一致');
  return data as OfficialManifest;
}

function officialIdentity(record: Record<string, unknown>, location: string, detail: boolean): OfficialRecordIdentity {
  assertOfficialFields(record, detail ? officialDetailFields : officialIndexFields, location);
  const id = officialText(record.id, location + ' id');
  const sourceId = officialText(record.sourceId, location + ' sourceId');
  if (!/^[a-z0-9-]+$/.test(id) || !/^[a-z0-9-]+$/.test(sourceId)) throw new Error('官方来源记录ID无效：' + location);
  const rowNumber = officialNumber(record.rowNumber, location + ' rowNumber');
  if (rowNumber === 0) throw new Error('官方来源原始行号无效：' + location);
  const name = officialText(record.name, location + ' name');
  const address = officialNullableText(record.address, location + ' address');
  const beds = officialNumber(record.beds, location + ' beds', true);
  if (detail) {
    officialNumber(record.residentCount, location + ' residentCount', true);
    officialNumber(record.staffCount, location + ' staffCount', true);
    officialNullableText(record.services, location + ' services');
  } else if (typeof record.chunk !== 'string' || !/^chunk-\d{3}\.v1\.json$/.test(record.chunk)) {
    throw new Error('官方来源详情分块路径无效：' + location);
  }
  return { id, sourceId, rowNumber: rowNumber as number, name, address, beds };
}

function validateOfficialIndex(data: unknown, location: string, match: RegExpMatchArray): OfficialIndexSummary {
  assertOfficialFields(data, ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records'], location);
  if (data.schemaVersion !== 1 || data.provinceSlug !== match[1] || data.citySlug !== match[2] || !Array.isArray(data.records)) {
    throw new Error('官方来源城市索引地区或结构错误：' + location);
  }
  const snapshotId = officialText(data.snapshotId, 'index snapshotId');
  const records = data.records.map((record: unknown) => ({
    ...officialIdentity(record as Record<string, unknown>, location, false),
    chunk: (record as Record<string, unknown>).chunk as string,
  }));
  return { snapshotId, provinceSlug: match[1], citySlug: match[2], records };
}

function validateOfficialChunk(data: unknown, location: string, match: RegExpMatchArray): OfficialChunkSummary {
  assertOfficialFields(data, ['schemaVersion', 'snapshotId', 'provinceSlug', 'citySlug', 'records'], location);
  if (data.schemaVersion !== 1 || data.provinceSlug !== match[1] || data.citySlug !== match[2] ||
    !Array.isArray(data.records) || data.records.length > 100) {
    throw new Error('官方来源详情分块地区或结构错误：' + location);
  }
  const snapshotId = officialText(data.snapshotId, 'chunk snapshotId');
  return { snapshotId, provinceSlug: match[1], citySlug: match[2],
    records: data.records.map((record: unknown) => officialIdentity(record as Record<string, unknown>, location, true)) };
}

function validateQccProjection(relative: string, text: string): void {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('QCC投影不是有效JSON：' + relative); }
  const location = relative;
  if (relative.endsWith('/index.v1.json')) {
    assertFields(data, ['schemaVersion', 'snapshotId', 'exportedAt', 'sourceSha256', 'records'], location);
    if (data.schemaVersion !== 1 || typeof data.snapshotId !== 'string' || typeof data.exportedAt !== 'string' ||
      typeof data.sourceSha256 !== 'string' || !Array.isArray(data.records)) throw new Error('QCC索引结构错误：' + relative);
    for (const record of data.records) {
      assertFields(record, qccIndexFields, location);
      validateQccValues(record, location);
    }
    return;
  }
  if (relative.endsWith('/links.v1.json')) {
    assertFields(data, ['schemaVersion', 'snapshotId', 'links'], location);
    if (data.schemaVersion !== 1 || typeof data.snapshotId !== 'string' || !Array.isArray(data.links)) throw new Error('QCC关联结构错误：' + relative);
    for (const link of data.links) {
      assertFields(link, qccLinkFields, location);
      if (typeof link.sourceRecordId !== 'string' || !Array.isArray(link.subjectIds) ||
        !link.subjectIds.every((id: unknown) => typeof id === 'string')) throw new Error('QCC关联字段错误：' + relative);
    }
    return;
  }
  assertFields(data, ['schemaVersion', 'snapshotId', 'records'], location);
  if (data.schemaVersion !== 1 || typeof data.snapshotId !== 'string' || !Array.isArray(data.records) || data.records.length > 100) {
    throw new Error('QCC详情分块结构错误：' + relative);
  }
  for (const record of data.records) {
    assertFields(record, qccDetailFields, location);
    validateQccValues(record, location);
  }
}

export async function scanPublicOutput(directory: string, privateIdentifiers: string[] = [], withheldMobileNumbers: string[] = [], requireNational = false, sourceLock?: NationalSourceLock, requireOfficial = false, officialLock?: OfficialSourceLock, requireInstitutionReference = false, institutionReferenceLock?: InstitutionReferenceLock, requireInstitutionLinks = false, requireInstitutionRegistryLinks = false): Promise<{filesScanned: number}> {
  let filesScanned = 0;
  let nationalManifest: NationalManifest | null = null;
  const nationalIndexes = new Map<string, NationalIndexSummary>();
  const nationalChunks = new Map<string, NationalChunkSummary>();
  let officialManifest: OfficialManifest | null = null;
  const officialIndexes = new Map<string, OfficialIndexSummary>();
  const officialChunks = new Map<string, OfficialChunkSummary>();
  const institutionReferenceFiles = new Map<string, string>();
  const institutionLinkFiles = new Map<string, string>();
  const institutionRegistryLinkFiles = new Map<string, string>();
  const guangdongRegistryFiles = new Map<string, string>();
  const officialReferenceFiles = new Map<string, string>();
  const mcaObservedFiles = new Map<string, string>();
  let guangdongReferenceContent: string | undefined;
  const officialRawHashes = new Set(officialLock?.sources.map(source => source.sha256) ?? []);
  async function walk(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('公开输出含未经扫描的符号链接：' + path.relative(directory, file));
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) continue;
      filesScanned++;
      const relative = path.relative(directory, file).replaceAll('\\', '/');
      if (relative.startsWith('data/raw/') || relative.startsWith('data/private/')) {
        throw new Error('公开输出含私有原件目录：' + relative);
      }
      if (relative.startsWith('data/.mca-observed-') ||
        (relative.startsWith('data/mca-') && !relative.startsWith('data/mca-observed/')) ||
        (relative.startsWith('quanguo/mca-preview/') && !allowedMcaPreviewFiles.has(relative))) {
        throw new Error('公开输出含未经审核的MCA数据或详情页：' + relative);
      }
      if (/\.(?:csv|xls|xlsx|docx)$/i.test(relative)) throw new Error('公开输出含未经批准的CSV/XLSX/DOCX原件：' + relative);
      if (/\.(?:html|pdf)$/i.test(relative) && officialRawHashes.size > 0) {
        const rawHash = createHash('sha256').update(await readFile(file)).digest('hex');
        if (officialRawHashes.has(rawHash)) {
          const kind = /\.pdf$/i.test(relative) ? 'PDF' : 'HTML';
          throw new Error('公开输出含官方来源原始' + kind + '：' + relative);
        }
      }
      const content = (await readFile(file, 'utf8')).replace(/\\u([\da-f]{4})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
      if (mcaPrivateMarkers.some(marker => content.includes(marker))) {
        throw new Error('公开输出发现MCA私有快照标记，停止发布：' + relative);
      }
      if (relative === 'data/guangdong-source-records.v1.json') guangdongReferenceContent = content;
      if (relative.startsWith('data/mca-observed/')) {
        mcaObservedFiles.set(relative, content);
      } else if (relative.startsWith('data/qcc/')) {
        if (!qccPath.test(relative)) throw new Error('QCC投影目录含未经批准文件：' + relative);
        validateQccProjection(relative, content);
        guangdongRegistryFiles.set(relative, content);
      } else if (relative.startsWith('data/qcc-national/')) {
        let data: unknown;
        try { data = JSON.parse(content); } catch { throw new Error('QCC全国投影不是有效JSON：' + relative); }
        if (relative === nationalManifestPath) {
          nationalManifest = validateNationalManifest(data);
        } else {
          const indexMatch = relative.match(nationalIndexPath);
          const chunkMatch = relative.match(nationalChunkPath);
          if (indexMatch) nationalIndexes.set(relative, validateNationalIndex(data, relative, indexMatch));
          else if (chunkMatch) nationalChunks.set(relative, validateNationalChunk(data, relative, chunkMatch));
          else throw new Error('QCC全国投影目录含未经批准文件：' + relative);
        }
      } else if (relative.startsWith('data/national-official/')) {
        officialReferenceFiles.set(relative, content);
        let data: unknown;
        if (relative !== officialManifestPath && !officialIndexPath.test(relative) && !officialChunkPath.test(relative)) {
          throw new Error('官方来源投影目录含未经批准文件：' + relative);
        }
        try { data = JSON.parse(content); } catch { throw new Error('官方来源投影不是有效JSON：' + relative); }
        if (relative === officialManifestPath) {
          officialManifest = validateOfficialManifest(data);
        } else {
          const indexMatch = relative.match(officialIndexPath);
          const chunkMatch = relative.match(officialChunkPath);
          if (indexMatch) officialIndexes.set(relative, validateOfficialIndex(data, relative, indexMatch));
          else if (chunkMatch) officialChunks.set(relative, validateOfficialChunk(data, relative, chunkMatch));
        }
      } else if (relative.startsWith('data/qcc-institutions/')) {
        validateReferenceContacts(content, relative);
        institutionReferenceFiles.set(relative, content);
      } else if (relative.startsWith('data/qcc-institution-links/')) {
        institutionLinkFiles.set(relative, content);
      } else if (relative.startsWith('data/qcc-institution-registry-links/')) {
        institutionRegistryLinkFiles.set(relative, content);
      } else if ((relative.endsWith('.json') && /"(?:creditCode|legalRepresentative|registeredCapital|businessScope)"\s*:/.test(content)) ||
        privateMarkers.some((marker) => content.includes(marker)) ||
        privateIdentifiers.some((identifier) => identifier.length > 0 && content.includes(identifier))) {
        throw new Error('公开输出发现私有工商字段或标识，停止发布：' + relative);
      }
      const rawFieldSet = /^data\/qcc\/chunk-\d{3}\.v1\.json$/.test(relative) || nationalChunkPath.test(relative)
        ? QCC_SOURCE_FIELD_NAMES
        : /^data\/qcc-institutions\/p-[a-f0-9]{12}\/c-[a-f0-9]{12}\/chunk-\d{3}\.v1\.json$/.test(relative)
          ? REFERENCE_SOURCE_FIELD_NAMES : null;
      const compactText = (rawFieldSet ? withoutSourceFields(content, rawFieldSet, relative) : content)
        .normalize('NFKC').replace(/[\s-]/g, '');
      if (withheldMobileNumbers.some((number) => number.length > 0 && compactText.includes(number))) {
        throw new Error('公开输出发现暂不公开的手机号，停止发布：' + relative);
      }
    }
  }
  await walk(directory);
  validateMcaObservedOutput(mcaObservedFiles);
  if (requireNational && !nationalManifest) throw new Error('QCC全国投影缺失manifest');
  if (nationalManifest || nationalIndexes.size || nationalChunks.size) {
    if (!nationalManifest) throw new Error('QCC全国投影缺失manifest');
    const manifest: NationalManifest = nationalManifest;
    if (sourceLock && (sourceLock.schemaVersion !== 1 || sourceLock.exportedAt !== manifest.exportedAt ||
      sourceLock.rowCount !== manifest.rowCount ||
      JSON.stringify(sourceLock.sourceFiles) !== JSON.stringify(manifest.sourceFiles))) {
      throw new Error('QCC全国快照与锁定来源清单不一致');
    }
    const sourceRows = new Map(manifest.sourceFiles.map(source => [source.id, new Set<number>()]));
    const sourceById = new Map(manifest.sourceFiles.map(source => [source.id, source]));
    const expectedIndexes = new Map<string, { provinceSlug: string; citySlug: string; provinceName: string; cityName: string; count: number }>();
    for (const province of manifest.provinces) {
      for (const city of province.cities) {
        expectedIndexes.set('data/qcc-national/' + city.indexPath,
          { provinceSlug: province.slug, citySlug: city.slug, provinceName: province.name, cityName: city.name, count: city.count });
      }
    }
    if (nationalIndexes.size !== expectedIndexes.size) throw new Error('QCC全国城市索引缺失或多余');
    const expectedChunks = new Map<string, Map<string, NationalRecordIdentity>>();
    const allIds = new Set<string>();
    for (const [indexPath, expected] of expectedIndexes) {
      const index = nationalIndexes.get(indexPath);
      if (!index || index.snapshotId !== manifest.snapshotId ||
        index.provinceSlug !== expected.provinceSlug || index.citySlug !== expected.citySlug ||
        index.records.length !== expected.count) throw new Error('QCC全国城市索引与manifest不一致：' + indexPath);
      for (const record of index.records) {
        const source = sourceById.get(record.sourceId);
        const seenRows = sourceRows.get(record.sourceId);
        if (!source || !seenRows || record.rowNumber > source.rowCount + 2 || seenRows.has(record.rowNumber)) {
          throw new Error('QCC全国来源行号无效、超范围或重复：' + indexPath);
        }
        seenRows.add(record.rowNumber);
        if (record.province !== expected.provinceName || record.city !== expected.cityName) {
          throw new Error('QCC全国省市名称与manifest不一致：' + indexPath);
        }
        if (allIds.has(record.id)) throw new Error('QCC全国重复主体ID：' + record.id);
        allIds.add(record.id);
        const chunkPath = path.posix.join(path.posix.dirname(indexPath), record.chunk);
        let records = expectedChunks.get(chunkPath);
        if (!records) { records = new Map(); expectedChunks.set(chunkPath, records); }
        records.set(record.id, record);
      }
    }
    for (const source of manifest.sourceFiles) {
      if (sourceRows.get(source.id)?.size !== source.rowCount) throw new Error('QCC全国来源行未被完整覆盖：' + source.id);
    }
    if (allIds.size !== manifest.rowCount || nationalChunks.size !== expectedChunks.size) {
      throw new Error('QCC全国记录数或详情分块缺失');
    }
    for (const [chunkPath, expectedRecords] of expectedChunks) {
      const chunk = nationalChunks.get(chunkPath);
      if (!chunk || chunk.snapshotId !== manifest.snapshotId || chunk.records.length !== expectedRecords.size ||
        new Set(chunk.records.map(record => record.id)).size !== chunk.records.length ||
        chunk.records.some(record => {
          const expected = expectedRecords.get(record.id);
          return !expected || expected.sourceId !== record.sourceId || expected.rowNumber !== record.rowNumber ||
            expected.name !== record.name || expected.province !== record.province || expected.city !== record.city ||
            expected.district !== record.district || expected.subjectType !== record.subjectType ||
            expected.registrationStatus !== record.registrationStatus;
        })) {
        throw new Error('QCC全国详情分块与索引不一致：' + chunkPath);
      }
    }
  }
  if (requireOfficial && !officialManifest) throw new Error('官方来源投影缺失manifest');
  if (officialManifest || officialIndexes.size || officialChunks.size) {
    if (!officialManifest) throw new Error('官方来源投影缺失manifest');
    const manifest: OfficialManifest = officialManifest;
    if (officialLock) {
      if (officialLock.schemaVersion !== 1 || !Array.isArray(officialLock.sources) ||
        officialLock.sources.length !== manifest.sources.length) throw new Error('官方来源与锁定清单不一致');
      const lockedSources = new Map(officialLock.sources.map(source => [source.id, source]));
      if (lockedSources.size !== officialLock.sources.length || manifest.sources.some(source => {
        const locked = lockedSources.get(source.id);
        const allowedJsonSource = (source.id === 'sc-dz-20260814' && locked?.filename === 'dazhou-preview-20261117.json') ||
          (source.id === 'sc-dz-xuanhan-20260722' && locked?.filename === 'dazhou-98c83f7a84a0488290df5a2025ad6932-preview-20261117.json') ||
          (source.id === 'sc-dz-wanyuan-20260722' && locked?.filename === 'dazhou-567ef5ba62324c16a39e16dfe43094bd-preview-20261117.json') ||
          (source.id === 'sc-dz-dazhu-20260722' && locked?.filename === 'dazhou-2bba3e7042374a84bf1c479e066a5c0f-preview-20261117.json') ||
          (source.id === 'sc-dz-kaijiang-20260722' && locked?.filename === 'dazhou-3583b17b10e544e080458b8107e9364c-preview-20261117.json') ||
          (source.id === 'sc-pzh-20260901' && locked?.filename === 'panzhihua-43f1109ec4c04fde854889873395d4cd-full-20261117.json');
        const allowedCsvSource = (source.id === 'sd-hz-luxi-20250627' && locked?.filename === 'shandong-luxi-20250627.csv') ||
          (source.id === 'sd-taian-20250724' && locked?.filename === 'shandong-taian-20250724.csv') ||
          (source.id === 'sd-jinan-20250721' && locked?.filename === 'shandong-jinan-202507210938.csv') ||
          (source.id === 'sd-weifang-20261110' && locked?.filename === 'shandong-weifang-20261110.csv') ||
          (source.id === 'zj-prov-20260902' && locked?.filename === 'zhejiang-provincial-yljg-20260902.csv');
        const allowedZipSource = source.id === 'zj-wz-20220826' &&
          locked?.filename === 'wenzhou-care-homes-6724-current-20261117.zip';
        const rowCountsMatch = source.id === 'zj-prov-20260902'
          ? locked?.rowCount === 1147 && source.rowCount === 674
          : locked?.rowCount === source.rowCount;
        return !locked || locked.sha256 !== source.sha256 || !rowCountsMatch ||
          typeof locked.filename !== 'string' || (!/^[a-z0-9-]+\.(?:html|xlsx|pdf|docx)$/.test(locked.filename) && !allowedJsonSource && !allowedCsvSource && !allowedZipSource) ||
          !Number.isSafeInteger(locked.bytes) || locked.bytes <= 0;
      })) throw new Error('官方来源快照与锁定清单不一致');
    }
    const sourceById = new Map(manifest.sources.map(source => [source.id, source]));
    const sourceRows = new Map(manifest.sources.map(source => [source.id, new Set<number>()]));
    const expectedIndexes = new Map<string, { provinceSlug: string; citySlug: string; provinceName: string; cityName: string; count: number }>();
    for (const province of manifest.provinces) {
      for (const city of province.cities) {
        expectedIndexes.set('data/national-official/' + city.indexPath, {
          provinceSlug: province.slug, citySlug: city.slug, provinceName: province.name, cityName: city.name, count: city.count,
        });
      }
    }
    if (officialIndexes.size !== expectedIndexes.size) throw new Error('官方来源城市索引缺失或多余');
    const expectedChunks = new Map<string, Map<string, OfficialRecordIdentity>>();
    const allIds = new Set<string>();
    for (const [indexPath, expected] of expectedIndexes) {
      const index = officialIndexes.get(indexPath);
      if (!index || index.snapshotId !== manifest.snapshotId ||
        index.provinceSlug !== expected.provinceSlug || index.citySlug !== expected.citySlug ||
        index.records.length !== expected.count) throw new Error('官方来源城市索引与manifest不一致：' + indexPath);
      for (const record of index.records) {
        const source = sourceById.get(record.sourceId);
        const seenRows = sourceRows.get(record.sourceId);
        const sourceRowStart = source?.id === 'zj-wz-20220826' ? 2 : 1;
        const sourceRowLimit = source?.id === 'zj-prov-20260902' ? 1147 : (source?.rowCount ?? 0) + sourceRowStart - 1;
        if (!source || !seenRows || source.province !== expected.provinceName || (source.city !== null && source.city !== expected.cityName) ||
          record.rowNumber < sourceRowStart || record.rowNumber > sourceRowLimit || seenRows.has(record.rowNumber) ||
          (source.id === 'zj-prov-20260902' && record.id !== source.id + '-' + String(record.rowNumber).padStart(4, '0'))) {
          throw new Error('官方来源地区或来源行号无效、超范围或重复：' + indexPath);
        }
        seenRows.add(record.rowNumber);
        if (allIds.has(record.id)) throw new Error('官方来源重复记录ID：' + record.id);
        allIds.add(record.id);
        const chunkPath = path.posix.join(path.posix.dirname(indexPath), record.chunk);
        let expectedRecords = expectedChunks.get(chunkPath);
        if (!expectedRecords) { expectedRecords = new Map(); expectedChunks.set(chunkPath, expectedRecords); }
        expectedRecords.set(record.id, record);
      }
    }
    for (const source of manifest.sources) {
      if (sourceRows.get(source.id)?.size !== source.rowCount) throw new Error('官方来源公开行未被完整覆盖：' + source.id);
    }
    if (allIds.size !== manifest.rowCount || officialChunks.size !== expectedChunks.size) {
      throw new Error('官方来源记录数或详情分块缺失');
    }
    for (const [chunkPath, expectedRecords] of expectedChunks) {
      const chunk = officialChunks.get(chunkPath);
      if (!chunk || chunk.snapshotId !== manifest.snapshotId || chunk.records.length !== expectedRecords.size ||
        new Set(chunk.records.map(record => record.id)).size !== chunk.records.length ||
        chunk.records.some(record => {
          const expected = expectedRecords.get(record.id);
          return !expected || expected.sourceId !== record.sourceId || expected.rowNumber !== record.rowNumber ||
            expected.name !== record.name || expected.address !== record.address || expected.beds !== record.beds;
        })) throw new Error('官方来源详情分块与索引不一致：' + chunkPath);
    }
  }
  if (institutionReferenceFiles.size > 0 || requireInstitutionReference) {
    validateInstitutionReferenceFiles(institutionReferenceFiles, institutionReferenceLock);
  }
  if (institutionLinkFiles.size > 0 || requireInstitutionLinks) {
    validateInstitutionReferenceLinks(institutionLinkFiles, institutionReferenceFiles, officialReferenceFiles, guangdongReferenceContent);
  }
  if (institutionRegistryLinkFiles.size > 0 || requireInstitutionRegistryLinks) {
    if (!nationalManifest) throw new Error('机构线索—登记主体关联缺少全国主体manifest');
    validateInstitutionRegistryLinks(institutionRegistryLinkFiles, institutionReferenceFiles,
      nationalManifest, nationalIndexes, nationalChunks, guangdongRegistryFiles);
  }
  if (filesScanned === 0) throw new Error('公开输出没有可扫描文件，不能判定隔离成功。');
  return { filesScanned };
}

async function main() {
  let identifiers: string[] = [];
  const privateCsv = 'data/private/registration_status_all235.csv';
  if (existsSync(privateCsv)) {
    const rows = parse(await readFile(privateCsv, 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
    identifiers = [...new Set(rows.map((row) => row['统一社会信用代码']).filter(Boolean))];
  }
  const officialRows = parse(await readFile('data/raw/family_fields_official.csv', 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const withheldMobileNumbers = [...new Set(officialRows.map((row) => row['电话号码']?.replace(/[\s-]/g, '') ?? '').filter((number) => /^1\d{10}$/.test(number)))];
  const sourceLock = JSON.parse(await readFile('data/raw/qcc-national-source-manifest.json', 'utf8')) as NationalSourceLock;
  if (sourceLock.schemaVersion !== 1 || sourceLock.rowCount !== 141364 || sourceLock.sourceFiles?.length !== 25) {
    throw new Error('QCC全国锁定来源清单与审核批次不一致');
  }
  const officialLock = JSON.parse(await readFile('data/raw/national-official-source-manifest.json', 'utf8')) as OfficialSourceLock;
  const institutionReferenceLock = JSON.parse(await readFile('data/raw/qcc-institutions-source-manifest.json', 'utf8')) as InstitutionReferenceLock;
  const result = await scanPublicOutput('out', identifiers, withheldMobileNumbers, true, sourceLock, true, officialLock, true, institutionReferenceLock, true, true);
  console.log('公开隔离扫描通过：' + result.filesScanned + '个文件；' + (identifiers.length ? '包含本机已知标识检查' : '无私有输入，已检查工商字段特征') + '。');
}

if (path.basename(process.argv[1] ?? '') === 'check-public-output.ts') {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
