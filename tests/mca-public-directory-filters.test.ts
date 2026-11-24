import assert from 'node:assert/strict';
import test from 'node:test';
import type { McaPublicIndexRecord } from '../lib/mca-public-types';
import { filterPublicDirectory, publicDirectoryHref, publicDirectoryReturnHref, removeDirectoryFilter } from '../components/mca-public-directory-filters';

const make=(id:string,region='广东省/深圳市',min:number|null=2000,max:number|null=5000,label='机构服务,日托服务',conflictFields:McaPublicIndexRecord['conflictFields']=[])=>
  ({mcaId:id,name:'测试机构 '+id,address:null,regionPath:region,facilityTypeLabel:'养老机构',
    listedMonthlyFeeMin:min,listedMonthlyFeeMax:max,conflictFields,
    serviceCategoryLabel:{state:'observed' as const,value:label,observationCount:1}});
test('budget uses the written upper bound and excludes zero, partial and conflicting fees',()=>{
 const rows=[make('match'),make('too-high',undefined,2000,5001),make('missing',undefined,2000,null),make('zero',undefined,0,0),make('conflict',undefined,2000,4500,undefined,['listedMonthlyFeeMax'])];
 assert.deepEqual(filterPublicDirectory(rows,new URLSearchParams('budget=5000')).items.map(r=>r.mcaId),['match']);
 assert.deepEqual(filterPublicDirectory(rows,new URLSearchParams('budget=unknown')).items.map(r=>r.mcaId),['missing','zero','conflict']);
});
test('an empty service result never falls back to another province; service tokens are exact',()=>{
 const rows=[make('a','广东省/深圳市',1000,2000,'机构服务,日托服务说明'),make('b','北京市/北京市',1000,2000)];
 const q=new URLSearchParams({province:'广东省',city:'深圳市',service:'day'});
 const answer=filterPublicDirectory(rows,q);
 assert.equal(answer.total,0);
 assert.equal(answer.selected.city,'深圳市');
 assert.equal(filterPublicDirectory(rows,new URLSearchParams({service:'day'})).total,1);
});
test('advanced filtering paginates matches and round-trips filters into details or comparisons',()=>{
 const rows=Array.from({length:25},(_,i)=>make(String(i)));
 const params=new URLSearchParams({province:'广东省',city:'深圳市',budget:'5000',service:'day',page:'2'});
 const answer=filterPublicDirectory(rows,params);
 assert.equal(answer.items.length,5); assert.equal(answer.page,2);
 const href=publicDirectoryHref(params,2);
 assert.equal(publicDirectoryReturnHref(href),href);
 assert.equal(publicDirectoryReturnHref('/quanguo/pingtai/?budget=5000&budget=3000'),'/quanguo/pingtai/');
 assert.equal(publicDirectoryReturnHref('/quanguo/jiage/?service=day'),'/quanguo/pingtai/');
 assert.equal(publicDirectoryReturnHref('https://example.test/quanguo/pingtai/?budget=5000'),'/quanguo/pingtai/');
});

test('removing a filter keeps unrelated criteria, resets page and targets the results', () => {
  const selected=new URLSearchParams({province:'广东省',city:'广州市',q:'养老',budget:'5000',service:'day',page:'2'});
  const budget=new URL(removeDirectoryFilter(selected,'budget'),'https://example.test');
  assert.equal(budget.hash,'#directory-results');
  assert.equal(budget.searchParams.get('city'),'广州市');
  assert.equal(budget.searchParams.get('service'),'day');
  assert.equal(budget.searchParams.has('budget'),false);
  assert.equal(budget.searchParams.has('page'),false);
  const province=new URL(removeDirectoryFilter(selected,'province'),'https://example.test');
  assert.equal(province.searchParams.has('city'),false);
  assert.equal(province.searchParams.get('q'),'养老');
  assert.equal(province.searchParams.get('budget'),'5000');
  assert.equal(selected.get('page'),'2');
});
test('new low and high reference monthly caps filter inclusively and survive the return link', () => {
  const rows=[make('low',undefined,600,1000),make('medium',undefined,800,2000),make('high',undefined,12000,30000),make('above',undefined,12000,30001)];
  for (const [budget, expected] of [['1000',['low']],['2000',['low','medium']],['30000',['low','medium','high']]] as const) {
    const params=new URLSearchParams({budget});
    assert.deepEqual(filterPublicDirectory(rows,params).items.map(row=>row.mcaId),expected);
    assert.equal(publicDirectoryReturnHref(publicDirectoryHref(params,1)),'/quanguo/pingtai/?budget='+budget);
  }
});
