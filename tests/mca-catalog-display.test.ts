import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { McaCatalogDetailView } from '../components/McaPublicDetailView';
import { mapMcaCatalogDisplay } from '../lib/mca-catalog-display';
import { MCA_CATALOG_CSV_FIELDS, type McaCatalogCsvDetail, type McaCatalogCsvFields,
  type McaCatalogIndexRecord, type McaCatalogManifest } from '../lib/mca-catalog-types';
import { mcaPublicLoader } from '../lib/mca-public-static';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';

const original = mcaPublicLoader.getIndex().records.find(row => row.mcaId === 'BA7E6A754BB0A66AE053E897A6C0B507');
assert.ok(original);
const record: McaCatalogIndexRecord = { ...original, sourceKind: 'csv', collectorStatus: 'stale',
  csvUpdatedAtLocal: '2026-11-22T19:57:39', detailPath: 'details/test.v1.json', hasDetail: true };
const manifest: McaCatalogManifest = { schemaVersion: 1, scope: 'partial_mca_csv_catalog', snapshotId: 'csv-test',
  observedSnapshotId: 'observed-test', sourceCsvSha256: 'a'.repeat(64), csvExportDate: '2026-11-23',
  generatedAtUtc: '2026-11-23T01:00:00Z', csvRowCount: 3497, csvStaleCount: 3, observedRecordCount: 231,
  overlapCount: 131, recordCount: 3597, detailCount: 3597, nationalComplete: false, currentStatusVerified: false };

function csvFields(): McaCatalogCsvFields {
  const empty = Object.fromEntries(MCA_CATALOG_CSV_FIELDS.map(key => [key, null])) as unknown as McaCatalogCsvFields;
  return { ...empty, org_id: record.mcaId, name: 'CSV 机构长名称测试', org_type: '养老机构',
    area: '山西省/长治市', area_code: '140400', address: '测试街道 8 号',
    found_date: '2021-04-13', building_area: 1200, tags: ['民办', '城区'],
    services: ['机构服务', '日托服务'], total_beds: 100, beds: 60, nursing_beds: 30,
    fee_month_min: 3000, fee_month_max: 6000, fee_bed_min: 1000, fee_bed_max: 3000,
    intro: '公开介绍正文', service_detail: '日常照护', service_team: '护理团队',
    fee_detail_json: [{ serviceType: '双人间', project: '照护和居住', priceRangeText: '3000元/月' }],
    cx_beds: 5, cx_nursing_beds: 2, cx_fee_day_min: 0, cx_fee_day_max: 200,
    cx_fee_detail_json: [{ serviceType: '短期托养', project: '喘息照护', priceRangeText: '200元/日' }],
    rt_beds: 10, rt_nursing_beds: 4, rt_fee_day_min: 100, rt_fee_day_max: 300,
    rt_fee_detail_json: [], home_fee_time_min: 50, home_fee_time_max: 100,
    home_service_project: '上门护理', assess_fee_home: 0, assess_fee_site: 80,
    contact: '王女士', phone: '010-12345678', evaluation: 0, eval_count: 0,
    point: '111.123,39.123', risk_level: '03', status: 'stale',
    updated_at: '2026-11-22T19:57:39' };
}
function detail(fields = csvFields()): McaCatalogCsvDetail {
  return { schemaVersion: 1, snapshotId: manifest.snapshotId, mcaId: record.mcaId, sourceKind: 'csv', fields };
}

test('CSV 展示 DTO 按 51 列映射且不混入重叠的旧观察值', () => {
  const dto = mapMcaCatalogDisplay(record, detail(), manifest);
  assert.equal(dto.name, 'CSV 机构长名称测试');
  assert.equal(dto.capacity.total.value, 100);
  assert.equal(dto.capacity.fullCare.value, 60);
  assert.equal(dto.capacity.nursing.value, 30);
  assert.deepEqual(dto.monthlyFees[0].range.value, [3000, 6000]);
  assert.equal(dto.serviceFields[0].field.value, '机构服务、日托服务');
  assert.equal(dto.foundDate.value, '2021-04-13');
  assert.deepEqual(dto.source.rawFields.map(field => field.key), MCA_CATALOG_CSV_FIELDS);
  assert.equal(JSON.stringify(dto.source.rawFields).includes('images_json'), false);
});

test('CSV 详情显示真实值、待刷新提醒和本地无时区采集时间，不把状态或原码当在营评级', () => {
  const html = renderToStaticMarkup(React.createElement(McaCatalogDetailView, { record, detail: detail(), manifest }));
  for (const value of ['CSV 机构长名称测试', '100 个', '60 个', '30 个', '3,000',
    '平台列示日期（原值）', '2021-04-13', '日常照护', '短期托养', '王女士', '010-12345678']) {
    assert.ok(html.includes(value), value);
  }
  assert.match(html, /资料待刷新|采集器标记为待刷新/);
  assert.match(html, /2026-11-22T19:57:39[\s\S]*时区未提供/);
  assert.match(html, /原值为 0，不代表免费/);
  assert.match(html, /能力评估[\s\S]*上门评估费（元）[\s\S]*原值为 0，不代表免费/);
  assert.doesNotMatch(html, /已在营|风险评级|图片记录|images_json/);
  assert.match(html, /<details[\s\S]*risk_level[\s\S]*03[\s\S]*<\/details>/);
});

test('CSV 缺失、零值和长文本原样保留', () => {
  const longIntro = '长期照护与康复服务。'.repeat(150);
  const changed = { ...csvFields(), intro: longIntro, total_beds: 0, beds: null,
    fee_month_min: null, fee_month_max: null, eval_count: null, status: 'ok' as const };
  const dto = mapMcaCatalogDisplay({ ...record, collectorStatus: 'ok' }, detail(changed), manifest);
  assert.equal(dto.capacity.total.value, 0);
  assert.equal(dto.capacity.fullCare.value, null);
  assert.equal(dto.monthlyFees[0].range.value, null);
  assert.equal(dto.introduction.value, longIntro);
});

test('已导入 CSV 的首中末与 stale 详情都能经同一 DTO 展示', () => {
  const manifest = mcaCatalogLoader.getManifest();
  const records = mcaCatalogLoader.getIndex().records.filter(row => row.sourceKind === 'csv');
  assert.equal(records.length, manifest.csvRowCount);
  const examples = [records[0], records[Math.floor(records.length / 2)], records.at(-1),
    records.find(row => row.collectorStatus === 'stale')];
  for (const record of examples) {
    assert.ok(record?.sourceKind === 'csv');
    const detail = mcaCatalogLoader.getCsvDetail(record.mcaId);
    assert.ok(detail);
    const dto = mapMcaCatalogDisplay(record, detail, manifest);
    assert.equal(dto.name, detail.fields.name);
    assert.equal(dto.capacity.total.value, detail.fields.total_beds);
    assert.equal(dto.source.rawFields.length, 51);
    const html = renderToStaticMarkup(React.createElement(McaCatalogDetailView, { record, detail, manifest }));
    assert.ok(html.includes(detail.fields.name));
    assert.ok(html.includes('来源原值'));
    if (record.collectorStatus === 'stale') assert.match(html, /资料待刷新/);
  }
});
