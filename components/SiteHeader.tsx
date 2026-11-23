'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { logicalPathname, sitePath } from '@/lib/site-path';
import { Logo } from './DirectoryUi';

const primaryNav = [
  { href: '/', name: '首页' },
  { href: '/quanguo/pingtai/', name: '找养老机构' },
  { href: '/quanguo/shangmen/', name: '找上门服务' },
  { href: '/quanguo/changhuxian/', name: '长护险指南' },
  { href: '/quanguo/jiage/', name: '价格参考' },
  { href: '/quanguo/bangdan/', name: '榜单' },
  { href: '/rules/', name: '方法论' },
];

const supportNav = [
  { href: '/quanguo/cankao/', name: '企查查机构线索' },
  { href: '/quanguo/laiyuan/', name: '官方来源' },
  { href: '/quanguo/zhuti/', name: '登记主体' },
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
    // 广东旧列表的城市参数不是全国来源页的城市 slug。
  } else if (/^\/guangdong\/zhuti\/?$/.test(currentPathname)) {
    // 进入全国主体目录时只保留关键词。
  } else if (/^\/quanguo\/laiyuan(?:\/detail)?\/?$/.test(currentPathname)) {
    for (const key of ['province', 'city']) { const value = live.get(key); if (value) next.set(key, value); }
  } else if (/^\/quanguo\/pingtai(?:\/[A-Za-z0-9_-]+)?\/?$/.test(currentPathname) && searchRoute === '/quanguo/pingtai/') {
    for (const key of ['province', 'city', 'type']) { const value = live.get(key); if (value) next.set(key, value); }
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
  const isMcaPublicRoute = pathname === '/quanguo/pingtai' || pathname.startsWith('/quanguo/pingtai/');
  const isInstitutionReferenceRoute = pathname === '/quanguo/cankao' || pathname.startsWith('/quanguo/cankao/');
  const isQccRoute = pathname === '/guangdong/zhuti' || pathname.startsWith('/guangdong/zhuti/');
  const isNationalQccRoute = pathname === '/quanguo/zhuti' || pathname.startsWith('/quanguo/zhuti/');
  const ownsSearch = ['/guangzhou/jigou', '/guangzhou/shangmen', '/guangdong/jigou', '/guangdong/zhuti', '/quanguo/cankao', '/quanguo/laiyuan', '/quanguo/zhuti', '/quanguo/pingtai', '/quanguo/shangmen', '/quanguo/changhuxian', '/quanguo/jiage', '/quanguo/bangdan'].includes(pathname.replace(/\/$/, '')) || isMcaPreviewRoute;
  const searchRoute = isServiceRoute ? '/guangzhou/shangmen/' : isMcaPublicRoute ? '/quanguo/pingtai/' : isProvinceRoute || isNationalOfficialRoute ? '/quanguo/laiyuan/' : isQccRoute || isNationalQccRoute ? '/quanguo/zhuti/' : '/quanguo/cankao/';
  const scopeLabel = isMcaPreviewRoute ? '全国平台已观察记录 · 本机预览' : isMcaPublicRoute ? '民政部平台部分采集快照' : isHomeRoute || isInstitutionReferenceRoute ? '全国机构来源线索' : isNationalOfficialRoute || isProvinceRoute ? '地方官方来源记录' : isNationalQccRoute || isQccRoute ? '登记主体候选' : isServiceRoute ? '广州养老服务记录' : '机构档案';
  const router = useRouter();
  const [q, setQ] = useState(searchKeyword);
  const navLink = (item: { href?: string; name: string }, secondary: boolean) => {
    const current = item.href !== undefined && (item.href === '/' ? pathname === '/' :
      (item.href === '/quanguo/pingtai/' && isMcaPreviewRoute) ||
      pathname === item.href.slice(0, -1) || pathname.startsWith(item.href));
    const className = secondary
      ? 'flex min-h-11 items-center justify-between gap-2 rounded-md px-3 py-2.5 no-underline ' + (current ? 'bg-brand-tint font-semibold text-brand-ink' : item.href ? 'text-ink hover:bg-page' : 'text-sub')
      : 'inline-flex min-h-12 shrink-0 items-center gap-1 whitespace-nowrap border-b-[3px] px-1 pt-[3px] text-[15px] font-medium no-underline sm:text-[17px] ' + (current ? 'border-brand font-semibold text-brand-dark' : item.href ? 'border-transparent text-brand-dark hover:border-brand hover:text-brand-dark' : 'border-transparent text-sub');
    if (!item.href) return <span key={item.name} aria-disabled="true" className={className}>{item.name}<span className="text-[11px] font-normal">待开放</span></span>;
    return <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined} className={className}>{item.name}</Link>;
  };
  const secondaryNav = showMcaPreview ? [...supportNav, { href: '/quanguo/mca-preview/', name: '全国平台本机预览' }] : supportNav;
  return <header className={isHomeRoute ? 'relative z-20 border-b border-transparent bg-transparent' : 'relative z-20 border-b border-line bg-white shadow-[0_1px_0_rgba(17,32,40,0.04)]'}>
    <div className={isHomeRoute ? 'bg-transparent' : 'portal-header-surface'}>
      <div className="container-site flex min-h-[82px] items-center justify-between gap-5 py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3"><div className="shrink-0 origin-left xl:scale-[1.15]"><Logo /></div><span className="inline-flex whitespace-nowrap rounded-md border border-brand-line bg-brand-tint px-2 py-1 text-xs text-brand-ink">全国<span className="hidden sm:inline"> · 分批收录</span></span></div>
        <div className="hidden items-center justify-end gap-5 xl:flex">
          <span className="whitespace-nowrap text-[12px] text-sub">独立资料整理</span>
          <nav aria-label="本站资料入口" className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-[13px]">{supportNav.map(item => <Link key={item.href} href={item.href} className="whitespace-nowrap text-brand-ink underline-offset-4 hover:underline">{item.name}</Link>)}{showMcaPreview && <Link href="/quanguo/mca-preview/">本机预览</Link>}<a href="https://yanglao.mca.gov.cn/#/homePage" target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-brand-ink underline-offset-4 hover:underline">民政部平台 ↗</a></nav>
        </div>
      <details className="relative xl:hidden" onKeyDown={event => {
        if (event.key !== 'Escape' || event.nativeEvent.isComposing || !event.currentTarget.open) return;
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-md border border-brand-line bg-white/80 px-3 text-sm font-semibold text-brand-dark [&::-webkit-details-marker]:hidden">资料</summary>
        <nav aria-label="本站资料入口" className="absolute right-0 top-full z-30 mt-2 grid w-[min(86vw,320px)] max-h-[75vh] gap-1 overflow-y-auto rounded-md border border-brand-line bg-white p-3 shadow-xl">{secondaryNav.map(item => navLink(item, true))}</nav>
      </details>
      </div>
    </div>
    <div className={isHomeRoute ? 'border-t border-line/70 bg-transparent' : 'border-t border-line bg-brand-tint/40'}><div className="container-site">
      <nav aria-label="主导航" className="flex w-full items-center gap-5 overflow-x-auto overscroll-x-contain whitespace-nowrap sm:gap-7 xl:justify-between">{primaryNav.map(item => navLink(item, false))}</nav>
    </div></div>
    {!isHomeRoute && !ownsSearch && <div className="border-t border-hair bg-brand-tint/40">
      <div className="container-site flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
        <span className="text-[13px] font-medium text-brand-ink">{scopeLabel}{pathname.startsWith('/guangzhou/') ? <> · 名单 <time dateTime={publishedAt}>{publishedAt}</time></> : null}</span>
        <form action={sitePath(searchRoute)} method="get" role="search" aria-label={isServiceRoute ? '养老服务记录搜索' : isMcaPublicRoute ? '民政部平台采集快照搜索' : isProvinceRoute || isNationalOfficialRoute ? '官方来源记录搜索' : isQccRoute || isNationalQccRoute ? '登记主体候选搜索' : '全国机构线索搜索'} className="flex min-w-[240px] flex-[1_1_350px] overflow-hidden rounded-md border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20" onSubmit={event => {
          event.preventDefault();
          router.push(headerSearchHref(searchRoute, q, logicalPathname(window.location.pathname), window.location.search));
        }}>
          <label htmlFor="site-q" className="sr-only">{isMcaPublicRoute ? '搜索民政部平台采集快照' : isProvinceRoute || isNationalOfficialRoute ? '搜索官方来源记录' : isQccRoute || isNationalQccRoute ? '搜索登记主体候选' : '搜索全国机构线索，进入后选择省份'}</label>
          <input id="site-q" name="q" type="search" value={q} onChange={event => setQ(event.target.value)} maxLength={80} placeholder={isMcaPublicRoute ? '输入平台机构名称或地区' : isProvinceRoute || isNationalOfficialRoute ? '搜索来源中的机构名称' : isQccRoute || isNationalQccRoute ? '搜索登记主体名称' : '输入机构名称或地区'} className="h-11 min-w-0 flex-1 border-0 px-3 text-[15px] outline-none" />
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
