import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getPublishedInstitutionArticle, institutionArticleHref,
  listPublishedArticlePaths, listPublishedInstitutionArticles,
} from '@/lib/institution-articles';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';
import { sitePath } from '@/lib/site-path';

type Props = { params: Promise<{ id: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return listPublishedArticlePaths();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, slug } = await params;
  const article = getPublishedInstitutionArticle(id, slug);
  const institution = mcaCatalogLoader.getRecord(id);
  if (!article || !institution) return { title: '文章未找到' };
  return {
    title: article.title + ' · ' + (institution.name ?? '机构档案'),
    description: article.summary,
  };
}

export default async function InstitutionArticlePage({ params }: Props) {
  const { id, slug } = await params;
  const article = getPublishedInstitutionArticle(id, slug);
  const institution = mcaCatalogLoader.getRecord(id);
  if (!article || !institution?.detailPath) notFound();

  const institutionName = institution.name ?? '该机构';
  const institutionHref = sitePath('/quanguo/pingtai/' + encodeURIComponent(id) + '/');
  const related = listPublishedInstitutionArticles(id).filter(item => item.slug !== slug);

  return <div className="min-w-0 bg-page pb-12">
    <div className="border-b border-line bg-white">
      <div className="container-site max-w-[960px] py-5 sm:py-8">
        <nav aria-label="面包屑" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-sub">
          <a href={sitePath('/quanguo/pingtai/')} className="text-brand">找养老机构</a>
          <span aria-hidden="true">›</span>
          <a href={institutionHref} className="min-w-0 break-words text-brand">{institutionName}</a>
          <span aria-hidden="true">›</span>
          <span>机构解读</span>
        </nav>
        <p className="mb-0 mt-7 text-xs font-semibold tracking-wide text-brand">机构资料解读</p>
        <h1 className="mb-0 mt-2 break-words text-[clamp(1.65rem,3.2vw,2.3rem)] font-semibold leading-tight text-ink">{article.title}</h1>
        <p className="mb-0 mt-4 break-words text-base leading-7 text-body">{article.summary}</p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-hair pt-4 text-xs leading-6 text-sub">
          <span>整理：{article.authorLabel}</span>
          <span>发布：<time dateTime={article.publishedAt}>{article.publishedAt}</time></span>
          {article.updatedAt !== article.publishedAt && <span>更新：<time dateTime={article.updatedAt}>{article.updatedAt}</time></span>}
          <span>依据资料观察于：<time dateTime={article.evidenceAsOf}>{article.evidenceAsOf}</time></span>
        </div>
      </div>
    </div>

    <div className="container-site max-w-[960px] min-w-0 py-6 sm:py-9">
      <article className="min-w-0 rounded-card border border-line bg-white p-5 shadow-card sm:p-8">
        <p className="mb-0 rounded-md border border-caution-line bg-caution-bg px-4 py-3 text-sm leading-6 text-caution">本文依据注明时点的来源资料整理，不代表机构当前在营、实时空床或最新报价；服务和收费请向机构核实。</p>
        <div className="mt-7 space-y-9">
          {article.sections.map((section, sectionIndex) => <section key={sectionIndex} aria-labelledby={'article-section-' + sectionIndex}>
            <h2 id={'article-section-' + sectionIndex} className="mb-0 break-words text-xl font-semibold leading-8 text-ink">{section.heading}</h2>
            <div className="mt-3 space-y-4">
              {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="mb-0 whitespace-pre-wrap break-words text-[15px] leading-7 text-body">
                {paragraph.text}{' '}
                {paragraph.sourceIds.map(sourceId => {
                  const sourceIndex = article.sources.findIndex(source => source.id === sourceId);
                  if (sourceIndex < 0) throw new Error('文章段落引用了不存在的来源：' + sourceId);
                  return <a key={sourceId} href={'#article-source-' + sourceId} aria-label={'查看来源 ' + (sourceIndex + 1) + '：' + article.sources[sourceIndex].title} className="ml-1 whitespace-nowrap text-sm text-brand underline-offset-4 hover:underline">[{sourceIndex + 1}]</a>;
                })}
              </p>)}
            </div>
          </section>)}
        </div>
        <section aria-labelledby="article-sources-heading" className="mt-10 border-t border-line pt-6">
          <h2 id="article-sources-heading" className="m-0 text-xl font-semibold">资料来源</h2>
          <p className="mb-0 mt-2 text-sm leading-6 text-sub">下列链接用于核对文章依据；资料时点不代表机构当前状态。</p>
          <ol className="mb-0 mt-4 space-y-4 pl-5 text-sm leading-6">
            {article.sources.map(source => <li key={source.id} id={'article-source-' + source.id} className="scroll-mt-20 min-w-0 break-words pl-1">
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink underline-offset-4 hover:underline">{source.title} ↗</a>
              <span className="block text-xs leading-5 text-sub">资料观察：<time dateTime={source.observedAt}>{source.observedAt}</time></span>
            </li>)}
          </ol>
        </section>
      </article>

      {related.length > 0 && <section aria-labelledby="related-articles-heading" className="mt-5 min-w-0 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
        <h2 id="related-articles-heading" className="m-0 text-lg font-semibold">这家机构的其他文章</h2>
        <ul className="mb-0 mt-3 divide-y divide-hair pl-0">
          {related.map(item => <li key={item.slug} className="list-none py-2"><a href={sitePath(institutionArticleHref(id, item.slug))} className="block min-h-11 max-w-full break-words py-2.5 font-medium text-brand-ink underline-offset-4 hover:underline">{item.title}</a></li>)}
        </ul>
      </section>}
      <a href={institutionHref} className="mt-5 block min-h-11 max-w-full break-words py-2.5 font-semibold text-brand-ink underline-offset-4 hover:underline">← 返回{institutionName}的机构档案</a>
    </div>
  </div>;
}
