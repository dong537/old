import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../app/page';

Object.assign(globalThis, { React });

test('首页服务卡保持原型顺序并开放真实居家上门服务入口', () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  const services = html.slice(html.indexOf('id="service-query"'), html.indexOf('id="online-services"'));
  const labels = ['民政部平台采集', '喘息服务查询', '日托服务查询', '居家上门服务查询'];
  for (const label of labels) assert.ok(services.includes(label), label);
  for (let index = 1; index < labels.length; index++) {
    assert.ok(services.indexOf(labels[index - 1]) < services.indexOf(labels[index]));
  }
  const homeCard = services.slice(services.indexOf('居家上门服务查询'));
  assert.match(homeCard, /href="\/quanguo\/shangmen"/);
  assert.doesNotMatch(homeCard, /尚未开放|建设中/);
  assert.doesNotMatch(homeCard, /href="[^"]*homeServiceList/);
});
