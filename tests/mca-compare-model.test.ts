import assert from 'node:assert/strict';
import test from 'node:test';
import { compareFee, compareHref, compareDetailUrl, parseComparePicks, toggleComparePick } from '../components/mca-compare-model';

const detailPath='details/'+'a'.repeat(64)+'.v1.json';
const pick = (id: string) => ({ id, name: '测试机构 '+id, source: 'csv' as const, detailPath, observedAt: null });

test('selection spans lists, is unique, removes existing choices and caps at three', () => {
  const list=[pick('0001'),pick('0002'),pick('0003')];
  assert.deepEqual(toggleComparePick(list,pick('0004')),list);
  assert.deepEqual(toggleComparePick(list,pick('0002')).map(x=>x.id),['0001','0003']);
  assert.deepEqual(parseComparePicks(JSON.stringify([list[0],list[0],...list.slice(1),pick('0004')])).map(x=>x.id),['0001','0002','0003']);
});
test('the comparison return link retains the actual filtered second page and rejects an external destination', () => {
  const from='/quanguo/jiage/?province='+encodeURIComponent('北京市')+'&page=2';
  const href=new URL(compareHref(from),'https://example.test');
  assert.equal(href.pathname,'/quanguo/duibi/');
  const origin=new URL(href.searchParams.get('from')!,'https://example.test');
  assert.equal(origin.searchParams.get('province'),'北京市');
  assert.equal(origin.searchParams.get('page'),'2');
  assert.equal(compareHref('https://invalid.example/'),'/quanguo/duibi/');
});
test('monthly, daily and per-visit fee labels keep zero, incomplete and conflicting values distinct', () => {
  assert.equal(compareFee([8000,15000],'元/月'),'8,000–15,000 元/月');
  assert.match(compareFee([0,0],'元/月'),/0.*元\/月.*不代表免费/);
  assert.match(compareFee([0,120],'元/天'),/元\/天.*不代表免费/);
  assert.equal(compareFee([50,100],'元/次'),'50–100 元/次');
  assert.match(compareFee([20,null],'元/月'),/未提供完整区间/);
  assert.match(compareFee([100,50],'元/月'),/待核对/);
  assert.match(compareFee(null,'元/月','conflict'),/冲突/);
});
test('comparison fetches only approved public detail paths and tolerates index-only selections', () => {
  assert.match(compareDetailUrl(pick('0001'))!, /^\/data\/mca-catalog\/details\/[a-f0-9]{64}\.v1\.json$/);
  assert.match(compareDetailUrl({...pick('0001'),source:'observed'})!, /^\/data\/mca-observed\//);
  assert.equal(compareDetailUrl({...pick('0001'),detailPath:'../private.json'}),null);
  assert.equal(compareDetailUrl({...pick('0001'),detailPath:null}),null);
});


test('comparison preserves CSV stale status and fee units, and rejects a different snapshot', async t => {
  const { loadCompareColumn } = await import('../components/mca-compare-data');
  const selection=pick('0001');
  const detail={
    schemaVersion:1,snapshotId:'snapshot-a',mcaId:selection.id,sourceKind:'csv',
    fields:{org_id:selection.id,area:'北京市',org_type:'养老机构',status:'stale',updated_at:'2026-11-22T08:00:00',
      fee_month_min:0,fee_month_max:0,fee_bed_min:null,fee_bed_max:null,fee_care_min:100,fee_care_max:null,
      fee_meal_min:null,fee_meal_max:null,rt_fee_day_min:50,rt_fee_day_max:65,
      home_fee_time_min:80,home_fee_time_max:90,cx_fee_day_min:null,cx_fee_day_max:null,
      services:['生活照料'],total_beds:22,nursing_beds:null},
  };
  t.mock.method(globalThis,'fetch',async () => new Response(JSON.stringify(detail)));
  const signal=new AbortController().signal;
  const result=await loadCompareColumn(selection,{csv:'snapshot-a',observed:'x'},signal);
  assert.equal(result.state,'ready');
  if(result.state!=='ready') return;
  assert.match(result.column.total,/不代表免费/);
  assert.match(result.column.care,/未提供完整区间/);
  assert.equal(result.column.day,'50–65 元/天');
  assert.equal(result.column.home,'80–90 元/次');
  assert.match(result.column.status,/待刷新/);
  assert.match(result.column.date,/时区未注明/);
  await assert.rejects(loadCompareColumn(selection,{csv:'snapshot-b',observed:'x'},signal),/different snapshots/);
});
