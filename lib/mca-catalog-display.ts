import type { McaPreviewChargeItem, McaPreviewResolved } from './mca-preview-dto';
import type { McaPublicDetailDisplayDto } from './mca-public-detail-display';
import { mcaOfficialDetailHref } from './mca-preview-ui';
import { MCA_CATALOG_CSV_FIELDS, type McaCatalogChargeItem, type McaCatalogCsvDetail,
  type McaCatalogCsvFields, type McaCatalogIndexRecord, type McaCatalogManifest,
  type McaCsvColumn } from './mca-catalog-types';

type PublicCsvKey = Exclude<McaCsvColumn, 'images_json'>;
type DisplayBase = Omit<McaPublicDetailDisplayDto, 'source'>;

export interface McaCatalogDisplayDto extends DisplayBase {
  foundDate: McaPreviewResolved<string>;
  source: {
    sourceKind: 'csv';
    mcaId: string;
    sourcePage: string;
    csvUpdatedAtLocal: string;
    csvExportDate: string;
    sourceCsvSha256: string;
    collectorStatus: 'ok' | 'stale';
    pointRaw: McaPreviewResolved<string>;
    riskLevelRaw: McaPreviewResolved<string>;
    rawFields: { key: PublicCsvKey; label: string; text: string }[];
  };
}

const labels: Record<PublicCsvKey, string> = {
  org_id: '平台 ID', name: '机构名称', org_type: '机构类型原文', area: '地区原文',
  area_code: '地区代码', address: '地址', contact: '联系人', phone: '联系电话',
  found_date: '平台列示日期（原值）', building_area: '建筑面积（㎡）',
  tags: '平台标签原文（资格未核）', services: '平台列示服务类别',
  total_beds: '总床位', beds: '全托床位', nursing_beds: '护理型床位',
  fee_month_min: '月总费用下限（元/月）', fee_month_max: '月总费用上限（元/月）',
  fee_bed_min: '床位费下限（元/月）', fee_bed_max: '床位费上限（元/月）',
  fee_care_min: '护理费下限（元/月）', fee_care_max: '护理费上限（元/月）',
  fee_meal_min: '膳食费下限（元/月）', fee_meal_max: '膳食费上限（元/月）',
  intro: '机构介绍', service_detail: '服务内容', service_team: '服务团队',
  service_time: '服务时间', service_radius: '服务范围', service_radius_explain: '服务说明',
  point: '平台原始坐标（未定位核验）', risk_level: '平台风险原码（含义未核）',
  evaluation: '平台综合评价原值（量表未核）', eval_count: '平台评价次数',
  fee_detail_json: '分项收费', status: '采集器状态原值（非机构在营状态）',
  updated_at: '采集器本地时间原值（时区未提供）',
  cx_beds: '喘息服务床位', cx_nursing_beds: '喘息服务护理型床位',
  cx_fee_day_min: '喘息服务费用下限（元/天）', cx_fee_day_max: '喘息服务费用上限（元/天）',
  cx_fee_detail_json: '喘息服务分项收费',
  rt_beds: '日托服务床位', rt_nursing_beds: '日托服务护理型床位',
  rt_fee_day_min: '日托服务费用下限（元/天）', rt_fee_day_max: '日托服务费用上限（元/天）',
  rt_fee_detail_json: '日托服务分项收费',
  home_fee_time_min: '上门服务费用下限（元/次）',
  home_fee_time_max: '上门服务费用上限（元/次）',
  home_service_project: '上门服务项目',
  assess_fee_home: '上门能力评估费（元）', assess_fee_site: '站点能力评估费（元）',
};

function resolved<T>(value: T | null): McaPreviewResolved<T> {
  return { state: value === null ? 'missing' : 'observed', value,
    observationCount: value === null ? 0 : 1 };
}

function bounds(min: number | null, max: number | null): McaPreviewResolved<[number, number]> {
  if ((min === null) !== (max === null)) {
    return { state: 'conflict', value: null, observationCount: 1 };
  }
  return resolved(min === null || max === null ? null : [min, max]);
}

function charges(items: McaCatalogChargeItem[] | null): McaPreviewResolved<McaPreviewChargeItem[]> {
  return resolved(items?.map((item, index) => ({ id: String(index), name: item.serviceType,
    description: item.project, standard: item.priceRangeText })) ?? null);
}

function subService(beds: number | null, nursingBeds: number | null,
  min: number | null, max: number | null, unit: string,
  items: McaCatalogChargeItem[] | null, project: string | null = null) {
  return { beds: resolved(beds), nursingBeds: resolved(nursingBeds), fee: bounds(min, max),
    unit, project: resolved(project), charges: charges(items) };
}

function contactHref(phone: string | null): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  if (!/^[+0-9()（）\s-]{6,30}$/.test(raw)) return null;
  const dialable = raw.replace(/[()（）\s-]/g, '');
  const local = dialable.startsWith('+86') ? dialable.slice(3) : dialable;
  return /^1[3-9]\d{9}$/.test(local) || /^0\d{9,11}$/.test(local) ||
    /^(?:400|800)\d{7}$/.test(local) ? 'tel:' + dialable : null;
}

function rawText(value: McaCatalogCsvFields[PublicCsvKey]): string {
  if (value === null) return '采集快照未提供';
  if (typeof value === 'number') return value.toLocaleString('zh-CN');
  if (typeof value === 'string') return value;
  if (!value.length) return '来源记录 0 项';
  if (typeof value[0] === 'string') return (value as string[]).join('、');
  return (value as McaCatalogChargeItem[]).map(item =>
    [item.serviceType, item.project, item.priceRangeText].filter(Boolean).join('｜')).join('\n');
}

/** A family-facing view of only the typed, published CSV projection; never use old values as fallback. */
export function mapMcaCatalogDisplay(record: McaCatalogIndexRecord,
  detail: McaCatalogCsvDetail, manifest: McaCatalogManifest): McaCatalogDisplayDto {
  if (record.sourceKind !== 'csv' || record.mcaId !== detail.mcaId ||
    detail.snapshotId !== manifest.snapshotId || detail.fields.org_id !== detail.mcaId) {
    throw new Error('CSV 机构详情与索引或快照不一致');
  }
  const f = detail.fields;
  if (record.collectorStatus !== f.status || record.csvUpdatedAtLocal !== f.updated_at) {
    throw new Error('CSV 采集状态或时间与索引不一致');
  }
  const resp = subService(f.cx_beds, f.cx_nursing_beds, f.cx_fee_day_min, f.cx_fee_day_max,
    '元/天', f.cx_fee_detail_json);
  const day = subService(f.rt_beds, f.rt_nursing_beds, f.rt_fee_day_min, f.rt_fee_day_max,
    '元/天', f.rt_fee_detail_json);
  const home = subService(null, null, f.home_fee_time_min, f.home_fee_time_max,
    '元/次', null, f.home_service_project);
  const count = resolved(f.eval_count);
  const score = resolved(f.evaluation);
  const evaluationSummary = f.eval_count === null ? '采集快照未提供评价资料。' :
    f.eval_count === 0 ? '平台列示 0 条评价，不代表零分差评。' :
      '平台列示 ' + f.eval_count.toLocaleString('zh-CN') + ' 条评价；' +
      (f.evaluation === null ? '综合评价原值未提供。' :
        '综合评价原值 ' + f.evaluation.toLocaleString('zh-CN') + '（量表未核）。');
  return {
    name: f.name,
    overview: {
      facilityType: resolved(f.org_type), functionPositioning: resolved<string>(null),
      region: resolved(f.area), address: resolved(f.address), tags: resolved(f.tags),
      contactName: resolved(f.contact), contactPhone: resolved(f.phone),
      contactHref: contactHref(f.phone),
    },
    capacity: { total: resolved(f.total_beds), fullCare: resolved(f.beds),
      nursing: resolved(f.nursing_beds), dayCare: resolved<number>(null) },
    monthlyFees: [
      { code: '04', label: '月总费用', range: bounds(f.fee_month_min, f.fee_month_max), description: resolved<string>(null) },
      { code: '02', label: '床位费用', range: bounds(f.fee_bed_min, f.fee_bed_max), description: resolved<string>(null) },
      { code: '01', label: '护理费用', range: bounds(f.fee_care_min, f.fee_care_max), description: resolved<string>(null) },
      { code: '03', label: '膳食费用', range: bounds(f.fee_meal_min, f.fee_meal_max), description: resolved<string>(null) },
    ],
    charges: charges(f.fee_detail_json),
    introduction: resolved(f.intro), areaSqm: resolved(f.building_area),
    foundDate: resolved(f.found_date),
    serviceFields: [
      { label: '平台列示服务类别', field: resolved(f.services?.join('、') ?? null) },
      { label: '服务内容', field: resolved(f.service_detail) },
      { label: '服务团队', field: resolved(f.service_team) },
      { label: '服务时间', field: resolved(f.service_time) },
      { label: '服务范围', field: resolved(f.service_radius) },
      { label: '服务说明', field: resolved(f.service_radius_explain) },
    ],
    subServices: { respite: resp, dayCare: day, homeVisit: home,
      assessment: { home: resolved(f.assess_fee_home), site: resolved(f.assess_fee_site) } },
    hasSubServices: [resp, day, home].some(service => service.beds.state !== 'missing' ||
      service.nursingBeds.state !== 'missing' || service.fee.state !== 'missing' ||
      service.project.state !== 'missing' || service.charges.state !== 'missing') ||
      f.assess_fee_home !== null || f.assess_fee_site !== null,
    photoCount: resolved<number>(null),
    evaluation: { state: count.state, text: evaluationSummary, count, score },
    evaluationSummary,
    source: {
      sourceKind: 'csv', mcaId: f.org_id, sourcePage: mcaOfficialDetailHref(f.org_id),
      csvUpdatedAtLocal: f.updated_at, csvExportDate: manifest.csvExportDate,
      sourceCsvSha256: manifest.sourceCsvSha256, collectorStatus: f.status,
      pointRaw: resolved(f.point), riskLevelRaw: resolved(f.risk_level),
      rawFields: MCA_CATALOG_CSV_FIELDS.map(key => ({ key, label: labels[key], text: rawText(f[key]) })),
    },
  };
}
