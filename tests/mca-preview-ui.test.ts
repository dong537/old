import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMcaPreviewRecords, mcaOfficialDetailHref, mcaPreviewDetailHref, safeMcaPreviewReturnPath } from '../lib/mca-preview-ui';

const records = [
  { mcaId: '000123', name: '春晖养老院', address: '甲路 1 号', regionPath: '广东省/广州市/越秀区', facilityTypeLabel: '养老机构' },
  { mcaId: 'A/2', name: '春晖养老院', address: null, regionPath: '广东省/深圳市/福田区', facilityTypeLabel: null },
  { mcaId: 'B3', name: '松园照护站', address: '乙路', regionPath: '北京市/朝阳区', facilityTypeLabel: '社区服务设施' },
];

test('预览筛选只按实有地区、名称地址和设施类型，不合并同名记录', () => {
  const result = filterMcaPreviewRecords(records, new URLSearchParams('province=%E5%B9%BF%E4%B8%9C%E7%9C%81&q=%E6%98%A5%E6%99%96'));
  assert.deepEqual(result.items.map(item => item.mcaId), ['000123', 'A/2']);
  assert.equal(result.total, 2);
  assert.deepEqual(result.cities, ['广州市', '深圳市']);
  assert.deepEqual(result.types, ['养老机构']);
  const specific = filterMcaPreviewRecords(records, new URLSearchParams('province=%E5%B9%BF%E4%B8%9C%E7%9C%81&city=%E6%B7%B1%E5%9C%B3%E5%B8%82&type=%E5%85%BB%E8%80%81%E6%9C%BA%E6%9E%84'));
  assert.equal(specific.total, 1);
  assert.deepEqual(specific.items.map(item => item.mcaId), ['A/2']);
  assert.ok(specific.issues.some(issue => issue.includes('设施类型')));
});

test('无效条件显式复位；缺失地区及类型不冒充未知或零', () => {
  const result = filterMcaPreviewRecords(records, new URLSearchParams('province=不存在&city=广州市&type=不存在&page=0'));
  assert.equal(result.total, 3);
  assert.equal(result.selected.province, '');
  assert.equal(result.selected.city, '');
  assert.equal(result.selected.type, '');
  assert.equal(result.page, 1);
  assert.ok(result.issues.length >= 3);
});

test('预览详情链接保留原平台 ID 并只把 ID 传到官网', () => {
  assert.equal(mcaPreviewDetailHref('000123'), '/quanguo/mca-preview/000123/');
  assert.equal(mcaPreviewDetailHref('A/2'), '/quanguo/mca-preview/A%2F2/');
  const href = mcaOfficialDetailHref('A/2');
  assert.match(href, /axbe0001=A%2F2/);
  assert.ok(!href.includes('sourceFields'));
});

test('详情返回路径只接受预览列表和白名单筛选参数', () => {
  assert.equal(safeMcaPreviewReturnPath('/quanguo/mca-preview/?province=广东省&page=2&unused=secret'), '/quanguo/mca-preview/?province=%E5%B9%BF%E4%B8%9C%E7%9C%81&page=2');
  assert.equal(safeMcaPreviewReturnPath('https://attacker.example/path'), '/quanguo/mca-preview/');
  assert.equal(safeMcaPreviewReturnPath('//attacker.example/quanguo/mca-preview/'), '/quanguo/mca-preview/');
});
