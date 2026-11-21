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
    {privatePreview && <div className="border-b border-caution-line bg-caution-bg px-4 py-2 text-center text-sm text-caution"><strong>本机私有预览</strong> · 含第三方工商快照与全国平台已观察原件，仅在此电脑查看；公开构建不含这些资料。</div>}
    <SiteHeader publishedAt={catalog.source.publishedAt} showMcaPreview={privatePreview} />
    <main id="main-content" tabIndex={-1} className="container-site flex flex-1 flex-col gap-7 py-7 outline-none lg:py-9">{children}</main>
    <footer className="mt-8 border-t border-[#BA8B69] bg-[#302B28] text-[#F6EDE2]">
      <nav aria-label="相关政务入口" className="border-b border-white/15 bg-[#403B38]"><div className="container-site flex flex-wrap gap-x-5 gap-y-2 py-3 text-[12px] sm:text-[13px] [&_a]:text-[#F6EDE2] [&_a]:underline-offset-4 [&_a]:hover:underline"><a href="https://www.mca.gov.cn/" target="_blank" rel="noopener noreferrer">中华人民共和国民政部 ↗</a><a href="https://yanglao.mca.gov.cn/#/homePage" target="_blank" rel="noopener noreferrer">全国养老服务信息平台 ↗</a><Link href="/quanguo/laiyuan/">本站地方官方来源</Link><Link href="/rules/">本站来源与方法</Link></div></nav>
      <div className="container-site grid gap-7 py-9 text-[13px] md:grid-cols-[minmax(0,1fr)_auto]">
        <div><strong className="text-[17px] text-white">养老信源（暂名）</strong><p className="mb-0 mt-2 max-w-[590px] leading-6 text-[#E7D7C8]">整理养老机构线索、地方官方来源与登记主体候选。资料是特定时间的记录，入住前请核对实际服务、费用与签约主体。</p></div>
        <nav aria-label="页脚导航" className="grid grid-cols-2 gap-x-7 gap-y-3 self-start [&_a]:text-[#F6EDE2] [&_a]:underline-offset-4 [&_a]:hover:underline"><Link href="/quanguo/cankao/">全国机构线索</Link><Link href="/quanguo/laiyuan/">官方来源</Link><Link href="/quanguo/zhuti/">登记主体</Link><Link href="/rules/">来源与方法</Link></nav>
      </div>
      <div className="border-t border-white/15"><div className="container-site py-4 text-xs leading-5 text-[#D8C5B4]">本站为独立资料整理项目；机构状态、床位和收费请以机构及主管部门最新信息为准。</div></div>
    </footer>
  </div></body></html>;
}
