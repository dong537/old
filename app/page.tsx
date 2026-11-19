import Link from 'next/link';
import { sitePath } from '@/lib/site-path';
import referenceManifest from '@/public/data/qcc-institutions/manifest.v1.json';

export const metadata = {
  title: '找养老机构 · 全国机构线索与官方来源',
  description: '先选地区，再查全国机构线索、广州官方名单和可核对的公开来源。',
};

export default function HomePage() {
  return <>
    <section className="overflow-hidden rounded-[24px] border border-brand-line bg-white" aria-labelledby="home-title">
      <div className="grid gap-8 px-5 py-8 sm:px-9 sm:py-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
        <div className="min-w-0">
          <h1 id="home-title" className="m-0 max-w-[660px] text-[30px] font-bold leading-tight sm:text-[38px]">先选地区，再找养老机构</h1>
          <p className="mb-0 mt-3 max-w-[640px] text-[16px] leading-7 text-body">按名称或地址查找全国机构来源线索。广州另有民政部门公布的机构名单，可直接进入查看。</p>
          <form action={sitePath('/quanguo/cankao/')} method="get" role="search" aria-label="按地区查找养老机构线索" className="mt-7 grid gap-3 sm:grid-cols-[minmax(170px,0.75fr)_minmax(230px,1.25fr)_auto] sm:items-end">
            <div className="min-w-0"><label htmlFor="home-province" className="mb-1.5 block text-sm font-semibold">所在省份</label><select id="home-province" name="province" required defaultValue="" className="field min-h-12"><option value="" disabled>选择省份</option>{referenceManifest.provinces.map(province => <option key={province.slug} value={province.slug}>{province.name}</option>)}</select></div>
            <div className="min-w-0"><label htmlFor="home-keyword" className="mb-1.5 block text-sm font-semibold">机构名称或地址</label><input id="home-keyword" name="q" type="search" maxLength={80} placeholder="可选，先按地区浏览也可以" className="field min-h-12" /></div>
            <button type="submit" className="btn-primary min-h-12 px-6">查找线索</button>
          </form>
          <p className="mb-0 mt-4 text-[13px] text-sub">全国线索来自用户提供的来源表，不等于已核实在营机构；选定省份后可继续按城市筛选。</p>
        </div>
        <div className="rounded-2xl border border-brand-line bg-brand-tint p-5 sm:p-6">
          <p className="m-0 text-[13px] font-semibold text-brand-ink">已有官方名单的城市</p>
          <h2 className="mb-1 mt-3 text-[24px] font-bold">广州</h2>
          <p className="m-0 text-[14px] leading-6 text-body">查看广州官方名单中的机构名称、地址、备案床位和可公开联系方式，逐项核对资料日期。</p>
          <Link href="/guangzhou/jigou/" className="mt-5 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">查看广州官方名单 →</Link>
        </div>
      </div>
    </section>

    <section className="flex flex-col gap-4" aria-labelledby="source-choices-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="source-choices-title" className="m-0 text-[22px] font-bold">选择要核对的资料</h2><Link href="/rules/" className="text-[13px]">资料来源与使用规则</Link></div>
      <div className="grid gap-3 md:grid-cols-3">
        <Link href="/guangzhou/jigou/" className="source-entry no-underline"><span className="text-xs font-semibold text-brand">广州官方名单</span><strong className="mt-2 text-[18px] text-ink">找广州养老机构</strong><span className="mt-2 text-sm leading-6 text-body">按区查名称、地址和名单原有字段；名单日期不代表当前空床或在营状态。</span><span className="mt-4 text-sm font-semibold text-brand">查看名单 →</span></Link>
        <Link href="/quanguo/cankao/" className="source-entry no-underline"><span className="text-xs font-semibold text-brand">全国来源线索</span><strong className="mt-2 text-[18px] text-ink">按省市找名称</strong><span className="mt-2 text-sm leading-6 text-body">从 {referenceManifest.provinces.length} 个省级地区的来源行检索；同名记录不会自动合并。</span><span className="mt-4 text-sm font-semibold text-brand">查找线索 →</span></Link>
        <Link href="/quanguo/laiyuan/" className="source-entry no-underline"><span className="text-xs font-semibold text-brand">官方来源记录</span><strong className="mt-2 text-[18px] text-ink">核对已取得的原文</strong><span className="mt-2 text-sm leading-6 text-body">查看本站已归档的地区范围、资料期和官方原文；未收录不表示当地没有机构。</span><span className="mt-4 text-sm font-semibold text-brand">核对官方来源 →</span></Link>
      </div>
    </section>

    <section className="border-t border-line pt-6" aria-labelledby="how-title">
      <h2 id="how-title" className="m-0 text-[22px] font-bold">查找后，继续核对</h2>
      <ol className="mt-4 grid gap-4 p-0 md:grid-cols-3">
        <li className="list-none border-l-2 border-brand pl-4"><strong className="block">看清资料范围</strong><span className="mt-1 block text-sm leading-6 text-body">区分机构线索、广州名单和各地官方来源记录。</span></li>
        <li className="list-none border-l-2 border-brand pl-4"><strong className="block">打开原文</strong><span className="mt-1 block text-sm leading-6 text-body">确认原始名称、地址、资料期及设施类型。</span></li>
        <li className="list-none border-l-2 border-brand pl-4"><strong className="block">联系机构</strong><span className="mt-1 block text-sm leading-6 text-body">入住前再问当前服务、收费和空床，并核对签约主体。</span></li>
      </ol>
      <Link href="/quanguo/zhuti/" className="mt-2 inline-block text-sm">需要核对登记主体？查看主体候选 →</Link>
    </section>
  </>;
}