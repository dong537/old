import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RulesPage from '../app/rules/page';
import NotFound from '../app/not-found';
import nationalManifest from '../public/data/qcc-national/manifest.v1.json';
import officialManifest from '../public/data/national-official/manifest.v1.json';
import institutionReferenceManifest from '../public/data/qcc-institutions/manifest.v1.json';

Object.assign(globalThis, { React });

test('methodology distinguishes private originals from contact-masked public fields', () => {
  const html = renderToStaticMarkup(React.createElement(RulesPage));
  assert.match(html, /全部 11 个原列名和非联系字段原值/);
  assert.match(html, /全部 37 个原列名和非联系字段原值/);
  assert.match(html, /手机、电话、邮箱及含联系方式的自由文本整格显示“\[已遮蔽\]”/);
  assert.match(html, /私有 XLSX 原件保留不变，不随网站发布/);
  assert.doesNotMatch(html, /联系方式仅保留为来源文字|联系方式作为来源文字展示|全部 37 个原始字段/);
});

test('methodology discloses national candidate coverage and its limits', () => {
  const html = renderToStaticMarkup(React.createElement(RulesPage));
  assert.match(html, /收录范围：全国线索、官方来源、登记主体与广州专项/);
  assert.ok(html.indexOf('全国机构线索来自') < html.indexOf('广州档案收录'));
  assert.match(html, new RegExp(`${nationalManifest.sourceFiles.length} 份企查查导出快照`));
  assert.match(html, new RegExp(`${nationalManifest.rowCount.toLocaleString('zh-CN')} 条原始行`));
  assert.match(html, /不是全国养老机构名录或当前在营数/);
  assert.match(html, /跨省登记主体与跨省官方来源行尚未自动关联/);
  assert.match(html, new RegExp(officialManifest.rowCount.toLocaleString('zh-CN') + ' 条跨省官方来源记录'));
  assert.match(html, new RegExp(officialManifest.sources.length + ' 组经核验的官方来源'));
  for (const source of officialManifest.sources) {
    assert.ok(html.includes(source.title), 'missing official source title: ' + source.id);
  }
  assert.doesNotMatch(html, /官方机构来源仅覆盖广东/);
  assert.match(html, new RegExp(institutionReferenceManifest.rowCount.toLocaleString('zh-CN') + ' 条企查查来源机构线索'));
  assert.match(html, /资料截至日未知/);
  assert.match(html, /省市派生列存在冲突/);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.some((href) => href.replace(/\/$/, '') === '/quanguo/laiyuan'), 'missing official source link');
  assert.ok(hrefs.some((href) => href.replace(/\/$/, '') === '/quanguo/cankao'), 'missing institution reference link');
  const prefix = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH === '/eldercare' ? '/eldercare' : '';
  // Next Link resolves basePath and trailing slashes during the Next build, not this standalone render.
  assert.ok(hrefs.some((href) => href.replace(/\/$/, '') === '/quanguo/zhuti'), `missing national directory link: ${JSON.stringify(hrefs)}`);
  assert.ok(hrefs.includes(`${prefix}/data/qcc-national/manifest.v1.json`), `missing national manifest link: ${JSON.stringify(hrefs)}`);
});

test('global recovery links lead to the nationwide institution directory', () => {
  const notFound = renderToStaticMarkup(React.createElement(NotFound));
  assert.match(notFound, /全国目录/);
  assert.ok(notFound.includes('href="/quanguo/cankao/"'));
  assert.doesNotMatch(notFound, /回到广州目录/);
  assert.ok(!notFound.includes('href="/guangzhou/jigou/"'));

  const rules = renderToStaticMarkup(React.createElement(RulesPage));
  assert.match(rules, new RegExp('href="/quanguo/cankao/?"[^>]*>查找养老机构 →</a>'));
  assert.match(rules, new RegExp('href="/quanguo/cankao/?"[^>]*>返回查找养老机构</a>'));
  assert.match(rules, /查看广州名单 JSON/);
});
