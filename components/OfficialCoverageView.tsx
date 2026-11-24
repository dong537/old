import type { OfficialCoverage, OfficialCoverageRegion } from '@/lib/official-coverage';
import { officialVerificationPointer } from '@/lib/official-verification-pointers';
import { sitePath } from '@/lib/site-path';

function RegionLink({ region }: { region: OfficialCoverageRegion }) {
  const hasOfficial = region.officialSlug !== null;
  if (hasOfficial) return <li className="min-w-0 border-b border-line py-3 last:border-b-0">
    <a href={sitePath('/quanguo/laiyuan/?province=' + encodeURIComponent(region.officialSlug!))} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 underlink">
      <span className="font-semibold text-ink">{region.name}</span>
      <span className="text-[13px] text-sub">{region.officialRowCount.toLocaleString('zh-CN')} 条官方来源观察 · 查看来源记录 →</span>
    </a>
  </li>;

  const pointer = officialVerificationPointer(region.name);
  return <li className="min-w-0 border-b border-line py-3 last:border-b-0">
    <div className="font-semibold text-ink">{region.name} <span className="text-[12px] font-normal text-sub">· 待补官方来源</span></div>
    <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
      <a href={sitePath('/quanguo/cankao/sheng/' + encodeURIComponent(region.referenceSlug) + '/')} className="underlink">查看本站机构线索 →</a>
      <a href={pointer.url} target="_blank" rel="noopener noreferrer" className="underlink">外部官方核验：{pointer.title} <span aria-hidden="true">↗</span><span className="sr-only">（新窗口打开）</span></a>
    </div>
    <p className="m-0 mt-1 break-words text-[12px] leading-relaxed text-sub">{pointer.scope} 入口核验于 {pointer.checkedAt}。</p>
  </li>;
}

export function OfficialCoverageView({ coverage }: { coverage: OfficialCoverage }) {
  const recorded = coverage.regions.filter(region => region.officialSlug !== null);
  const pending = coverage.regions.filter(region => region.officialSlug === null);
  return <section className="card p-5 sm:p-6" aria-labelledby="official-coverage-title">
    <h2 id="official-coverage-title" className="m-0 text-lg font-semibold text-ink">地方逐名官方来源覆盖</h2>
    <p className="mb-0 mt-2 text-[14px] leading-relaxed text-body">本区块不含民政部平台快照。本站在 {coverage.regions.length} 个省级地区中，已有 {coverage.officialRegionCount} 个地区的逐名官方来源，共 {coverage.officialRowCount.toLocaleString('zh-CN')} 条来源观察；另有 {coverage.pendingRegionCount} 个地区待补。已有 {coverage.referenceRowCount.toLocaleString('zh-CN')} 条机构线索供查漏。来源行、线索行均不能当作机构家数，也不证明目前在营。</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <details open className="min-w-0 rounded-xl border border-line px-4 py-3">
        <summary className="cursor-pointer font-semibold text-ink">已有官方来源 · {recorded.length} 个地区</summary>
        <ul className="m-0 mt-3 list-none p-0">{recorded.map(region => <RegionLink key={region.name} region={region} />)}</ul>
      </details>
      <details className="min-w-0 rounded-xl border border-line px-4 py-3">
        <summary className="cursor-pointer font-semibold text-ink">待补官方来源 · {pending.length} 个地区</summary>
        <p className="mb-0 mt-3 text-[13px] text-sub">这里的“待补”只表示本站尚无逐名官方来源，不表示当地没有养老机构。</p>
        <ul className="m-0 mt-2 list-none p-0">{pending.map(region => <RegionLink key={region.name} region={region} />)}</ul>
      </details>
    </div>
  </section>;
}
