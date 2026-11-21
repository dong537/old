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

test('平台标签在 DTO 中拆分为有序列表，保留原文供证据核对', () => {
  const row = { ...base, platformTagsRaw: '民办，医养结合养老机构、城区' };
  const dto = mapMcaPreviewDetail(row, detail, 'observed-test');
  assert.deepEqual(dto.platformDetail.tags.value, ['民办', '医养结合养老机构', '城区']);
  assert.equal(dto.facts.find(fact => fact.key === 'platformTagsRaw')?.text, row.platformTagsRaw);
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

const officialObservation: McaPreviewDetail['detailObservations'][number] = {
  source: { fetchedAtUtc: '2026-11-20T02:00:00Z' },
  endpoints: {
    orgBaseDetail: { source: { fetchedAtUtc: '2026-11-20T02:00:00Z' }, sourceFields: {
      ahae0021: 1112.7, ahae0635: '1', tag: '民办,医养结合养老机构',
      orgBaseInfo: { infoDetail: '机构介绍', point: '116,39' },
      orgServiceInfo: { serviceDetail: '生活照料', serviceTeam: '护理团队', serviceTime: '全天', serviceRadius: '自理老人', serviceRadiusExplain: '服务说明' },
      ahae2572: '私人联系人', ahae2573: '13800000000',
      hae5List: [{ ahae2372: 'private-photo-file-id' }],
    } },
    yangLaoOrgDetail: { source: { fetchedAtUtc: '2026-11-20T02:00:01Z' }, sourceFields: {
      ahae2347: 55, ahae0019: 0, ahae2343: 55, ahae2323: 55,
      hae8List: [
        { axbe8002: '01', axbe8004: 2000, axbe8003: 7000, axbe8005: '按评估级别' },
        { axbe8002: '02', axbe8004: 4500, axbe8003: 6500, axbe8005: '朝向不同' },
        { axbe8002: '03', axbe8004: 1500, axbe8003: 1500, axbe8005: '含加餐' },
        { axbe8002: '04', axbe8004: 8000, axbe8003: 15000, axbe8005: '按房型和护理' },
      ],
      hae4List: [{ axbe4001: 'fee-1', axbe4002: '床位费', axbe4003: '按朝向', axbe4004: '4500/月---6500/月' }],
    } },
  },
};

test('私有详情 DTO 对齐官网栏目并保留日托零床位、四类费用与收费原文', () => {
  const row = { ...base, listedBeds: 55, nursingBeds: 55, listedMonthlyFeeMin: 8000, listedMonthlyFeeMax: 15000 };
  const dto = mapMcaPreviewDetail(row, { ...detail, detailObservations: [officialObservation] }, 'observed-test');
  assert.equal(dto.platformDetail.identity.facilityType.value, '养老机构');
  assert.equal(dto.platformDetail.identity.starCode.value, '00');
  assert.equal(dto.platformDetail.identity.region.value, '广东省/广州市/越秀区');
  assert.equal(dto.platformDetail.identity.address.value, '测试路 1 号');
  assert.equal(dto.platformDetail.evaluation.count.value, 0);
  assert.equal(dto.platformDetail.evaluation.score.value, 0);
  assert.equal(dto.platformDetail.tags.state, 'conflict');
  assert.equal(dto.platformDetail.tags.value, null);
  assert.equal(dto.platformDetail.areaSqm.value, 1112.7);
  assert.equal(dto.platformDetail.subsidyCode.value, '1');
  assert.equal(dto.platformDetail.pointRaw.value, '116,39');
  assert.equal(dto.platformDetail.photoCount.value, 1);
  assert.equal(dto.platformDetail.contactName.value, '私人联系人');
  assert.equal(dto.platformDetail.contactPhone.value, '13800000000');
  assert.equal(dto.platformDetail.introduction.value, '机构介绍');
  assert.equal(dto.platformDetail.service.content.value, '生活照料');
  assert.equal(dto.platformDetail.service.team.value, '护理团队');
  assert.equal(dto.platformDetail.service.hours.value, '全天');
  assert.equal(dto.platformDetail.service.scope.value, '自理老人');
  assert.equal(dto.platformDetail.service.explanation.value, '服务说明');
  assert.equal(dto.platformDetail.beds.total.value, 55);
  assert.equal(dto.platformDetail.beds.dayCare.value, 0);
  assert.equal(dto.platformDetail.beds.fullCare.value, 55);
  assert.equal(dto.platformDetail.beds.nursing.value, 55);
  assert.deepEqual(dto.platformDetail.feeSummary.map(item => item.label), ['月总费用', '床位费用', '护理费用', '膳食费用']);
  assert.deepEqual(dto.platformDetail.feeSummary.map(item => item.range.value), [[8000, 15000], [4500, 6500], [2000, 7000], [1500, 1500]]);
  assert.deepEqual(dto.platformDetail.feeSummary.map(item => item.description.value), ['按房型和护理', '朝向不同', '按评估级别', '含加餐']);
  assert.deepEqual(dto.platformDetail.charges.value, [{ id: 'fee-1', name: '床位费', description: '按朝向', standard: '4500/月---6500/月' }]);
  assert.equal(dto.platformDetail.evaluation.text, '暂无平台评价');
  assert.ok(!JSON.stringify(dto.platformDetail).includes('private-photo-file-id'));
});

test('详情身份槽位保留列表来源缺失与冲突，不把旧值当已确认', () => {
  const row = { ...base, functionPositioningLabel: '城区', conflictFields: ['facilityTypeLabel', 'platformStarCode', 'address'] as McaPreviewIndexRecord['conflictFields'] };
  const dto = mapMcaPreviewDetail(row, detail, 'observed-test').platformDetail;
  assert.equal(dto.identity.facilityType.state, 'conflict');
  assert.equal(dto.identity.facilityType.value, null);
  assert.equal(dto.identity.starCode.state, 'conflict');
  assert.equal(dto.identity.address.state, 'conflict');
  assert.equal(dto.identity.functionPositioning.value, '城区');
  assert.equal(dto.identity.region.value, '广东省/广州市/越秀区');
  assert.deepEqual(dto.tags.value, ['公办', '医养结合']);
});

test('只有列表观察时，详情仍保留可用的标签和身份槽位', () => {
  const dto = mapMcaPreviewDetail(base, detail, 'observed-test').platformDetail;
  assert.equal(dto.tags.state, 'observed');
  assert.deepEqual(dto.tags.value, ['公办', '医养结合']);
  assert.equal(dto.identity.facilityType.value, '养老机构');
  assert.equal(dto.identity.functionPositioning.state, 'missing');
  assert.equal(dto.beds.total.observationCount, base.listObservationCount);
  assert.equal(dto.feeSummary[0].range.observationCount, base.listObservationCount);
});

test('地区层级缺失时可展示地区名称，但冲突名称不兜底成已确认', () => {
  const regionOnly = { ...base, regionPath: null, regionLabel: '广东省广州市' };
  assert.equal(mapMcaPreviewDetail(regionOnly, detail, 'observed-test').platformDetail.identity.region.value, '广东省广州市');
  const conflict = { ...regionOnly, conflictFields: ['regionLabel'] as McaPreviewIndexRecord['conflictFields'] };
  assert.equal(mapMcaPreviewDetail(conflict, detail, 'observed-test').platformDetail.identity.region.state, 'conflict');
});

test('缺失、空图片集与多次冲突观察保持不同状态，不生成图片 URL', () => {
  const row = { ...base, listedBeds: 55, nursingBeds: 55, listedMonthlyFeeMin: 8000, listedMonthlyFeeMax: 15000 };
  const missing = mapMcaPreviewDetail(row, detail, 'observed-test').platformDetail;
  assert.equal(missing.pointRaw.state, 'missing');
  assert.equal(missing.photoCount.state, 'missing');
  assert.equal(missing.contactName.state, 'missing');
  const empty = structuredClone(officialObservation);
  empty.endpoints.orgBaseDetail.sourceFields.hae5List = [];
  const zeroPhotos = mapMcaPreviewDetail(row, { ...detail, detailObservations: [empty] }, 'observed-test').platformDetail.photoCount;
  assert.deepEqual([zeroPhotos.state, zeroPhotos.value], ['observed', 0]);
  const changed = structuredClone(officialObservation);
  changed.endpoints.orgBaseDetail.sourceFields.orgBaseInfo = { point: '117,40' };
  changed.endpoints.orgBaseDetail.sourceFields.hae5List = [{ ahae2372: 'another-photo-file-id' }];
  changed.endpoints.orgBaseDetail.sourceFields.ahae2572 = '另一联系人';
  const conflict = mapMcaPreviewDetail(row, { ...detail, detailObservations: [officialObservation, changed] }, 'observed-test').platformDetail;
  for (const field of [conflict.pointRaw, conflict.photoCount, conflict.contactName]) {
    assert.equal(field.state, 'conflict');
    assert.equal(field.value, null);
  }
});

test('多次非空观察不一致时结构化详情不选边，缺组也不补零', () => {
  const changed = structuredClone(officialObservation);
  changed.endpoints.orgBaseDetail.sourceFields.orgServiceInfo = { serviceTime: '仅白天' };
  changed.endpoints.yangLaoOrgDetail.sourceFields.hae8List = [{ axbe8002: '04', axbe8004: 9000, axbe8003: 15000 }];
  changed.endpoints.yangLaoOrgDetail.sourceFields.hae4List = [{ axbe4001: 'fee-1', axbe4002: '床位费', axbe4003: '按朝向', axbe4004: '5000/月' }];
  const row = { ...base, listedBeds: 55, nursingBeds: 55, listedMonthlyFeeMin: 8000, listedMonthlyFeeMax: 15000 };
  const dto = mapMcaPreviewDetail(row, { ...detail, detailObservations: [officialObservation, changed] }, 'observed-test');
  assert.equal(dto.platformDetail.service.hours.state, 'conflict');
  assert.equal(dto.platformDetail.service.hours.value, null);
  assert.equal(dto.platformDetail.feeSummary[0].range.state, 'conflict');
  assert.equal(dto.platformDetail.feeSummary[0].range.value, null);
  assert.equal(dto.platformDetail.charges.state, 'conflict');
  assert.equal(dto.platformDetail.charges.value, null);
  const empty = mapMcaPreviewDetail({ ...base, listedMonthlyFeeMin: null, listedMonthlyFeeMax: null }, detail, 'observed-test').platformDetail;
  assert.equal(empty.beds.dayCare.state, 'missing');
  assert.equal(empty.feeSummary[0].range.state, 'missing');
  assert.deepEqual(empty.charges.value, null);
  const malformed = structuredClone(officialObservation);
  malformed.endpoints.yangLaoOrgDetail.sourceFields.hae4List = ['broken row'];
  assert.equal(mapMcaPreviewDetail(row, { ...detail, detailObservations: [malformed] }, 'observed-test').platformDetail.charges.state, 'conflict');
  const scoreConflict = mapMcaPreviewDetail(row, { ...detail, conflictFields: ['evaluationCount'] }, 'observed-test').platformDetail.evaluation;
  assert.equal(scoreConflict.state, 'conflict');
  assert.match(scoreConflict.text, /冲突/);
});

test('详情冲突不得在头部卡片继续展示旧索引值', () => {
  const dto = mapMcaPreviewDetail(base, { ...detail, conflictFields: ['name', 'address', 'facilityTypeLabel', 'platformStarCode'] }, 'observed-test');
  assert.match(dto.card.displayName, /冲突/);
  assert.match(dto.card.displayAddress, /冲突/);
  assert.equal(dto.platformDetail.identity.facilityType.state, 'conflict');
  assert.equal(dto.platformDetail.identity.starCode.state, 'conflict');
});
