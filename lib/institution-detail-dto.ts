import type { ReferenceDetailRecord } from './institution-reference-types';
import type { NationalOfficialDetailRecord, NationalOfficialSource } from './national-official-types';
import { officialAddressLabel } from './national-official-presentation';
import type { Institution } from './types';
import type { ProvinceSourceRecord } from './province-types';

export type DetailSource = 'reference' | 'official' | 'guangzhou' | 'province';
export type DetailAvailability = 'recorded' | 'source_missing';

/** A source missing a field is not evidence that an institution has no such service. */
export interface DetailFact<T> {
  label: string;
  value: T | null;
  availability: DetailAvailability;
  source: DetailSource;
}

export interface MonthlyFeeRange { min: number; max: number }
export interface ChargeItem { name: string; description: string; standard: string }
export interface FacilityPhoto { url: string; alt: string }
export interface MapPoint { latitude: number; longitude: number }

/** Public display contract. MCA observed/private values never enter either mapper. */
export interface PublicInstitutionDetailDto {
  kind: DetailSource;
  name: string;
  region: string;
  profile: {
    facilityType: DetailFact<string>;
    starLevel: DetailFact<string>;
    subsidyStatus: DetailFact<string>;
    functionPositioning: DetailFact<string>;
    tags: DetailFact<string[]>;
    areaSqm: DetailFact<number>;
    contactName: DetailFact<string>;
    contactPhone: DetailFact<string>;
    photos: DetailFact<FacilityPhoto[]>;
    mapPoint: DetailFact<MapPoint>;
  };
  address: DetailFact<string>;
  introduction: DetailFact<string>;
  beds: {
    total: DetailFact<number>;
    dayCare: DetailFact<number>;
    fullCare: DetailFact<number>;
    nursing: DetailFact<number>;
    residents: DetailFact<number>;
    staff: DetailFact<number>;
  };
  monthlyFees: {
    total: DetailFact<MonthlyFeeRange>;
    bed: DetailFact<MonthlyFeeRange>;
    care: DetailFact<MonthlyFeeRange>;
    meal: DetailFact<MonthlyFeeRange>;
  };
  monthlyFeeNotes: {
    total: DetailFact<string>;
    bed: DetailFact<string>;
    care: DetailFact<string>;
    meal: DetailFact<string>;
  };
  services: {
    content: DetailFact<string>;
    team: DetailFact<string>;
    time: DetailFact<string>;
    range: DetailFact<string>;
    notes: DetailFact<string>;
  };
  chargeItems: DetailFact<ChargeItem[]>;
  reviews: { count: DetailFact<number>; score: DetailFact<number> };
}

function fact<T>(label: string, value: T | null, source: DetailSource): DetailFact<T> {
  const normalized = typeof value === 'string' && value.trim() === '' ? null : value;
  return { label, value: normalized, availability: normalized === null ? 'source_missing' : 'recorded', source };
}

function rawCoordinate(value: string | number | null | undefined, max: number): number | null {
  if (typeof value === 'string' && !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && Math.abs(parsed) <= max ? parsed : null;
}

function referenceMapPoint(record: ReferenceDetailRecord): MapPoint | null {
  const longitude = rawCoordinate(record.sourceFields['经度'], 180);
  const latitude = rawCoordinate(record.sourceFields['纬度'], 90);
  return longitude === null || latitude === null ? null : { longitude, latitude };
}

function unavailableFields(source: DetailSource) {
  return {
    profile: {
      facilityType: fact<string>('设施类型', null, source),
      starLevel: fact<string>('机构星级', null, source),
      subsidyStatus: fact<string>('养老消费补贴', null, source),
      functionPositioning: fact<string>('功能定位', null, source),
      tags: fact<string[]>('机构标签', null, source),
      areaSqm: fact<number>('机构面积', null, source),
      contactName: fact<string>('联系人', null, source),
      contactPhone: fact<string>('联系电话', null, source),
      photos: fact<FacilityPhoto[]>('机构图片', null, source),
      mapPoint: fact<MapPoint>('地图坐标', null, source),
    },
    introduction: fact<string>('机构介绍', null, source),
    beds: {
      dayCare: fact<number>('日托床位数', null, source),
      fullCare: fact<number>('全托床位数', null, source),
      nursing: fact<number>('护理型床位数', null, source),
      residents: fact<number>('入住老年人总数', null, source),
      staff: fact<number>('从业人员数', null, source),
    },
    monthlyFees: {
      total: fact<MonthlyFeeRange>('月总费用', null, source),
      bed: fact<MonthlyFeeRange>('床位费用', null, source),
      care: fact<MonthlyFeeRange>('护理费用', null, source),
      meal: fact<MonthlyFeeRange>('膳食费用', null, source),
    },
    monthlyFeeNotes: {
      total: fact<string>('月总费用说明', null, source),
      bed: fact<string>('床位费用说明', null, source),
      care: fact<string>('护理费用说明', null, source),
      meal: fact<string>('膳食费用说明', null, source),
    },
    services: {
      content: fact<string>('服务内容', null, source),
      team: fact<string>('服务团队', null, source),
      time: fact<string>('服务时间', null, source),
      range: fact<string>('服务范围', null, source),
      notes: fact<string>('服务说明', null, source),
    },
    chargeItems: fact<ChargeItem[]>('收费标准', null, source),
    reviews: {
      count: fact<number>('平台评价次数', null, source),
      score: fact<number>('平台综合评分', null, source),
    },
  };
}

export function mapReferenceInstitutionDetail(record: ReferenceDetailRecord): PublicInstitutionDetailDto {
  const missing = unavailableFields('reference');
  return {
    kind: 'reference', name: record.name, region: record.region,
    profile: { ...missing.profile, mapPoint: fact('原表坐标（未核实）', referenceMapPoint(record), 'reference') },
    address: fact('原表地址字段（未核实）', record.address, 'reference'),
    introduction: missing.introduction,
    beds: { total: fact('原表床位数', record.beds, 'reference'), ...missing.beds },
    monthlyFees: missing.monthlyFees, monthlyFeeNotes: missing.monthlyFeeNotes, services: missing.services,
    chargeItems: missing.chargeItems, reviews: missing.reviews,
  };
}

export function mapOfficialInstitutionDetail(record: NationalOfficialDetailRecord, source: NationalOfficialSource): PublicInstitutionDetailDto {
  const missing = unavailableFields('official');
  return {
    kind: 'official', name: record.name, region: [source.province, source.city].filter(Boolean).join(' · '),
    profile: missing.profile,
    address: fact('原表地址', record.address === null ? null : officialAddressLabel(record), 'official'),
    introduction: missing.introduction,
    beds: {
      total: fact('原表床位数', record.beds, 'official'),
      ...missing.beds,
      residents: fact('入住老年人总数', record.residentCount, 'official'),
      staff: fact('从业人员数', record.staffCount, 'official'),
    },
    monthlyFees: missing.monthlyFees,
    monthlyFeeNotes: missing.monthlyFeeNotes,
    services: { ...missing.services, content: fact('提供服务内容', record.services, 'official') },
    chargeItems: missing.chargeItems, reviews: missing.reviews,
  };
}

/** A province name-only observation is not evidence of a registered or operating care facility. */
export function mapProvinceSourceDetail(record: ProvinceSourceRecord): PublicInstitutionDetailDto {
  const missing = unavailableFields('province');
  return {
    kind: 'province', name: record.name, region: '广东省 · ' + record.city,
    profile: missing.profile,
    address: fact<string>('原文地址', null, 'province'),
    introduction: missing.introduction,
    beds: { total: fact<number>('原文床位数', null, 'province'), ...missing.beds },
    monthlyFees: missing.monthlyFees, monthlyFeeNotes: missing.monthlyFeeNotes,
    services: missing.services, chargeItems: missing.chargeItems, reviews: missing.reviews,
  };
}

export function mapGuangzhouInstitutionDetail(record: Institution): PublicInstitutionDetailDto {
  const missing = unavailableFields('guangzhou');
  return {
    kind: 'guangzhou', name: record.name, region: '广东省 · 广州市 · ' + record.district,
    profile: {
      ...missing.profile,
      facilityType: fact('来源分类', '养老机构', 'guangzhou'),
      contactPhone: fact('名单所列电话', record.phoneWithheld ? null : record.phone, 'guangzhou'),
    },
    address: fact('名单所列地址', record.address, 'guangzhou'),
    introduction: missing.introduction,
    beds: { total: fact('备案床位', record.registeredBeds, 'guangzhou'), ...missing.beds },
    monthlyFees: missing.monthlyFees,
    monthlyFeeNotes: missing.monthlyFeeNotes,
    services: missing.services,
    chargeItems: missing.chargeItems,
    reviews: missing.reviews,
  };
}
