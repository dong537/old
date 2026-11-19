import { sitePath } from '@/lib/site-path';
import { catalog } from '@/lib/catalog';
import type { ReactEventHandler } from 'react';
import type { Institution } from '@/lib/types';
import { WITHHELD_PHONE_MESSAGE } from '@/lib/phone-display';

export function InstitutionList({ items, returnTo, selectedIds, onToggleCompare, onOpenProfile }: { items: Institution[]; returnTo?: string; selectedIds?: readonly string[]; onToggleCompare?: (id: string) => void; onOpenProfile?: ReactEventHandler<HTMLAnchorElement> }) {
  const profileEvents = { onClick: onOpenProfile, onAuxClick: onOpenProfile, onContextMenu: onOpenProfile };
  return <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="养老机构检索结果">
    {items.map(item => {
      const profileHref = '/guangzhou/jigou/' + item.id + '/' + (returnTo ? '?from=' + encodeURIComponent(returnTo) : '');
      const selected = selectedIds?.includes(item.id) ?? false;
      const facts: { label: string; value: string }[] = [];
      if (item.registeredBeds !== null) facts.push({ label: '备案床位', value: item.registeredBeds.toLocaleString('zh-CN') + ' 张' });
      if (item.advanceFee !== null) facts.push({ label: '服务费预收', value: '原表标记：' + (item.advanceFee ? '是' : '否') });
      if (item.deposit !== null) facts.push({ label: '押金', value: '原表标记：' + (item.deposit ? '是' : '否') });
      if (item.membershipFee !== null) facts.push({ label: '会员费', value: '原表标记：' + (item.membershipFee ? '是' : '否') });
      return <li key={item.id} className="min-w-0">
        <article className="record-card">
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[13px] font-semibold text-brand">{item.district} · 广州官方名单</p>
                <h2 className="mb-0 mt-1 text-[19px] font-semibold leading-snug"><a href={sitePath(profileHref)} {...profileEvents} className="text-ink no-underline hover:text-brand">{item.name}</a></h2>
              </div>
              {onToggleCompare && <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-body">
                <input type="checkbox" checked={selected} onChange={() => onToggleCompare(item.id)} className="h-4 w-4 accent-brand" aria-label={selected ? '从对比中移除' + item.name : '将' + item.name + '加入对比'} />
                {selected ? '已选，可取消' : '加入对比'}
              </label>}
            </div>
            <p className="m-0 break-words text-[14px] text-body"><span className="font-semibold text-ink">地址：</span>{item.address}</p>
            {facts.length > 0 ? <dl className="m-0 grid gap-x-5 gap-y-3 border-t border-hair pt-4 sm:grid-cols-2 lg:grid-cols-4">{facts.map(fact => <div key={fact.label}><dt className="text-xs text-sub">{fact.label}</dt><dd className="m-0 text-[14px] font-semibold text-ink">{fact.value}</dd></div>)}</dl> : <p className="m-0 text-[13px] text-sub">备案床位原表未提供；预收费标记原表未提供。</p>}
            <p className="m-0 text-[14px] text-body"><span className="font-semibold text-ink">电话：</span>{item.phoneWithheld ? WITHHELD_PHONE_MESSAGE : item.phoneHref ? <a href={sitePath(item.phoneHref)} className="underlink">{item.phone}</a> : item.phone ? item.phone + '（待核实）' : '原表未提供电话'}</p>
            {item.qualityNotes.length > 0 && <p className="m-0 text-[13px] text-caution">资料提示：{item.qualityNotes.join('；')}</p>}
          </div>
          <div className="record-evidence">
            <span>官方名单 · 发布于 <time dateTime={catalog.source.publishedAt}>{catalog.source.publishedAt}</time> · 原表第 {item.sourceRow} 条</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1"><a href={sitePath(profileHref)} {...profileEvents} className="font-semibold">查看档案与来源 →</a><a href={catalog.source.url} target="_blank" rel="noopener noreferrer">打开官方原文 ↗</a></span>
          </div>
        </article>
      </li>;
    })}
  </ul>;
}