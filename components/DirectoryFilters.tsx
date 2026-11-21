import { sitePath } from '@/lib/site-path';
import { feeFilterKeys, type FeeFacetCounts, type FeeFilterKey, type FeeFilters, type FeeFilterValue } from '@/lib/search';
import type { ReactEventHandler } from 'react';

const districtOrder = ['越秀区', '海珠区', '荔湾区', '天河区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '从化区', '增城区'];
const feeRows: { key: FeeFilterKey; label: string }[] = [
  { key: 'advanceFee', label: '预收养老服务费' },
  { key: 'deposit', label: '押金' },
  { key: 'membershipFee', label: '会员费' },
];
const feeOptions: { value: FeeFilterValue; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'yes', label: '是' },
  { value: 'no', label: '否' },
  { value: 'unknown', label: '原表未提供' },
];
const emptyFeeFilters: FeeFilters = { advanceFee: '', deposit: '', membershipFee: '' };

interface Props {
  q: string;
  district: string;
  districts: string[];
  counts: Record<string, number>;
  feeFilters: FeeFilters;
  feeCounts: FeeFacetCounts;
  compare: string;
  onNavigate: ReactEventHandler<HTMLAnchorElement>;
}

export function DirectoryFilters({ q, district, districts, counts, feeFilters, feeCounts, compare, onNavigate }: Props) {
  const href = (nextQ: string, nextDistrict: string, nextFees: FeeFilters = feeFilters) => {
    const params = new URLSearchParams();
    if (nextQ) params.set('q', nextQ);
    if (nextDistrict) params.set('district', nextDistrict);
    for (const key of feeFilterKeys) if (nextFees[key]) params.set(key, nextFees[key]);
    if (compare) params.set('compare', compare);
    return '/guangzhou/jigou/' + (params.size ? '?' + params : '');
  };
  const events = { onClick: onNavigate, onAuxClick: onNavigate, onContextMenu: onNavigate };
  const hasFeeFilter = feeFilterKeys.some(key => Boolean(feeFilters[key]));
  const districtLinks = <>
    <a href={sitePath(href(q, ''))} {...events} aria-current={!district ? 'true' : undefined} className={'chip px-2.5 py-1 text-[14px] no-underline ' + (!district ? 'bg-brand text-white hover:text-white' : 'text-ink hover:text-brand')}>全部</a>
    {districtOrder.filter(value => districts.includes(value)).map(value => {
      const active = district === value;
      return <a key={value} href={sitePath(href(q, active ? '' : value))} {...events} aria-current={active ? 'true' : undefined} className={'chip px-2.5 py-1 text-[14px] no-underline ' + (active ? 'bg-brand text-white hover:text-white' : counts[value] === 0 ? 'text-sub hover:text-brand' : 'text-ink hover:text-brand')}>
        {value.replace(/区$/, '')} <span className={active ? 'text-white/80' : 'text-sub'}>{counts[value]}</span>
      </a>;
    })}
  </>;
  return <section className="filter-panel" aria-label="筛选养老机构">
    <h2 className="mb-4 mt-0 border-b border-line pb-3 text-base font-semibold">查询与筛选</h2>
    <form action={sitePath('/guangzhou/jigou/')} method="get" role="search" aria-label="检索广州养老机构" className="grid gap-3">
      {district && <input type="hidden" name="district" value={district} />}
      {feeFilterKeys.filter(key => feeFilters[key]).map(key => <input key={key} type="hidden" name={key} value={feeFilters[key]} />)}
      {compare && <input type="hidden" name="compare" value={compare} />}
      <div className="min-w-0"><label htmlFor="directory-q" className="mb-1.5 block text-sm font-semibold">机构名称或地址</label><input id="directory-q" name="q" type="search" maxLength={80} defaultValue={q} placeholder="输入名称、街道或地址" className="field min-h-12" /></div>
      <button type="submit" className="btn-primary min-h-12 w-full px-6">查找机构</button>
    </form>
    <details className="mt-4 border-t border-hair pt-3 sm:hidden" open={Boolean(district)}>
      <summary className="cursor-pointer text-[14px] font-semibold text-brand">按区筛选{district ? `：${district}` : ''}</summary>
      <div role="group" aria-label="区域" className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-2">{districtLinks}</div>
    </details>
    <div role="group" aria-label="区域" className="mt-5 hidden flex-wrap items-baseline gap-x-2 gap-y-2 border-t border-hair pt-4 sm:flex">
      <span className="w-[72px] shrink-0 text-[13px] font-semibold text-sub">所在区</span>
      {districtLinks}
    </div>
    <details className="mt-3 border-t border-hair pt-3" open={hasFeeFilter}>
      <summary className="w-fit cursor-pointer text-[13px] font-semibold text-brand">预收费标记筛选（非收费金额）</summary>
      <div className="mt-3 flex flex-col gap-2.5">{feeRows.map(row => <div key={row.key} role="group" aria-label={row.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
        <span className="w-[108px] shrink-0 text-[13px] text-sub">{row.label}</span>
        {feeOptions.map(option => {
          const active = feeFilters[row.key] === option.value;
          return <a key={option.value} href={sitePath(href(q, district, { ...feeFilters, [row.key]: option.value }))} {...events} aria-current={active ? 'true' : undefined} className={'chip px-2.5 py-1 text-[13px] no-underline ' + (active ? 'bg-brand text-white hover:text-white' : 'text-ink hover:text-brand')}>
            {option.label} <span className={active ? 'text-white/80' : 'text-sub'}>{feeCounts[row.key][option.value]}</span>
          </a>;
        })}
      </div>)}</div>
    </details>
    {(q || district || hasFeeFilter) && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hair pt-3 text-[13px]">
      <span className="text-sub">已选：</span>
      {q && <a href={sitePath(href('', district))} {...events} className="chip bg-brand-tint text-brand-ink no-underline">关键词：{q} ×</a>}
      {district && <a href={sitePath(href(q, ''))} {...events} className="chip bg-brand-tint text-brand-ink no-underline">区域：{district.replace(/区$/, '')} ×</a>}
      {feeRows.filter(row => feeFilters[row.key]).map(row => <a key={row.key} href={sitePath(href(q, district, { ...feeFilters, [row.key]: '' }))} {...events} className="chip bg-brand-tint text-brand-ink no-underline">{row.label}：{feeOptions.find(option => option.value === feeFilters[row.key])?.label} ×</a>)}
      <a href={sitePath(href('', '', emptyFeeFilters))} {...events} className="text-sub">清空条件</a>
    </div>}
  </section>;
}
