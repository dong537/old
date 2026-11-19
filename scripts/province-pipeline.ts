import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const OBSERVATION_FIELDS = ['city', 'institution_name', 'source_url', 'source_published_at', 'source_as_of', 'source_file', 'evidence_type', 'details'];
const COMPANY_FIELDS = ['企业名称', '统一社会信用代码', '登记状态', '来源URL', '证据状态限制'];
const CLAIM_FIELDS: Record<string, string> = {
  address_as_published: 'address', address: 'address',
  beds_as_published: 'beds_as_published', beds: 'beds_as_published',
  district_as_published: 'district', district: 'district', '区': 'district',
  status_as_published: 'source_status', operating_status: 'source_status',
  institution_nature_as_published: 'institution_nature', institution_nature: 'institution_nature', nature_as_published: 'institution_nature',
  medical_integration_as_published: 'medical_integration',
  filing_number_as_published: 'filing_number', filing_date_excel_serial_as_published: 'filing_date_raw',
  nursing_beds_as_published: 'nursing_beds_as_published', total_beds_as_published: 'beds_as_published',
  star_level_as_published: 'star_level_as_published',
  star_level: 'star_level_as_published',
};
const POINTER_FIELDS = ['source_row', 'source_row_number', '原始序号', 'official_sequence', 'source_excel_row', 'physical_row'];
const SHA_FIELDS = ['source_sha256', 'source_page_sha256', 'sha256'];

type Row = Record<string, string>;
type Detail = Record<string, unknown>;
type DatePrecision = 'missing' | 'day' | 'month' | 'year' | 'datetime_unzoned' | 'unparsed';
interface ParsedDate { raw: string | null; normalized: string | null; isoDate: string | null; precision: DatePrecision }
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const scalar = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value).trim() || null : null;

function parsedDate(raw: string | null): ParsedDate {
  if (!raw) return { raw, normalized: null, isoDate: null, precision: 'missing' };
  const datetime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) ?? /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(raw);
  const match = datetime ?? day;
  if (match) {
    const year = Number(match[1]); const month = Number(match[2]); const date = Number(match[3]);
    const validDay = month >= 1 && month <= 12 && date >= 1 && date <= 31 &&
      new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10) ===
        [match[1], String(month).padStart(2, '0'), String(date).padStart(2, '0')].join('-');
    const validTime = !datetime || (Number(datetime[4]) < 24 && Number(datetime[5]) < 60 && (!datetime[6] || Number(datetime[6]) < 60));
    if (validDay && validTime) {
      const isoDate = [match[1], String(month).padStart(2, '0'), String(date).padStart(2, '0')].join('-');
      return { raw, normalized: isoDate, isoDate, precision: datetime ? 'datetime_unzoned' : 'day' };
    }
  }
  const month = /^(\d{4})-(\d{2})$/.exec(raw);
  if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) return { raw, normalized: raw, isoDate: null, precision: 'month' };
  if (/^\d{4}$/.test(raw)) return { raw, normalized: raw, isoDate: null, precision: 'year' };
  return { raw, normalized: null, isoDate: null, precision: 'unparsed' };
}

function metadataField(key: string): boolean {
  return key === 'city' || key === '原始序号' || key.startsWith('source_') || key.endsWith('_sha256') || key === 'sha256' ||
    ['catalog_id', 'dataset_res_id', 'json_pointer', 'pdf_page', 'physical_row', 'printed_row',
      'official_sequence', 'sequence_as_published', 'actual_preview_rows', 'obtained_preview_rows',
      'platform_record_count_as_published', 'record_total_metadata', 'data_update_time_metadata',
      'data_update_time_as_published', 'row_increment_time_as_published', 'row_sync_time_as_published',
      'scope', 'published_scope'].includes(key);
}

function rows(csv: string, fields: string[], exact: boolean, label: string): Row[] {
  const matrix = parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: false }) as string[][];
  const header = matrix[0];
  if (!header || new Set(header).size !== header.length || fields.some((field, index) => exact ? header[index] !== field : !header.includes(field)) || (exact && header.length !== fields.length)) {
    throw new Error(label + ' CSV表头不符合已审查的输入结构。');
  }
  return matrix.slice(1).map((cells) => Object.fromEntries(header.map((field, index) => [field, cells[index]])));
}

function detailObject(raw: string, inputLine: number): Detail {
  if (!raw) return {};
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch (error) { throw new Error('第' + inputLine + '行details不是合法JSON。', { cause: error }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('第' + inputLine + '行details必须是JSON对象。');
  return value as Detail;
}

function sourceUrl(value: string, label: string): string {
  const trimmed = value.trim();
  let url: URL;
  try { url = new URL(trimmed); }
  catch (error) { throw new Error(label + ' source_url不是合法URL。', { cause: error }); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error(label + ' source_url必须是HTTP(S)地址。');
  return trimmed;
}

function pointer(detail: Detail, inputLine: number): string {
  for (const key of POINTER_FIELDS) {
    const value = scalar(detail[key]);
    if (value) return key + ':' + value;
  }
  return 'input_line:' + inputLine;
}

function sourceSha(detail: Detail): string | null {
  for (const key of SHA_FIELDS) {
    const value = scalar(detail[key]);
    if (value) return value;
  }
  return null;
}

// Candidate matching deliberately does not strip suffixes, infer aliases, or merge service points.
export function normalizeCandidateName(name: string): string {
  return name.replace(/\s+/gu, '').replaceAll('(', '（').replaceAll(')', '）');
}

export function assertPrivateOutputPath(projectRoot: string, destination: string): void {
  const privateRoot = path.resolve(projectRoot, 'data', 'private').toLowerCase() + path.sep;
  if (!path.resolve(destination).toLowerCase().startsWith(privateRoot)) {
    throw new Error('审核产物只能写入 data/private。');
  }
}

interface SourceDocument {
  id: string; url: string; publishedAt: string | null; sourceFile: string; sourceSha256s: string[];
}
interface Observation {
  id: string; candidateKey: string; inputLine: number; city: string; name: string;
  sourceDocumentId: string; sourceUrl: string; publishedAt: string | null; asOfRaw: string | null;
  asOf: string | null; retrievedAt: string | null;
  publishedDate: ParsedDate; asOfDate: ParsedDate; detailPublishedDate: ParsedDate; detailAsOfDate: ParsedDate;
  sourcePeriod: string | null; sourceFile: string; evidenceType: string; sourcePointer: string; sourceSha256: string | null;
  rawRow: Row; rawDetails: Detail;
}
interface Claim {
  id: string; observationId: string; candidateKey: string; field: string; rawField: string; value: unknown;
  fieldRole: 'business' | 'source_metadata';
  sourceDocumentId: string; sourceUrl: string; publishedAt: string | null; asOfRaw: string | null;
  asOf: string | null; retrievedAt: string | null;
  publishedDate: ParsedDate; asOfDate: ParsedDate;
  sourcePeriod: string | null; sourcePointer: string; sourceSha256: string | null;
}
interface CandidateGroup {
  candidateKey: string; city: string; normalizedName: string; displayNames: string[];
  observationIds: string[]; institutionId: null; reviewStatus: 'unreviewed';
}
interface CompanyMatchCandidate {
  candidateKey: string; companyCreditCode: string; companyName: string; companyStatus: string | null;
  companySourceUrlRaw: string; companySourceUrls: string[];
  evidenceStatusLimit: string | null; relationshipVerified: false;
}
interface StatusReview {
  candidateKey: string; city: string; displayNames: string[];
  reasons: ('possible_stop_or_pause' | 'different_raw_statuses')[];
  signals: { value: string; rawField: string; observationId: string; publishedAt: string | null; asOf: string | null }[];
}
interface MetadataReview {
  observationId: string; candidateKey: string; city: string; name: string; sourceUrl: string;
  reasons: ('detail_city_differs' | 'detail_published_at_differs' | 'detail_as_of_differs' | 'retrieval_date_in_source_as_of')[];
  topLevelCity: string; detailCity: string | null;
  topLevelPublishedAt: string | null; detailPublishedAt: string | null;
  topLevelAsOf: string | null; detailAsOf: string | null; retrievedAt: string | null;
}
interface IdentityPairReview {
  leftCandidateKey: string; rightCandidateKey: string; city: string;
  leftName: string; rightName: string; reasons: ('same_address_ignoring_whitespace' | 'same_source_row_pointer')[];
  evidence: { leftObservationId: string; rightObservationId: string; leftRawAddress: string | null;
    rightRawAddress: string | null; sourceUrl: string | null; sourcePointer: string | null }[];
  identityVerified: false;
}

export interface ProvinceReview {
  manifest: {
    schemaVersion: 1; inputSha256: string; companyInputSha256: string | null;
    sourceRows: number; cityCount: number; sourceUrlCount: number; sourceDocumentCount: number;
    candidateNameKeysNotEntities: number; approvedInstitutions: 0; topLevelAsOfMissing: number;
    topLevelPublishedNotPureDate: number; detailCityRawDifferences: number; detailPublishedRawDifferences: number;
    retrievalDateMisfiledCount: number;
    detailFieldCount: number; sourceShaMissing: number; companyRows: number; companyMatchCandidates: number;
    companyMultiUrlRows: number; asOfPrecisionCounts: Record<DatePrecision, number>;
    publishedPrecisionCounts: Record<DatePrecision, number>;
    statusReviewCandidates: number; metadataReviewRows: number; identityPairReviewCandidates: number;
    interpretation: string;
  };
  sourceDocuments: SourceDocument[]; observations: Observation[]; claims: Claim[];
  candidateGroups: CandidateGroup[]; companyMatchCandidates: CompanyMatchCandidate[];
  statusReviewQueue: StatusReview[]; metadataReviewQueue: MetadataReview[];
  identityPairReviewQueue: IdentityPairReview[];
  detailFieldInventory: { rawField: string; canonicalField: string; fieldRole: Claim['fieldRole']; rows: number; nonempty: number }[];
}

export function buildProvinceReview(observationCsv: string, companyCsv?: string): ProvinceReview {
  const inputRows = rows(observationCsv, OBSERVATION_FIELDS, true, '机构观察');
  const documents = new Map<string, SourceDocument>();
  const groups = new Map<string, CandidateGroup>();
  const duplicateContent = new Map<string, number>();
  const observations: Observation[] = [];
  const claims: Claim[] = [];
  const metadataReviewQueue: MetadataReview[] = [];
  const detailFieldCounts = new Map<string, { rows: number; nonempty: number }>();
  let topLevelAsOfMissing = 0;
  let topLevelPublishedNotPureDate = 0;
  let detailCityRawDifferences = 0;
  let detailPublishedRawDifferences = 0;
  let retrievalDateMisfiledCount = 0;

  for (const [index, row] of inputRows.entries()) {
    const inputLine = index + 2;
    const city = row.city.trim();
    const name = row.institution_name.trim();
    if (!city || !name || !row.source_file.trim()) throw new Error('第' + inputLine + '行缺城市、机构名或来源文件。');
    const url = sourceUrl(row.source_url, '第' + inputLine + '行');
    const detail = detailObject(row.details, inputLine);
    const publishedAt = row.source_published_at.trim() || null;
    const topLevelAsOf = row.source_as_of.trim() || null;
    if (!topLevelAsOf) topLevelAsOfMissing++;
    if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) topLevelPublishedNotPureDate++;
    const retrievalMatch = topLevelAsOf && /^(\d{4}-\d{2}-\d{2})采集$/.exec(topLevelAsOf);
    const retrievedAt = retrievalMatch ? retrievalMatch[1] : null;
    if (retrievedAt) retrievalDateMisfiledCount++;
    const asOfDate = retrievedAt ? parsedDate(null) : parsedDate(topLevelAsOf);
    const asOf = asOfDate.normalized;
    const detailPublishedAt = scalar(detail.source_published_at);
    const detailAsOf = scalar(detail.source_as_of);
    const detailCity = scalar(detail.city);
    const sourcePeriod = scalar(detail.source_period) ?? scalar(detail.source_period_as_published);
    const sha = sourceSha(detail);
    const sourceFile = row.source_file.trim();
    const documentId = 'doc-' + hash([url, publishedAt ?? '', sourceFile].join('\0'));
    const existingDocument = documents.get(documentId);
    if (existingDocument) {
      if (sha && !existingDocument.sourceSha256s.includes(sha)) existingDocument.sourceSha256s.push(sha);
    } else {
      documents.set(documentId, { id: documentId, url, publishedAt, sourceFile, sourceSha256s: sha ? [sha] : [] });
    }
    const normalizedName = normalizeCandidateName(name);
    const candidateKey = 'candidate-' + hash(city + '\0' + normalizedName);
    const contentHash = hash(OBSERVATION_FIELDS.map(field => row[field]).join('\0'));
    const duplicateOrdinal = (duplicateContent.get(contentHash) ?? 0) + 1;
    duplicateContent.set(contentHash, duplicateOrdinal);
    const observationId = 'obs-' + hash(contentHash + ':' + duplicateOrdinal);
    const item: Observation = {
      id: observationId, candidateKey, inputLine, city, name, sourceDocumentId: documentId,
      sourceUrl: url, publishedAt, asOfRaw: topLevelAsOf, asOf, retrievedAt, sourcePeriod, sourceFile,
      evidenceType: row.evidence_type, sourcePointer: pointer(detail, inputLine), sourceSha256: sha,
      publishedDate: parsedDate(publishedAt), asOfDate,
      detailPublishedDate: parsedDate(detailPublishedAt), detailAsOfDate: parsedDate(detailAsOf),
      rawRow: { ...row }, rawDetails: detail,
    };
    observations.push(item);
    const metadataReasons: MetadataReview['reasons'] = [];
    if (detailCity && detailCity !== city) { metadataReasons.push('detail_city_differs'); detailCityRawDifferences++; }
    if (detailPublishedAt && detailPublishedAt !== publishedAt) { metadataReasons.push('detail_published_at_differs'); detailPublishedRawDifferences++; }
    if (detailAsOf && topLevelAsOf && detailAsOf !== topLevelAsOf) metadataReasons.push('detail_as_of_differs');
    if (retrievedAt) metadataReasons.push('retrieval_date_in_source_as_of');
    if (metadataReasons.length) {
      metadataReviewQueue.push({ observationId, candidateKey, city, name, sourceUrl: url, reasons: metadataReasons,
        topLevelCity: city, detailCity, topLevelPublishedAt: publishedAt, detailPublishedAt,
        topLevelAsOf, detailAsOf, retrievedAt });
    }
    const group = groups.get(candidateKey);
    if (group) {
      if (!group.displayNames.includes(name)) group.displayNames.push(name);
      group.observationIds.push(observationId);
    } else {
      groups.set(candidateKey, { candidateKey, city, normalizedName, displayNames: [name], observationIds: [observationId], institutionId: null, reviewStatus: 'unreviewed' });
    }
    const addClaim = (field: string, rawField: string, value: unknown, fieldRole: Claim['fieldRole']) => {
      claims.push({
        id: 'claim-' + hash(observationId + '\0' + rawField), observationId, candidateKey,
        field, rawField, value, fieldRole, sourceDocumentId: documentId, sourceUrl: url,
        publishedAt, asOfRaw: topLevelAsOf, asOf, retrievedAt,
        sourcePeriod, sourcePointer: item.sourcePointer, sourceSha256: sha,
        publishedDate: item.publishedDate, asOfDate: item.asOfDate,
      });
    };
    addClaim('name', 'institution_name', row.institution_name, 'business');
    for (const [rawField, value] of Object.entries(detail)) {
      const fieldRole = metadataField(rawField) ? 'source_metadata' : 'business';
      addClaim(CLAIM_FIELDS[rawField] ?? rawField, rawField, value, fieldRole);
      const count = detailFieldCounts.get(rawField) ?? { rows: 0, nonempty: 0 };
      count.rows++;
      if (value !== null && value !== '' && value !== undefined) count.nonempty++;
      detailFieldCounts.set(rawField, count);
    }
  }

  const companyMatchCandidates: CompanyMatchCandidate[] = [];
  let companyRows = 0;
  let companyMultiUrlRows = 0;
  if (companyCsv !== undefined) {
    const companies = rows(companyCsv, COMPANY_FIELDS, false, '工商登记');
    companyRows = companies.length;
    const uniqueCompanies = new Map<string, Row>();
    for (const [index, company] of companies.entries()) {
      const code = company['统一社会信用代码'].trim();
      const name = company['企业名称'].trim();
      if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(code) || !name) throw new Error('工商第' + (index + 2) + '行统一社会信用代码或企业名称无效。');
      const urls = company['来源URL'].split(/\s*\|\s*/u);
      if (!urls.length || urls.some(url => !url.trim())) throw new Error('工商第' + (index + 2) + '行 source_url 含空链接。');
      urls.forEach(url => sourceUrl(url, '工商第' + (index + 2) + '行'));
      if (urls.length > 1) companyMultiUrlRows++;
      const existing = uniqueCompanies.get(code);
      if (existing && existing['企业名称'] !== company['企业名称']) throw new Error('同一统一社会信用代码对应不同企业名称，停止生成。');
      if (!existing) uniqueCompanies.set(code, company);
    }
    const groupsByName = new Map<string, CandidateGroup[]>();
    for (const group of groups.values()) {
      const matches = groupsByName.get(group.normalizedName) ?? [];
      matches.push(group);
      groupsByName.set(group.normalizedName, matches);
    }
    for (const company of uniqueCompanies.values()) {
      for (const group of groupsByName.get(normalizeCandidateName(company['企业名称'].trim())) ?? []) {
        companyMatchCandidates.push({
          candidateKey: group.candidateKey, companyCreditCode: company['统一社会信用代码'].trim(),
          companyName: company['企业名称'].trim(), companyStatus: company['登记状态'].trim() || null,
          companySourceUrlRaw: company['来源URL'],
          companySourceUrls: company['来源URL'].split(/\s*\|\s*/u).map(url => url.trim()),
          evidenceStatusLimit: company['证据状态限制'].trim() || null,
          relationshipVerified: false,
        });
      }
    }
  }

  const statusByGroup = new Map<string, StatusReview['signals']>();
  for (const claim of claims) {
    if (claim.field !== 'source_status') continue;
    const value = scalar(claim.value);
    if (!value) continue;
    const signals = statusByGroup.get(claim.candidateKey) ?? [];
    signals.push({ value, rawField: claim.rawField, observationId: claim.observationId, publishedAt: claim.publishedAt, asOf: claim.asOf });
    statusByGroup.set(claim.candidateKey, signals);
  }
  const statusReviewQueue: StatusReview[] = [];
  for (const group of groups.values()) {
    const signals = statusByGroup.get(group.candidateKey) ?? [];
    const reasons: StatusReview['reasons'] = [];
    if (signals.some(signal => /停业|暂停|暂未运营|注销|撤销|歇业|停止服务/u.test(signal.value))) reasons.push('possible_stop_or_pause');
    if (new Set(signals.map(signal => signal.value)).size > 1) reasons.push('different_raw_statuses');
    if (reasons.length) statusReviewQueue.push({ candidateKey: group.candidateKey, city: group.city, displayNames: group.displayNames, reasons, signals });
  }

  const observationsById = new Map(observations.map(item => [item.id, item]));
  const identityPairs = new Map<string, IdentityPairReview>();
  const addIdentityPair = (a: Observation, b: Observation, reason: IdentityPairReview['reasons'][number],
    aAddress: string | null, bAddress: string | null) => {
    if (a.city !== b.city || a.candidateKey === b.candidateKey) return;
    const [left, right] = [a, b].sort((x, y) => x.candidateKey.localeCompare(y.candidateKey));
    const key = left.candidateKey + ':' + right.candidateKey;
    const pair = identityPairs.get(key) ?? {
      leftCandidateKey: left.candidateKey, rightCandidateKey: right.candidateKey, city: left.city,
      leftName: left.name, rightName: right.name, reasons: [], evidence: [], identityVerified: false,
    };
    if (!pair.reasons.includes(reason)) pair.reasons.push(reason);
    pair.evidence.push({ leftObservationId: left.id, rightObservationId: right.id,
      leftRawAddress: left.id === a.id ? aAddress : bAddress,
      rightRawAddress: right.id === b.id ? bAddress : aAddress,
      sourceUrl: reason === 'same_source_row_pointer' ? left.sourceUrl : null,
      sourcePointer: reason === 'same_source_row_pointer' ? left.sourcePointer : null });
    identityPairs.set(key, pair);
  };
  const addresses = new Map<string, { item: Observation; address: string }[]>();
  for (const claim of claims) {
    if (claim.field !== 'address') continue;
    const address = scalar(claim.value);
    const item = observationsById.get(claim.observationId);
    if (!address || !item) continue;
    // Whitespace-only matching catches source formatting variants; never interpret it as an identity decision.
    const key = item.city + '\0' + address.replace(/\s+/gu, '');
    const bucket = addresses.get(key) ?? [];
    bucket.push({ item, address });
    addresses.set(key, bucket);
  }
  for (const bucket of addresses.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        addIdentityPair(bucket[i].item, bucket[j].item, 'same_address_ignoring_whitespace', bucket[i].address, bucket[j].address);
      }
    }
  }
  const sourcePointers = new Map<string, Observation[]>();
  for (const item of observations) {
    if (item.sourcePointer.startsWith('input_line:')) continue;
    const key = item.sourceUrl + '\0' + item.sourcePointer;
    const bucket = sourcePointers.get(key) ?? [];
    bucket.push(item);
    sourcePointers.set(key, bucket);
  }
  for (const bucket of sourcePointers.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        addIdentityPair(bucket[i], bucket[j], 'same_source_row_pointer', null, null);
      }
    }
  }

  const detailFieldInventory = [...detailFieldCounts].map(([rawField, count]) => ({
    rawField, canonicalField: CLAIM_FIELDS[rawField] ?? rawField,
    fieldRole: metadataField(rawField) ? 'source_metadata' as const : 'business' as const,
    ...count,
  })).sort((a, b) => a.rawField.localeCompare(b.rawField));
  const emptyPrecisionCounts = (): Record<DatePrecision, number> => ({
    missing: 0, day: 0, month: 0, year: 0, datetime_unzoned: 0, unparsed: 0,
  });
  const asOfPrecisionCounts = emptyPrecisionCounts();
  const publishedPrecisionCounts = emptyPrecisionCounts();
  for (const item of observations) {
    asOfPrecisionCounts[item.asOfDate.precision]++;
    publishedPrecisionCounts[item.publishedDate.precision]++;
  }

  return {
    manifest: {
      schemaVersion: 1, inputSha256: hash(observationCsv), companyInputSha256: companyCsv === undefined ? null : hash(companyCsv),
      sourceRows: inputRows.length, cityCount: new Set(observations.map(item => item.city)).size,
      sourceUrlCount: new Set(observations.map(item => item.sourceUrl)).size,
      sourceDocumentCount: documents.size, candidateNameKeysNotEntities: groups.size, approvedInstitutions: 0,
      topLevelAsOfMissing, topLevelPublishedNotPureDate, detailCityRawDifferences, detailPublishedRawDifferences,
      retrievalDateMisfiledCount,
      detailFieldCount: detailFieldInventory.length, sourceShaMissing: observations.filter(item => !item.sourceSha256).length,
      companyRows, companyMultiUrlRows, asOfPrecisionCounts, publishedPrecisionCounts,
      companyMatchCandidates: companyMatchCandidates.length, statusReviewCandidates: statusReviewQueue.length,
      metadataReviewRows: metadataReviewQueue.length, identityPairReviewCandidates: identityPairs.size,
      interpretation: '名称候选组不是已核身份或当前在营机构；同名企业关系和状态信号均待人工审查。',
    },
    sourceDocuments: [...documents.values()], observations, claims, candidateGroups: [...groups.values()],
    companyMatchCandidates, statusReviewQueue, metadataReviewQueue,
    identityPairReviewQueue: [...identityPairs.values()], detailFieldInventory,
  };
}

export function provinceOutputRoot(projectRoot: string): string {
  const destination = path.join(projectRoot, 'data', 'private', 'guangdong-eldercare-source', 'research-batch11', 'province-pipeline');
  assertPrivateOutputPath(projectRoot, destination);
  return destination;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' :
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}

function csvTable(header: string[], rows: unknown[][]): string {
  return '\ufeff' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function renderCandidateCsv(result: ProvinceReview): string {
  const observations = new Map(result.observations.map(item => [item.id, item]));
  const statusReasons = new Map(result.statusReviewQueue.map(item => [item.candidateKey, item.reasons]));
  const metadataReasons = new Map<string, Set<string>>();
  for (const item of result.metadataReviewQueue) {
    const reasons = metadataReasons.get(item.candidateKey) ?? new Set<string>();
    item.reasons.forEach(reason => reasons.add(reason));
    metadataReasons.set(item.candidateKey, reasons);
  }
  const identityReasons = new Map<string, Set<string>>();
  for (const item of result.identityPairReviewQueue) {
    for (const key of [item.leftCandidateKey, item.rightCandidateKey]) {
      const reasons = identityReasons.get(key) ?? new Set<string>();
      item.reasons.forEach(reason => reasons.add(reason));
      identityReasons.set(key, reasons);
    }
  }
  return csvTable(['城市', '原名', '候选键_非机构ID', '观察行数', '来源数', '人工确认', '待核原因'],
    result.candidateGroups.map(group => [
      group.city, group.displayNames.join(' | '), group.candidateKey, group.observationIds.length,
      new Set(group.observationIds.map(id => observations.get(id)?.sourceDocumentId)).size, false,
      [...(statusReasons.get(group.candidateKey) ?? []), ...(metadataReasons.get(group.candidateKey) ?? []),
        ...(identityReasons.get(group.candidateKey) ?? [])].join(' | '),
    ]));
}

export function renderReviewCsv(result: ProvinceReview): string {
  const observations = new Map(result.observations.map(item => [item.id, item]));
  const rows: unknown[][] = [];
  for (const item of result.statusReviewQueue) {
    rows.push(['状态', item.city, item.displayNames.join(' | '), item.candidateKey, '',
      item.signals.length, false, item.reasons.join(' | '),
      item.signals.map(signal => observations.get(signal.observationId)?.sourceUrl), item.signals]);
  }
  for (const item of result.metadataReviewQueue) {
    rows.push(['来源元数据', item.city, item.name, item.candidateKey, '', 1, false,
      item.reasons.join(' | '), item.sourceUrl,
      { observationId: item.observationId, topLevelCity: item.topLevelCity, detailCity: item.detailCity,
        topLevelPublishedAt: item.topLevelPublishedAt, detailPublishedAt: item.detailPublishedAt,
        topLevelAsOf: item.topLevelAsOf, detailAsOf: item.detailAsOf, retrievedAt: item.retrievedAt }]);
  }
  return csvTable(['类型', '城市', '原名', '候选键_非机构ID', '关联候选键', '来源/信号数', '人工确认', '待核原因', '来源URL', '原文证据'], rows);
}

export function renderIdentityPairCsv(result: ProvinceReview): string {
  return csvTable(['城市', '原名A', '候选键A', '原名B', '候选键B', '人工确认', '待核原因', '原文证据'],
    result.identityPairReviewQueue.map(item => [item.city, item.leftName, item.leftCandidateKey,
      item.rightName, item.rightCandidateKey, false, item.reasons.join(' | '), item.evidence]));
}

export function renderFieldInventoryCsv(result: ProvinceReview): string {
  return csvTable(['详情原字段', '归类字段', '字段角色', '出现行数', '非空行数'],
    result.detailFieldInventory.map(item => [item.rawField, item.canonicalField, item.fieldRole, item.rows, item.nonempty]));
}

export function renderProvinceOutputFiles(result: ProvinceReview): Record<string, string> {
  const jsonl = (items: unknown[]) => items.map(item => JSON.stringify(item)).join('\n') + '\n';
  return {
    'source-documents.jsonl': jsonl(result.sourceDocuments),
    'observations.jsonl': jsonl(result.observations),
    'claims.jsonl': jsonl(result.claims),
    'candidate-groups.jsonl': jsonl(result.candidateGroups),
    'company-match-candidates.jsonl': jsonl(result.companyMatchCandidates),
    'status-review-queue.jsonl': jsonl(result.statusReviewQueue),
    'metadata-review-queue.jsonl': jsonl(result.metadataReviewQueue),
    'identity-pair-review-queue.jsonl': jsonl(result.identityPairReviewQueue),
    'detail-field-inventory.json': JSON.stringify(result.detailFieldInventory, null, 2) + '\n',
    '候选机构名称组_待审核.csv': renderCandidateCsv(result),
    '待核状态与来源日期.csv': renderReviewCsv(result),
    '可能同一机构或服务点_待审对.csv': renderIdentityPairCsv(result),
    '详情字段清单.csv': renderFieldInventoryCsv(result),
  };
}

export function verifyProvinceReviewOutput(result: ProvinceReview, savedManifest: unknown,
  files: Record<string, string>): void {
  if (!savedManifest || typeof savedManifest !== 'object' || Array.isArray(savedManifest)) throw new Error('manifest无效。');
  const saved = savedManifest as Record<string, unknown>;
  for (const [key, value] of Object.entries(result.manifest)) {
    if (JSON.stringify(saved[key]) !== JSON.stringify(value)) throw new Error('manifest字段与当前输入不符：' + key);
  }
  const outputSha = saved.outputSha256;
  if (!outputSha || typeof outputSha !== 'object' || Array.isArray(outputSha)) throw new Error('manifest缺输出sha256。');
  const hashes = outputSha as Record<string, unknown>;
  if (Object.keys(hashes).sort().join('|') !== Object.keys(files).sort().join('|')) throw new Error('输出文件清单与sha256不符。');
  for (const [filename, contents] of Object.entries(files)) {
    if (hash(contents) !== hashes[filename]) throw new Error(filename + ' 的 sha256 不匹配。');
  }
  const jsonlCounts: Record<string, number> = {
    'source-documents.jsonl': result.sourceDocuments.length,
    'observations.jsonl': result.observations.length,
    'claims.jsonl': result.claims.length,
    'candidate-groups.jsonl': result.candidateGroups.length,
    'company-match-candidates.jsonl': result.companyMatchCandidates.length,
    'status-review-queue.jsonl': result.statusReviewQueue.length,
    'metadata-review-queue.jsonl': result.metadataReviewQueue.length,
    'identity-pair-review-queue.jsonl': result.identityPairReviewQueue.length,
  };
  for (const [filename, expected] of Object.entries(jsonlCounts)) {
    if (!(filename in files)) continue;
    const actual = files[filename].split(/\r?\n/u).filter(Boolean).length;
    if (actual !== expected) throw new Error(filename + ' 行数不符：' + actual + '/' + expected);
  }
  const csvCounts: Record<string, number> = {
    '候选机构名称组_待审核.csv': result.candidateGroups.length,
    '待核状态与来源日期.csv': result.statusReviewQueue.length + result.metadataReviewQueue.length,
    '可能同一机构或服务点_待审对.csv': result.identityPairReviewQueue.length,
    '详情字段清单.csv': result.detailFieldInventory.length,
  };
  for (const [filename, expected] of Object.entries(csvCounts)) {
    if (!(filename in files)) continue;
    const actual = (parse(files[filename], { bom: true, skip_empty_lines: true }) as string[][]).length - 1;
    if (actual !== expected) throw new Error(filename + ' 行数不符：' + actual + '/' + expected);
  }
  if ('detail-field-inventory.json' in files) {
    const inventory: unknown = JSON.parse(files['detail-field-inventory.json']);
    if (!Array.isArray(inventory) || inventory.length !== result.detailFieldInventory.length) {
      throw new Error('详情字段清单 JSON 行数不符。');
    }
  }
  const regenerated = renderProvinceOutputFiles(result);
  for (const [filename, contents] of Object.entries(files)) {
    if (!(filename in regenerated) || contents !== regenerated[filename]) {
      throw new Error(filename + ' 与当前输入的可再生内容不符。');
    }
  }
}
