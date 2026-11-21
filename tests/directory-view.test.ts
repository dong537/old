import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { DirectoryView } from '../components/DirectoryView';
import { InstitutionList } from '../components/InstitutionList';
import { catalog, districts } from '../lib/catalog';
import { searchInstitutions } from '../lib/search';
import { sitePath } from '../lib/site-path';

// tsx follows this Next project's preserved JSX setting and uses the classic
// runtime outside Next. Supply React only to the server-rendering test harness.
Object.assign(globalThis, { React });

function renderDirectory(query = '') {
  return renderToStaticMarkup(React.createElement(SearchParamsContext.Provider, {
    value: new URLSearchParams(query),
  }, React.createElement(DirectoryView, { institutions: catalog.institutions, districts })));
}

function textContent(html: string) {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
}

function links(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({
    href: match[1].match(/href="([^"]*)"/)?.[1].replace(/&amp;/g, '&') ?? '',
    current: match[1].match(/aria-current="([^"]*)"/)?.[1],
    text: textContent(match[2]),
  }));
}

function group(html: string, name: string) {
  const content = html.match(new RegExp(`<div\\b[^>]*role="group"[^>]*aria-label="${name}"[^>]*>([\\s\\S]*?)<\\/div>`));
  assert.ok(content, `页面应提供“${name}”筛选行`);
  return content[1];
}

function facts(html: string) {
  return [...html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)]
    .map(match => [textContent(match[1]), textContent(match[2])]);
}

test('district chips use real query counts and preserve search and comparison while resetting the page', () => {
  const html = renderDirectory('q=广州&district=越秀区&page=2&compare=gz-000001,gz-000002');
  const areaLinks = links(group(html, '区域'));
  assert.equal(areaLinks.length, 12);
  const selected = areaLinks.find(link => link.current === 'true');
  assert.ok(selected?.text.startsWith('越秀'));
  const tianhe = areaLinks.find(link => link.text.startsWith('天河'));
  assert.ok(tianhe);
  assert.equal(tianhe.text, `天河 ${searchInstitutions(catalog.institutions, { q: '广州', district: '天河区' }).total}`);
  const target = new URL(tianhe.href, 'https://example.test');
  assert.equal(target.searchParams.get('q'), '广州');
  assert.equal(target.searchParams.get('district'), '天河区');
  assert.equal(target.searchParams.get('compare'), 'gz-000001,gz-000002');
  assert.equal(target.searchParams.has('page'), false);
  const all = new URL(areaLinks[0].href, 'https://example.test');
  assert.equal(all.searchParams.has('district'), false);
  assert.equal(all.searchParams.get('q'), '广州');
  assert.equal(all.searchParams.get('compare'), 'gz-000001,gz-000002');
});

test('prepayment chips show actual facet counts and keep the other filters and comparison', () => {
  const html = renderDirectory('q=广州&district=越秀区&deposit=yes&membershipFee=unknown&compare=gz-000001,gz-000002');
  for (const name of ['预收养老服务费', '押金', '会员费']) {
    assert.equal(links(group(html, name)).length, 4);
  }
  const depositLinks = links(group(html, '押金'));
  assert.ok(depositLinks.find(link => link.current === 'true')?.text.startsWith('是'));
  const no = depositLinks.find(link => link.text.startsWith('否'));
  assert.ok(no);
  const target = new URL(no.href, 'https://example.test');
  assert.equal(target.searchParams.get('q'), '广州');
  assert.equal(target.searchParams.get('district'), '越秀区');
  assert.equal(target.searchParams.get('deposit'), 'no');
  assert.equal(target.searchParams.get('membershipFee'), 'unknown');
  assert.equal(target.searchParams.get('compare'), 'gz-000001,gz-000002');
  assert.equal(target.searchParams.has('page'), false);
  const allDistrict = links(group(html, '区域'))[0];
  const allTarget = new URL(allDistrict.href, 'https://example.test');
  assert.equal(allTarget.searchParams.get('deposit'), 'yes');
  assert.equal(allTarget.searchParams.get('membershipFee'), 'unknown');
  const clear = links(html).find(link => link.text === '清空条件');
  assert.ok(clear);
  const clearTarget = new URL(clear.href, 'https://example.test');
  for (const key of ['q', 'district', 'advanceFee', 'deposit', 'membershipFee']) assert.equal(clearTarget.searchParams.has(key), false);
  assert.equal(clearTarget.searchParams.get('compare'), 'gz-000001,gz-000002');
});

test('invalid prepayment filter reports correction and does not hide all results', () => {
  const html = renderDirectory('deposit=free');
  assert.match(textContent(html), /押金筛选参数无效，已恢复为全部/);
  assert.match(textContent(html), /找到 235 条官方名单记录/);
});

test('directory starts with keyword search and shows only supported filters', () => {
  const html = renderDirectory('q=广州&district=越秀区&deposit=yes&compare=gz-000001');
  const form = html.match(/<form\b[\s\S]*?<\/form>/)?.[0];
  assert.ok(form);
  assert.match(form, /role="search"/);
  assert.match(form, /name="q"[^>]*value="广州"/);
  assert.match(form, /name="district"[^>]*value="越秀区"/);
  assert.match(form, /name="deposit"[^>]*value="yes"/);
  assert.match(form, /name="compare"[^>]*value="gz-000001"/);
  for (const name of ['老人情况', '月费', '机构等级', '长护险', '医疗', '可信度']) {
    assert.doesNotMatch(html, new RegExp('role="group" aria-label="' + name + '"'));
  }
  assert.doesNotMatch(html, /<button\b[^>]*disabled/);
  assert.match(html, /押金/);
});
test('mobile district filter stays compact until opened and exposes the selected district', () => {
  const initial = renderDirectory();
  assert.match(initial, /<details class="[^"]*sm:hidden"><summary[^>]*>按区筛选<[/]summary>/);
  const selected = renderDirectory('district=越秀区');
  assert.match(selected, /<details class="[^"]*sm:hidden" open=""><summary[^>]*>按区筛选：越秀区<[/]summary>/);
  assert.equal(links(group(selected, '区域')).find(link => link.current === 'true')?.text, `越秀 ${searchInstitutions(catalog.institutions, { district: '越秀区' }).total}`);
});
test('filter recovery and pagination keep the existing comparison selection', () => {
  const html = renderDirectory('q=广州&district=越秀区&compare=gz-000001,gz-000002');
  for (const label of ['清空条件', '关键词：广州 ×', '区域：越秀 ×', '下一页']) {
    const link = links(html).find(item => item.text === label);
    assert.ok(link, `应有“${label}”链接`);
    assert.equal(new URL(link.href, 'https://example.test').searchParams.get('compare'), 'gz-000001,gz-000002');
  }
  const clear = links(html).find(item => item.text === '清空条件')!;
  const target = new URL(clear.href, 'https://example.test');
  assert.equal(target.searchParams.has('q'), false);
  assert.equal(target.searchParams.has('district'), false);
});

test('comparison entry preserves normalized URL selection order and requires two institutions', () => {
  const html = renderDirectory('q=广州&district=越秀区&page=2&compare=gz-000003,gz-000001,gz-000003,unknown');
  const entry = links(html).find(link => link.text === '对比已选机构');
  assert.ok(entry);
  const target = new URL(entry.href, 'https://example.test');
  assert.equal(target.pathname, sitePath('/guangzhou/duibi/'));
  assert.equal(target.searchParams.get('ids'), 'gz-000003,gz-000001');
  const from = new URL(target.searchParams.get('from') ?? '', 'https://example.test');
  assert.equal(from.pathname, '/guangzhou/jigou/');
  assert.equal(from.searchParams.get('q'), '广州');
  assert.equal(from.searchParams.get('district'), '越秀区');
  assert.equal(from.searchParams.get('page'), '2');
  assert.equal(from.searchParams.has('compare'), false);
  assert.deepEqual([...target.searchParams.keys()], ['ids', 'from']);

  const single = renderDirectory('compare=gz-000001');
  assert.equal(links(single).some(link => link.text === '对比已选机构'), false);
  assert.match(textContent(single), /再选1家即可对比/);
  assert.equal(links(renderDirectory()).some(link => link.text === '对比已选机构'), false);
});

test('official institution cards prioritize sourced facts instead of repeated unknown services', () => {
  const item = catalog.institutions[0];
  const returnTo = '/guangzhou/jigou/?q=颐福居&compare=gz-000001%2Cgz-000002';
  const html = renderToStaticMarkup(React.createElement(InstitutionList, {
    items: [item], returnTo, selectedIds: [item.id], onToggleCompare: () => undefined,
  }));
  assert.deepEqual(facts(html), [
    ['备案床位', '54 张'], ['服务费预收', '原表标记：是'],
    ['押金', '原表标记：是'], ['会员费', '原表标记：否'],
  ]);
  assert.match(textContent(html), /官方名单.*2026-09-23/);
  assert.match(html, /href="tel:02083586999"/);
  assert.match(html, /<input\b[^>]*type="checkbox"[^>]*checked=""/);
  const profile = links(html).find(link => link.text === item.name);
  assert.ok(profile);
  assert.equal(new URL(profile.href, 'https://example.test').searchParams.get('from'), returnTo);
  assert.doesNotMatch(textContent(html), /已存管|未存管|非定点|已认领|已核验|样例/);
});

test('missing official card values remain unknown and never become zero or a fabricated telephone link', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionList, {
    items: [{ ...catalog.institutions[0], registeredBeds: null, phone: null, phoneHref: null, advanceFee: null, deposit: null, membershipFee: null }],
  }));
  assert.equal(facts(html).length, 0);
  assert.match(textContent(html), /备案床位原表未提供/);
  assert.match(textContent(html), /原表未提供电话/);
  assert.doesNotMatch(html, /href="tel:|null|undefined/);
});
test('institution card distinguishes a withheld mobile from a missing source telephone', () => {
  const html = renderToStaticMarkup(React.createElement(InstitutionList, {
    items: [{ ...catalog.institutions[0], phone: null, phoneHref: null, phoneWithheld: true }],
  }));
  assert.match(textContent(html), /原表有手机号格式电话，本站暂不展示/);
  assert.doesNotMatch(html, /原表未提供电话|13800000000|href="tel:/);
});
