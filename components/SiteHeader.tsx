'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { logicalPathname, sitePath } from '@/lib/site-path';
import { Logo } from './DirectoryUi';

const nav = [
  { href: '/', name: '首页' },
  { href: '/quanguo/cankao/', name: '找养老机构' },
  { href: '/quanguo/laiyuan/', name: '官方来源' },
  { href: '/quanguo/zhuti/', name: '登记主体' },
  { href: '/guangzhou/shangmen/', name: '广州服务记录' },
  { href: '/guangzhou/changhuxian/', name: '长护险指南' },
  { href: '/rules/', name: '来源与方法' },
];

export function headerSearchHref(searchRoute: string, q: string, currentPathname: string, currentSearch: string): string {
  const live = new URLSearchParams(currentSearch);
  const next = new URLSearchParams();
  const staticProvince = currentPathname.match(/^\/quanguo\/cankao\/sheng\/([a-z0-9-]+)(?:\/page\/[1-9]\d*)?\/?$/)?.[1];
  if (q.trim()) next.set('q', q.trim());
  if (/^\/guangzhou\/jigou\/?$/.test(currentPathname) && searchRoute === '/guangzhou/jigou/') {
    for (const key of ['district', 'compare', 'advanceFee', 'deposit', 'membershipFee']) { const value = live.get(key); if (value) next.set(key, value); }
  } else if (/^\/guangdong\/jigou\/?$/.test(currentPathname)) {
    // The legacy Guangdong query uses city names, not national city slugs.
  } else if (/^\/guangdong\/zhuti\/?$/.test(currentPathname)) {
    // Keep the keyword when entering the nationwide registry directory.
  } else if (/^\/quanguo\/laiyuan(?:\/detail)?\/?$/.test(currentPathname)) {
    for (const key of ['province', 'city']) { const value = live.get(key); if (value) next.set(key, value); }
  } else if (staticProvince && searchRoute === '/quanguo/cankao/') {
    next.set('province', staticProvince);
  } else if (/^\/quanguo\/cankao(?:\/detail)?\/?$/.test(currentPathname)) {
    for (const key of ['province', 'city']) { const value = live.get(key); if (value) next.set(key, value); }
  } else if (/^\/quanguo\/zhuti(?:\/detail)?\/?$/.test(currentPathname)) {
    for (const key of ['province', 'city']) { const value = live.get(key); if (value) next.set(key, value); }
    if (!/\/detail\/?$/.test(currentPathname)) {
      for (const key of ['type', 'status']) { const value = live.get(key); if (value) next.set(key, value); }
    }
  } else if (/^\/guangzhou\/shangmen\/?$/.test(currentPathname)) {
    for (const key of ['district', 'recordType', 'grade']) { const value = live.get(key); if (value) next.set(key, value); }
  }
  return searchRoute + (next.size ? '?' + next : '');
}

function SiteHeaderContent({ publishedAt, searchKeyword, showMcaPreview }: { publishedAt: string; searchKeyword: string; showMcaPreview: boolean }) {
  const pathname = logicalPathname(usePathname());
  const isHomeRoute = pathname === '/';
  const isServiceRoute = pathname === '/guangzhou/shangmen' || pathname.startsWith('/guangzhou/shangmen/');
  const isProvinceRoute = pathname === '/guangdong/jigou' || pathname.startsWith('/guangdong/jigou/');
  const isNationalOfficialRoute = pathname === '/quanguo/laiyuan' || pathname.startsWith('/quanguo/laiyuan/');
  const isMcaPreviewRoute = pathname === '/quanguo/mca-preview' || pathname.startsWith('/quanguo/mca-preview/');
  const isInstitutionReferenceRoute = pathname === '/quanguo/cankao' || pathname.startsWith('/quanguo/cankao/');
  const isQccRoute = pathname === '/guangdong/zhuti' || pathname.startsWith('/guangdong/zhuti/');
  const isNationalQccRoute = pathname === '/quanguo/zhuti' || pathname.startsWith('/quanguo/zhuti/');
  const ownsSearch = ['/guangzhou/jigou', '/guangzhou/shangmen', '/guangdong/jigou', '/guangdong/zhuti', '/quanguo/cankao', '/quanguo/laiyuan', '/quanguo/zhuti'].includes(pathname.replace(/\/$/, '')) || isMcaPreviewRoute;
  const searchRoute = isServiceRoute ? '/guangzhou/shangmen/' : isProvinceRoute || isNationalOfficialRoute ? '/quanguo/laiyuan/' : isQccRoute || isNationalQccRoute ? '/quanguo/zhuti/' : '/quanguo/cankao/';
  const scopeLabel = isMcaPreviewRoute ? '全国平台已观察记录 · 本机预览' : isHomeRoute || isInstitutionReferenceRoute ? '全国养老机构线索' : isNationalOfficialRoute || isProvinceRoute ? '全国官方来源' : isNationalQccRoute || isQccRoute ? '全国登记主体候选' : isServiceRoute ? '广州养老服务记录' : '机构档案';
  const router = useRouter();
  const [q, setQ] = useState(searchKeyword);
  const links = (mobile: boolean) => (showMcaPreview ? [...nav, { href: '/quanguo/mca-preview/', name: '全国平台预览' }] : nav).map(item => {
    const current = item.href === '/' ? pathname === '/' : pathname === item.href.slice(0, -1) || pathname.startsWith(item.href);
    const cls = mobile
      ? 'block rounded-md px-3 py-2.5 no-underline ' + (current ? 'bg-brand-tint font-semibold text-brand-ink' : 'text-ink')
      : 'whitespace-nowrap border-b-2 py-2 no-underline ' + (current ? 'border-brand font-semibold text-brand' : 'border-transparent text-body hover:text-brand');
    return <Link key={item.name} href={item.href} aria-current={current ? 'page' : undefined} className={cls}>{item.name}</Link>;
  });
  return <header className="border-b border-line bg-white">
    <div className="container-site flex min-h-[76px] items-center justify-between gap-5 py-3">
      <Logo />
      <nav aria-label="主导航" className="hidden items-center gap-x-5 text-[14px] xl:flex">{links(false)}</nav>
      <details className="relative xl:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-lg border border-line px-3 font-semibold text-brand">菜单</summary>
        <nav aria-label="手机主导航" className="absolute right-0 top-full z-30 mt-2 w-[min(80vw,260px)] rounded-xl border border-line bg-white p-2 shadow-lg">{links(true)}</nav>
      </details>
    </div>
    {!isHomeRoute && !ownsSearch && <div className="border-t border-hair bg-page/70">
      <div className="container-site flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5">
        <span className="text-[13px] text-sub">{scopeLabel}{pathname.startsWith('/guangzhou/') ? <> · 名单 <time dateTime={publishedAt}>{publishedAt}</time></> : null}</span>
        <form action={sitePath(searchRoute)} method="get" role="search" aria-label={isServiceRoute ? '养老服务记录搜索' : isProvinceRoute || isNationalOfficialRoute ? '官方来源记录搜索' : isQccRoute || isNationalQccRoute ? '登记主体候选搜索' : '全国机构线索搜索'} className="flex min-w-[260px] flex-[1_1_350px] overflow-hidden rounded-lg border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15" onSubmit={event => {
          event.preventDefault();
          router.push(headerSearchHref(searchRoute, q, logicalPathname(window.location.pathname), window.location.search));
        }}>
          <label htmlFor="site-q" className="sr-only">{isProvinceRoute || isNationalOfficialRoute ? '搜索官方来源记录' : isQccRoute || isNationalQccRoute ? '搜索登记主体候选' : '搜索全国机构线索，进入后选择省份'}</label>
          <input id="site-q" name="q" type="search" value={q} onChange={event => setQ(event.target.value)} maxLength={80} placeholder={isProvinceRoute || isNationalOfficialRoute ? '搜索来源中的机构名称' : isQccRoute || isNationalQccRoute ? '搜索登记主体名称' : '输入名称或地区'} className="h-11 min-w-0 flex-1 border-0 px-3 text-[15px] outline-none" />
          <button type="submit" className="min-w-[72px] bg-brand px-4 font-semibold text-white hover:bg-brand-dark">搜索</button>
        </form>
      </div>
    </div>}
  </header>;
}
function SiteHeaderWithParams({ publishedAt, showMcaPreview }: { publishedAt: string; showMcaPreview: boolean }) {
  const pathname = usePathname();
  const searchKeyword = useSearchParams().get('q') ?? '';
  return <SiteHeaderContent key={pathname + ':' + searchKeyword} publishedAt={publishedAt} searchKeyword={searchKeyword} showMcaPreview={showMcaPreview} />;
}

export function SiteHeader({ publishedAt, showMcaPreview = false }: { publishedAt: string; showMcaPreview?: boolean }) {
  return <Suspense fallback={<SiteHeaderContent publishedAt={publishedAt} searchKeyword="" showMcaPreview={showMcaPreview} />}>
    <SiteHeaderWithParams publishedAt={publishedAt} showMcaPreview={showMcaPreview} />
  </Suspense>;
}
