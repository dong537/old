import { sitePath } from '@/lib/site-path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { privatePreview } from '@company-data';
import { catalog } from '@/lib/catalog';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '养老信源 · 全国机构线索与官方来源', template: '%s · 养老信源' },
  description: '按省市查询养老机构来源线索、官方逐名记录与登记主体候选，逐条核对来源范围和资料日期。',
  robots: { index: false, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><div className="flex min-h-screen flex-col">
    <a href={sitePath("#main-content")} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">跳到主要内容</a>
    {privatePreview && <div className="border-b border-caution-line bg-caution-bg px-4 py-2 text-center text-sm text-caution"><strong>本机私有预览</strong> · 含第三方工商快照，仅在此电脑查看；公开构建不含这些资料。</div>}
    <SiteHeader publishedAt={catalog.source.publishedAt} />
    <main id="main-content" tabIndex={-1} className="container-site flex flex-1 flex-col gap-6 py-6 outline-none">{children}</main>
    <footer className="mt-6 border-t border-line bg-white">
      <div className="container-site flex flex-wrap justify-between gap-6 py-6 text-xs text-sub">
        <span>养老信源（暂名）· 全国机构线索、官方来源与登记主体候选 · 入住前请核对实际服务与签约主体</span>
        <span className="flex flex-wrap gap-4"><Link href="/quanguo/cankao/" className="text-sub">找养老机构</Link><Link href="/quanguo/laiyuan/" className="text-sub">官方来源</Link><Link href="/quanguo/zhuti/" className="text-sub">登记主体</Link><Link href="/guangzhou/shangmen/" className="text-sub">广州服务记录</Link><Link href="/guangzhou/changhuxian/" className="text-sub">长护险指南</Link><Link href="/rules/" className="text-sub">来源与方法</Link></span>
      </div>
    </footer>
  </div></body></html>;
}
