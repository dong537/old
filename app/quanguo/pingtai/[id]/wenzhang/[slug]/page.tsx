import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getPublishedInstitutionArticle, institutionArticleHref,
  listPublishedArticlePaths, listPublishedInstitutionArticles,
} from '@/lib/institution-articles';
import { mcaCatalogLoader } from '@/lib/mca-catalog-static';
import { articlePageCopy } from '@/lib/institution-article-copy';
import { sitePath } from '@/lib/site-path';
import { McaArticleContextLink } from '@/components/McaArticleContextLink';

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
  const institutionHref = '/quanguo/pingtai/' + encodeURIComponent(id) + '/';
  const related = listPublishedInstitutionArticles(id).filter(item => item.slug !== slug);
  const copy = articlePageCopy(slug);

  return <div className="institution-article-page min-w-0 bg-[#f4f5f7] pb-12">
    <div className="bg-[#f4f5f7]">
      <div className="container-site max-w-[1200px] py-4 sm:py-5">
        <nav aria-label="面包屑" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-sub">
          <a href={sitePath('/')} className="text-[#0e6d31]">首页</a>
          <span aria-hidden="true">›</span>
          <McaArticleContextLink href="/quanguo/pingtai/" toDirectory className="text-[#0e6d31]">找养老机构</McaArticleContextLink>
          <span aria-hidden="true">›</span>
          <McaArticleContextLink href={institutionHref} className="min-w-0 break-words text-[#0e6d31]">{institutionName}</McaArticleContextLink>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{copy.breadcrumb}</span>
        </nav>
      </div>
    </div>

    <div className="container-site max-w-[1200px] min-w-0 py-5 sm:py-7">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[minmax(0,760px)_minmax(0,1fr)]">
      <article id="institution-article" className="min-w-0 border border-[#e2e8e1] bg-white p-5 sm:p-7 lg:p-8">
        <header className="border-b border-[#e8ece7] pb-5 text-center">
          <p className="m-0 text-[13px] font-medium text-[#246719]">{copy.category}</p>
          <h1 className="mx-auto mb-0 mt-3 max-w-[680px] break-words text-[clamp(1.5rem,2.7vw,2rem)] font-bold leading-[1.4] text-ink">{article.title}</h1>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[12px] leading-6 text-sub">
            <span>整理：{article.authorLabel}</span>
            <span>发布：<time dateTime={article.publishedAt}>{article.publishedAt}</time></span>
            {article.updatedAt !== article.publishedAt && <span>更新：<time dateTime={article.updatedAt}>{article.updatedAt}</time></span>}
            <span>{copy.evidenceDateLabel}<time dateTime={article.evidenceAsOf}>{article.evidenceAsOf}</time></span>
          </div>
        </header>
        <p className="mb-0 mt-5 rounded-[4px] bg-[#f2f3f4] px-4 py-4 text-[15px] leading-7 text-body sm:px-5">{article.summary}</p>
        <p className="mb-0 mt-4 border-l-[3px] border-[#d59a42] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#76501b]">{copy.notice}</p>
        <details className="mt-5 border border-[#e2e8e1] bg-[#f7faf6] px-4 py-3 lg:hidden">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-[#0e6d31]">本文目录</summary>
          <nav aria-label="文章目录" className="pb-2"><ol className="m-0 space-y-2 pl-5 text-sm leading-6">{article.sections.map((section, index) => <li key={index}><a href={'#article-section-' + index} className="break-words text-[#0e6d31] underline-offset-4 hover:underline">{section.heading}</a></li>)}</ol></nav>
        </details>
        <div className="mt-7 space-y-9">
          {article.sections.map((section, sectionIndex) => <section key={sectionIndex} aria-labelledby={'article-section-' + sectionIndex}>
            <h2 id={'article-section-' + sectionIndex} className="mb-0 scroll-mt-24 break-words border-l-4 border-[#378821] pl-3 text-xl font-semibold leading-8 text-ink">{section.heading}</h2>
            <div className="mt-3 space-y-4">
              {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="mb-0 whitespace-pre-wrap break-words text-[15px] leading-7 text-body">
                {paragraph.text}{' '}
                {paragraph.sourceIds.map(sourceId => {
                  const sourceIndex = article.sources.findIndex(source => source.id === sourceId);
                  if (sourceIndex < 0) throw new Error('文章段落引用了不存在的来源：' + sourceId);
                  return <a key={sourceId} href={'#article-source-' + sourceId} aria-label={'查看来源 ' + (sourceIndex + 1) + '：' + article.sources[sourceIndex].title} className="ml-1 whitespace-nowrap text-sm text-[#0e6d31] underline-offset-4 hover:underline">[{sourceIndex + 1}]</a>;
                })}
              </p>)}
            </div>
          </section>)}
        </div>
        <section aria-labelledby="article-sources-heading" className="mt-10 border-t border-[#e2e8e1] pt-6">
          <h2 id="article-sources-heading" className="m-0 text-xl font-semibold">资料来源</h2>
          <p className="mb-0 mt-2 text-sm leading-6 text-sub">下列链接用于核对文章依据；资料时点不代表机构当前状态。</p>
          <ol className="mb-0 mt-4 space-y-4 pl-5 text-sm leading-6">
            {article.sources.map(source => <li key={source.id} id={'article-source-' + source.id} className="scroll-mt-20 min-w-0 break-words pl-1">
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0e6d31] underline-offset-4 hover:underline">{source.title} ↗</a>
              <span className="block text-xs leading-5 text-sub">资料观察：<time dateTime={source.observedAt}>{source.observedAt}</time></span>
            </li>)}
          </ol>
        </section>
        <McaArticleContextLink href={institutionHref} className="mt-7 inline-flex min-h-11 max-w-full items-center break-words border-t border-[#e2e8e1] pt-4 font-semibold text-[#0e6d31] underline-offset-4 hover:underline">← 返回{institutionName}的机构档案</McaArticleContextLink>
      </article>

      <aside aria-label="文章辅助信息" className="min-w-0 space-y-5">
        <section aria-labelledby="article-institution-heading" className="min-w-0 border border-[#e2e8e1] bg-white p-5">
          <h2 id="article-institution-heading" className="m-0 border-b border-[#e8ece7] pb-3 text-lg font-semibold text-ink">机构档案</h2>
          <p className="mb-0 mt-4 break-words text-base font-semibold leading-7 text-ink">{institutionName}</p>
          {(institution.regionPath ?? institution.regionLabel) && <p className="mb-0 mt-1 break-words text-sm leading-6 text-sub">{institution.regionPath ?? institution.regionLabel}</p>}
          <McaArticleContextLink href={institutionHref} className="mt-4 inline-flex min-h-11 max-w-full items-center break-words border border-[#0e6d31] px-4 py-2 text-sm font-semibold text-[#0e6d31] underline-offset-4 hover:bg-[#f3faf3] hover:underline">查看机构档案 →</McaArticleContextLink>
        </section>
        <nav aria-label="文章目录" className="hidden border border-[#e2e8e1] bg-white p-5 lg:block">
          <h2 className="m-0 border-b border-[#e8ece7] pb-3 text-lg font-semibold text-ink">本文目录</h2>
          <ol className="mb-0 mt-3 space-y-2 pl-5 text-sm leading-6">
            {article.sections.map((section, index) => <li key={index}><a href={'#article-section-' + index} className="break-words text-[#0e6d31] underline-offset-4 hover:underline">{section.heading}</a></li>)}
          </ol>
        </nav>
        {related.length > 0 && <section aria-labelledby="related-articles-heading" className="min-w-0 border border-[#e2e8e1] bg-white p-5">
          <h2 id="related-articles-heading" className="m-0 border-b border-[#e8ece7] pb-3 text-lg font-semibold text-ink">这家机构的其他文章</h2>
          <ul className="mb-0 mt-3 divide-y divide-[#e8ece7] pl-0">
            {related.map(item => <li key={item.slug} className="list-none py-1"><McaArticleContextLink href={institutionArticleHref(id, item.slug)} className="block min-h-11 max-w-full break-words py-2.5 font-medium text-[#0e6d31] underline-offset-4 hover:underline">{item.title}</McaArticleContextLink></li>)}
          </ul>
        </section>}
      </aside>
    </div>
    </div>
  </div>;
}
