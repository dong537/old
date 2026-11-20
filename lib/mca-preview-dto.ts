import { mcaPreviewFields } from './mca-preview-types';
import type { McaPreviewDetail, McaPreviewDetailObservation, McaPreviewField,
  McaPreviewIndexRecord, McaPreviewObservation } from './mca-preview-types';

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
}

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

function bedText(record: McaPreviewIndexRecord, field: 'listedBeds' | 'nursingBeds'): string {
  if (record.conflictFields.includes(field)) return '观察值冲突';
  const value = record[field];
  return value === null ? '未提供' : numberText(value) + ' 个';
}

function fee(record: McaPreviewIndexRecord): { text: string | null; warning: boolean } {
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

function evaluation(record: McaPreviewIndexRecord): string | null {
  if (record.conflictFields.includes('evaluationCount') || record.conflictFields.includes('overallEvaluation')) {
    return '平台评价观察值冲突，见原始证据';
  }
  if (record.evaluationCount === null) return null;
  if (record.evaluationCount === 0) return '暂无平台评价';
  const count = '平台评价 ' + numberText(record.evaluationCount) + ' 次';
  return record.overallEvaluation === null ? count :
    count + ' · 综合评价原值 ' + numberText(record.overallEvaluation) + '（量表未核）';
}

/** Presentation values only; never parse unreviewed sourceFields in the browser. */
export function mapMcaPreviewCard(record: McaPreviewIndexRecord): McaPreviewCardDto {
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
    card: mapMcaPreviewCard(record), facts, snapshotId,
    conflictLabels: mcaPreviewFields.filter(key => conflicts.has(key)).map(key => labels[key]),
    listObservations: detail.listObservations, detailObservations: detail.detailObservations,
  };
}
