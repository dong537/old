import assert from 'node:assert/strict';
import test from 'node:test';
import { mapOfficialInstitutionDetail, mapProvinceSourceDetail, mapReferenceInstitutionDetail } from '../lib/institution-detail-dto';
import type { ReferenceDetailRecord } from '../lib/institution-reference-types';
import type { NationalOfficialDetailRecord, NationalOfficialSource } from '../lib/national-official-types';
import type { ProvinceSourceRecord } from '../lib/province-types';

const reference: ReferenceDetailRecord = {
  id: 'qref-2', sourceRow: 2, name: '甲养老院', region: '河北省石家庄市',
  address: null, beds: 0, creditCode: null, codeStatus: 'missing', sourceFields: {},
};
const official: NationalOfficialDetailRecord = {
  id: 'official-2', sourceId: 'source-a', rowNumber: 2, name: '乙养老院',
  address: '乙路 1 号', beds: 80, residentCount: 0, staffCount: null,
  services: '日间照护',
};
const source: NationalOfficialSource = {
  id: 'source-a', province: '河北省', city: '石家庄市', scope: '石家庄市',
  title: '本地民政名单', url: 'https://example.gov.cn/roster',
  publishedAt: '2026-01-01', asOf: '2025-12-31', sha256: 'a'.repeat(64), rowCount: 20,
};

test('reference mapping retains recorded zero while leaving absent MCA-style detail unfilled', () => {
  const dto = mapReferenceInstitutionDetail(reference);
  assert.equal(dto.kind, 'reference');
  assert.equal(dto.name, '甲养老院');
  assert.equal(dto.region, '河北省石家庄市');
  assert.equal(dto.address.value, null);
  assert.equal(dto.address.availability, 'source_missing');
  assert.equal(dto.beds.total.value, 0);
  assert.equal(dto.beds.total.availability, 'recorded');
  assert.equal(dto.beds.total.label, '原表床位数');
  assert.equal(dto.beds.dayCare.value, null);
  assert.equal(dto.beds.fullCare.value, null);
  assert.equal(dto.beds.nursing.value, null);
  for (const fee of Object.values(dto.monthlyFees)) assert.equal(fee.availability, 'source_missing');
  for (const note of Object.values(dto.monthlyFeeNotes)) assert.equal(note.availability, 'source_missing');
  for (const field of [dto.profile.starLevel, dto.profile.subsidyStatus, dto.profile.functionPositioning]) {
    assert.equal(field.value, null);
    assert.equal(field.availability, 'source_missing');
  }
  for (const service of Object.values(dto.services)) assert.equal(service.availability, 'source_missing');
  assert.equal(dto.chargeItems.value, null);
  assert.equal(dto.reviews.count.value, null);
  assert.equal(dto.reviews.score.value, null);
});

test('official mapping preserves local-source terms and never infers platform fees or reviews', () => {
  const dto = mapOfficialInstitutionDetail(official, source);
  assert.equal(dto.kind, 'official');
  assert.equal(dto.region, '河北省 · 石家庄市');
  assert.equal(dto.address.value, '乙路 1 号');
  assert.equal(dto.beds.total.value, 80);
  assert.equal(dto.beds.total.label, '原表床位数');
  assert.equal(dto.beds.residents.value, 0);
  assert.equal(dto.beds.residents.availability, 'recorded');
  assert.equal(dto.beds.staff.value, null);
  assert.equal(dto.services.content.value, '日间照护');
  assert.equal(dto.services.content.source, 'official');
  assert.equal(dto.services.team.value, null);
  assert.equal(dto.monthlyFees.total.value, null);
  assert.equal(dto.chargeItems.value, null);
  assert.equal(dto.reviews.count.value, null);
});

test('blank optional strings remain source missing without converting numbers to strings', () => {
  const dto = mapOfficialInstitutionDetail({ ...official, address: '', services: '', beds: 0 }, { ...source, city: null });
  assert.equal(dto.region, '河北省');
  assert.equal(dto.address.availability, 'source_missing');
  assert.equal(dto.services.content.availability, 'source_missing');
  assert.equal(dto.beds.total.value, 0);
  assert.equal(typeof dto.beds.total.value, 'number');
});

test('Guangdong name-only source maps to the shared profile without inventing institution facts', () => {
  const record: ProvinceSourceRecord = {
    id: 'gd-source-1', city: '深圳市', name: '某社区养老服务中心',
    evidenceType: '原文名称', sourceUrl: 'https://example.gov.cn/list',
    sourcePublishedAt: '2026-01-01', sourceAsOf: null, sourceStatusNote: null,
  };
  const dto = mapProvinceSourceDetail(record);
  assert.equal(dto.kind, 'province');
  assert.equal(dto.name, record.name);
  assert.equal(dto.region, '广东省 · 深圳市');
  assert.equal(dto.profile.facilityType.availability, 'source_missing');
  assert.equal(dto.address.availability, 'source_missing');
  assert.equal(dto.beds.total.availability, 'source_missing');
  assert.equal(dto.reviews.count.availability, 'source_missing');
  assert.ok(Object.values(dto.monthlyFees).every(field => field.value === null));
  assert.ok(Object.values(dto.services).every(field => field.value === null));
});
