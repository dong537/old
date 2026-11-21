import { mcaPreviewFields } from './mca-preview-types';
import type { McaPreviewDetail, McaPreviewDetailObservation, McaPreviewField,
  McaPreviewIndexRecord, McaPreviewObservation, McaJsonValue } from './mca-preview-types';

export type McaPreviewFactState = 'observed' | 'missing' | 'conflict';

export interface McaPreviewCardDto extends Pick<McaPreviewIndexRecord,
  'mcaId' | 'name' | 'address' | 'regionPath' | 'facilityTypeLabel' | 'hasDetail' |
  'listObservationCount' | 'detailObservationCount' | 'conflictFields'> {
  displayName: string;
  displayRegion: string;
  displayAddress: string;
  displayType: string;
  bedsText: string;
  nursingBedsText: string;
  feeText: string | null;
  feeWarning: boolean;
  starText: string | null;
  evaluationText: string | null;
}

export interface McaPreviewFactDto {
  key: McaPreviewField;
  label: string;
  text: string;
  state: McaPreviewFactState;
  source: { channelLabel: string; fetchedAtUtc: string | null } | null;
  warning: string | null;
}

export interface McaPreviewDetailDto {
  card: McaPreviewCardDto;
  facts: McaPreviewFactDto[];
  snapshotId: string;
  conflictLabels: string[];
  listObservations: McaPreviewObservation[];
  detailObservations: McaPreviewDetailObservation[];
  platformDetail: McaPreviewPlatformDetailDto;
}

export interface McaPreviewResolved<T> {
  state: McaPreviewFactState;
  value: T | null;
  observationCount: number;
}

export interface McaPreviewListExtrasDto {
  listedContactPhone: McaPreviewResolved<string>;
  serviceCategoryLabel: McaPreviewResolved<string>;
  subsidyCode: McaPreviewResolved<string>;
  dayCareBeds: McaPreviewResolved<number>;
  fullCareBeds: McaPreviewResolved<number>;
}

export interface McaPreviewChargeItem {
  id: string | null;
  name: string | null;
  description: string | null;
  standard: string | null;
}

export interface McaPreviewPlatformDetailDto {
  identity: {
    facilityType: McaPreviewResolved<string>;
    starCode: McaPreviewResolved<string>;
    functionPositioning: McaPreviewResolved<string>;
    region: McaPreviewResolved<string>;
    address: McaPreviewResolved<string>;
  };
  tags: McaPreviewResolved<string[]>;
  subsidyCode: McaPreviewResolved<string>;
  contactName: McaPreviewResolved<string>;
  contactPhone: McaPreviewResolved<string>;
  pointRaw: McaPreviewResolved<string>;
  photoCount: McaPreviewResolved<number>;
  areaSqm: McaPreviewResolved<number>;
  introduction: McaPreviewResolved<string>;
  service: {
    content: McaPreviewResolved<string>;
    team: McaPreviewResolved<string>;
    hours: McaPreviewResolved<string>;
    scope: McaPreviewResolved<string>;
    explanation: McaPreviewResolved<string>;
  };
  beds: {
    total: McaPreviewResolved<number>;
    dayCare: McaPreviewResolved<number>;
    fullCare: McaPreviewResolved<number>;
    nursing: McaPreviewResolved<number>;
  };
  feeSummary: { code: '04' | '02' | '01' | '03'; label: string;
    range: McaPreviewResolved<[number, number]>; description: McaPreviewResolved<string> }[];
  charges: McaPreviewResolved<McaPreviewChargeItem[]>;
  evaluation: { state: McaPreviewFactState; text: string;
    count: McaPreviewResolved<number>; score: McaPreviewResolved<number> };
}

type McaCardSource = Omit<McaPreviewIndexRecord, 'detailPath'>;

const labels: Record<McaPreviewField, string> = {
  name: '机构名称', facilityTypeCode: '设施类型原码', facilityTypeLabel: '设施类型原标签',
  areaCode: '地区代码', regionLabel: '地区名称', regionPath: '地区层级', address: '详细地址',
  listedBeds: '机构床位（平台列示）', nursingBeds: '护理型床位（平台列示）',
  listedMonthlyFeeMin: '月费用下限（平台列示）', listedMonthlyFeeMax: '月费用上限（平台列示）',
  platformStarCode: '机构星级原码（评定期未核）',
  evaluationCount: '平台评价次数', overallEvaluation: '平台综合评价原值',
  functionPositioningLabel: '功能定位原标签', platformTagsRaw: '平台标签原文（资格未核）',
};

const channelLabels: Record<string, string> = {
  list: '平台列表', orgBaseDetail: '基本详情', yangLaoOrgDetail: '养老详情',
};

function numberText(value: number): string { return value.toLocaleString('zh-CN'); }

function bedText(record: McaCardSource, field: 'listedBeds' | 'nursingBeds'): string {
  if (record.conflictFields.includes(field)) return '观察值冲突';
  const value = record[field];
  return value === null ? '未提供' : numberText(value) + ' 个';
}

function fee(record: McaCardSource): { text: string | null; warning: boolean } {
  if (record.conflictFields.includes('listedMonthlyFeeMin') || record.conflictFields.includes('listedMonthlyFeeMax')) {
    return { text: '费用观察值冲突，见原始证据', warning: false };
  }
  const lower = record.listedMonthlyFeeMin;
  const upper = record.listedMonthlyFeeMax;
  if (lower === null && upper === null) return { text: null, warning: false };
  const warning = lower === 0 || upper === 0;
  if (lower === null) return { text: '下限未提供 · 上限 ¥' + numberText(upper!) + ' 元/月（平台列示）', warning };
  if (upper === null) return { text: '下限 ¥' + numberText(lower) + ' 元/月 · 上限未提供（平台列示）', warning };
  return { text: '¥' + numberText(lower) + '–' + numberText(upper) + ' 元/月（平台列示）', warning };
}

function evaluation(record: McaCardSource): string | null {
  if (record.conflictFields.includes('evaluationCount') || record.conflictFields.includes('overallEvaluation')) {
    return '平台评价观察值冲突，见原始证据';
  }
  if (record.evaluationCount === null) return null;
  if (record.evaluationCount === 0) return '暂无平台评价';
  const count = '平台评价 ' + numberText(record.evaluationCount) + ' 次';
  return record.overallEvaluation === null ? count :
    count + ' · 综合评价原值 ' + numberText(record.overallEvaluation) + '（量表未核）';
}

function object(value: McaJsonValue | undefined): Record<string, McaJsonValue> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function textValue(value: McaJsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numericValue(value: McaJsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function listResolved<T>(observations: readonly McaPreviewObservation[], key: string,
  kind: 'string' | 'number'): McaPreviewResolved<T> {
  const values: T[] = [];
  for (const observation of observations) {
    const raw = observation.sourceFields[key];
    if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) continue;
    if (kind === 'string' && typeof raw !== 'string' ||
      kind === 'number' && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0)) {
      throw new Error('MCA列表字段类型无效：' + key);
    }
    values.push(raw as T);
  }
  if (values.length === 0) return { state: 'missing', value: null, observationCount: 0 };
  if (new Set(values.map(value => JSON.stringify(value))).size > 1) {
    return { state: 'conflict', value: null, observationCount: values.length };
  }
  return { state: 'observed', value: values[0], observationCount: values.length };
}

/** 只投影列表原件已观察到的五个字段，详情原件不反填列表。 */
export function mapMcaPreviewListExtras(detail: McaPreviewDetail): McaPreviewListExtrasDto {
  const list = detail.listObservations;
  return {
    listedContactPhone: listResolved<string>(list, 'ahae0012', 'string'),
    serviceCategoryLabel: listResolved<string>(list, 'ahae0633Name', 'string'),
    subsidyCode: listResolved<string>(list, 'ahae0635', 'string'),
    dayCareBeds: listResolved<number>(list, 'ahae0019', 'number'),
    fullCareBeds: listResolved<number>(list, 'ahae2343', 'number'),
  };
}

function detailWithListFallback<T>(detailValue: McaPreviewResolved<T>,
  listValue: McaPreviewResolved<T>): McaPreviewResolved<T> {
  if (detailValue.state === 'conflict' || listValue.state !== 'observed') return detailValue;
  if (detailValue.state === 'missing') return listValue;
  if (JSON.stringify(detailValue.value) !== JSON.stringify(listValue.value)) {
    return { state: 'conflict', value: null,
      observationCount: detailValue.observationCount + listValue.observationCount };
  }
  return detailValue;
}

function resolved<T>(observations: readonly McaPreviewDetailObservation[], channel: 'orgBaseDetail' | 'yangLaoOrgDetail',
  read: (fields: Record<string, McaJsonValue>) => readonly T[]): McaPreviewResolved<T> {
  const values = observations.flatMap(observation => [...read(observation.endpoints[channel].sourceFields)]);
  const distinct = new Map(values.map(value => [JSON.stringify(value), value]));
  if (!values.length) return { state: 'missing', value: null, observationCount: 0 };
  if (distinct.size > 1) return { state: 'conflict', value: null, observationCount: values.length };
  return { state: 'observed', value: values[0], observationCount: values.length };
}

function baseString(observations: readonly McaPreviewDetailObservation[], key: string): McaPreviewResolved<string> {
  return resolved(observations, 'orgBaseDetail', fields => {
    const value = textValue(fields[key]);
    return value === null ? [] : [value];
  });
}

// 官网页面用 hae5List[].ahae2372 换取图片地址；此处仅统计文件记录，不请求或存储图片 URL。
function photoCount(observations: readonly McaPreviewDetailObservation[]): McaPreviewResolved<number> {
  const malformed = observations.some(observation => {
    const raw = observation.endpoints.orgBaseDetail.sourceFields.hae5List;
    return raw !== null && raw !== undefined && (!Array.isArray(raw) || raw.some(row => textValue(object(row)?.ahae2372) === null));
  });
  if (malformed) return { state: 'conflict', value: null, observationCount: observations.length };
  const ids = resolved(observations, 'orgBaseDetail', fields => {
    const raw = fields.hae5List;
    return Array.isArray(raw) ? [raw.map(row => textValue(object(row)?.ahae2372) as string)] : [];
  });
  return { ...ids, value: ids.value === null ? null : ids.value.length };
}

function nestedString(observations: readonly McaPreviewDetailObservation[], parent: string, key: string): McaPreviewResolved<string> {
  return resolved(observations, 'orgBaseDetail', fields => {
    const value = textValue(object(fields[parent])?.[key]);
    return value === null ? [] : [value];
  });
}

function careNumber(observations: readonly McaPreviewDetailObservation[], key: string): McaPreviewResolved<number> {
  return resolved(observations, 'yangLaoOrgDetail', fields => {
    const value = numericValue(fields[key]);
    return value === null ? [] : [value];
  });
}

function indexedNumber(detailValue: McaPreviewResolved<number>, indexValue: number | null,
  indexConflict: boolean, indexObservationCount: number): McaPreviewResolved<number> {
  if (indexConflict || (detailValue.state === 'observed' && indexValue !== null && detailValue.value !== indexValue)) {
    return { state: 'conflict', value: null, observationCount: detailValue.observationCount + indexObservationCount };
  }
  if (detailValue.state !== 'missing' || indexValue === null) return detailValue;
  return { state: 'observed', value: indexValue, observationCount: indexObservationCount };
}

function indexField<T>(value: T | null, conflict: boolean, observationCount: number): McaPreviewResolved<T> {
  return conflict ? { state: 'conflict', value: null, observationCount } :
    value === null ? { state: 'missing', value: null, observationCount: 0 } :
      { state: 'observed', value, observationCount };
}

function indexedTags(detailValue: McaPreviewResolved<string>, indexValue: string | null,
  conflict: boolean, observationCount: number): McaPreviewResolved<string> {
  if (conflict || detailValue.state === 'conflict' ||
    (detailValue.value !== null && indexValue !== null && detailValue.value.trim() !== indexValue.trim())) {
    return { state: 'conflict', value: null, observationCount: detailValue.observationCount + observationCount };
  }
  return detailValue.state === 'missing'
    ? indexField(indexValue, false, observationCount) : detailValue;
}

function structuredTags(raw: McaPreviewResolved<string>): McaPreviewResolved<string[]> {
  if (raw.value === null) return { ...raw, value: null };
  return { ...raw, value: [...new Set(raw.value.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean))] };
}

function feeRows(fields: Record<string, McaJsonValue>, code: string): Record<string, McaJsonValue>[] {
  return (Array.isArray(fields.hae8List) ? fields.hae8List : [])
    .map(object).filter((row): row is Record<string, McaJsonValue> => row !== null && row.axbe8002 === code);
}

function feeRange(observations: readonly McaPreviewDetailObservation[], code: string): McaPreviewResolved<[number, number]> {
  return resolved(observations, 'yangLaoOrgDetail', fields => feeRows(fields, code).flatMap(row => {
    const min = numericValue(row.axbe8004);
    const max = numericValue(row.axbe8003);
    return min === null || max === null ? [] : [[min, max] as [number, number]];
  }));
}

function feeDescription(observations: readonly McaPreviewDetailObservation[], code: string): McaPreviewResolved<string> {
  return resolved(observations, 'yangLaoOrgDetail', fields => feeRows(fields, code).flatMap(row => {
    const value = textValue(row.axbe8005);
    return value === null ? [] : [value];
  }));
}

function chargeItems(observations: readonly McaPreviewDetailObservation[]): McaPreviewResolved<McaPreviewChargeItem[]> {
  const parsed = resolved(observations, 'yangLaoOrgDetail', fields => {
    if (!Array.isArray(fields.hae4List)) return [];
    const rows = fields.hae4List.map(object);
    if (rows.some(row => row === null)) return [];
    return [rows.map(row => ({
      id: textValue(row?.axbe4001), name: textValue(row?.axbe4002),
      description: textValue(row?.axbe4003), standard: textValue(row?.axbe4004),
    }))];
  });
  const malformed = observations.some(observation => {
    const raw = observation.endpoints.yangLaoOrgDetail.sourceFields.hae4List;
    return raw !== undefined && raw !== null &&
      (!Array.isArray(raw) || raw.some(row => object(row) === null));
  });
  return malformed ? { state: 'conflict', value: null, observationCount: observations.length } : parsed;
}

function mapPlatformDetail(record: McaPreviewIndexRecord, detail: McaPreviewDetail): McaPreviewPlatformDetailDto {
  const observations = detail.detailObservations;
  const listExtras = mapMcaPreviewListExtras(detail);
  const fieldConflict = (key: McaPreviewField) => record.conflictFields.includes(key) || detail.conflictFields.includes(key);
  const indexObservationCount = record.listObservationCount || record.detailObservationCount;
  const indexed = <T>(key: McaPreviewField, value: T | null) => indexField(value, fieldConflict(key), indexObservationCount);
  const monthlyRange = feeRange(observations, '04');
  const monthlyConflict = record.conflictFields.includes('listedMonthlyFeeMin') || record.conflictFields.includes('listedMonthlyFeeMax') ||
    detail.conflictFields.includes('listedMonthlyFeeMin') || detail.conflictFields.includes('listedMonthlyFeeMax');
  const indexRange = record.listedMonthlyFeeMin !== null && record.listedMonthlyFeeMax !== null
    ? [record.listedMonthlyFeeMin, record.listedMonthlyFeeMax] as [number, number] : null;
  const mergedMonthlyRange: McaPreviewResolved<[number, number]> = monthlyConflict ||
    (monthlyRange.state === 'observed' && indexRange !== null && JSON.stringify(monthlyRange.value) !== JSON.stringify(indexRange))
    ? { state: 'conflict', value: null, observationCount: monthlyRange.observationCount + indexObservationCount }
    : monthlyRange.state === 'missing' && indexRange !== null
      ? { state: 'observed', value: indexRange, observationCount: indexObservationCount } : monthlyRange;
  const feeSummary = ([
    ['04', '月总费用'], ['02', '床位费用'], ['01', '护理费用'], ['03', '膳食费用'],
  ] as const).map(([code, label]) => ({ code, label,
    range: code === '04' ? mergedMonthlyRange : feeRange(observations, code),
    description: feeDescription(observations, code),
  }));
  const areaSqm = resolved(observations, 'orgBaseDetail', fields => {
    const value = numericValue(fields.ahae0021);
    return value === null ? [] : [value];
  });
  const countConflict = record.conflictFields.includes('evaluationCount') || detail.conflictFields.includes('evaluationCount');
  const scoreConflict = record.conflictFields.includes('overallEvaluation') || detail.conflictFields.includes('overallEvaluation');
  const evaluationCount = indexed('evaluationCount', record.evaluationCount);
  const evaluationScore = indexed('overallEvaluation', record.overallEvaluation);
  return {
    identity: {
      facilityType: indexed('facilityTypeLabel', record.facilityTypeLabel),
      starCode: indexed('platformStarCode', record.platformStarCode),
      functionPositioning: indexed('functionPositioningLabel', record.functionPositioningLabel),
      region: indexField(record.regionPath ?? record.regionLabel,
        fieldConflict('regionPath') || (record.regionPath === null && fieldConflict('regionLabel')),
        indexObservationCount),
      address: indexed('address', record.address),
    },
    tags: structuredTags(indexedTags(baseString(observations, 'tag'), record.platformTagsRaw,
      fieldConflict('platformTagsRaw'), indexObservationCount)),
    subsidyCode: detailWithListFallback(baseString(observations, 'ahae0635'), listExtras.subsidyCode),
    contactName: baseString(observations, 'ahae2572'),
    contactPhone: detailWithListFallback(baseString(observations, 'ahae2573'), listExtras.listedContactPhone),
    pointRaw: nestedString(observations, 'orgBaseInfo', 'point'),
    photoCount: photoCount(observations),
    areaSqm,
    introduction: nestedString(observations, 'orgBaseInfo', 'infoDetail'),
    service: {
      content: nestedString(observations, 'orgServiceInfo', 'serviceDetail'),
      team: nestedString(observations, 'orgServiceInfo', 'serviceTeam'),
      hours: nestedString(observations, 'orgServiceInfo', 'serviceTime'),
      scope: nestedString(observations, 'orgServiceInfo', 'serviceRadius'),
      explanation: nestedString(observations, 'orgServiceInfo', 'serviceRadiusExplain'),
    },
    beds: {
      total: indexedNumber(careNumber(observations, 'ahae2347'), record.listedBeds,
        record.conflictFields.includes('listedBeds') || detail.conflictFields.includes('listedBeds'), indexObservationCount),
      dayCare: detailWithListFallback(careNumber(observations, 'ahae0019'), listExtras.dayCareBeds),
      fullCare: detailWithListFallback(careNumber(observations, 'ahae2343'), listExtras.fullCareBeds),
      nursing: indexedNumber(careNumber(observations, 'ahae2323'), record.nursingBeds,
        record.conflictFields.includes('nursingBeds') || detail.conflictFields.includes('nursingBeds'), indexObservationCount),
    }, feeSummary, charges: chargeItems(observations),
    evaluation: { state: countConflict || scoreConflict ? 'conflict' : record.evaluationCount === null ? 'missing' : 'observed',
      text: countConflict || scoreConflict ? '平台评价观察值冲突，见原始证据' : evaluation(record) ?? '原平台未提供',
      count: evaluationCount, score: evaluationScore },
  };
}

/** Presentation values only; never parse unreviewed sourceFields in the browser. */
export function mapMcaPreviewCard(record: McaCardSource): McaPreviewCardDto {
  const monthlyFee = fee(record);
  const conflicts = new Set(record.conflictFields);
  return {
    mcaId: record.mcaId, name: conflicts.has('name') ? null : record.name,
    address: conflicts.has('address') ? null : record.address,
    regionPath: conflicts.has('regionPath') ? null : record.regionPath,
    facilityTypeLabel: conflicts.has('facilityTypeLabel') ? null : record.facilityTypeLabel,
    hasDetail: record.hasDetail, listObservationCount: record.listObservationCount,
    detailObservationCount: record.detailObservationCount, conflictFields: [...record.conflictFields],
    displayName: conflicts.has('name') ? '机构名称观察值冲突' : record.name ?? '原平台未提供名称',
    displayRegion: conflicts.has('regionPath') ? '地区层级观察值冲突' :
      record.regionPath?.replaceAll('/', ' / ') ??
        (conflicts.has('regionLabel') ? '地区名称观察值冲突' : record.regionLabel ?? '地区未提供'),
    displayAddress: conflicts.has('address') ? '地址观察值冲突' : record.address ?? '原平台未提供',
    displayType: conflicts.has('facilityTypeLabel') ? '设施类型待核' : record.facilityTypeLabel ?? '设施类型未提供',
    bedsText: bedText(record, 'listedBeds'), nursingBedsText: bedText(record, 'nursingBeds'),
    feeText: monthlyFee.text, feeWarning: monthlyFee.warning,
    starText: conflicts.has('platformStarCode') ? '星级原码待核' :
      record.platformStarCode === null ? null : record.platformStarCode + '（评定期未核）',
    evaluationText: evaluation(record),
  };
}

function factText(record: McaPreviewIndexRecord, key: McaPreviewField): string {
  const value = record[key];
  if (value === null) return '原平台未提供';
  if (key === 'overallEvaluation') {
    return record.evaluationCount === 0
      ? '暂无评价（原值为 ' + value + '）'
      : value + '（量表未核）';
  }
  if (typeof value === 'number') {
    const unit = key === 'listedBeds' || key === 'nursingBeds' ? ' 个' :
      key === 'listedMonthlyFeeMin' || key === 'listedMonthlyFeeMax' ? ' 元/月' :
        key === 'evaluationCount' ? ' 次' : '';
    return numberText(value) + unit;
  }
  return value;
}

export function mapMcaPreviewDetail(record: McaPreviewIndexRecord, detail: McaPreviewDetail, snapshotId: string): McaPreviewDetailDto {
  const conflicts = new Set<McaPreviewField>([...record.conflictFields, ...detail.conflictFields]);
  const facts: McaPreviewFactDto[] = mcaPreviewFields.map(key => {
    const state: McaPreviewFactState = conflicts.has(key) ? 'conflict' : record[key] === null ? 'missing' : 'observed';
    const selected = state === 'observed' ? detail.selectedFieldSources[key] : undefined;
    const time = selected?.source.fetchedAtUtc;
    return {
      key, label: labels[key], state,
      text: state === 'conflict' ? '观察值冲突，见原始证据' : factText(record, key),
      source: selected ? { channelLabel: channelLabels[selected.channel] ?? '来源未标明',
        fetchedAtUtc: typeof time === 'string' && time.trim() ? time : null } : null,
      warning: state === 'observed' && (key === 'listedMonthlyFeeMin' || key === 'listedMonthlyFeeMax') && record[key] === 0
        ? '原值为 0，不代表免费。' : null,
    };
  });
  return {
    card: mapMcaPreviewCard({ ...record, conflictFields: [...conflicts] }), facts, snapshotId,
    conflictLabels: mcaPreviewFields.filter(key => conflicts.has(key)).map(key => labels[key]),
    listObservations: detail.listObservations, detailObservations: detail.detailObservations,
    platformDetail: mapPlatformDetail(record, detail),
  };
}
