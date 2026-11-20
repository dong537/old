import assert from 'node:assert/strict';
import test from 'node:test';
import { mapMcaPreviewCard, mapMcaPreviewDetail } from '../lib/mca-preview-dto';
import { mcaPreviewFields } from '../lib/mca-preview-types';
import type { McaPreviewDetail, McaPreviewIndexRecord } from '../lib/mca-preview-types';

const base: McaPreviewIndexRecord = {
  mcaId: '000123', detailPath: 'details/example.json', name: '春晖养老院',
  facilityTypeCode: '1', facilityTypeLabel: '养老机构', areaCode: '440100000000',
  regionLabel: '广东省广州市', regionPath: '广东省/广州市/越秀区', address: '测试路 1 号',
  listedBeds: 0, nursingBeds: null, listedMonthlyFeeMin: 0, listedMonthlyFeeMax: 3000,
  platformStarCode: '00', evaluationCount: 0, overallEvaluation: 0,
  functionPositioningLabel: null, platformTagsRaw: ' 公办,医养结合 ',
  hasDetail: false, listObservationCount: 1, detailObservationCount: 0, conflictFields: [],
};

const detail: McaPreviewDetail = {
  schemaVersion: 1, mcaId: base.mcaId, publishable: false, conflictFields: [],
  selectedFieldSources: {
    name: { channel: 'list', source: { fetchedAtUtc: '2026-11-20T01:02:03Z', fileSha256: 'abc' } },
    listedBeds: { channel: 'yangLaoOrgDetail', source: { fetchedAtUtc: null, fileSha256: 'def' } },
  },
  listObservations: [{ source: { fetchedAtUtc: '2026-11-20T01:02:03Z' }, sourceFields: { axbe0003: '春晖养老院', unknownKey: '<script>private</script>' } }],
  detailObservations: [],
};

test('列表 DTO 保留筛选原值，统一零床位、单边费用与评价文案', () => {
  const dto = mapMcaPreviewCard(base);
  assert.equal(dto.mcaId, '000123');
  assert.equal(dto.name, '春晖养老院');
  assert.equal(dto.address, '测试路 1 号');
  assert.equal(dto.regionPath, '广东省/广州市/越秀区');
  assert.equal(dto.facilityTypeLabel, '养老机构');
  assert.equal(dto.displayName, '春晖养老院');
  assert.equal(dto.displayRegion, '广东省 / 广州市 / 越秀区');
  assert.equal(dto.displayAddress, '测试路 1 号');
  assert.equal(dto.displayType, '养老机构');
  assert.equal(dto.bedsText, '0 个');
  assert.equal(dto.nursingBedsText, '未提供');
  assert.equal(dto.feeText, '¥0–3,000 元/月（平台列示）');
  assert.equal(dto.feeWarning, true);
  assert.equal(dto.starText, '00（评定期未核）');
  assert.equal(dto.evaluationText, '暂无平台评价');
  assert.equal(dto.hasDetail, false);
  assert.equal(dto.listObservationCount, 1);
  assert.deepEqual(dto.conflictFields, []);
  assert.equal('platformTagsRaw' in dto, false);
});

test('列表 DTO 不把来源冲突当缺失，也不拼接冲突价格', () => {
  const row: McaPreviewIndexRecord = { ...base, name: null, regionPath: null, regionLabel: null, address: null,
    listedMonthlyFeeMin: null, platformStarCode: null, evaluationCount: null,
    conflictFields: ['name', 'listedMonthlyFeeMin', 'platformStarCode'] };
  const dto = mapMcaPreviewCard(row);
  assert.equal(dto.name, null);
  assert.equal(dto.displayName, '机构名称观察值冲突');
  assert.equal(dto.displayRegion, '地区未提供');
  assert.equal(dto.displayAddress, '原平台未提供');
  assert.equal(dto.feeText, '费用观察值冲突，见原始证据');
  assert.equal(dto.feeWarning, false);
  assert.equal(dto.starText, '星级原码待核');
  assert.equal(dto.evaluationText, null);
  assert.deepEqual(dto.conflictFields, row.conflictFields);
});

test('冲突字段即使带有旧值，也不参与筛选或展示为已确认值', () => {
  const dto = mapMcaPreviewCard({ ...base, conflictFields: ['name', 'address', 'regionPath', 'facilityTypeLabel', 'listedBeds', 'platformStarCode'] });
  assert.equal(dto.name, null);
  assert.equal(dto.address, null);
  assert.equal(dto.regionPath, null);
  assert.equal(dto.facilityTypeLabel, null);
  assert.equal(dto.displayName, '机构名称观察值冲突');
  assert.equal(dto.displayRegion, '地区层级观察值冲突');
  assert.equal(dto.bedsText, '观察值冲突');
  assert.equal(dto.starText, '星级原码待核');
});

test('无费用与有评价的列表 DTO 保留原码，不推断评分量表', () => {
  const dto = mapMcaPreviewCard({ ...base, listedMonthlyFeeMin: null, listedMonthlyFeeMax: null,
    platformStarCode: '05', evaluationCount: 2, overallEvaluation: 4.8 });
  assert.equal(dto.feeText, null);
  assert.equal(dto.feeWarning, false);
  assert.equal(dto.starText, '05（评定期未核）');
  assert.equal(dto.evaluationText, '平台评价 2 次 · 综合评价原值 4.8（量表未核）');
});

test('详情 DTO 生成有序事实、来源端点与原值证据，不修改输入', () => {
  const before = JSON.stringify({ base, detail });
  const dto = mapMcaPreviewDetail(base, detail, 'observed-test');
  assert.equal(dto.snapshotId, 'observed-test');
  assert.equal(dto.card.displayName, '春晖养老院');
  assert.deepEqual(dto.facts.map(item => item.key), [...mcaPreviewFields]);
  assert.equal(dto.facts.length, 16);
  const name = dto.facts.find(item => item.key === 'name');
  assert.deepEqual(name?.source, { channelLabel: '平台列表', fetchedAtUtc: '2026-11-20T01:02:03Z' });
  const beds = dto.facts.find(item => item.key === 'listedBeds');
  assert.equal(beds?.state, 'observed');
  assert.equal(beds?.text, '0 个');
  assert.deepEqual(beds?.source, { channelLabel: '养老详情', fetchedAtUtc: null });
  const fee = dto.facts.find(item => item.key === 'listedMonthlyFeeMin');
  assert.equal(fee?.text, '0 元/月');
  assert.equal(fee?.warning, '原值为 0，不代表免费。');
  const score = dto.facts.find(item => item.key === 'overallEvaluation');
  assert.equal(score?.text, '暂无评价（原值为 0）');
  const tag = dto.facts.find(item => item.key === 'platformTagsRaw');
  assert.equal(tag?.text, ' 公办,医养结合 ');
  assert.match(tag?.label ?? '', /资格未核/);
  const absent = dto.facts.find(item => item.key === 'functionPositioningLabel');
  assert.equal(absent?.state, 'missing');
  assert.equal(absent?.text, '原平台未提供');
  assert.equal(absent?.source, null);
  assert.deepEqual(dto.conflictLabels, []);
  assert.equal(dto.listObservations, detail.listObservations);
  assert.equal(dto.detailObservations, detail.detailObservations);
  assert.equal(JSON.stringify({ base, detail }), before);
});

test('详情 DTO 冲突不选值、不展示单边来源；未知采集时间保留空值', () => {
  const row: McaPreviewIndexRecord = { ...base, name: null, nursingBeds: null, conflictFields: ['name'] };
  const evidence: McaPreviewDetail = { ...detail, conflictFields: ['name', 'nursingBeds'],
    selectedFieldSources: { ...detail.selectedFieldSources, nursingBeds: { channel: 'orgBaseDetail', source: { fetchedAtUtc: 123 } } } };
  const dto = mapMcaPreviewDetail(row, evidence, 'observed-other');
  const name = dto.facts.find(item => item.key === 'name');
  assert.equal(name?.state, 'conflict');
  assert.equal(name?.text, '观察值冲突，见原始证据');
  assert.equal(name?.source, null);
  const nursing = dto.facts.find(item => item.key === 'nursingBeds');
  assert.equal(nursing?.state, 'conflict');
  assert.equal(nursing?.source, null);
  assert.deepEqual(dto.conflictLabels, ['机构名称', '护理型床位（平台列示）']);
  assert.equal(dto.listObservations[0].sourceFields.unknownKey, '<script>private</script>');
});
