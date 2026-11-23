import assert from 'node:assert/strict';
import test from 'node:test';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';
import { buildPriceReference, filterPriceReference, priceReferenceHref, priceRangeText } from '../lib/price-reference';

test('价格参考只投影 CSV 完整月总费，不从历史观察或缺失值补零', () => {
  const index = mcaCatalogLoader.getIndex();
  const data = buildPriceReference(index.records);
  assert.equal(data.csvRecordCount, 3497);
  assert.equal(data.records.length, 2328);
  assert.equal(data.unavailableCount, 1169);
  assert.equal(data.zeroRangeCount, 28);
  assert.equal(data.provinces.length, 5);
  assert.equal(data.provinces.reduce((sum, item) => sum + item.count, 0), data.records.length);
  for (const record of data.records) {
    const source = index.records.find(item => item.mcaId === record.id);
    assert.equal(source?.sourceKind, 'csv');
    assert.equal(record.min, source?.listedMonthlyFeeMin);
    assert.equal(record.max, source?.listedMonthlyFeeMax);
    assert.ok(record.province.length > 0);
    assert.ok(record.updatedAt.length > 0);
  }
});

test('缺失、单端、负数和倒置区间不纳入价格样本；真实零值保留', () => {
  const original = mcaCatalogLoader.getIndex().records.find(record => record.sourceKind === 'csv');
  assert.ok(original);
  const data = buildPriceReference([
    { ...original, mcaId: 'zero-record', listedMonthlyFeeMin: 0, listedMonthlyFeeMax: 0 },
    { ...original, mcaId: 'one-side', listedMonthlyFeeMin: 1000, listedMonthlyFeeMax: null },
    { ...original, mcaId: 'negative', listedMonthlyFeeMin: -1, listedMonthlyFeeMax: 2000 },
    { ...original, mcaId: 'reversed', listedMonthlyFeeMin: 3000, listedMonthlyFeeMax: 2000 },
  ]);
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].id, 'zero-record');
  assert.equal(data.unavailableCount, 3);
  assert.equal(priceRangeText(0, 0), '0 元/月（来源原值，不代表免费）');
  assert.equal(priceRangeText(0, 3000), '0–3,000 元/月（含来源零值，请核实）');
  assert.equal(priceRangeText(2000, 4000), '2,000–4,000 元/月');
});

test('省市与关键词联合筛选，分页钳制且未知地区显示空结果', () => {
  const data = buildPriceReference(mcaCatalogLoader.getIndex().records);
  const first = data.records[0];
  const found = filterPriceReference(data.records, new URLSearchParams({ province: first.province, city: first.city, q: first.name }));
  assert.ok(found.total > 0);
  assert.ok(found.records.some(record => record.id === first.id));
  assert.ok(found.records.every(record => record.province === first.province && record.city === first.city));
  const last = filterPriceReference(data.records, new URLSearchParams({ page: '99999' }));
  assert.equal(last.page, last.pageCount);
  assert.ok(last.records.length > 0 && last.records.length <= 20);
  const empty = filterPriceReference(data.records, new URLSearchParams({ province: '不存在省' }));
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.records, []);
});

test('价格分页链接只保留允许筛选，忽略外部跳转参数', () => {
  const href = priceReferenceHref(new URLSearchParams({ province: '河北省', city: '石家庄市', q: '养老', from: 'https://example.com/' }), 2);
  const url = new URL(href, 'https://local.test');
  assert.equal(url.pathname, '/quanguo/jiage/');
  assert.equal(url.searchParams.get('province'), '河北省');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.has('from'), false);
  assert.equal(priceReferenceHref(new URLSearchParams(), 1), '/quanguo/jiage/');
});
