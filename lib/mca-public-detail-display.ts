import type { McaPreviewFactDto, McaPreviewPlatformDetailDto, McaPreviewResolved } from './mca-preview-dto';
import type { McaObservedTimeRange, McaPublicDetailRecord, McaPublicIndexRecord, McaPublicManifest } from './mca-public-types';

export interface McaPublicDetailDisplayDto {
  name: string;
  overview: {
    facilityType: McaPreviewResolved<string>;
    functionPositioning: McaPreviewResolved<string>;
    region: McaPreviewResolved<string>;
    address: McaPreviewResolved<string>;
    tags: McaPreviewResolved<string[]>;
    contactName: McaPreviewResolved<string>;
    contactPhone: McaPreviewResolved<string>;
    contactHref: string | null;
  };
  capacity: McaPreviewPlatformDetailDto['beds'];
  monthlyFees: McaPreviewPlatformDetailDto['feeSummary'];
  charges: McaPreviewPlatformDetailDto['charges'];
  introduction: McaPreviewResolved<string>;
  areaSqm: McaPreviewResolved<number>;
  serviceFields: { label: string; field: McaPreviewResolved<string> }[];
  subServices: McaPreviewPlatformDetailDto['subServices'];
  hasSubServices: boolean;
  photoCount: McaPreviewResolved<number>;
  evaluation: McaPreviewPlatformDetailDto['evaluation'];
  evaluationSummary: string;
  source: {
    mcaId: string;
    sourcePage: string;
    detailObservedAtUtc: McaObservedTimeRange;
    listObservedAtUtc: McaObservedTimeRange | null;
    snapshotCapturedAtUtc: string;
    detailObservationCount: number;
    listObservationCount: number;
    conflictLabels: string[];
    starCode: McaPreviewResolved<string>;
    subsidyCode: McaPreviewResolved<string>;
    pointRaw: McaPreviewResolved<string>;
    listExtras: { label: string; field: McaPreviewResolved<string | number> }[];
    facts: McaPreviewFactDto[];
  };
}

function contactHref(field: McaPreviewResolved<string>): string | null {
  if (field.state !== 'observed' || field.value === null) return null;
  const raw = field.value.trim();
  if (!/^[+0-9()（）\s-]{6,30}$/.test(raw)) return null;
  const dialable = raw.replace(/[()（）\s-]/g, '');
  const local = dialable.startsWith('+86') ? dialable.slice(3) : dialable;
  const recognizable = /^1[3-9]\d{9}$/.test(local) || /^0\d{9,11}$/.test(local) || /^(?:400|800)\d{7}$/.test(local);
  return recognizable ? 'tel:' + dialable : null;
}

function evaluationSummary(value: McaPreviewPlatformDetailDto['evaluation']): string {
  if (value.state === 'conflict' || value.count.state === 'conflict' || value.score.state === 'conflict') {
    return '平台评价观察值冲突，待核对。';
  }
  if (value.count.state === 'missing' || value.count.value === null) return '采集快照未提供评价资料。';
  if (value.count.value === 0) return '平台列示 0 条评价，不代表零分差评。';
  return value.text + '；评价量表和正文尚未核对。';
}

function hasSubService(data: McaPublicDetailDisplayDto['subServices']): boolean {
  return [data.respite, data.dayCare, data.homeVisit].some(service =>
    service.beds.state !== 'missing' || service.nursingBeds.state !== 'missing' ||
    service.fee.state !== 'missing' || service.project.state !== 'missing' ||
    service.charges.state !== 'missing') ||
    data.assessment.home.state !== 'missing' || data.assessment.site.state !== 'missing';
}

/** Groups only the already-reviewed public projection for family-facing display. */
export function mapMcaPublicDetailDisplay(
  record: McaPublicIndexRecord, detail: McaPublicDetailRecord, manifest: McaPublicManifest,
): McaPublicDetailDisplayDto {
  const data = detail.platformDetail;
  return {
    name: record.conflictFields.includes('name') ? '机构名称观察值冲突' : record.name ?? '平台未提供机构名称',
    overview: {
      facilityType: data.identity.facilityType,
      functionPositioning: data.identity.functionPositioning,
      region: data.identity.region,
      address: data.identity.address,
      tags: data.tags,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      contactHref: contactHref(data.contactPhone),
    },
    capacity: data.beds,
    monthlyFees: data.feeSummary,
    charges: data.charges,
    introduction: data.introduction,
    areaSqm: data.areaSqm,
    serviceFields: [
      { label: '平台列示服务类别', field: record.serviceCategoryLabel },
      { label: '服务内容', field: data.service.content },
      { label: '服务团队', field: data.service.team },
      { label: '服务时间', field: data.service.hours },
      { label: '服务范围', field: data.service.scope },
      { label: '服务说明', field: data.service.explanation },
    ],
    subServices: data.subServices,
    hasSubServices: hasSubService(data.subServices),
    photoCount: data.photoCount,
    evaluation: data.evaluation,
    evaluationSummary: evaluationSummary(data.evaluation),
    source: {
      mcaId: record.mcaId, sourcePage: detail.sourcePage,
      detailObservedAtUtc: detail.detailObservedAtUtc,
      listObservedAtUtc: record.listObservedAtUtc,
      snapshotCapturedAtUtc: manifest.snapshotCapturedAtUtc,
      detailObservationCount: record.detailObservationCount,
      listObservationCount: record.listObservationCount,
      conflictLabels: detail.conflictLabels,
      starCode: data.identity.starCode,
      subsidyCode: data.subsidyCode,
      pointRaw: data.pointRaw,
      listExtras: [
        { label: '平台列表服务类别', field: record.serviceCategoryLabel },
        { label: '平台列表联系电话原值', field: record.listedContactPhone },
        { label: '平台列表补贴原码', field: record.subsidyCode },
        { label: '平台列表日托床位', field: record.dayCareBeds },
        { label: '平台列表全托床位', field: record.fullCareBeds },
      ],
      facts: detail.facts,
    },
  };
}
