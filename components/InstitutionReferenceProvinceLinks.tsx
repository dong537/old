import { referenceProvinceHref } from '@/lib/institution-reference-static';
import type { ReferenceProvince } from '@/lib/institution-reference-types';

export function InstitutionReferenceProvinceLinks({ provinces }: { provinces: ReferenceProvince[] }) {
  return <section className="section" aria-labelledby="reference-province-links-title">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
      <h2 id="reference-province-links-title" className="m-0 text-lg font-semibold">按省级地区浏览来源线索</h2>
      <span className="text-[13px] text-sub">31 个已收录分组 · 企查查来源行</span>
    </div>
    <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-x-5 gap-y-2 p-0 text-[14px] sm:grid-cols-3 lg:grid-cols-4">
      {provinces.map(province => <li key={province.slug} className="min-w-0">
        <a href={referenceProvinceHref(province.slug)} className="flex min-h-10 items-center justify-between gap-2 border-b border-line py-2 no-underline hover:text-brand">
          <span className="break-words">{province.name}</span><span className="shrink-0 text-[12px] text-sub">{province.count.toLocaleString('zh-CN')}</span>
        </a>
      </li>)}
    </ul>
  </section>;
}
