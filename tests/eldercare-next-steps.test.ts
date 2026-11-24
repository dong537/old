import assert from 'node:assert/strict';
import test from 'node:test';
import { citationText, getRegionalGuides, visitFacts } from '../components/eldercare-next-steps';

test('citation keeps both links and capture timing with historical scope', () => {
  const value = citationText({name:'示例养老院',capture:'2026-11-22（UTC）',official:'https://example.test/source',detailPath:'/eldercare/detail/'},'https://site.test');
  assert.match(value,/示例养老院/);
  assert.match(value,/2026-11-22/);
  assert.match(value,/https:\/\/example.test\/source/);
  assert.match(value,/https:\/\/site.test\/eldercare\/detail\//);
  assert.match(value,/不代表当前/);
});
test('shows the approved Guangzhou guide only for an exact region match', () => {
  assert.equal(getRegionalGuides('广东省','广州市')[0]?.href,'/guangzhou/changhuxian/');
  assert.deepEqual(getRegionalGuides('广东省','深圳市'),[]);
  assert.deepEqual(getRegionalGuides('广东省',''),[]);
});
test('visit facts refuse to invent missing information or turn zero into free', () => {
  assert.match(visitFacts({state:'error'}).total,/待核对/);
  assert.match(visitFacts({state:'index'}).services,/待核对/);
  assert.match(visitFacts(undefined).status,/读取中/);
  const facts=visitFacts({state:'ready',column:{total:'0–0 元/月（含来源原值 0，不代表免费）',services:'采集快照未提供',date:'2026-11-22',status:'历史快照'}});
  assert.match(facts.total,/不代表免费/);
  assert.match(facts.services,/待核对/);
});
