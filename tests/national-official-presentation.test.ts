import assert from 'node:assert/strict';
import test from 'node:test';
import { officialNameCaution } from '../lib/national-official-presentation';

test('all four Chongqing source test units are explicitly marked', () => {
  for (const [rowNumber, name] of [
    [23, '测试单位1209'],
    [305, '测试机构003'],
    [671, '测试单位001'],
    [1510, '测试99'],
  ] as const) {
    const caution = officialNameCaution({ sourceId: 'cq-mzj-20251222', rowNumber, name, address: null });
    assert.match(caution ?? '', /疑似测试记录/);
    assert.match(caution ?? '', /不能作为机构信息使用/);
  }
});

test('Chongqing test-row warning does not apply to a neighboring record', () => {
  assert.equal(officialNameCaution({
    sourceId: 'cq-mzj-20251222',
    rowNumber: 22,
    name: '重庆市南岸区社会福利中心',
    address: '重庆市南岸区黄桷垭福寿路1号',
  }), null);
  assert.equal(officialNameCaution({
    sourceId: 'cq-mzj-20251222',
    rowNumber: 24,
    name: '测试单位1209',
    address: null,
  }), null);
});
