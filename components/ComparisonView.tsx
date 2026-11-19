'use client';
import { sitePath } from '@/lib/site-path';

import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Catalog, Institution } from '@/lib/types';
import { WITHHELD_PHONE_MESSAGE } from '@/lib/phone-display';
import { compareUrl, directoryReturnUrl, parseCompareSelection } from '@/lib/compare';
import { SourceNote } from './SourceNote';
import { PageTitle } from './DirectoryUi';

function mark(value: boolean | null): string {
  return value === null ? '原表未提供' : value ? '是' : '否';
}

function printedPhone(item: Institution): string {
  if (item.phoneWithheld) return WITHHELD_PHONE_MESSAGE;
  if (!item.phone) return '原表未提供';
  return item.phoneHref ? item.phone : `${item.phone}（待核实）`;
}

const visitQuestions = [
  '当前是否营业，当前是否有空床？',
  '实际月费及其他收费分别是多少？押金、会员费和预收款如何退还？',
  '所需照护服务与医疗安排能否提供？具体由谁负责？',
  '合同签约主体是谁？签约前能否查看合同和收费明细？',
  '何时可实地探访？现场看到的房间和服务是否与介绍一致？',
];

export function ComparisonView({ catalog }: { catalog: Catalog }) {
  const params = useSearchParams();
  const knownIds = new Set(catalog.institutions.map((item) => item.id));
  const selection = parseCompareSelection(params.get('ids'), knownIds);
  const from = params.get('from');
  const selectionKey = selection.ids.join(',');
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnLink = useRef<HTMLAnchorElement>(null);
  const pendingFocus = useRef<{ selectionKey: string; id: string | null } | null>(null);
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.selectionKey !== selectionKey) return;
    const target = pending.id === null ? returnLink.current : removeButtons.current.get(pending.id);
    target?.focus();
    pendingFocus.current = null;
  }, [selectionKey]);
  const items = selection.ids.map((id) => catalog.institutions.find((item) => item.id === id)).filter((item): item is Institution => Boolean(item));
  const addUrl = directoryReturnUrl(from, selection.ids);
  const remove = (id: string) => {
    const current = parseCompareSelection(new URLSearchParams(window.location.search).get('ids'), knownIds).ids;
    const index = current.indexOf(id);
    if (index < 0) return;
    const next = current.filter((currentId) => currentId !== id);
    pendingFocus.current = { selectionKey: next.join(','), id: next[Math.min(index, next.length - 1)] ?? null };
    window.history.replaceState(null, '', sitePath(compareUrl(next, from)));
  };
  const rows: { label: string; value: (item: Institution) => ReactNode }[] = [
    { label: '所属行政区', value: (item) => item.district },
    { label: '机构地址', value: (item) => item.address },
    { label: '备案床位', value: (item) => item.registeredBeds === null ? '原表未提供' : item.registeredBeds.toLocaleString('zh-CN') + ' 张' },
    { label: '联系电话', value: (item) => item.phoneWithheld ? WITHHELD_PHONE_MESSAGE : item.phoneHref ? <a href={sitePath(item.phoneHref)} className="underlink">{item.phone}</a> : item.phone ? item.phone + '（待核实）' : '原表未提供' },
    { label: '预收养老服务费', value: (item) => mark(item.advanceFee) },
    { label: '收取押金', value: (item) => mark(item.deposit) },
    { label: '收取会员费', value: (item) => mark(item.membershipFee) },
    { label: '原表资料提示', value: (item) => item.qualityNotes.length ? item.qualityNotes.join('；') : '本表未标注' },
    { label: '原始名单序号', value: (item) => '第 ' + item.sourceRow + ' 条' },
  ];

  return <>
    <nav aria-label="面包屑" className="text-[13px] text-sub"><a href={sitePath("/guangzhou/")}>广州</a><span aria-hidden="true" className="mx-2">/</span><a href={sitePath(addUrl)}>养老机构</a><span aria-hidden="true" className="mx-2">/</span>机构对比</nav>
    <PageTitle title="机构对比" lead="仅比较同一份官方名单中的可核字段。资料是发布时的快照；备案床位不是当前空床，预收费标记不是收费金额。" />
    {selection.issues.length > 0 && <div className="notice mb-5" role="status">{selection.issues.join(' ')}</div>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="note" role="status" aria-live="polite" aria-atomic="true">已选 {items.length} / 3 家{items.length > 0 ? ' · 小屏幕可左右滚动表格' : ''}</p><div className="flex flex-wrap gap-2">{items.length >= 2 && <button type="button" onClick={() => window.print()} className="btn-primary text-sm">打印探访核对单</button>}{items.length > 0 && <a href={sitePath(addUrl)} className="btn-outline text-sm">返回目录添加机构</a>}</div></div>
    {items.length < 2 && <div className="notice mb-5" role="status">请选择至少2家机构后再比较。<a ref={returnLink} href={sitePath(addUrl)} className="underlink">返回目录选择机构 →</a></div>}
    {items.length > 0 && <>
      <div className="card max-w-full overflow-x-auto" role="region" aria-label="养老机构对比表" tabIndex={0}>
        <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">按广州市民政局名单字段对比所选机构</caption>
          <thead><tr className="border-b border-line">
            <th scope="col" className="w-40 p-4 font-semibold text-sub">比较字段</th>
            {items.map((item) => <th key={item.id} scope="col" className="p-4 align-top font-semibold text-ink">
              <a href={sitePath('/guangzhou/jigou/' + item.id + '/?from=' + encodeURIComponent(addUrl))} className="underlink">{item.name}</a>
              <button ref={(button) => { if (button) removeButtons.current.set(item.id, button); else removeButtons.current.delete(item.id); }} type="button" onClick={() => remove(item.id)} className="mt-2 block min-h-11 text-sm font-normal text-brand underline" aria-label={'从对比中移除' + item.name}>移出对比</button>
            </th>)}
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label} className="border-b border-line last:border-0">
            <th scope="row" className="bg-page p-4 align-top font-medium text-body">{row.label}</th>
            {items.map((item) => <td key={item.id} className="p-4 align-top text-ink">{row.value(item)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <section className="section"><h2 className="m-0 text-lg font-semibold">资料来源</h2><SourceNote source={catalog.source} detailed /><p className="m-0 text-[13px] text-sub">对比只帮助整理资料，不构成机构推荐。实际运营、服务能力和当前床位需联系机构确认。</p></section>
      {items.length >= 2 && <section className="section visit-print-sheet" aria-labelledby="visit-print-title">
        <div><h2 id="visit-print-title" className="m-0 text-xl font-semibold">联系与探访核对单</h2><p className="m-0 mt-1 text-sm text-sub">打印后逐家向机构询问并记录；本站不收集或保存核对结果。原表标记不等于当前收费，备案床位也不是当前空床。</p></div>
        {items.map(item => <article key={item.id} className="visit-sheet-card rounded-lg border border-line p-4">
          <h3 className="m-0 text-base font-semibold">{item.name}<span className="ml-2 text-xs font-normal text-sub">· 联系与探访核对单</span></h3>
          <p className="m-0 mt-1 text-xs text-sub">官方名单第 {item.sourceRow} 条 · {item.district}</p>
          <p className="m-0 mt-1 text-xs text-sub">来源：<a href={sitePath(catalog.source.url)} className="underlink">广州市民政局 · {catalog.source.title}</a>；名单发布于 <time dateTime={catalog.source.publishedAt}>{catalog.source.publishedAt}</time>。该日期不代表机构现时信息已核验。</p>
          <dl className="my-3 grid gap-x-5 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="inline text-sub">地址：</dt><dd className="inline">{item.address}</dd></div>
            <div><dt className="inline text-sub">名单联系电话：</dt><dd className="inline">{printedPhone(item)}</dd></div>
            <div><dt className="inline text-sub">备案床位：</dt><dd className="inline">{item.registeredBeds === null ? '原表未提供' : `${item.registeredBeds.toLocaleString('zh-CN')} 张`}</dd></div>
            <div><dt className="inline text-sub">预收养老服务费：</dt><dd className="inline">{mark(item.advanceFee)}</dd></div>
            <div><dt className="inline text-sub">收取押金：</dt><dd className="inline">{mark(item.deposit)}</dd></div>
            <div><dt className="inline text-sub">收取会员费：</dt><dd className="inline">{mark(item.membershipFee)}</dd></div>
          </dl>
          <h4 className="m-0 text-sm font-semibold">向机构核对（下方可手写结果）</h4>
          <ol className="visit-questions m-0 mt-2 list-decimal space-y-2 pl-5 text-sm">{visitQuestions.map(question => <li key={question}>{question}<span className="visit-answer-line block" aria-hidden="true" /></li>)}</ol>
          <p className="m-0 mt-3 text-sm">联系 / 探访日期：<span className="visit-date-line inline-block align-bottom" aria-hidden="true" />　核对人：<span className="visit-date-line inline-block align-bottom" aria-hidden="true" /></p>
        </article>)}
        <p className="m-0 text-xs text-sub">请以机构当次答复、现场情况和拟签合同为准；这张核对单不构成平台核验、服务推荐或预约确认。</p>
      </section>}
    </>}
  </>;
}
