import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../app/page';

Object.assign(globalThis, { React });

test('首页首屏服务卡按已保存官网截图排序，未开放入口不伪装可点击', () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  const services = html.slice(html.indexOf('id="service-query"'), html.indexOf('id="online-services"'));
  const labels = ['机构服务查询', '喘息服务查询', '日托服务查询', '居家上门服务查询'];
  for (let index = 1; index < labels.length; index++) {
    assert.ok(services.indexOf(labels[index - 1]) < services.indexOf(labels[index]));
  }
  const homeCard = services.slice(services.indexOf('居家上门服务查询'));
  assert.match(homeCard, /官网入口建设中/);
  assert.doesNotMatch(homeCard, /href="[^"]*homeServiceList/);
});
