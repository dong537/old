import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageTitle } from '@/components/DirectoryUi';
import { findPolicyItem, listPolicyContent, policyManifest } from '@/lib/policy-content';
import { sectionLabel } from '@/lib/policy-content-types';

function formatDate(s?: string) {
  if (!s) return '';
  return s.slice(0, 10);
}

/** 静态导出：预生成全部政策内容详情页 */
export const dynamicParams = false;
export function generateStaticParams() {
  return listPolicyContent().map((item) => ({ id: item.id }));
}

type Props = { params: Promise<{ id: string }> };

/** 仅保留基础排版标签，剔除脚本/样式/外链风险，供正文安全渲染 */
function sanitizeContent(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:[^"']*/gi, '')
    .replace(/<a\b/gi, '<a target="_blank" rel="noopener noreferrer"')
    .replace(/<img\b/gi, '<img loading="lazy"');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = findPolicyItem(id);
  if (!item) return { title: '未找到该内容' };
  return { title: item.title };
}

export default async function PolicyDetailPage({ params }: Props) {
  const { id } = await params;
  const item = findPolicyItem(id);
  if (!item) notFound();

  const content = sanitizeContent(item.content);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title={item.title}
        lead={
          <>
            <span className="rounded bg-brand-tint/70 px-1.5 py-0.5 text-brand-ink">{sectionLabel[item.section]}</span>
            {item.docNo && <span className="ml-2 font-mono">{item.docNo}</span>}
            {item.source && <span className="ml-2">来源：{item.source}</span>}
            {item.releaseTime && <span className="ml-2">发布时间：<time dateTime={formatDate(item.releaseTime)}>{formatDate(item.releaseTime)}</time></span>}
          </>
        }
        extra={
          <Link href="/zhengce/" className="text-[13px] text-sub underline-offset-4 hover:underline">
            ← 返回政策与资讯
          </Link>
        }
      />

      {item.fileId && !content && (
        <p className="m-0 text-[14px] text-body">
          该内容为附件或多媒体文件，本站未取得文字版。{item.fileName ? `附件：${item.fileName}。` : ''}
        </p>
      )}

      {content ? (
        <article
          className="card policy-article max-w-[860px] p-6 text-[15px] leading-7 text-body sm:p-8"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : (
        item.fileId && (
          <p className="m-0 text-[14px] text-body">
            原文以附件形式发布，请到全国养老服务信息平台查看原文。
          </p>
        )
      )}

      <p className="m-0 text-[12px] leading-5 text-sub">
        全文存档自全国养老服务信息平台（快照 {policyManifest.capturedAt}），以官方原文为准；本页存档不替代官方发布渠道。
      </p>
    </div>
  );
}
