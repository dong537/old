import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { McaPublicDirectoryContent } from '../components/McaPublicDirectoryView';
import { McaPublicDetailView } from '../components/McaPublicDetailView';
import { mapMcaPreviewDetail } from '../lib/mca-preview-dto';
import { mcaOfficialDetailHref } from '../lib/mca-preview-ui';
import type { McaPreviewDetail, McaPreviewIndexRecord } from '../lib/mca-preview-types';
import type { McaPublicDetailRecord, McaPublicIndexRecord, McaPublicManifest } from '../lib/mca-public-types';

const mcaId = 'AD3777D91F431D21E053E897A6C077E1';
const snapshotId = 'observed-aaaaaaaaaaaaaaaaaaaaaaaa';
const detailPath = 'details/' + createHash('sha256').update(mcaId).digest('hex') + '.v1.json';
const manifest: McaPublicManifest = {
  schemaVersion: 1, scope: 'partial_observed_mca_institutions', snapshotId,
  sourcePage: 'https://yanglao.mca.gov.cn/?#/index/institutionList',
  snapshotCapturedAtUtc: '2026-11-18T17:58:00Z', generatedAtUtc: '2026-11-21T01:00:00Z',
  recordCount: 2, listObservedCount: 2, withDetailCount: 1, detailOnlyCount: 0,
  nationalComplete: false, currentStatusVerified: false,
  sourceSnapshots: [],
};
const record: McaPublicIndexRecord = {
  mcaId, detailPath, name: '北京测试养老中心', facilityTypeCode: '3', facilityTypeLabel: '养老机构',
  areaCode: '110101', regionLabel: '北京市', regionPath: '北京市/东城区', address: '龙潭路 1 号',
  listedBeds: 55, nursingBeds: 55, listedMonthlyFeeMin: 8000, listedMonthlyFeeMax: 15000,
  platformStarCode: '02', evaluationCount: 0, overallEvaluation: 0,
  functionPositioningLabel: '机构养老', platformTagsRaw: '护理',
  listedContactPhone: { state: 'observed', value: '01012345678', observationCount: 1 },
  serviceCategoryLabel: { state: 'observed', value: '机构养老', observationCount: 1 },
  subsidyCode: { state: 'observed', value: '1', observationCount: 1 },
  dayCareBeds: { state: 'observed', value: 0, observationCount: 1 },
  fullCareBeds: { state: 'observed', value: 55, observationCount: 1 },
  listObservedAtUtc: { earliest: '2026-11-18T17:57:00Z', latest: '2026-11-18T17:58:00Z' },
  hasDetail: true, listObservationCount: 1, detailObservationCount: 1, conflictFields: [],
};
const listOnly: McaPublicIndexRecord = {
  ...record, mcaId: 'BA7E6A754BB0A66AE053E897A6C0B507', name: '仅列表机构',
  detailPath: null, hasDetail: false, detailObservationCount: 0,
};

function publicDetail(): McaPublicDetailRecord {
  const observation: McaPreviewDetail['detailObservations'][number] = {
    source: { fetchedAtUtc: '2026-11-18T17:58:00Z' },
    endpoints: {
      orgBaseDetail: { source: {}, sourceFields: {
        ahae0021: 1112.7, ahae0635: '1', ahae2572: '张女士', ahae2573: '01012345678',
        orgBaseInfo: { infoDetail: '养老照护介绍', point: '116,39' },
        orgServiceInfo: { serviceDetail: '生活照料', serviceTeam: '护理团队', serviceTime: '全天', serviceRadius: '本区域', serviceRadiusExplain: '服务说明' },
        hae5List: [{ ahae2372: 'private-photo-file-id' }],
      } },
      yangLaoOrgDetail: { source: {}, sourceFields: {
        ahae2347: 55, ahae0019: 0, ahae2343: 55, ahae2323: 55,
        hae8List: [{ axbe8002: '04', axbe8004: 8000, axbe8003: 15000, axbe8005: '实际收费以机构确认为准' }],
        hae4List: [{ axbe4001: 'fee-1', axbe4002: '床位费', axbe4003: '按房型', axbe4004: '2000 元/月' }],
      } },
    },
  };
  const privateDetail: McaPreviewDetail = {
    schemaVersion: 1, mcaId, publishable: false, selectedFieldSources: {}, conflictFields: [],
    listObservations: [], detailObservations: [observation],
  };
  const dto = mapMcaPreviewDetail(record as McaPreviewIndexRecord, privateDetail, snapshotId);
  return { schemaVersion: 1, snapshotId, mcaId,
    sourcePage: mcaOfficialDetailHref(mcaId),
    detailObservedAtUtc: { earliest: '2026-11-18T17:57:30Z', latest: '2026-11-18T17:58:00Z' },
    platformDetail: dto.platformDetail,
    facts: dto.facts, conflictLabels: dto.conflictLabels };
}

test('公开目录区分已采详情和仅列表观察，后者不产生本地详情链接', () => {
  const html = renderToStaticMarkup(React.createElement(McaPublicDirectoryContent, {
    records: [record, listOnly], manifest, params: new URLSearchParams(),
  }));
  assert.match(html, /已采集 1 条双端点详情/);
  assert.match(html, /仅列表观察/);
  assert.match(html, /\/quanguo\/pingtai\/AD3777D91F431D21E053E897A6C077E1\//);
  assert.doesNotMatch(html, /\/quanguo\/pingtai\/BA7E6A754BB0A66AE053E897A6C0B507\//);
  assert.match(html, /不代表全国全量或当前在营/);
  assert.match(html, /平台列表服务类别：机构养老/);
  assert.match(html, /平台列示日托床位：0 个/);
  assert.match(html, /平台列表联系电话原值：01012345678/);
  assert.match(html, /功能定位原标签：机构养老/);
  assert.match(html, /平台标签原文（非资质认证）：护理/);
  assert.match(html, /平台评价：暂无平台评价/);
  assert.match(html, /时效待核/);
  assert.match(html, /该机构列表最晚采集/);
});

test('新增列表字段保留未知和冲突状态，不填造电话或床位', () => {
  const changed: McaPublicIndexRecord = {
    ...record,
    listedContactPhone: { state: 'missing', value: null, observationCount: 0 },
    dayCareBeds: { state: 'conflict', value: null, observationCount: 2 },
    functionPositioningLabel: null,
    platformTagsRaw: null,
    evaluationCount: null,
    conflictFields: ['platformTagsRaw'],
  };
  const html = renderToStaticMarkup(React.createElement(McaPublicDirectoryContent, {
    records: [changed], manifest: { ...manifest, recordCount: 1, listObservedCount: 1 }, params: new URLSearchParams(),
  }));
  assert.match(html, /平台列表联系电话原值：采集快照未提供/);
  assert.match(html, /平台列示日托床位：观察值冲突，待核对/);
  assert.match(html, /功能定位原标签：采集快照未提供/);
  assert.match(html, /平台标签原文（非资质认证）：观察值冲突，待核对/);
  assert.match(html, /平台评价：采集快照未提供/);
});

test('公开详情显示已采字段、零值、来源时间，隐藏内部原件与地图', () => {
  const html = renderToStaticMarkup(React.createElement(McaPublicDetailView, {
    record, detail: publicDetail(), manifest,
  }));
  for (const value of ['北京测试养老中心', '55 个', '8,000', '15,000', '1,112.7',
    '养老照护介绍', '生活照料', '护理团队', '床位费', '张女士', '01012345678', '2026-11-18']) {
    assert.ok(html.includes(value), value);
  }
  assert.match(html, /日托床位[^<]*<\/dt>[^<]*<dd[^>]*>0 个/);
  assert.match(html, /图片记录 1 项/);
  assert.match(html, /平台列表补充字段/);
  assert.match(html, /平台列表服务类别/);
  assert.match(html, /平台列表联系电话原值/);
  assert.match(html, /该机构详情采集时间/);
  assert.match(html, /该机构列表采集时间/);
  assert.match(html, /本批次最晚采集时间/);
  assert.doesNotMatch(html, /来源快照时间/);
  assert.doesNotMatch(html, /private-photo-file-id|sourceFields|ahae2572|地图|仅供本机/);
  assert.match(html, /快照不代表实时在营、实时空床或最新报价/);
});

test('仅详情观察不伪造平台列表字段或列表采集时间', () => {
  const detailOnly: McaPublicIndexRecord = {
    ...record, listObservationCount: 0, listObservedAtUtc: null,
    listedContactPhone: { state: 'missing', value: null, observationCount: 0 },
    serviceCategoryLabel: { state: 'missing', value: null, observationCount: 0 },
    subsidyCode: { state: 'missing', value: null, observationCount: 0 },
    dayCareBeds: { state: 'missing', value: null, observationCount: 0 },
    fullCareBeds: { state: 'missing', value: null, observationCount: 0 },
  };
  const html = renderToStaticMarkup(React.createElement(McaPublicDetailView, {
    record: detailOnly, detail: publicDetail(), manifest,
  }));
  assert.match(html, /该机构详情采集时间/);
  assert.doesNotMatch(html, /平台列表补充字段|该机构列表采集时间/);
});
