/** Import the locked 2026-11-23 institutional detail CSV into a reviewed public projection. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { MCA_CSV_COLUMNS } from '../lib/mca-catalog-types';
import type { McaCatalogChargeItem, McaCatalogCsvDetail, McaCatalogCsvFields,
  McaCatalogIndex, McaCatalogIndexRecord, McaCatalogManifest } from '../lib/mca-catalog-types';
import type { McaPreviewResolved } from '../lib/mca-preview-dto';
import type { McaPublicIndex, McaPublicManifest } from '../lib/mca-public-types';

const PROJECT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OBSERVED = path.join(PROJECT, 'public/data/mca-observed');
export const MCA_CATALOG_PUBLIC_DIR = path.join(PROJECT, 'public/data/mca-catalog');
export const MCA_CATALOG_SOURCE_SHA256 = 'd11c1916f5020a9cb2ea69a2f92ec7e4c881a1247cb4a744a4d968d8b8d4330a';
const CSV_ROW_COUNT = 3497;
const ID_PATTERN = /^(?:[a-fA-F0-9]{32}|[0-9]{18})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export interface McaCatalogProjection {
  manifest: McaCatalogManifest;
  index: McaCatalogIndex;
  /** CSV details only. Existing observed details remain in their own source directory. */
  details: McaCatalogCsvDetail[];
}

function hash(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function text(raw: string): string | null {
  const value = raw.trim();
  return value === '' ? null : value;
}

function required(raw: string, field: string, row: number): string {
  const value = text(raw);
  if (value === null) throw new Error('CSV row ' + row + ' missing required field ' + field);
  return value;
}

function number(raw: string, field: string, row: number, integer = false): number | null {
  const value = text(raw);
  if (value === null) return null;
  if (value.startsWith('-')) throw new Error('CSV row ' + row + ' negative number ' + field);
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('CSV row ' + row + ' invalid number ' + field);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed))) {
    throw new Error('CSV row ' + row + ' invalid number ' + field);
  }
  if (parsed < 0) throw new Error('CSV row ' + row + ' negative number ' + field);
  return parsed;
}

function list(raw: string): string[] | null {
  const value = text(raw);
  return value === null ? null : value.split(/[,，]/).map(item => item.trim()).filter(Boolean);
}

function date(raw: string, row: number): string | null {
  const value = text(raw);
  if (value === null) return null;
  const normalized = value.endsWith(' 00:00:00') ? value.slice(0, 10) : value;
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(Date.parse(normalized + 'T00:00:00Z')) ||
    new Date(normalized + 'T00:00:00Z').toISOString().slice(0, 10) !== normalized) {
    throw new Error('CSV row ' + row + ' invalid found_date');
  }
  return normalized;
}

function localTimestamp(raw: string, row: number): string {
  const value = required(raw, 'updated_at', row);
  if (!LOCAL_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value + 'Z'))) {
    throw new Error('CSV row ' + row + ' invalid updated_at');
  }
  return value;
}

function jsonArray(raw: string, field: string, row: number): unknown[] | null {
  const value = text(raw);
  if (value === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error('CSV row ' + row + ' invalid JSON ' + field); }
  if (!Array.isArray(parsed)) throw new Error('CSV row ' + row + ' invalid JSON array ' + field);
  return parsed;
}

function chargeText(value: unknown, field: string, row: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('CSV row ' + row + ' invalid JSON charge text ' + field);
  return text(value);
}

function charges(raw: string, field: string, row: number): McaCatalogChargeItem[] | null {
  const items = jsonArray(raw, field, row);
  if (items === null) return null;
  return items.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item) ||
      Object.keys(item).some(key => !['服务类型', '项目', '价格区间'].includes(key))) {
      throw new Error('CSV row ' + row + ' invalid JSON charge item ' + field + '[' + index + ']');
    }
    const value = item as Record<string, unknown>;
    return {
      serviceType: chargeText(value['服务类型'], field, row),
      project: chargeText(value['项目'], field, row),
      priceRangeText: chargeText(value['价格区间'], field, row),
    };
  });
}

function validateUnpublishedImages(raw: string, row: number): void {
  const items = jsonArray(raw, 'images_json', row);
  if (items?.some(item => typeof item !== 'string')) throw new Error('CSV row ' + row + ' invalid JSON images_json');
}

function range(fields: McaCatalogCsvFields, min: keyof McaCatalogCsvFields,
  max: keyof McaCatalogCsvFields, row: number): void {
  const lower = fields[min], upper = fields[max];
  if (typeof lower === 'number' && typeof upper === 'number' && lower > upper) {
    throw new Error('CSV row ' + row + ' reversed range ' + min + '/' + max);
  }
}

function parseFields(rowData: Record<string, string>, row: number): McaCatalogCsvFields {
  const id = required(rowData.org_id, 'org_id', row);
  if (!ID_PATTERN.test(id)) throw new Error('CSV row ' + row + ' malformed ID');
  const status = required(rowData.status, 'status', row);
  if (status !== 'ok' && status !== 'stale') throw new Error('CSV row ' + row + ' invalid collector status');
  const areaCode = required(rowData.area_code, 'area_code', row);
  if (!/^\d{12}$/.test(areaCode)) throw new Error('CSV row ' + row + ' invalid area_code');
  validateUnpublishedImages(rowData.images_json, row);
  const fields: McaCatalogCsvFields = {
    org_id: id,
    name: required(rowData.name, 'name', row),
    org_type: required(rowData.org_type, 'org_type', row),
    area: required(rowData.area, 'area', row),
    area_code: areaCode,
    address: text(rowData.address),
    contact: text(rowData.contact),
    phone: text(rowData.phone),
    found_date: date(rowData.found_date, row),
    building_area: number(rowData.building_area, 'building_area', row),
    tags: list(rowData.tags),
    services: list(rowData.services),
    total_beds: number(rowData.total_beds, 'total_beds', row, true),
    beds: number(rowData.beds, 'beds', row, true),
    nursing_beds: number(rowData.nursing_beds, 'nursing_beds', row, true),
    fee_month_min: number(rowData.fee_month_min, 'fee_month_min', row),
    fee_month_max: number(rowData.fee_month_max, 'fee_month_max', row),
    fee_bed_min: number(rowData.fee_bed_min, 'fee_bed_min', row),
    fee_bed_max: number(rowData.fee_bed_max, 'fee_bed_max', row),
    fee_care_min: number(rowData.fee_care_min, 'fee_care_min', row),
    fee_care_max: number(rowData.fee_care_max, 'fee_care_max', row),
    fee_meal_min: number(rowData.fee_meal_min, 'fee_meal_min', row),
    fee_meal_max: number(rowData.fee_meal_max, 'fee_meal_max', row),
    intro: text(rowData.intro),
    service_detail: text(rowData.service_detail),
    service_team: text(rowData.service_team),
    service_time: text(rowData.service_time),
    service_radius: text(rowData.service_radius),
    service_radius_explain: text(rowData.service_radius_explain),
    point: text(rowData.point),
    risk_level: text(rowData.risk_level),
    evaluation: number(rowData.evaluation, 'evaluation', row),
    eval_count: number(rowData.eval_count, 'eval_count', row, true),
    fee_detail_json: charges(rowData.fee_detail_json, 'fee_detail_json', row),
    status,
    updated_at: localTimestamp(rowData.updated_at, row),
    cx_beds: number(rowData.cx_beds, 'cx_beds', row, true),
    cx_nursing_beds: number(rowData.cx_nursing_beds, 'cx_nursing_beds', row, true),
    cx_fee_day_min: number(rowData.cx_fee_day_min, 'cx_fee_day_min', row),
    cx_fee_day_max: number(rowData.cx_fee_day_max, 'cx_fee_day_max', row),
    cx_fee_detail_json: charges(rowData.cx_fee_detail_json, 'cx_fee_detail_json', row),
    rt_beds: number(rowData.rt_beds, 'rt_beds', row, true),
    rt_nursing_beds: number(rowData.rt_nursing_beds, 'rt_nursing_beds', row, true),
    rt_fee_day_min: number(rowData.rt_fee_day_min, 'rt_fee_day_min', row),
    rt_fee_day_max: number(rowData.rt_fee_day_max, 'rt_fee_day_max', row),
    rt_fee_detail_json: charges(rowData.rt_fee_detail_json, 'rt_fee_detail_json', row),
    home_fee_time_min: number(rowData.home_fee_time_min, 'home_fee_time_min', row),
    home_fee_time_max: number(rowData.home_fee_time_max, 'home_fee_time_max', row),
    home_service_project: text(rowData.home_service_project),
    assess_fee_home: number(rowData.assess_fee_home, 'assess_fee_home', row),
    assess_fee_site: number(rowData.assess_fee_site, 'assess_fee_site', row),
  };
  for (const [min, max] of [
    ['fee_month_min', 'fee_month_max'], ['fee_bed_min', 'fee_bed_max'],
    ['fee_care_min', 'fee_care_max'], ['fee_meal_min', 'fee_meal_max'],
    ['cx_fee_day_min', 'cx_fee_day_max'], ['rt_fee_day_min', 'rt_fee_day_max'],
    ['home_fee_time_min', 'home_fee_time_max'],
  ] as const) range(fields, min, max, row);
  return fields;
}

function parseCsv(source: Buffer): McaCatalogCsvFields[] {
  let parsed: string[][];
  try { parsed = parse(source, { bom: true, skip_empty_lines: true, relax_column_count: true }) as string[][]; }
  catch (error) { throw new Error('Malformed institution CSV: ' + String(error)); }
  const header = parsed.shift();
  if (!header || header.length !== MCA_CSV_COLUMNS.length ||
    header.some((name, index) => name !== MCA_CSV_COLUMNS[index])) throw new Error('CSV header/column layout changed');
  const seen = new Set<string>();
  return parsed.map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== MCA_CSV_COLUMNS.length) throw new Error('CSV row ' + rowNumber + ' column count changed');
    const rowData = Object.fromEntries(MCA_CSV_COLUMNS.map((key, i) => [key, cells[i]])) as Record<string, string>;
    const fields = parseFields(rowData, rowNumber);
    if (seen.has(fields.org_id)) throw new Error('CSV duplicate platform ID ' + fields.org_id);
    seen.add(fields.org_id);
    return fields;
  });
}

function resolved<T>(value: T | null): McaPreviewResolved<T> {
  return value === null ? { state: 'missing', value: null, observationCount: 0 } :
    { state: 'observed', value, observationCount: 1 };
}

function regionPath(area: string): string {
  const province = ['内蒙古自治区', '北京市', '天津市', '河北省', '山西省'].find(name => area.startsWith(name));
  if (!province) throw new Error('Unsupported province in CSV area: ' + area);
  const remainder = area.slice(province.length);
  if (!remainder) return province;
  if (province === '北京市' || province === '天津市') return province + '/' + remainder;
  if (remainder.startsWith('雄安新区')) return province + '/雄安新区' +
    (remainder.length > 4 ? '/' + remainder.slice(4) : '');
  const city = remainder.match(/^(.*?(?:市|盟|自治州|地区))(.*)$/);
  return city ? province + '/' + city[1] + (city[2] ? '/' + city[2] : '') : province + '/' + remainder;
}

function csvIndex(fields: McaCatalogCsvFields, old: McaCatalogIndexRecord | undefined): McaCatalogIndexRecord {
  return {
    mcaId: fields.org_id,
    detailPath: 'details/' + hash(fields.org_id) + '.v1.json',
    name: fields.name,
    facilityTypeCode: null,
    facilityTypeLabel: fields.org_type,
    areaCode: fields.area_code,
    regionLabel: fields.area,
    regionPath: regionPath(fields.area),
    address: fields.address,
    listedBeds: fields.total_beds,
    nursingBeds: fields.nursing_beds,
    listedMonthlyFeeMin: fields.fee_month_min,
    listedMonthlyFeeMax: fields.fee_month_max,
    platformStarCode: null,
    evaluationCount: fields.eval_count,
    overallEvaluation: fields.evaluation,
    functionPositioningLabel: null,
    platformTagsRaw: fields.tags?.join(',') ?? null,
    hasDetail: true,
    listObservationCount: 0,
    detailObservationCount: 1,
    conflictFields: old?.listedBeds !== null && old?.listedBeds !== undefined &&
      fields.total_beds !== null && old.listedBeds !== fields.total_beds ? ['listedBeds'] : [],
    listedContactPhone: resolved(fields.phone),
    serviceCategoryLabel: resolved(fields.services?.join(',') ?? null),
    subsidyCode: resolved<string>(null),
    dayCareBeds: resolved(fields.rt_beds),
    fullCareBeds: resolved(fields.beds),
    listObservedAtUtc: null,
    sourceKind: 'csv',
    collectorStatus: fields.status,
    csvUpdatedAtLocal: fields.updated_at,
  };
}

export function buildMcaCatalogProjection(source: Buffer, observedManifest: McaPublicManifest,
  observedIndex: McaPublicIndex, generatedAtUtc: string): McaCatalogProjection {
  if (observedManifest.snapshotId !== observedIndex.snapshotId ||
    observedManifest.recordCount !== observedIndex.records.length) throw new Error('Observed manifest/index mismatch');
  if (Number.isNaN(Date.parse(generatedAtUtc)) || !generatedAtUtc.endsWith('Z')) {
    throw new Error('Invalid UTC generation timestamp');
  }
  const fields = parseCsv(source);
  const sourceCsvSha256 = hash(source);
  const snapshotId = 'catalog-' + hash(sourceCsvSha256 + ':' + observedManifest.snapshotId).slice(0, 24);
  const records = new Map<string, McaCatalogIndexRecord>(observedIndex.records.map(record =>
    [record.mcaId, { ...record, sourceKind: 'observed' as const,
      collectorStatus: null, csvUpdatedAtLocal: null }]));
  const details: McaCatalogCsvDetail[] = [];
  let overlapCount = 0;
  for (const row of fields) {
    const old = records.get(row.org_id);
    if (old) overlapCount++;
    records.set(row.org_id, csvIndex(row, old));
    details.push({ schemaVersion: 1, snapshotId, mcaId: row.org_id, sourceKind: 'csv', fields: row });
  }
  const indexRecords = [...records.values()].sort((a, b) => a.mcaId < b.mcaId ? -1 : a.mcaId > b.mcaId ? 1 : 0);
  return {
    manifest: {
      schemaVersion: 1, scope: 'partial_mca_csv_catalog', snapshotId,
      observedSnapshotId: observedManifest.snapshotId, sourceCsvSha256,
      csvExportDate: '2026-11-23', generatedAtUtc, csvRowCount: fields.length,
      csvStaleCount: fields.filter(item => item.status === 'stale').length,
      observedRecordCount: observedIndex.records.length, overlapCount,
      recordCount: indexRecords.length, detailCount: indexRecords.filter(item => item.hasDetail).length,
      nationalComplete: false, currentStatusVerified: false,
    },
    index: { schemaVersion: 1, snapshotId, records: indexRecords },
    details,
  };
}

function writeJson(file: string, data: unknown): void {
  writeFileSync(file, JSON.stringify(data) + '\n', 'utf8');
}

/** Stages a complete replacement before switching the public directory. */
export function publishMcaCatalogProjection(projection: McaCatalogProjection, outputDir: string): void {
  const parent = path.dirname(outputDir);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(path.join(parent, '.mca-catalog-stage-'));
  const backup = path.join(parent, '.mca-catalog-backup-' + randomUUID());
  let movedExisting = false;
  try {
    mkdirSync(path.join(stage, 'details'));
    writeJson(path.join(stage, 'manifest.v1.json'), projection.manifest);
    writeJson(path.join(stage, 'index.v1.json'), projection.index);
    for (const detail of projection.details) {
      writeJson(path.join(stage, 'details', hash(detail.mcaId) + '.v1.json'), detail);
    }
    if (existsSync(outputDir)) {
      const entries = readdirSync(outputDir).sort();
      if (entries.join(',') !== 'details,index.v1.json,manifest.v1.json') {
        throw new Error('Refusing to overwrite non-catalog files in ' + outputDir);
      }
      const previous = JSON.parse(readFileSync(path.join(outputDir, 'index.v1.json'), 'utf8')) as McaCatalogIndex;
      const expectedDetails = previous.records.filter(item => item.sourceKind === 'csv')
        .map(item => hash(item.mcaId) + '.v1.json').sort();
      const actualDetails = readdirSync(path.join(outputDir, 'details')).sort();
      if (expectedDetails.length !== actualDetails.length ||
        expectedDetails.some((name, index) => name !== actualDetails[index])) {
        throw new Error('Refusing to overwrite unexpected or unreviewed catalog detail files');
      }
      renameSync(outputDir, backup);
      movedExisting = true;
    }
    renameSync(stage, outputDir);
    if (movedExisting) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedExisting && !existsSync(outputDir)) renameSync(backup, outputDir);
    throw error;
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}

function cli(): void {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--input') throw new Error('Usage: tsx scripts/import-mca-catalog.ts --input <CSV path>');
  const source = readFileSync(args[1]);
  const actualSha256 = hash(source);
  if (actualSha256 !== MCA_CATALOG_SOURCE_SHA256) throw new Error('CSV SHA-256 differs from reviewed source');
  const observedManifest = JSON.parse(readFileSync(path.join(OBSERVED, 'manifest.v1.json'), 'utf8')) as McaPublicManifest;
  const observedIndex = JSON.parse(readFileSync(path.join(OBSERVED, 'index.v1.json'), 'utf8')) as McaPublicIndex;
  const projection = buildMcaCatalogProjection(source, observedManifest, observedIndex, new Date().toISOString());
  if (projection.manifest.csvRowCount !== CSV_ROW_COUNT || projection.manifest.csvStaleCount !== 3 ||
    projection.manifest.observedRecordCount !== 3726 || projection.manifest.overlapCount !== 703 ||
    projection.manifest.recordCount !== 6520 || projection.manifest.detailCount !== 3597) {
    throw new Error('Catalog release counts differ from reviewed source');
  }
  publishMcaCatalogProjection(projection, MCA_CATALOG_PUBLIC_DIR);
  console.log('MCA catalog: ' + projection.manifest.recordCount + ' index, ' +
    projection.manifest.detailCount + ' details (' + projection.manifest.csvRowCount + ' CSV rows), SHA-256 ' + actualSha256);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
