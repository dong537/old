import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChanghuxianGuide from '../app/guangzhou/changhuxian/page';
import { ltciGuide } from '../lib/ltci-guide';
import { sitePath } from '../lib/site-path';

Object.assign(globalThis, { React });

const sourceIds = new Set(ltciGuide.sources.map((source) => source.id));

test('guide facts refer to dated sources and source IDs are unique', () => {
  assert.equal(sourceIds.size, ltciGuide.sources.length);
  for (const item of [...ltciGuide.faq, ...ltciGuide.steps]) {
    assert.ok(item.sourceIds.length > 0, `${item.title} must cite at least one source`);
    for (const id of item.sourceIds) assert.ok(sourceIds.has(id), `${item.title} references ${id}`);
  }
  for (const source of ltciGuide.sources) {
    assert.match(source.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(source.url, /^https:\/\//);
  }
});

test('guide renders the application answer open and cites each answer inline', () => {
  const html = renderToStaticMarkup(React.createElement(ChanghuxianGuide));
  const applicationAnswer = html.match(/<details\b[^>]*open=""[^>]*>[\s\S]*?<\/details>/);
  assert.ok(applicationAnswer, 'the application FAQ should be open by default');
  assert.match(applicationAnswer[0], /怎么申请/);
  for (const faq of ltciGuide.faq) {
    assert.match(html, new RegExp(`id="source-${faq.sourceIds[0]}"`));
    assert.match(html, new RegExp(`href="#source-${faq.sourceIds[0]}"`));
  }
});

test('guide separates the official annual assessment and designation notice without claiming current designation', () => {
  const html = renderToStaticMarkup(React.createElement(ChanghuxianGuide));
  assert.ok(html.includes(`href="${sitePath('/guangzhou/shangmen/?recordType=annual-assessment')}"`));
  assert.ok(html.includes(`href="${sitePath('/guangzhou/shangmen/?recordType=designation-notice')}"`));
  assert.match(html, /考核结果不能证明机构当前仍为定点，也不能证明其目前提供居家上门服务/);
  assert.match(html, /公示不等于服务协议正式生效/);
  assert.match(html, /非全量/);
  assert.doesNotMatch(html, /FAQPage|application\/ld\+json|ltci=/);
});

test('guide does not publish treatment amounts or unsupported eligibility thresholds', () => {
  const html = renderToStaticMarkup(React.createElement(ChanghuxianGuide));
  assert.doesNotMatch(html, /\d+\s*[%％元]/);
  assert.doesNotMatch(html, /年龄\s*(?:满|达到)\s*\d+|\d+\s*周岁.*(?:符合|可申请)/);
  assert.match(html, /不代替资格审核/);
});
