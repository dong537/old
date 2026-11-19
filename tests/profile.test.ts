import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileContact } from '../components/ProfileContact';
import { ProfileToc } from '../components/ProfileToc';
import { SourceNote } from '../components/SourceNote';
import { catalog } from '../lib/catalog';
import { sitePath } from '../lib/site-path';

const sourceUrl = 'https://mzj.gz.gov.cn/gk/fwjgylb/content/post_11018696.html';
Object.assign(globalThis, { React });

test('source note keeps the official original and offers the public derived snapshot', () => {
  const html = renderToStaticMarkup(createElement(SourceNote, { source: catalog.source, detailed: true }));
  assert.ok(html.includes(`href="${catalog.source.url}"`));
  assert.ok(html.includes(`href="${sitePath('/data/guangzhou-institutions.v1.json')}"`));
  assert.match(html, /站内公开快照/);
  assert.match(html, /由官方名单导入生成/);
  assert.match(html, /不是官方原页/);
});

test('profile contact keeps online booking unavailable and collects no personal information', () => {
  const html = renderToStaticMarkup(createElement(ProfileContact, {
    phone: '020-87654321', phoneHref: 'tel:02087654321', sourceUrl,
  }));
  assert.match(html, /在线预约暂未开放/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>在线预约暂未开放<\/button>/);
  assert.doesNotMatch(html, /<(?:form|input|select|textarea)\b/);
  assert.doesNotMatch(html, /预约已提交|提交成功/);
  assert.match(html, /href="tel:02087654321"/);
  assert.match(html, new RegExp(`href="${sourceUrl}"`));
});

test('profile contact displays an unverified source phone without manufacturing a call link', () => {
  const html = renderToStaticMarkup(createElement(ProfileContact, {
    phone: '020-00000000', phoneHref: null, sourceUrl,
  }));
  assert.match(html, /020-00000000/);
  assert.match(html, /待核实/);
  assert.doesNotMatch(html, /href="tel:/);
});

test('profile contact preserves an unknown phone as unknown', () => {
  const html = renderToStaticMarkup(createElement(ProfileContact, {
    phone: null, phoneHref: null, sourceUrl,
  }));
  assert.match(html, /原表未提供电话/);
  assert.doesNotMatch(html, /null|undefined|href="tel:/);
});

test('profile contact explains a withheld source mobile without displaying or linking it', () => {
  const html = renderToStaticMarkup(createElement(ProfileContact, {
    phone: null, phoneHref: null, phoneWithheld: true, sourceUrl,
  }));
  assert.match(html, /原表有手机号格式电话，本站暂不展示/);
  assert.doesNotMatch(html, /原表未提供电话|13800000000|href="tel:/);
});

test('profile TOC renders native links to the supplied archive sections', () => {
  const items = [{ id: 'overview', label: '概况' }, { id: 'fees', label: '收费明细' }, { id: 'sources', label: '来源' }];
  const html = renderToStaticMarkup(createElement(ProfileToc, { items, variant: 'bar' }));
  assert.match(html, /aria-label="本页目录"/);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['#overview', '#fees', '#sources']);
  assert.match(html, /href="#overview"[^>]*aria-current="location"/);
  assert.doesNotMatch(html, /report|claim|\/me/);
});
