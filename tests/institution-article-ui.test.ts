import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { McaPublicDetailView } from '../components/McaPublicDetailView';
import InstitutionArticlePage, { generateMetadata, generateStaticParams } from '../app/quanguo/pingtai/[id]/wenzhang/[slug]/page';
import { articlePageCopy } from '../lib/institution-article-copy';
import { getPublishedInstitutionArticle, type InstitutionArticleSummary } from '../lib/institution-articles';
import { mcaPublicLoader } from '../lib/mca-public-static';

const sampledId = 'BA7E6A754BB0A66AE053E897A6C0B507';

test('历史快照文章首屏说明资料日期、整理身份和当前状态边界', () => {
  const snapshot = articlePageCopy('csv-snapshot-review');
  assert.equal(snapshot.breadcrumb, '历史快照资料说明');
  assert.equal(snapshot.category, '历史快照资料说明');
  assert.equal(snapshot.evidenceDateLabel, '资料快照观察日期：');
  assert.match(snapshot.notice, /本站资料整理/);
  assert.match(snapshot.notice, /不代表专家审核或机构当前状态/);

  const regular = articlePageCopy('longtan-institution-review');
  assert.equal(regular.breadcrumb, '机构解读');
  assert.equal(regular.category, '机构资料解读');
  assert.equal(regular.evidenceDateLabel, '依据资料观察于：');
  assert.doesNotMatch(regular.notice, /专家审核/);
});

function detailHtml(articles: InstitutionArticleSummary[]) {
  const record = mcaPublicLoader.getIndex().records.find(item => item.mcaId === sampledId);
  const detail = mcaPublicLoader.getDetail(sampledId);
  assert.ok(record && detail);
  return renderToStaticMarkup(React.createElement(McaPublicDetailView, {
    record, detail, manifest: mcaPublicLoader.getManifest(), articles,
  }));
}

function summary(slug: string, title: string): InstitutionArticleSummary {
  return {
    institutionId: sampledId, slug, title, summary: '按注明日期整理的机构资料，仍需向机构核对。',
    authorLabel: '本站资料整理', publishedAt: '2026-11-23', updatedAt: '2026-11-23', evidenceAsOf: '2026-11-22',
  };
}

test('一机构可显示多篇文章，链接和时点明确且位置在来源之前', () => {
  const html = detailHtml([summary('sample-one', '第一篇机构解读'), summary('sample-two', '第二篇机构解读')]);
  const articleIndex = html.indexOf('id="mca-public-articles"');
  const sourceIndex = html.indexOf('id="mca-public-source"');
  assert.ok(articleIndex > 0 && sourceIndex > articleIndex);
  assert.ok(html.includes('href="#mca-public-articles"'));
  assert.ok(html.includes('href="/quanguo/pingtai/BA7E6A754BB0A66AE053E897A6C0B507/wenzhang/sample-one/"'));
  assert.ok(html.includes('href="/quanguo/pingtai/BA7E6A754BB0A66AE053E897A6C0B507/wenzhang/sample-two/"'));
  assert.ok(html.includes('<time dateTime="2026-11-22">2026-11-22</time>'));
  assert.match(html, /不证明当前在营、空床或最新报价/);
});

test('没有文章的机构不显示空文章区或失效目录项', () => {
  const html = detailHtml([]);
  assert.doesNotMatch(html, /id="mca-public-articles"|href="#mca-public-articles"/);
});

test('已发布文章预生成页面，展示逐段引用、资料时点和返回机构入口', async () => {
  const paths = generateStaticParams();
  assert.ok(paths.length > 0, '至少有一篇已发布的机构文章');
  const { id, slug } = paths[0];
  const article = getPublishedInstitutionArticle(id, slug);
  assert.ok(article);
  const page = await InstitutionArticlePage({ params: Promise.resolve({ id, slug }) });
  const html = renderToStaticMarkup(page);
  assert.ok(html.includes(article.title));
  assert.match(html, /资料来源/);
  assert.ok(html.includes(articlePageCopy(slug).evidenceDateLabel));
  assert.match(html, /返回.*的机构档案/);
  for (const source of article.sources) {
    assert.ok(html.includes('id="article-source-' + source.id + '"'));
    assert.ok(html.includes(source.url.replaceAll('&', '&amp;')));
  }
  const metadata = await generateMetadata({ params: Promise.resolve({ id, slug }) });
  assert.ok(String(metadata.title).includes(article.title));
  assert.equal(metadata.description, article.summary);
});

test('文章页提供可跳转的章节目录及可返回的机构侧栏，不展示未开放操作', async () => {
  const { id, slug } = generateStaticParams()[0];
  const article = getPublishedInstitutionArticle(id, slug);
  assert.ok(article);
  const html = renderToStaticMarkup(await InstitutionArticlePage({ params: Promise.resolve({ id, slug }) }));
  const bodyIndex = html.indexOf('id="institution-article"');
  const asideIndex = html.indexOf('aria-label="文章辅助信息"');
  assert.ok(bodyIndex > 0 && asideIndex > bodyIndex);
  assert.match(html, /aria-label="文章目录"/);
  for (const [index, section] of article.sections.entries()) {
    assert.ok(html.includes('href="#article-section-' + index + '"'));
    assert.ok(html.includes(section.heading));
  }
  assert.match(html, /查看机构档案/);
  assert.doesNotMatch(html, /长者登记|预约参观|用户登录后可查看/);
});
