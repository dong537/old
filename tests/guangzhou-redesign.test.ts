import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GuangzhouPage from '../app/guangzhou/page';

Object.assign(globalThis, { React });

test('Guangzhou entry offers district browsing before advice and hides unavailable features', () => {
  const html = renderToStaticMarkup(React.createElement(GuangzhouPage));
  const districts = html.indexOf('按区找');
  const sourceContext = html.indexOf('先看记录来自哪里');
  assert.ok(districts >= 0 && sourceContext > districts, '按区找应先于背景说明');
  assert.ok(/href="\/guangzhou\/jigou\/?\?district=/.test(html), '行政区应直达机构列表');
  assert.doesNotMatch(html, /<button[^>]*disabled/);
  assert.doesNotMatch(html, /本月榜单|已认领并核验|失能老人月费中位数/);
});

test('Guangzhou profile keeps the official-style sections before provenance and fee marks', () => {
  // The route imports the Next-only @company-data alias, so verify its page structure
  // here and leave rendered output to the static build/browser checks.
  const source = readFileSync('app/guangzhou/jigou/[id]/page.tsx', 'utf8');
  const overview = source.indexOf('<PublicInstitutionHero ');
  const summary = source.indexOf('<PublicInstitutionSummary ');
  const details = source.indexOf('<PublicInstitutionDetailSections ');
  const provenance = source.indexOf('<section id="sources"');
  const feeMarks = source.indexOf('<section id="custody"');
  const contact = source.indexOf('id="contact"');
  assert.ok(overview >= 0 && summary > overview && details > summary && provenance > details && feeMarks > provenance,
    '官网式详情应先展示概况与主要字段，再列来源和收费标记');
  assert.ok(contact > overview && contact < provenance, '联系出口应在来源之前');
  assert.doesNotMatch(source, /<section id="(?:fees|medical|visits|followups|history)"/);
  assert.match(source, /WITHHELD_PHONE_MESSAGE/);
  assert.match(source, /<ReturnToList/);
  assert.match(source, /<CompanyInfo/);
});
