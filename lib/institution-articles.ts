import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { mcaCatalogLoader } from './mca-catalog-static';

export interface InstitutionArticleSource {
  id: string;
  title: string;
  url: string;
  observedAt: string;
}

export interface InstitutionArticleParagraph {
  text: string;
  sourceIds: string[];
}

export interface InstitutionArticleSection {
  heading: string;
  paragraphs: InstitutionArticleParagraph[];
}

export interface InstitutionArticle {
  schemaVersion: 1;
  slug: string;
  institutionId: string;
  status: 'draft' | 'published';
  title: string;
  summary: string;
  authorLabel: string;
  publishedAt: string;
  updatedAt: string;
  evidenceAsOf: string;
  sections: InstitutionArticleSection[];
  sources: InstitutionArticleSource[];
}

export type InstitutionArticleSummary = Pick<InstitutionArticle,
  'slug' | 'institutionId' | 'title' | 'summary' | 'authorLabel' | 'publishedAt' | 'updatedAt' | 'evidenceAsOf'>;

export interface InstitutionArticlePath { id: string; slug: string }

const defaultRoot = path.join(process.cwd(), 'content', 'institution-articles');
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const institutionIdPattern = /^(?:[A-Za-z0-9_-]{7,64}|[0-9]{4,6})$/;
const sourceIdPattern = /^[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$/;
const placeholderPattern = /\b(?:TODO|TBD|FIXME|PLACEHOLDER|LOREM IPSUM)\b|\[(?:NEED|TODO|TBD)\s*[:：]|待补(?:充|全|写)?|待填写|此处填写|示例来源/i;
const articleFields = ['schemaVersion', 'slug', 'institutionId', 'status', 'title', 'summary',
  'authorLabel', 'publishedAt', 'updatedAt', 'evidenceAsOf', 'sections', 'sources'];
let cachedDefault: InstitutionArticle[] | null = null;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value: Record<string, unknown>, fields: readonly string[], where: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('文章字段不匹配：' + where);
  }
}

function text(value: unknown, where: string, published: boolean): asserts value is string {
  if (typeof value !== 'string' || (published && !value.trim())) throw new Error('文章文本无效：' + where);
  if (published && placeholderPattern.test(value)) throw new Error('文章含待补占位内容：' + where);
}

function date(value: unknown, where: string, published: boolean): asserts value is string {
  text(value, where, published);
  if (!published && value === '') return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw new Error('文章日期无效：' + where);
  }
}

function validateArticle(value: unknown, filename: string): InstitutionArticle {
  if (!object(value)) throw new Error('文章 JSON 顶层结构无效：' + filename);
  exactFields(value, articleFields, filename);
  if (value.schemaVersion !== 1 || typeof value.slug !== 'string' || !slugPattern.test(value.slug) ||
      typeof value.institutionId !== 'string' || !institutionIdPattern.test(value.institutionId) ||
      (value.status !== 'draft' && value.status !== 'published')) {
    throw new Error('文章版本、路由或状态无效：' + filename);
  }
  const published = value.status === 'published';
  const institution = mcaCatalogLoader.getRecord(value.institutionId);
  if (!institution?.detailPath) throw new Error('文章关联的机构缺少公开详情：' + filename);

  for (const key of ['title', 'summary', 'authorLabel'] as const) text(value[key], filename + ' ' + key, published);
  const publishedAt = value.publishedAt;
  const updatedAt = value.updatedAt;
  const evidenceAsOf = value.evidenceAsOf;
  date(publishedAt, filename + ' publishedAt', published);
  date(updatedAt, filename + ' updatedAt', published);
  date(evidenceAsOf, filename + ' evidenceAsOf', published);
  if (published && (updatedAt < publishedAt || evidenceAsOf > updatedAt)) {
    throw new Error('文章日期顺序无效：' + filename);
  }

  if (!Array.isArray(value.sources) || !Array.isArray(value.sections) ||
      (published && (value.sources.length === 0 || value.sections.length === 0))) {
    throw new Error('文章来源或段落缺失：' + filename);
  }
  const sourceIds = new Set<string>();
  for (const source of value.sources) {
    if (!object(source)) throw new Error('文章来源结构无效：' + filename);
    exactFields(source, ['id', 'title', 'url', 'observedAt'], filename + ' source');
    if (typeof source.id !== 'string' || !sourceIdPattern.test(source.id) || sourceIds.has(source.id)) {
      throw new Error('文章来源 ID 无效或重复：' + filename);
    }
    sourceIds.add(source.id);
    text(source.title, filename + ' source title', published);
    date(source.observedAt, filename + ' source observedAt', published);
    text(source.url, filename + ' source url', published);
    if (published) {
      let url: URL;
      try { url = new URL(source.url); } catch { throw new Error('文章来源必须是 HTTPS URL：' + filename); }
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
        throw new Error('文章来源必须是 HTTPS URL：' + filename);
      }
      if (source.observedAt > updatedAt) throw new Error('文章来源日期晚于更新日期：' + filename);
    }
  }
  for (const section of value.sections) {
    if (!object(section)) throw new Error('文章段落结构无效：' + filename);
    exactFields(section, ['heading', 'paragraphs'], filename + ' section');
    text(section.heading, filename + ' section heading', published);
    if (!Array.isArray(section.paragraphs) || (published && section.paragraphs.length === 0)) {
      throw new Error('文章段落缺失：' + filename);
    }
    for (const paragraph of section.paragraphs) {
      if (!object(paragraph)) throw new Error('文章正文结构无效：' + filename);
      exactFields(paragraph, ['text', 'sourceIds'], filename + ' paragraph');
      text(paragraph.text, filename + ' paragraph text', published);
      if (!Array.isArray(paragraph.sourceIds) || !paragraph.sourceIds.every(id => typeof id === 'string') ||
          (published && (paragraph.sourceIds.length === 0 ||
            new Set(paragraph.sourceIds).size !== paragraph.sourceIds.length ||
            paragraph.sourceIds.some(id => !sourceIds.has(id))))) {
        throw new Error('文章正文引用的来源无效：' + filename);
      }
    }
  }
  return value as unknown as InstitutionArticle;
}

function loadArticles(root = defaultRoot): InstitutionArticle[] {
  if (root === defaultRoot && cachedDefault) return cachedDefault;
  if (!existsSync(root)) return [];
  if (!lstatSync(root).isDirectory()) throw new Error('文章目录不是普通目录：' + root);
  const articles: InstitutionArticle[] = [];
  const keys = new Set<string>();
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.name.endsWith('.json')) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('文章文件不是普通 JSON 文件：' + entry.name);
    const filename = path.join(root, entry.name);
    const article = validateArticle(JSON.parse(readFileSync(filename, 'utf8')) as unknown, filename);
    const key = article.institutionId + '/' + article.slug;
    if (keys.has(key)) throw new Error('机构文章路由重复：' + key);
    keys.add(key);
    articles.push(article);
  }
  articles.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) ||
    left.institutionId.localeCompare(right.institutionId) || left.slug.localeCompare(right.slug));
  if (root === defaultRoot) cachedDefault = articles;
  return articles;
}

export function listPublishedInstitutionArticles(institutionId: string, root?: string): InstitutionArticleSummary[] {
  return loadArticles(root).filter(article => article.status === 'published' && article.institutionId === institutionId)
    .map(({ slug, institutionId, title, summary, authorLabel, publishedAt, updatedAt, evidenceAsOf }) =>
      ({ slug, institutionId, title, summary, authorLabel, publishedAt, updatedAt, evidenceAsOf }));
}

export function getPublishedInstitutionArticle(institutionId: string, slug: string, root?: string): InstitutionArticle | null {
  return loadArticles(root).find(article => article.status === 'published' &&
    article.institutionId === institutionId && article.slug === slug) ?? null;
}

export function listPublishedArticlePaths(root?: string): InstitutionArticlePath[] {
  return loadArticles(root).filter(article => article.status === 'published')
    .map(article => ({ id: article.institutionId, slug: article.slug }));
}

/** Logical path; callers use sitePath when rendering under /eldercare. */
export function institutionArticleHref(institutionId: string, slug: string): string {
  if (!institutionIdPattern.test(institutionId) || !slugPattern.test(slug)) {
    throw new Error('机构文章路由参数无效');
  }
  return '/quanguo/pingtai/' + institutionId + '/wenzhang/' + slug + '/';
}
