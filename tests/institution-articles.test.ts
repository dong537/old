import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mcaCatalogLoader } from '../lib/mca-catalog-static';
import { getPublishedInstitutionArticle, institutionArticleHref, listPublishedArticlePaths, listPublishedInstitutionArticles } from '../lib/institution-articles';

const institutionId = mcaCatalogLoader.getDetailIds()[0];
assert.ok(institutionId, 'public MCA catalog needs a detailed institution');

function sample(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, institutionId, slug: 'overview', status: 'published',
    title: '机构资料核对指南', summary: '整理公开快照中可以核对的机构资料。',
    authorLabel: '本站资料整理', publishedAt: '2026-11-20', updatedAt: '2026-11-22', evidenceAsOf: '2026-11-19',
    sections: [{ heading: '已记录的信息', paragraphs: [{ text: '平台列出了机构资料，阅读时应核对原始来源。', sourceIds: ['mca'] }] }],
    sources: [{ id: 'mca', title: '全国养老服务信息平台', url: 'https://yanglao.mca.gov.cn/', observedAt: '2026-11-19' }],
    ...overrides,
  };
}

function withArticles(records: unknown[], check: (root: string) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), 'institution-articles-'));
  try {
    records.forEach((record, index) => writeFileSync(path.join(root, 'article-' + index + '.json'), JSON.stringify(record), 'utf8'));
    check(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('one institution has many published articles in reverse date order while drafts stay private', () => {
  withArticles([
    sample({ slug: 'older', publishedAt: '2026-11-01', updatedAt: '2026-11-20' }),
    sample({ slug: 'newer', publishedAt: '2026-11-21', updatedAt: '2026-11-22' }),
    sample({ slug: 'draft', status: 'draft', title: 'TODO: review' }),
  ], root => {
    assert.deepEqual(listPublishedInstitutionArticles(institutionId, root).map(item => item.slug), ['newer', 'older']);
    assert.deepEqual(listPublishedArticlePaths(root), [{ id: institutionId, slug: 'newer' }, { id: institutionId, slug: 'older' }]);
    assert.equal(getPublishedInstitutionArticle(institutionId, 'newer', root)?.title, '机构资料核对指南');
    assert.equal(getPublishedInstitutionArticle(institutionId, 'draft', root), null);
    assert.equal(getPublishedInstitutionArticle('UNKNOWN123', 'newer', root), null);
    assert.deepEqual(listPublishedInstitutionArticles('UNKNOWN123', root), []);
  });
});

test('invalid institution foreign key or duplicate route blocks publication', () => {
  withArticles([sample({ institutionId: 'UNKNOWN123' })], root => {
    assert.throws(() => listPublishedArticlePaths(root), /机构.*详情/);
  });
  withArticles([sample(), sample({ title: '另一篇同路由文章' })], root => {
    assert.throws(() => listPublishedArticlePaths(root), /重复/);
  });
});

test('missing source citation, non-HTTPS URL, invalid date, and placeholders block publication', () => {
  withArticles([sample({ sections: [{ heading: '事实', paragraphs: [{ text: '资料内容', sourceIds: ['missing'] }] }] })], root => {
    assert.throws(() => listPublishedArticlePaths(root), /来源/);
  });
  withArticles([sample({ sources: [{ id: 'mca', title: '来源', url: 'http://example.org/', observedAt: '2026-11-19' }] })], root => {
    assert.throws(() => listPublishedArticlePaths(root), /HTTPS/);
  });
  withArticles([sample({ publishedAt: '2026-02-30' })], root => {
    assert.throws(() => listPublishedArticlePaths(root), /日期/);
  });
  withArticles([sample({ summary: 'TODO：待补充机构介绍' })], root => {
    assert.throws(() => listPublishedArticlePaths(root), /占位/);
  });
  withArticles([sample({ sections: [{ heading: '事实', paragraphs: [{ text: '[NEED: 实地照片]', sourceIds: ['mca'] }] }] })], root => {
    assert.throws(() => listPublishedArticlePaths(root), /占位/);
  });
});

test('empty article directory has no published articles', () => {
  withArticles([], root => {
    assert.deepEqual(listPublishedArticlePaths(root), []);
    assert.deepEqual(listPublishedInstitutionArticles(institutionId, root), []);
    assert.equal(getPublishedInstitutionArticle(institutionId, 'overview', root), null);
  });
});

test('article URL preserves institution and article slugs without a deployment base path', () => {
  assert.equal(institutionArticleHref(institutionId, 'source-note'),
    '/quanguo/pingtai/' + institutionId + '/wenzhang/source-note/');
  assert.throws(() => institutionArticleHref(institutionId, '../draft'), /路由/);
});
