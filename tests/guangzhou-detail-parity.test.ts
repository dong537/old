import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicInstitutionDetailSections, PublicInstitutionSummary } from '../components/PublicInstitutionDetailSections';
import { catalog } from '../lib/catalog';
import { mapGuangzhouInstitutionDetail } from '../lib/institution-detail-dto';

Object.assign(globalThis, { React });

test('广州名单字段投影到官网详情栏目且不推断未知值', () => {
  const item = catalog.institutions[0];
  const dto = mapGuangzhouInstitutionDetail(item);
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PublicInstitutionSummary, { dto }),
    React.createElement(PublicInstitutionDetailSections, { dto }),
  ));
  assert.match(html, /备案床位/);
  assert.match(html, /月总费用/);
  assert.equal(dto.beds.total.value, item.registeredBeds);
  assert.equal(dto.monthlyFees.total.value, null);
  assert.equal(dto.profile.contactPhone.value, item.phoneWithheld ? null : item.phone);
  assert.doesNotMatch(html, /预约参观|服务申请|查看地图/);
});

test('广州路由保留来源和联系出口，详情采用全宽官网顺序', () => {
  const source = readFileSync('app/guangzhou/jigou/[id]/page.tsx', 'utf8');
  const order = ['<PublicInstitutionHero', '<PublicInstitutionSummary', '<PublicInstitutionDetailSections', 'id="sources"', 'id="custody"', 'id="company"', 'id="checklist"'];
  for (let index = 1; index < order.length; index++) assert.ok(source.indexOf(order[index - 1]) < source.indexOf(order[index]), order[index]);
  assert.match(source, /contactPhoneNode=/);
  assert.match(source, /sourceLabel="广州市民政局公开名单/);
  assert.match(source, /sourceDate={null}/);
  assert.match(source, /' · 发布于 ' \+ catalog\.source\.publishedAt/);
  assert.ok(source.includes('mapGuangzhouInstitutionDetail(item)'));
  assert.match(source, /WITHHELD_PHONE_MESSAGE/);
  assert.match(source, /<ReturnToList/);
  assert.match(source, /<CompanyInfo/);
  assert.match(source, /<PublicInstitutionBottomNav name=\{item\.name\} items=\{toc\} \/>/);
  for (const anchor of ['overview', 'fields', 'services', 'care', 'reviews', 'sources', 'custody', 'company', 'checklist']) {
    assert.ok(source.includes(`{ id: '${anchor}'`), `missing detail navigation target ${anchor}`);
  }
  assert.doesNotMatch(source, /<ProfileToc[^>]*variant="side"/);
});
