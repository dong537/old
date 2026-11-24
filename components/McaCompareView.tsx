'use client';

import React, { useEffect, useState } from 'react';
import { InstitutionVisitSheet } from './InstitutionVisitSheet';
import { useSearchParams } from 'next/navigation';
import { mcaOfficialDetailHref, mcaPublicDetailHref } from '@/lib/mca-public-ui';
import { publicDirectoryReturnHref } from './mca-public-directory-filters';
import { sitePath } from '@/lib/site-path';
import { removeComparePick, useComparePicks } from './McaCompareControls';
import { compareRows, loadCompareColumn, type CompareResult, type CompareSnapshots } from './mca-compare-data';
import { unknownValue } from './mca-compare-model';

export function McaCompareView({ snapshots }: { snapshots: CompareSnapshots }) {
  const picks = useComparePicks();
  const back = publicDirectoryReturnHref(useSearchParams()?.get('from') ?? null);
  const [columns, setColumns] = useState<Record<string, CompareResult>>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setColumns({});
    if (picks.length >= 2) for (const pick of picks) {
      loadCompareColumn(pick, snapshots, controller.signal).then(
        result => { if (!controller.signal.aborted) setColumns(old => ({ ...old, [pick.id]: result })); },
        () => { if (!controller.signal.aborted) setColumns(old => ({ ...old, [pick.id]: { state: 'error' } })); },
      );
    }
    return () => controller.abort();
  }, [picks, snapshots, retry]);
  const filtered = back.includes('?');
  const hasError = picks.some(p => columns[p.id]?.state === 'error');
  return <div className="mca-compare-content flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <a className="underlink inline-flex min-h-11 items-center" href={sitePath(back)}>← {filtered ? '返回原筛选与页码' : back === '/quanguo/jiage/' ? '返回月费样本' : '返回机构目录'}</a>
      {back !== '/quanguo/pingtai/' && <a className="underlink inline-flex min-h-11 items-center" href={sitePath('/quanguo/pingtai/')}>打开全国机构目录</a>}
    </div>
    {picks.length < 2 ? <section className="card p-5" aria-label="当前对比选择">
      <p role="status" className="m-0">已选 {picks.length} 家。回到目录或费用页，再选机构即可对比（最多 3 家）。</p>
      {picks[0] && <button type="button" className="underlink mt-2 min-h-11 text-sm" onClick={() => removeComparePick(picks[0].id)}>移除 {picks[0].name}</button>}
    </section> : <>
      <div className="notice" role="status">已选 {picks.length} 家。各列来自不同时间的资料快照，不是实时报价或空床。窄屏可横向滑动表格。</div>
      {hasError && <p className="m-0 text-sm text-caution" role="alert">部分机构详情未载入。 <button type="button" className="underlink min-h-11" onClick={() => setRetry(v => v + 1)}>重试加载</button></p>}
      <InstitutionVisitSheet picks={picks} columns={columns} />
      <div tabIndex={0} role="region" aria-label="养老机构并排对比，可横向滚动" className="card min-w-0 max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        <table className="w-full table-fixed border-collapse text-left text-sm" style={{ minWidth: 110 + picks.length * 180 }}>
          <caption className="sr-only">所选养老机构的费用、服务、床位和资料来源</caption>
          <colgroup><col style={{ width: 110 }} />{picks.map(pick => <col key={pick.id} />)}</colgroup>
          <thead className="bg-brand-tint">
            <tr><th scope="col" className="sticky left-0 z-10 border-r border-line bg-brand-tint p-3 align-top">对比项目</th>
              {picks.map(pick => <th scope="col" key={pick.id} className="border-r border-line p-3 align-top last:border-r-0">
                <span className="block break-words text-base text-ink">{pick.name}</span>
                <button type="button" className="underlink min-h-11 text-sm font-normal" aria-label={'移除 ' + pick.name} onClick={() => removeComparePick(pick.id)}>移除</button>
              </th>)}
            </tr>
          </thead>
          <tbody>
            {compareRows.map(([key,label]) => <tr key={key} className={key === 'total' ? 'bg-brand-tint font-semibold' : ''}>
              <th scope="row" className={'sticky left-0 z-10 border-r border-t border-line p-3 align-top text-ink ' + (key === 'total' ? 'bg-brand-tint' : 'bg-white')}>{label}</th>
              {picks.map(pick => {
                const value = columns[pick.id];
                const cell = value?.state === 'ready' ? value.column[key] :
                  key === 'status' ? value?.state === 'error' ? '详情载入失败' : value?.state === 'index' ? '仅有索引，未采集详情' : '正在读取详情' :
                  key === 'date' && pick.observedAt ? pick.observedAt : value ? unknownValue : '读取中…';
                return <td key={pick.id} className="break-words whitespace-pre-line border-r border-t border-line p-3 align-top last:border-r-0">{cell}</td>;
              })}
            </tr>)}
            <tr><th scope="row" className="sticky left-0 z-10 border-r border-t border-line bg-white p-3 align-top text-ink">来源入口</th>
              {picks.map(pick => <td key={pick.id} className="border-r border-t border-line p-3 align-top last:border-r-0">
                <a className="underlink inline-flex min-h-11 items-center" href={mcaOfficialDetailHref(pick.id)} target="_blank" rel="noopener noreferrer">平台原页 ↗</a>
                {pick.detailPath && <><br /><a className="underlink inline-flex min-h-11 items-center" href={sitePath(mcaPublicDetailHref(pick.id) + '?' + new URLSearchParams({ from: back }))}>查看本站档案 →</a></>}
              </td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </>}
  </div>;
}
