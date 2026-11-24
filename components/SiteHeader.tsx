'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
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
  { href: '/zhengce/', name: '养老政策' },
  { href: '/quanguo/banshi/', name: '机构办事指南' },
  { href: '/corrections/', name: '资料纠错' },
];

const supportNav = [
  { href: '/quanguo/cankao/', name: '企查查机构线索' },
  { href: '/quanguo/laiyuan/', name: '官方来源' },
  { href: '/quanguo/zhuti/', name: '登记主体' },
  { href: '/rules/', name: '来源与方法' },
];

const categoryGroups = [
  { id: 'institutions', name: '养老院', links: [
    { href: '/quanguo/pingtai/', name: '找养老机构' },
    { href: '/quanguo/cankao/', name: '企查查机构线索' },
  ] },
  { id: 'services', name: '养老服务', links: [
    { href: '/quanguo/shangmen/', name: '找上门服务' },
  ] },
  { id: 'policy', name: '政策保障', links: [
    { href: '/zhengce/', name: '养老政策' },
    { href: '/quanguo/changhuxian/', name: '长护险指南' },
    { href: '/quanguo/banshi/', name: '机构办事指南' },
  ] },
  { id: 'prices', name: '价格参考', links: [
    { href: '/quanguo/jiage/', name: '价格参考' },
  ] },
  { id: 'ranking', name: '榜单', links: [
    { href: '/quanguo/bangdan/', name: '榜单' },
  ] },
  { id: 'sources', name: '信源资料', links: [
    { href: '/quanguo/laiyuan/', name: '官方来源' },
    { href: '/quanguo/zhuti/', name: '登记主体' },
    { href: '/rules/', name: '方法论' },
  ] },
  { id: 'help', name: '用户服务', links: [
    { href: '/corrections/', name: '资料纠错' },
  ] },
] as const;

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

function SiteHeaderContent({ searchKeyword, showMcaPreview }: { publishedAt: string; searchKeyword: string; showMcaPreview: boolean }) {
  const pathname = logicalPathname(usePathname());
  const isServiceRoute = pathname === '/guangzhou/shangmen' || pathname.startsWith('/guangzhou/shangmen/');
  const isProvinceRoute = pathname === '/guangdong/jigou' || pathname.startsWith('/guangdong/jigou/');
  const isNationalOfficialRoute = pathname === '/quanguo/laiyuan' || pathname.startsWith('/quanguo/laiyuan/');
  const isMcaPreviewRoute = pathname === '/quanguo/mca-preview' || pathname.startsWith('/quanguo/mca-preview/');
  const isInstitutionReferenceRoute = pathname === '/quanguo/cankao' || pathname.startsWith('/quanguo/cankao/');
  const isQccRoute = pathname === '/guangdong/zhuti' || pathname.startsWith('/guangdong/zhuti/');
  const isNationalQccRoute = pathname === '/quanguo/zhuti' || pathname.startsWith('/quanguo/zhuti/');
  const searchRoute = isServiceRoute ? '/guangzhou/shangmen/' : isProvinceRoute || isNationalOfficialRoute ? '/quanguo/laiyuan/' : isQccRoute || isNationalQccRoute ? '/quanguo/zhuti/' : isInstitutionReferenceRoute ? '/quanguo/cankao/' : '/quanguo/pingtai/';
  const searchLabel = isServiceRoute ? '搜索养老服务记录' : isProvinceRoute || isNationalOfficialRoute ? '搜索官方来源记录' : isQccRoute || isNationalQccRoute ? '搜索登记主体' : isInstitutionReferenceRoute ? '搜索机构线索' : '搜索全国养老机构';
  const searchPlaceholder = isQccRoute || isNationalQccRoute ? '输入登记主体名称' : '输入机构名称或所在地区';
  const router = useRouter();
  const [q, setQ] = useState(searchKeyword);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const secondaryNav = showMcaPreview ? [...supportNav, { href: '/quanguo/mca-preview/', name: '全国平台本机预览' }] : supportNav;
  useEffect(() => {
    if (!openMenu) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      const panel = document.getElementById(openMenu === 'all' ? 'site-mega-menu' : 'site-menu-' + openMenu);
      if (!panel?.contains(target) && !triggerRefs.current[openMenu]?.contains(target)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      const trigger = triggerRefs.current[openMenu];
      if (!trigger?.getClientRects().length) { setOpenMenu(null); return; }
      event.preventDefault();
      setOpenMenu(null);
      requestAnimationFrame(() => trigger?.focus());
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnViewportChange = () => setOpenMenu(null);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    desktop.addEventListener('change', closeOnViewportChange);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      desktop.removeEventListener('change', closeOnViewportChange);
    };
  }, [openMenu]);
  const isCurrent = (href: string) => href === '/' ? pathname === '/' :
    (href === '/quanguo/pingtai/' && isMcaPreviewRoute) ||
    pathname === href.slice(0, -1) || pathname.startsWith(href);
  const navLink = (item: { href: string; name: string }, mobile = false) => {
    const current = isCurrent(item.href);
    return <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined}
      onClick={event => {
        setOpenMenu(null);
        if (mobile) { const details = event.currentTarget.closest('details'); if (details) details.open = false; }
      }}
      className={mobile
        ? 'block min-h-11 rounded px-4 py-2.5 text-[15px] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#378821] ' + (current ? 'bg-[#eaf4e6] font-semibold text-[#246719]' : 'text-[#263d29] hover:bg-[#f3f8f0]')
        : 'block min-h-10 px-4 py-2.5 text-[14px] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#287a23] ' + (current ? 'bg-[#edf7e9] font-semibold text-[#246719]' : 'text-[#33443a] hover:bg-[#f3f8f0] hover:text-[#287a23]')}>{item.name}</Link>;
  };
  const quickLinkClass = 'inline-flex min-h-9 items-center gap-1.5 rounded-[4px] bg-[#0e8521] px-3 text-[13px] font-semibold text-white no-underline hover:bg-[#086d19] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e8521]';
  return <header ref={headerRef} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenMenu(null);
  }} className="relative z-30 w-full bg-white">
    <div className="hidden border-b border-[#e8ece8] bg-white lg:block">
      <div className="relative mx-auto flex h-[70px] w-full max-w-[1200px] items-center justify-between gap-5 px-5">
        <nav aria-label="快捷入口" className="flex items-center gap-2.5">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined} className={quickLinkClass}>首页 <span aria-hidden="true">⌂</span></Link>
          <button type="button" ref={node => { triggerRefs.current.all = node; }} aria-expanded={openMenu === 'all'} aria-controls="site-mega-menu"
            onClick={() => setOpenMenu(openMenu === 'all' ? null : 'all')} className={quickLinkClass + (openMenu === 'all' ? ' bg-[#086d19]' : '')}>导航 <span aria-hidden="true">▦</span></button>
          <div id="site-mega-menu" className={(openMenu === 'all' ? 'grid' : 'hidden') + ' absolute inset-x-5 top-full z-50 max-h-[calc(100svh-70px)] grid-cols-4 gap-x-5 gap-y-6 overflow-y-auto rounded-b-md border border-[#e4eae3] bg-white p-6 shadow-[0_18px_38px_rgba(24,48,28,0.2)] xl:grid-cols-7'}>
            {categoryGroups.map(group => <div key={group.id} className="min-w-0">
              <h2 className="m-0 border-b border-[#e6eee3] pb-2 text-[15px] font-bold text-[#17261d]">{group.name}</h2>
              <ul className="m-0 mt-2 list-none p-0">{group.links.map(item => <li key={item.href}>{navLink(item)}</li>)}
                {group.id === 'sources' && showMcaPreview && <li>{navLink({ href: '/quanguo/mca-preview/', name: '全国平台本机预览' })}</li>}
              </ul>
            </div>)}
            <button type="button" onClick={() => { setOpenMenu(null); triggerRefs.current.all?.focus(); }} aria-label="关闭网站导航" className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-[#f2f5f1] text-xl text-[#536554] hover:bg-[#e5ede2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#287a23]">×</button>
          </div>
          <Link href="/quanguo/pingtai/" className={quickLinkClass}>全国机构 <span aria-hidden="true">⌕</span></Link>
          <Link href="/quanguo/laiyuan/" className={quickLinkClass}>官方来源 <span aria-hidden="true">↗</span></Link>
        </nav>
        <nav aria-label="本站资料入口" className="flex items-center gap-2.5">
          <Link href="/quanguo/changhuxian/" className={quickLinkClass}>长护险指南</Link>
          <Link href="/corrections/" className={quickLinkClass}>资料纠错</Link>
          <a href="https://yanglao.mca.gov.cn/#/homePage" target="_blank" rel="noopener noreferrer" className={quickLinkClass}>民政部平台 ↗</a>
        </nav>
      </div>
    </div>
    <div className="border-b border-[#e6ebe3]">
      <div className="mx-auto grid w-full max-w-[1200px] gap-3 px-4 py-3 sm:px-5 lg:min-h-[60px] lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center lg:gap-8 lg:py-1.5">
        <div className="flex min-w-0 items-center justify-between"><Logo /><span className="hidden whitespace-nowrap border-l border-[#dce6da] pl-3 text-xs text-[#5c785a] sm:inline lg:hidden">全国</span></div>
        <form action={sitePath(searchRoute)} method="get" role="search" aria-label={searchLabel}
          className="flex h-12 min-w-0 w-full overflow-hidden rounded-[3px] border border-[#e4e9e4] bg-[#f4f5f4] focus-within:border-[#378821] focus-within:ring-2 focus-within:ring-[#378821]/20 lg:ml-auto lg:max-w-[500px]"
          onSubmit={event => {
            event.preventDefault();
            router.push(headerSearchHref(searchRoute, q, logicalPathname(window.location.pathname), window.location.search));
          }}>
          <label htmlFor="site-q" className="sr-only">{searchLabel}</label>
          <input id="site-q" name="q" type="search" value={q} onChange={event => setQ(event.target.value)} maxLength={80} placeholder={searchPlaceholder}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-4 text-[15px] text-[#25382b] outline-none placeholder:text-[#9aa59b]" />
          <button type="submit" aria-label="搜索" className="flex min-w-[72px] items-center justify-center bg-[#0e8521] text-white hover:bg-[#086d19] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white"><svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><span className="sr-only">搜索</span></button>
        </form>
      </div>
    </div>
    <div className="bg-[#2e861f] text-white lg:bg-white lg:pb-2.5">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-5">
        <nav aria-label="主导航" className="relative hidden min-h-[50px] rounded-[4px] bg-[#2e861f] lg:grid lg:grid-cols-8">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined} style={pathname === '/' ? { color: '#173419' } : undefined} className={'flex min-h-[50px] items-center justify-center text-[16px] font-semibold text-white no-underline hover:bg-[#67ad13] hover:text-[#173419] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white ' + (pathname === '/' ? 'bg-[#67ad13]' : '')}>首页</Link>
          {categoryGroups.map((group, index) => <div key={group.id} className="relative min-w-0">
            <button type="button" ref={node => { triggerRefs.current[group.id] = node; }} aria-expanded={openMenu === group.id} aria-controls={'site-menu-' + group.id}
              onClick={() => setOpenMenu(openMenu === group.id ? null : group.id)}
              style={openMenu === group.id || group.links.some(item => isCurrent(item.href)) ? { color: '#173419' } : undefined}
              className={'flex min-h-[50px] w-full items-center justify-center gap-1.5 px-2 text-[16px] font-semibold text-white hover:bg-[#67ad13] hover:text-[#173419] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white ' + (openMenu === group.id || group.links.some(item => isCurrent(item.href)) ? 'bg-[#67ad13]' : '')}>
              {group.name}<span aria-hidden="true" className="text-xs">⌄</span>
            </button>
            <div id={'site-menu-' + group.id} className={(openMenu === group.id ? 'block' : 'hidden') + ' absolute top-full z-40 min-w-[205px] rounded-b-md border border-[#e2e9df] bg-white py-2 shadow-[0_12px_24px_rgba(20,45,25,0.18)] ' + (index >= 4 ? 'right-0' : 'left-0')}>
              {group.links.map(item => navLink(item))}
            </div>
          </div>)}
        </nav>
        <details className="lg:hidden" onKeyDown={event => {
          if (event.key !== 'Escape' || event.nativeEvent.isComposing || !event.currentTarget.open) return;
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white [&::-webkit-details-marker]:hidden">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>网站导航
          </summary>
          <div className="grid max-h-[70svh] gap-3 overflow-y-auto border-t border-white/20 bg-white p-2 text-[#263d29] shadow-md">
            <nav aria-label="移动端导航" className="grid gap-0.5">{primaryNav.map(item => navLink(item, true))}</nav>
            <nav aria-label="移动端资料入口" className="grid gap-0.5 border-t border-[#e7eee5] pt-2">{secondaryNav.map(item => navLink(item, true))}
              <a href="https://yanglao.mca.gov.cn/#/homePage" target="_blank" rel="noopener noreferrer" className="block min-h-11 rounded px-4 py-2.5 text-[15px] text-[#263d29] no-underline hover:bg-[#f3f8f0]">民政部平台 ↗</a>
            </nav>
          </div>
        </details>
      </div>
    </div>
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
