import Link from 'next/link';
import { HomeOnlineTabs } from '@/components/HomeOnlineTabs';
import { sitePath } from '@/lib/site-path';
import referenceManifest from '@/public/data/qcc-institutions/manifest.v1.json';

export const metadata = {
  title: '找养老机构 · 全国机构线索与官方来源',
  description: '按省份查找全国养老机构来源线索，核对地方官方名单和登记主体；所有资料均标明来源边界。',
};

const hotLinks = [
  { href: '/quanguo/cankao/', label: '机构资料查询' },
  { href: '/quanguo/laiyuan/', label: '地方官方来源' },
  { href: '/quanguo/zhuti/', label: '登记主体候选' },
  { href: '/rules/', label: '收录范围与方法' },
] as const;

const serviceCards = [
  { title: '机构服务查询', description: '按省市查看机构来源线索', icon: '⌂', color: 'bg-[#E5F2FE] text-[#1777B9]', href: '/quanguo/cankao/', external: false },
  { title: '喘息服务查询', description: '在民政部平台查看服务点', icon: '✳', color: 'bg-[#FFF2D5] text-[#D88916]', href: 'https://yanglao.mca.gov.cn/#/index/chuanXiServicesList', external: true },
  { title: '日托服务查询', description: '在民政部平台查看服务点', icon: '◷', color: 'bg-[#DCF5F1] text-[#159A8E]', href: 'https://yanglao.mca.gov.cn/#/index/riTuoServicesList', external: true },
  { title: '居家上门服务查询', description: '官网首页此入口尚未开放', icon: '⌂', color: 'bg-[#FFF0E5] text-[#E87919]', href: null, external: false },
] as const;

export default function HomePage() {
  return <div className="home-page min-w-0">
    <section id="home-hero" aria-labelledby="home-title" className="home-hero relative isolate overflow-hidden">
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1440 500" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="home-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F5C589"/><stop offset=".46" stopColor="#FBE9C9"/><stop offset="1" stopColor="#FFF4DD"/></linearGradient>
          <linearGradient id="home-back-hill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C8D0B2"/><stop offset=".5" stopColor="#E3D4A7"/><stop offset="1" stopColor="#A8BFAD"/></linearGradient>
          <linearGradient id="home-front-hill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6B9A9B"/><stop offset=".52" stopColor="#8DAE9C"/><stop offset="1" stopColor="#D3B67F"/></linearGradient>
          <linearGradient id="home-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF7E5" stopOpacity="0"/><stop offset="1" stopColor="#FFF7E5" stopOpacity=".94"/></linearGradient>
        </defs>
        <rect width="1440" height="500" fill="url(#home-sky)"/>
        <path d="M0 130Q144 103 280 127T541 124Q648 103 762 125T1047 129Q1258 99 1440 136" fill="none" stroke="#FFF6DD" strokeWidth="34" opacity=".4"/>
        <path d="M0 358C62 330 91 240 138 230c35-7 53 69 84 68 44-2 55-120 111-123 52-3 73 121 121 121 41 0 64-78 111-81 52-3 77 105 127 105 52 0 73-116 130-116 55 0 80 124 136 124 45 0 65-86 109-91 51-6 80 92 128 91 46-1 71-130 128-139 58-9 76 94 117 100 38 5 78-60 120-56V500H0Z" fill="url(#home-back-hill)" opacity=".74"/>
        <path d="M0 435C58 398 70 260 129 245c43-11 61 91 105 95 48 4 58-114 108-127 46-12 75 97 112 106 36 9 61-84 112-92 52-7 78 112 135 116 42 3 66-96 114-110 49-14 79 85 126 94 53 9 78-86 131-94 43-7 76 91 116 93 48 2 75-118 132-131 65-15 79 76 126 90 44 14 76-45 114-35V500H0Z" fill="url(#home-front-hill)" opacity=".83"/>
        <path d="M0 467C72 430 80 324 147 300c46-17 69 69 107 66 45-4 62-85 112-88 47-4 68 85 113 90 46 5 75-82 116-83 45-2 68 89 109 96 44 7 72-76 118-75 54 2 76 90 125 87 51-3 80-93 131-93 44 0 75 95 118 88 53-7 77-123 131-130 58-8 83 89 136 94 36 4 72-21 77-27V500H0Z" fill="#5D8C8E" opacity=".52"/>
        <path d="M19 378C98 343 104 282 146 291M206 340C258 306 273 233 331 220M990 334c53-25 66-92 117-101m82 80c47-25 59-102 111-111" fill="none" stroke="#E7C987" strokeWidth="3" opacity=".78"/>
        <path d="M0 379Q157 340 322 376T654 381Q846 350 1041 388T1440 364V500H0Z" fill="url(#home-haze)"/>
        <path d="M0 444Q171 414 338 452T692 444Q871 416 1057 454T1440 424V500H0Z" fill="#FFF6E9" opacity=".7"/>
        <g fill="none" stroke="#B58443" strokeLinecap="round" opacity=".76">
          <path d="M1114 438q80-46 168-16t158-3" strokeWidth="5"/>
          <path d="M1170 432q-13-59-39-84m-13 78q8-63 36-92m140 94q-12-70-42-97m27 92q6-59 37-86" strokeWidth="3"/>
          <path d="M1131 348q-38-25-67-10m67 10q-12-33-37-47m37 47q15-36 31-48m-31 48q37-31 67-19m-45 5q-30 1-57 29m57-29q-6-33-20-59m20 59q12-39 39-50m-39 50q33-9 55 11m-55-11q27 14 49 36m52-40q-35-29-63-13m63 13q-9-41-31-55m31 55q17-43 39-56m-39 56q37-28 65-9m-42 2q-35 4-55 36m55-36q-3-40-18-66m18 66q20-40 48-45m-48 45q40-14 65 2" strokeWidth="1.4"/>
        </g>
      </svg>
      <div className="container-site relative z-10 flex min-h-[400px] flex-col justify-end pb-14 pt-32 sm:min-h-[485px] sm:pb-28 sm:pt-36">
        <h1 id="home-title" className="sr-only">全国养老机构来源资料查询</h1>
        <form action={sitePath('/quanguo/cankao/')} method="get" role="search" aria-label="按地区查找养老机构线索" className="flex w-full max-w-[675px] flex-col overflow-hidden border border-[#E1C294] bg-white/95 shadow-[0_10px_24px_#61451f25] sm:min-h-[55px] sm:flex-row">
          <label htmlFor="home-province" className="sr-only">所在省份</label>
          <select id="home-province" name="province" defaultValue="" className="min-h-12 w-full min-w-0 border-0 border-b border-[#E8D8C5] bg-transparent px-4 text-[15px] text-ink outline-offset-[-3px] sm:w-[160px] sm:border-b-0 sm:border-r"><option value="">全部地区</option>{referenceManifest.provinces.map(province => <option key={province.slug} value={province.slug}>{province.name}</option>)}</select>
          <label htmlFor="home-keyword" className="sr-only">机构名称或地址</label>
          <input id="home-keyword" name="q" type="search" maxLength={80} placeholder="请输入机构名称或地址" className="min-h-12 min-w-0 flex-1 border-0 bg-transparent px-4 text-[15px] outline-offset-[-3px]" />
          <button type="submit" className="min-h-12 bg-[#F68A13] px-7 text-[16px] font-semibold text-white hover:bg-[#D77309]">搜索</button>
        </form>
      </div>
    </section>

    <div className="container-site relative z-10 -mt-7">
      <nav aria-label="首页热点服务" className="flex flex-col gap-2 border-[3px] border-[#F68A13] bg-white px-4 py-3 shadow-[0_8px_20px_#61451f16] sm:flex-row sm:items-center sm:gap-x-5 sm:px-6">
        <strong className="shrink-0 border-b border-[#F0D2AD] pb-2 text-[17px] leading-tight text-[#6F4132] sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">热点<br className="hidden sm:block" />服务</strong>
        <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-[13px] sm:flex sm:flex-wrap sm:gap-x-5 sm:text-[14px]">{hotLinks.map(link => <Link key={link.href} href={link.href} className="leading-5 text-[#B73622] no-underline hover:underline">· {link.label}</Link>)}<a href="https://yanglao.mca.gov.cn/#/index/assessmentServicesList" target="_blank" rel="noopener noreferrer" className="leading-5 text-[#B73622] no-underline hover:underline">· 老年人能力评估 ↗</a><a href="https://yanglao.mca.gov.cn/#/index/institutionGuideList" target="_blank" rel="noopener noreferrer" className="leading-5 text-[#B73622] no-underline hover:underline">· 官网机构办事指南 ↗</a></div>
      </nav>
    </div>

    <div className="container-site mt-9 grid gap-8 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)] lg:gap-10">
      <section id="service-query" aria-labelledby="service-query-title" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="service-query-title" className="m-0 text-[23px] font-semibold text-[#C7112D]">服务查询</h2><span className="text-[12px] text-sub">本站机构线索与平台官网服务分开展示</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{serviceCards.map(card => <article key={card.title} className="flex min-h-[220px] flex-col items-center justify-between border border-[#E9D8C6] bg-white px-3 py-5 text-center shadow-[0_2px_5px_#3c2e1410] xl:min-h-[290px]">
          <span aria-hidden="true" className={'flex size-16 items-center justify-center rounded-xl text-[32px] ' + card.color}>{card.icon}</span>
          <div><h3 className="mb-0 mt-3 text-[15px] font-semibold">{card.title}</h3><p className="mb-0 mt-1 text-[12px] leading-5 text-sub">{card.description}</p></div>
          {card.href === null ? <span role="status" className="mt-4 inline-flex min-h-9 items-center border border-[#D7C9B8] bg-[#F7F3EC] px-3 text-[13px] text-[#766B62]">官网入口建设中</span>
            : card.external ? <a href={card.href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-9 items-center border border-[#2456A6] px-3 text-[13px] text-[#2456A6] no-underline hover:bg-[#EAF1FC]">到官网查询 ↗</a>
              : <Link href={card.href} className="mt-4 inline-flex min-h-9 items-center bg-[#2456A6] px-3 text-[13px] text-white no-underline hover:bg-[#173C78] hover:text-white">查看来源线索</Link>}
        </article>)}</div>
      </section>
      <HomeOnlineTabs />
    </div>

    <section id="region-index" aria-labelledby="region-index-title" className="container-site mt-12 lg:mt-24">
      <div className="border border-[#E6D6C5] bg-[#FFFDF8] p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="region-index-title" className="m-0 text-[19px] font-semibold">按省份进入机构来源线索</h2><span className="text-[12px] text-sub">地区索引 · 来源表记录</span></div>
        <p className="mb-4 mt-2 text-[13px] leading-6 text-body">按省份查看来源表记录；记录不等于当前在营机构。</p>
        <div className="max-w-[760px]"><details className="border border-[#E4C9AA] bg-white"><summary className="min-h-11 cursor-pointer px-4 py-3 text-[14px] font-semibold text-[#9A472D]">按省份展开来源线索</summary>
          <ul className="m-0 grid max-h-[260px] list-none grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto border-t border-[#E4C9AA] p-4 text-[14px] sm:grid-cols-4">{referenceManifest.provinces.map(province => <li key={province.slug}><Link href={'/quanguo/cankao/sheng/' + province.slug + '/'} className="inline-flex min-h-9 items-center text-[#9A472D] underline-offset-4 hover:underline">{province.name}</Link></li>)}</ul>
          </details></div>
      </div>
    </section>

    <section id="home-entrances" aria-label="本站资料入口" className="container-site mt-7 grid gap-4 pb-10 sm:grid-cols-2 lg:grid-cols-4">
      <Link href="/quanguo/cankao/" className="group flex min-h-[160px] flex-col justify-between overflow-hidden border border-[#C7DAE9] bg-[#E9F4FB] p-5 no-underline hover:border-[#4D91BB]"><span aria-hidden="true" className="text-[31px] text-[#367DB2]">⌂</span><span><strong className="block text-[20px] text-[#245E8C]">全国机构来源线索</strong><span className="mt-2 block text-[13px] text-[#466176]">按省市查询逐行记录 →</span></span></Link>
      <Link href="/quanguo/laiyuan/" className="group flex min-h-[160px] flex-col justify-between overflow-hidden border border-[#E9CCAC] bg-[#FFF0DD] p-5 no-underline hover:border-[#C98544]"><span aria-hidden="true" className="text-[31px] text-[#C4732C]">▤</span><span><strong className="block text-[20px] text-[#A4541D]">核对官方来源</strong><span className="mt-2 block text-[13px] text-[#71543D]">看原文与资料日期 →</span></span></Link>
      <Link href="/quanguo/zhuti/" className="group flex min-h-[160px] flex-col justify-between overflow-hidden border border-[#E1C5C4] bg-[#FBECEB] p-5 no-underline hover:border-[#C77E79]"><span aria-hidden="true" className="text-[31px] text-[#B9524A]">▣</span><span><strong className="block text-[20px] text-[#9D3835]">登记主体候选</strong><span className="mt-2 block text-[13px] text-[#755354]">核对企业登记快照 →</span></span></Link>
      <Link href="/rules/" className="group flex min-h-[160px] flex-col justify-between overflow-hidden border border-[#D8D0E4] bg-[#F3EFF9] p-5 no-underline hover:border-[#8873A2]"><span aria-hidden="true" className="text-[31px] text-[#806BA0]">◈</span><span><strong className="block text-[20px] text-[#675181]">来源与方法</strong><span className="mt-2 block text-[13px] text-[#655B6C]">了解收录与待核边界 →</span></span></Link>
    </section>
  </div>;
}
