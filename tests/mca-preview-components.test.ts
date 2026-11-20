import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { McaPreviewDirectoryContent } from '../components/McaPreviewDirectoryView';
import { McaPreviewDetailView } from '../components/McaPreviewDetailView';
import { mapMcaPreviewCard, mapMcaPreviewDetail } from '../lib/mca-preview-dto';
import type { McaPreviewDetail, McaPreviewIndexRecord } from '../lib/mca-preview-types';

const record: McaPreviewIndexRecord = {
  mcaId: '000123', detailPath: 'details/example.json', name: '春晖养老院',
  facilityTypeCode: '01', facilityTypeLabel: '养老机构', areaCode: '440100000000',
  regionLabel: '广东省广州市', regionPath: '广东省/广州市', address: '测试路 1 号',
  listedBeds: 0, nursingBeds: null, listedMonthlyFeeMin: 0, listedMonthlyFeeMax: 3000,
  platformStarCode: '00', evaluationCount: 0, overallEvaluation: 0,
  functionPositioningLabel: null, platformTagsRaw: '公办,医养结合',
  hasDetail: false, listObservationCount: 1, detailObservationCount: 0, conflictFields: [],
};

const detail: McaPreviewDetail = {
  schemaVersion: 1, mcaId: record.mcaId, publishable: false, selectedFieldSources: {}, conflictFields: [],
  listObservations: [{
    source: { fetchedAtUtc: '2026-11-20T01:02:03Z', fileSha256: 'abc123', responseSha256: 'def456', mirror: 'primary', sourceRelativePath: 'private/raw.json', rowNumber: 1 },
    sourceFields: { axbe0003: '春晖养老院', unknownKey: '<script>bad</script>' },
  }],
  detailObservations: [],
};

test('列表显示镜像时点、真实零值和缺详情状态', () => {
  const html = renderToStaticMarkup(React.createElement(McaPreviewDirectoryContent, { records: [mapMcaPreviewCard(record)], snapshotId: 'observed-test', capturedAt: '2026-11-20T01:02:03Z', withDetailCount: 0, fieldPathCount: 151, params: new URLSearchParams() }));
  assert.match(html, /镜像封存时间/);
  assert.match(html, /春晖养老院/);
  assert.match(html, /0 个/);
  assert.match(html, /尚无双端点详情/);
  assert.match(html, /机构星级原码：00/);
  assert.match(html, /暂无平台评价/);
  assert.match(html, /镜像封存时间：2026-11-20T01:02:03Z/);
  assert.match(html, /quanguo\/mca-preview\/000123/);
});

test('详情保留原字段与来源哈希，但对原值做 HTML 转义', () => {
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, { dto: mapMcaPreviewDetail(record, detail, 'observed-test') }));
  assert.match(html, /abc123/);
  assert.match(html, /2026-11-20T01:02:03Z/);
  assert.match(html, /unknownKey/);
  assert.ok(!html.includes('<script>bad</script>'));
  assert.match(html, /尚无双端点详情/);
  assert.match(html, /yanglao\.mca\.gov\.cn/);
  assert.match(html, /暂无评价（原值为 0）/);
  assert.match(html, /平台标签原文（资格未核）/);
  assert.match(html, /平台列示床位/);
  assert.match(html, /¥0–3,000 元\/月（平台列示）/);
  assert.match(html, /查看平台 ID 与快照标识/);
});

test('月费用单边缺值明确标为缺失，不输出伪造的数值区间', () => {
  const partial = { ...record, listedMonthlyFeeMin: null };
  const html = renderToStaticMarkup(React.createElement(McaPreviewDirectoryContent, { records: [mapMcaPreviewCard(partial)], snapshotId: 'observed-test', capturedAt: null, withDetailCount: 0, fieldPathCount: 151, params: new URLSearchParams() }));
  assert.match(html, /下限未提供/);
  assert.match(html, /上限 ¥3,000 元\/月/);
  assert.ok(!html.includes('¥未提供–'));
});

test('详情区分未提供和来源冲突的空摘要', () => {
  const conflicted = { ...record, name: null, conflictFields: ['name'] as McaPreviewIndexRecord['conflictFields'] };
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, { dto: mapMcaPreviewDetail(conflicted, { ...detail, conflictFields: ['name'] }, 'observed-test') }));
  assert.match(html, /观察值冲突，见原始证据/);
  assert.match(html, /原平台未提供/);
});

test('列表将机构名称冲突显示为待核，详情按任务分组字段', () => {
  const conflicted = { ...record, name: null, conflictFields: ['name'] as McaPreviewIndexRecord['conflictFields'] };
  const list = renderToStaticMarkup(React.createElement(McaPreviewDirectoryContent, { records: [mapMcaPreviewCard(conflicted)], snapshotId: 'observed-test', capturedAt: null, withDetailCount: 0, fieldPathCount: 151, params: new URLSearchParams() }));
  const profile = renderToStaticMarkup(React.createElement(McaPreviewDetailView, { dto: mapMcaPreviewDetail(record, detail, 'observed-test') }));
  assert.match(list, /机构名称观察值冲突/);
  assert.match(profile, /基本信息/);
  assert.match(profile, /床位与费用/);
  assert.match(profile, /平台标签与评价/);
});
