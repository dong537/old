import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { McaPublicDetailView } from '../components/McaPublicDetailView';
import { mcaPublicLoader } from '../lib/mca-public-static';
import type { McaPublicDetailRecord } from '../lib/mca-public-types';

// 真实公开快照：有地址、总/日托床位、四类月费、服务说明和收费项目。
const sampledId = 'BA7E6A754BB0A66AE053E897A6C0B507';

function sample() {
  const record = mcaPublicLoader.getIndex().records.find(item => item.mcaId === sampledId);
  const detail = mcaPublicLoader.getDetail(sampledId);
  assert.ok(record && detail, '已公开样本应有对应双端点详情');
  return { record, detail, manifest: mcaPublicLoader.getManifest() };
}

function render(detail?: McaPublicDetailRecord): string {
  const source = sample();
  return renderToStaticMarkup(React.createElement(McaPublicDetailView, {
    record: source.record, detail: detail ?? source.detail, manifest: source.manifest,
  }));
}

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('概况与紧随的费用区给出主要决策信息和官网出口', () => {
  const html = render();
  const beforeSections = html.split('id="mca-public-basic"')[0];
  for (const value of ['北京兆如养老服务有限公司', '北京市东城区广渠门内大街12号',
    '55 个', '8,000', '15,000', '2026-11-18', '打开官网原页核对']) {
    assert.ok(beforeSections.includes(value), `概况或费用区缺少 ${value}`);
  }
  assert.match(beforeSections, /href="https:\/\/yanglao\.mca\.gov\.cn\//);

  const mainContent = html.replace(/<details[\s\S]*?<\/details>/g, '');
  assert.equal((mainContent.match(/总床位/g) ?? []).length, 1, '总床位不应在主内容重复');
  assert.equal((mainContent.match(/8,000[–-]15,000/g) ?? []).length, 2, '完整区间应在首屏和收费明细各出现一次');
});

test('技术原码、坐标与完整索引只在可展开的来源原值中出现', () => {
  const html = render();
  const disclosure = html.match(/<details\b[^>]*>[\s\S]*?<summary\b[^>]*>来源原值<\/summary>[\s\S]*?<\/details>/)?.[0] ?? '';
  assert.ok(disclosure, '应有原生可展开的来源原值区域');
  for (const label of ['星级原码', '补贴原码', '平台原始坐标', '全部已映射索引字段']) {
    assert.ok(disclosure.includes(label), `来源原值缺少 ${label}`);
    assert.ok(!html.replace(disclosure, '').includes(label), `${label} 不应占用家属阅读主流程`);
  }
});

test('服务与收费项目按家属任务分别分组', () => {
  const html = render();
  const sections = [...html.matchAll(/<section\b[\s\S]*?<\/section>/g)].map(match => match[0]);
  assert.ok(sections.some(section => section.includes('服务内容') && section.includes('服务团队')), '服务字段应同组');
  assert.ok(sections.some(section => section.includes('8,000') && section.includes('医疗备用金')), '月费概览与分项收费应同组');
});

test('概况在手机阅读顺序中先给出床位与完整月费区间', () => {
  const html = render();
  const header = html.match(/<header id="mca-public-overview"[\s\S]*?<\/header>/)?.[0] ?? '';
  assert.match(header, /aria-label="机构关键事实"/);
  assert.ok(header.includes('55 个'));
  assert.match(header, /8,000[–-]15,000 元\/月/);
  assert.doesNotMatch(header, /2026-11-18[^<]*—[^<]*2026-11-18/);
});

test('子服务零值费用不被误读成免费，资格标签说明未核', () => {
  const source = sample();
  const changed = structuredClone(source.detail);
  changed.platformDetail.subServices.respite.fee = { state: 'observed', value: [0, 0], observationCount: 1 };
  const html = render(changed);
  assert.match(html, /喘息服务[\s\S]*?0–0 元\/天[\s\S]*?原值为 0，不代表免费/);
  assert.match(html, /平台标签原文（资格未核）/);
});

test('零值、缺失和冲突保持不同文案', () => {
  const source = sample();
  const changed = structuredClone(source.detail);
  changed.platformDetail.beds.fullCare = { state: 'missing', value: null, observationCount: 0 };
  changed.platformDetail.feeSummary[0].range = { state: 'conflict', value: null, observationCount: 2 };
  const text = visibleText(render(changed));
  assert.match(text, /日托床位\s+0 个/, '原值 0 是已观察值');
  assert.match(text, /全托床位\s+采集快照未提供/, '缺失不能显示为 0');
  assert.match(text, /月总费用\s+多次观察值冲突，待核对/, '冲突不能回退为任一金额');
});

test('评价次数的缺失、零值与冲突不互相冒充', () => {
  const source = sample();
  const changed = structuredClone(source.detail);
  changed.platformDetail.evaluation.count = { state: 'missing', value: null, observationCount: 0 };
  assert.match(visibleText(render(changed)), /采集快照未提供评价资料/);
  assert.doesNotMatch(visibleText(render(changed)), /来源记录的 0/);
  changed.platformDetail.evaluation.count = { state: 'observed', value: 0, observationCount: 1 };
  assert.match(visibleText(render(changed)), /平台列示 0 条评价，不代表零分差评/);
  changed.platformDetail.evaluation.count = { state: 'conflict', value: null, observationCount: 2 };
  assert.match(visibleText(render(changed)), /平台评价观察值冲突，待核对/);
});

test('详情暂不展示图片计数或图片文件名', () => {
  const html = render();
  assert.doesNotMatch(visibleText(html), /机构图片记录|图片 URL/);
  assert.doesNotMatch(html, /hae5List|images_json|private-photo-file-id/);
});

test('首屏完整月费沿用原版强调色', () => {
  const html = render();
  const header = html.match(/<header id="mca-public-overview"[\s\S]*?<\/header>/)?.[0] ?? '';
  assert.match(header, /text-\[#b47713\][^>]*>8,000[–-]15,000 元\/月/);
  assert.doesNotMatch(header, /#855405|#edf7e9/);
});

test('关键摘要按月费、服务、资料来源排列，三个链接也指向原有章节', () => {
  const html=render();
  const h=html.match(/<header id="mca-public-overview"[\s\S]*?<\/header>/)?.[0] ?? '';
  const fee=h.indexOf('data-overview-item="fees"');
  const service=h.indexOf('data-overview-item="services"');
  const sources=h.indexOf('data-overview-item="source"');
  assert.ok(fee>=0 && fee<service && service<sources);
  for(const target of ['fees','service','source']) assert.ok(h.includes('href="#mca-public-'+target+'"'));
});
