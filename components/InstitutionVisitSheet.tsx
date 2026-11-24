'use client';

import React from 'react';
import { mcaOfficialDetailHref } from '@/lib/mca-public-ui';
import { visitFacts, visitQuestions } from './eldercare-next-steps';
import type { CompareResult } from './mca-compare-data';
import type { ComparePick } from './mca-compare-model';

export function InstitutionVisitSheet({ picks, columns }: { picks: ComparePick[]; columns: Record<string, CompareResult> }) {
  const loading = picks.some(pick => !columns[pick.id]);
  return <details className="mca-visit-sheet card min-w-0 p-4 sm:p-5">
    <summary className="mca-visit-screen cursor-pointer text-base font-semibold text-brand-dark">
      看院前核对清单 <span className="ml-2 text-sm font-normal text-sub">按已选机构生成，可打印</span>
    </summary>
    <section aria-labelledby="mca-visit-title" className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="mca-visit-title" className="m-0 text-xl font-semibold">看院前核对清单</h2>
          <p className="m-0 mt-1 text-sm text-body">用历史资料做准备，空床和实际费用请向机构核对。</p></div>
        <button type="button" className="mca-visit-screen btn-primary min-h-11 disabled:opacity-50" disabled={loading} onClick={() => window.print()}>
          {loading ? '正在读取资料…' : '打印清单 / 保存 PDF'}
        </button>
      </div>
      {picks.map(pick => {
        const data = visitFacts(columns[pick.id]);
        return <article key={pick.id} className="mca-visit-institution rounded border border-line p-4">
          <h3 className="m-0 break-words text-lg font-semibold">{pick.name}</h3>
          <div className="mca-visit-columns mt-3 grid gap-4 md:grid-cols-2">
            <section aria-label="历史资料" className="min-w-0">
              <h4 className="m-0 font-semibold">平台已列出的历史资料</h4>
              <dl className="mt-2 grid gap-2 text-sm">
                {([['参考月费',data.total],['平台列示服务',data.services.length > 150 ? data.services.slice(0,150)+'…（详见原页）' : data.services],['资料时间',data.date],['资料状态',data.status]] as const).map(([label,value]) =>
                  <div key={label}><dt className="text-sub">{label}</dt><dd className="m-0 break-words">{value}</dd></div>)}
              </dl>
              <p className="mb-0 mt-2 break-all text-xs text-sub">来源：<a href={mcaOfficialDetailHref(pick.id)} className="underlink" target="_blank" rel="noopener noreferrer">全国养老服务信息平台</a> · ID {pick.id}</p>
            </section>
            <section aria-label="待问问题" className="min-w-0 border-t border-line pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
              <h4 className="m-0 font-semibold">联系机构时待核对</h4>
              <ul className="mb-0 mt-2 grid list-none gap-2 p-0 text-sm">
                {visitQuestions.map(question => <li key={question} className="flex gap-2"><span aria-hidden="true">□</span><span>{question}</span></li>)}
              </ul>
              <div className="mt-3 min-h-10 border-b border-dashed border-line text-sm">记录：</div>
            </section>
          </div>
        </article>;
      })}
    </section>
  </details>;
}
