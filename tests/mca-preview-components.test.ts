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
  assert.match(html, /设施类型原标签：养老机构/);
  assert.match(html, /机构星级原码：00/);
  assert.match(html, /平台列示床位/);
  assert.match(html, /¥0–3,000 元\/月/);
  assert.match(html, /查看平台 ID 与快照标识/);
});

test('月费用单边缺值明确标为缺失，不输出伪造的数值区间', () => {
  const partial = { ...record, listedMonthlyFeeMin: null };
  const html = renderToStaticMarkup(React.createElement(McaPreviewDirectoryContent, { records: [mapMcaPreviewCard(partial)], snapshotId: 'observed-test', capturedAt: null, withDetailCount: 0, fieldPathCount: 151, params: new URLSearchParams() }));
  assert.match(html, /下限未提供/);
  assert.match(html, /上限 ¥3,000 元\/月/);
  assert.ok(!html.includes('¥未提供–'));
});

test('列表为无值的费用和星级保留字段位置，并保持移动筛选可达', () => {
  const withoutFees = { ...record, listedMonthlyFeeMin: null, listedMonthlyFeeMax: null, platformStarCode: null };
  const html = renderToStaticMarkup(React.createElement(McaPreviewDirectoryContent, {
    records: [mapMcaPreviewCard(withoutFees)], snapshotId: 'observed-test', capturedAt: null,
    withDetailCount: 0, fieldPathCount: 151, params: new URLSearchParams(),
  }));
  assert.match(html, /月费用范围：原平台未提供/);
  assert.match(html, /机构星级原码：原平台未提供/);
  assert.match(html, /<details[^>]*class="filter-panel lg:hidden"[^>]*open=""/);
  assert.match(html, /class="directory-workspace"/);
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

test('私有详情依官网栏目顺序展示，未核验联系原值与零值可辨', () => {
  const observed: McaPreviewDetail['detailObservations'][number] = {
    source: { fetchedAtUtc: '2026-11-20T02:00:00Z' },
    endpoints: {
      orgBaseDetail: { source: {}, sourceFields: {
        ahae0021: 100, ahae0635: '1', tag: '民办,城区',
        orgBaseInfo: { infoDetail: '机构介绍', point: '116,39' },
        orgServiceInfo: { serviceDetail: '生活照料', serviceTeam: '护理团队', serviceTime: '全天', serviceRadius: '自理', serviceRadiusExplain: '服务说明' },
        ahae2572: '个人联系人', ahae2573: '13800000000',
        hae5List: [{ ahae2372: 'private-photo-file-id' }],
      } },
      yangLaoOrgDetail: { source: {}, sourceFields: {
        ahae2347: 0, ahae0019: 0, ahae2343: 0, ahae2323: 0,
        hae8List: [{ axbe8002: '04', axbe8004: 0, axbe8003: 3000 }],
        hae4List: [{ axbe4001: 'fee-1', axbe4002: '床位费', axbe4003: '按房型', axbe4004: '2000/月' }],
      } },
    },
  };
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, { dto: mapMcaPreviewDetail(record, { ...detail, detailObservations: [observed] }, 'observed-test') }));
  const order = ['mca-preview-fees', 'mca-preview-basic', 'mca-preview-service', 'mca-preview-beds', 'mca-preview-charges', 'mca-preview-evaluation'];
  for (let index = 1; index < order.length; index++) assert.ok(html.indexOf('id="' + order[index - 1] + '"') < html.indexOf('id="' + order[index] + '"'));
  const structured = html.slice(html.indexOf('<header'), html.indexOf('id="mca-preview-original"'));
  const structuredText = structured.replace(/<[^>]*>/g, '');
  assert.match(structured, /平台列示护理型床位/);
  assert.match(structured, /日托床位/);
  assert.match(structured, /0 个/);
  assert.match(structured, /原值为 0，不代表免费/);
  assert.doesNotMatch(structured, /元\/月（平台列示）/);
  assert.match(structured, /金额为平台列示元\/月/);
  assert.match(structured, /床位费/);
  assert.match(structured, /养老消费补贴/);
  assert.match(structuredText, /联系人：个人联系人/);
  assert.match(structuredText, /联系电话：13800000000/);
  assert.doesNotMatch(structuredText, /个人联系人（原平台列示/);
  assert.match(structuredText, /联系人和电话为原平台快照值，未经本站核验/);
  assert.doesNotMatch(structured, /来源原始坐标|地图不可用|地图导航/);
  assert.match(structured, /平台含 1 项图片记录/);
  assert.doesNotMatch(structured, /查看地图|预约参观/);
  assert.doesNotMatch(structured, /private-photo-file-id/);
  assert.match(html, /原始响应与采集证据/);
});

test('私有详情沿用官网主体顺序，并把开发说明和证据移到末尾', () => {
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, { dto: mapMcaPreviewDetail(record, detail, 'observed-test') }));
  const hero = html.slice(html.indexOf('<header'), html.indexOf('id="mca-preview-fees"'));
  assert.ok(hero.indexOf('<h1') < hero.indexOf('民政部平台采集观察'));
  assert.match(html, /class="[^"]*institution-detail-page/);
  assert.match(html, /<table[^>]*aria-label="月费用摘要"/);
  assert.match(html, /<th[^>]*scope="row"[^>]*>月总费用/);
  assert.match(html, /aria-label="机构照片"/);
  assert.match(html, /本来源未提供可公开的机构照片/);
  assert.doesNotMatch(html, /aria-label="详情栏目"/);
  assert.ok(html.indexOf('id="mca-preview-evaluation"') < html.indexOf('仅供本机开发预览'));
  assert.match(html, /lg:px-20/);
  const overview = html.slice(html.indexOf('<header'), html.indexOf('id="mca-preview-original"'));
  assert.doesNotMatch(overview, /预约参观|服务申请/);
});

test('私有详情服务信息沿用五行图标与标签的可读结构', () => {
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, { dto: mapMcaPreviewDetail(record, detail, 'observed-test') }));
  const services = html.slice(html.indexOf('id="mca-preview-service"'), html.indexOf('id="mca-preview-beds"'));
  assert.equal((services.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length, 5);
  for (const label of ['服务内容', '服务团队', '服务时间', '服务范围', '服务说明']) assert.ok(services.includes(label));
});

test('窄屏费用摘要四项全部直接可见，无需横向滚动', () => {
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, { dto: mapMcaPreviewDetail(record, detail, 'observed-test') }));
  const mobileFees = html.match(/<dl[^>]*aria-label="月费用摘要（窄屏）"[^>]*>(.*?)<\/dl>/s)?.[1];
  assert.ok(mobileFees);
  for (const label of ['月总费用', '床位费用', '护理费用', '膳食费用']) assert.ok(mobileFees.includes(label));
  assert.equal((mobileFees.match(/<dt/g) ?? []).length, 4);
  assert.doesNotMatch(mobileFees, /min-w-\[/);
});

test('仅原平台补贴原码 1 显示补贴徽标', () => {
  const makeObservation = (code: string): McaPreviewDetail['detailObservations'][number] => ({
    source: {}, endpoints: {
      orgBaseDetail: { source: {}, sourceFields: { ahae0635: code, hae5List: [] } },
      yangLaoOrgDetail: { source: {}, sourceFields: {} },
    },
  });
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, {
    dto: mapMcaPreviewDetail({ ...record, platformStarCode: null }, { ...detail, detailObservations: [makeObservation('0')] }, 'observed-test'),
  }));
  const hero = html.slice(html.indexOf('<header'), html.indexOf('id="mca-preview-fees"'));
  assert.doesNotMatch(hero, /养老消费补贴（原平台标识）/);
  assert.match(hero, /养老消费补贴原码：0（含义待核）/);
  assert.doesNotMatch(hero, /机构星级原码：未提供（评定期未核）/);
  assert.match(hero, /原平台记录 0 张图片/);
  assert.match(html, /<details[^>]*id="mca-preview-original"/);
  assert.match(html, /<summary[^>]*>原始响应与采集证据/);
});

test('机构图片区按官网三列比例占位，不编造图片 URL', () => {
  const photos: McaPreviewDetail['detailObservations'][number] = {
    source: {}, endpoints: {
      orgBaseDetail: { source: {}, sourceFields: { hae5List: Array.from({ length: 4 }, (_, index) => ({ ahae2372: 'private-photo-' + index })) } },
      yangLaoOrgDetail: { source: {}, sourceFields: {} },
    },
  };
  const html = renderToStaticMarkup(React.createElement(McaPreviewDetailView, {
    dto: mapMcaPreviewDetail(record, { ...detail, detailObservations: [photos] }, 'observed-test'),
  }));
  const hero = html.slice(html.indexOf('<header'), html.indexOf('id="mca-preview-fees"'));
  assert.match(hero, /sm:grid-cols-3/);
  assert.equal((hero.match(/aria-label="图片记录 [1-3]"/g) ?? []).length, 3);
  assert.match(hero, /平台含 4 项图片记录/);
  assert.doesNotMatch(hero, /private-photo-|<img/);
});
