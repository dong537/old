import Link from 'next/link';
import { HomeOnlineTabs } from '@/components/HomeOnlineTabs';
import { sitePath } from '@/lib/site-path';
import referenceManifest from '@/public/data/qcc-institutions/manifest.v1.json';

export const metadata = {
  title: '找养老机构 · 全国机构线索与官方来源',
  description: '按省份查找全国养老机构来源线索，核对地方官方名单和登记主体；所有资料均标明来源边界。',
};

const hotLinks = [
  { href: '/quanguo/pingtai/', label: '民政部平台快照' },
  { href: '/quanguo/cankao/', label: '企查查机构线索' },
  { href: '/quanguo/laiyuan/', label: '地方官方来源' },
  { href: '/quanguo/zhuti/', label: '登记主体候选' },
  { href: '/rules/', label: '收录范围与方法' },
] as const;

const serviceCards = [
  { title: '民政部平台采集', description: '民政部平台部分采集快照，按地区查已观察记录', icon: '⌂', href: '/quanguo/pingtai/', external: false },
  { title: '喘息服务查询', description: '在平台采集快照里查机构，再看是否提供喘息服务', icon: '✳', href: '/quanguo/pingtai/', external: false },
  { title: '日托服务查询', description: '在平台采集快照里查机构，再看是否提供日托服务', icon: '◷', href: '/quanguo/pingtai/', external: false },
  { title: '居家上门服务查询', description: '按地区查找公开列示居家、上门服务的机构线索', icon: '⌂', href: '/quanguo/shangmen/', external: false },
] as const;

const entranceCards = [
  { href: '/quanguo/cankao/', icon: '⌂', title: '企查查机构线索', desc: '按省市查看来源表逐行记录' },
  { href: '/quanguo/laiyuan/', icon: '▤', title: '核对官方来源', desc: '看原文与资料日期' },
  { href: '/quanguo/zhuti/', icon: '▣', title: '登记主体候选', desc: '核对企业登记快照' },
  { href: '/rules/', icon: '◈', title: '来源与方法', desc: '了解收录与待核边界' },
] as const;

export default function HomePage() {
  return <div className="home-page min-w-0">
    <section id="home-hero" aria-labelledby="home-title" className="home-hero relative isolate">
      <div className="container-site relative z-10 pb-14 pt-28 sm:pt-32 lg:pt-36">
        <div className="max-w-[760px]">
          <p className="eyebrow">全国养老机构来源核查</p>
          <h1 id="home-title" className="mt-3 text-[clamp(24px,3.6vw,38px)] font-semibold leading-[1.25] text-ink">
            找养老机构前，先看清资料从哪来
          </h1>
          <p className="mt-3 max-w-[640px] text-[15px] leading-7 text-body">
            按地区与名称检索机构线索，逐条核对官方来源、资料日期与可联系信息。所有记录都标明来源边界，不代表当前在营、空床或实时收费。
          </p>
        </div>

        <form action={sitePath('/quanguo/pingtai/')} method="get" role="search" aria-label="检索民政部平台部分采集快照" className="mt-7 flex w-full max-w-[680px] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-lift sm:flex-row">
          <label htmlFor="home-keyword" className="sr-only">机构名称或地址</label>
          <input id="home-keyword" name="q" type="search" maxLength={80} placeholder="输入机构名称或地址，如「东城区 养老院」" className="min-h-12 min-w-0 flex-1 border-0 bg-transparent px-5 text-[15px] outline-none" />
          <button type="submit" className="min-h-12 bg-brand px-8 text-[15px] font-semibold text-white transition-colors hover:bg-brand-dark">搜索</button>
        </form>
        <p className="mb-0 mt-2.5 max-w-[680px] text-[13px] leading-5 text-sub">民政部平台部分采集快照，非全国全量；进入目录后可按省份、城市和设施类型筛选。</p>
      </div>
    </section>

    <div className="container-site relative z-10 -mt-6">
      <nav aria-label="首页热点服务" className="flex flex-col gap-3 rounded-card border border-line bg-white px-5 py-3.5 shadow-card sm:flex-row sm:items-center sm:gap-x-6">
        <strong className="shrink-0 text-[13px] font-semibold text-brand sm:border-r sm:border-line sm:pr-5">热点服务</strong>
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-[14px] sm:flex sm:flex-wrap sm:gap-x-6">
          {hotLinks.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-9 items-center text-body no-underline transition-colors hover:text-brand">{link.label}</Link>)}
          <Link href="/quanguo/pingtai/" className="inline-flex min-h-9 items-center text-body no-underline transition-colors hover:text-brand">能力评估服务点</Link>
          <Link href="/quanguo/banshi/" className="inline-flex min-h-9 items-center text-body no-underline transition-colors hover:text-brand">机构办事指南</Link>
        </div>
      </nav>
    </div>

    <div className="container-site mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)] lg:gap-10">
      <section id="service-query" aria-labelledby="service-query-title" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="service-query-title" className="m-0 text-[20px] font-semibold text-ink">服务查询</h2>
          <span className="text-[12px] text-sub">本站机构线索与平台官网服务分开展示</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{serviceCards.map(card => <article key={card.title} className="group flex min-h-[180px] flex-col rounded-card border border-line bg-white p-5 shadow-card transition-all hover:border-brand-line hover:shadow-lift sm:min-h-[200px]">
          <span aria-hidden="true" className={'flex size-11 items-center justify-center rounded-lg text-[20px] ' + (card.href ? 'bg-brand-tint text-brand' : 'bg-page text-sub')}>{card.icon}</span>
          <h3 className="mb-0 mt-4 text-[16px] font-semibold text-ink">{card.title}</h3>
          <p className="mb-0 mt-1.5 flex-1 text-[13px] leading-6 text-sub">{card.description}</p>
          {card.external ? <a href={card.href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-9 items-center text-[13px] font-medium text-brand no-underline hover:underline">到官网查询 ↗</a>
              : <Link href={card.href} className="mt-4 inline-flex min-h-9 items-center text-[13px] font-medium text-brand no-underline hover:underline">查看来源线索 →</Link>}
        </article>)}</div>
      </section>
      <HomeOnlineTabs />
    </div>

    <section id="region-index" aria-labelledby="region-index-title" className="container-site mt-12 lg:mt-16">
      <div className="rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="region-index-title" className="m-0 text-[19px] font-semibold text-ink">按省份进入企查查来源表线索</h2>
          <span className="text-[12px] text-sub">地区索引 · 来源表记录</span>
        </div>
        <p className="mb-4 mt-2 text-[13px] leading-6 text-body">按省份查看企查查来源表记录；记录不等于当前在营机构，也不自动关联民政部平台记录。</p>
        <div className="max-w-[760px]">
          <details open className="group rounded-lg border border-line bg-white">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              按省份展开来源线索
              <span aria-hidden="true" className="text-sub transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <ul className="m-0 grid max-h-[280px] list-none grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto border-t border-line bg-page/60 p-4 text-[14px] sm:grid-cols-4">
              {referenceManifest.provinces.map(province => <li key={province.slug}>
                <Link href={'/quanguo/cankao/sheng/' + province.slug + '/'} className="inline-flex min-h-9 items-center text-body underline-offset-4 hover:text-brand hover:underline">{province.name}</Link>
              </li>)}
            </ul>
          </details>
        </div>
      </div>
    </section>

    <section id="home-entrances" aria-label="本站资料入口" className="container-site mt-6 grid gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-4">
      {entranceCards.map(item => <Link key={item.href} href={item.href} className="group flex min-h-[150px] flex-col justify-between rounded-card border border-line bg-white p-5 no-underline shadow-card transition-all hover:border-brand hover:shadow-lift">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-lg bg-brand-tint text-[19px] text-brand">{item.icon}</span>
        <span className="mt-4">
          <strong className="block text-[16px] font-semibold text-ink">{item.title}</strong>
          <span className="mt-1 block text-[13px] leading-6 text-sub">{item.desc} →</span>
        </span>
      </Link>)}
    </section>
  </div>;
}
