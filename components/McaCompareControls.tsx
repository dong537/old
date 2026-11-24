'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { compareHref, compareLimit, parseComparePicks, toggleComparePick, type ComparePick } from './mca-compare-model';

const key = 'eldercare-mca-comparison-v1';
const empty: ComparePick[] = [];
let current = empty;
let storageRead = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  if (!storageRead) {
    storageRead = true;
    try { current = parseComparePicks(window.sessionStorage.getItem(key)); } catch { /* storage can be blocked */ }
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const getSnapshot = () => current;
const getServerSnapshot = () => empty;
export function useComparePicks() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
function update(next: ComparePick[]) {
  current = next;
  try { window.sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* in-memory selection remains usable */ }
  for (const listener of listeners) listener();
}
export function removeComparePick(id: string) {
  update(current.filter(item => item.id !== id));
}

export function CompareToggle({ pick }: { pick: ComparePick }) {
  const picks = useComparePicks();
  const selected = picks.some(item => item.id === pick.id);
  return <button type="button" data-compare-id={pick.id}
    aria-pressed={selected} aria-label={(selected ? '移出对比：' : '加入对比：') + pick.name}
    disabled={!selected && picks.length >= compareLimit} onClick={() => update(toggleComparePick(current, pick))}
    className={'inline-flex min-h-11 items-center rounded border px-3 py-1.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ' +
      (selected ? 'border-brand bg-brand-tint text-brand-dark' : 'border-line bg-white text-brand-dark hover:border-brand')}>
    {selected ? '已选 · 移出' : '加入对比'}
  </button>;
}

export function CompareTray({ from }: { from: string | null }) {
  const picks = useComparePicks();
  const trayRef = useRef<HTMLElement>(null);
  const [showDock, setShowDock] = useState(false);
  const hasPicks = picks.length > 0;
  useEffect(() => {
    if (!hasPicks) { setShowDock(false); return; }
    const mobile = window.matchMedia('(max-width: 767px)');
    let frame = 0;
    const sync = () => {
      frame = 0;
      const tray = trayRef.current;
      setShowDock(Boolean(mobile.matches && tray && tray.getBoundingClientRect().bottom <= 0));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(sync); };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    if (trayRef.current) observer.observe(trayRef.current);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [hasPicks]);


  return <><section ref={trayRef} aria-label="机构对比选择" className="card min-w-0 p-4" id="mca-compare-tray">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div><h2 className="m-0 text-base font-semibold text-ink">对比养老机构</h2>
        <p className="m-0 mt-1 text-sm text-sub" role="status">已选 {picks.length}/{compareLimit} 家。{picks.length >= compareLimit ? '已达上限，可先移除一家。' : '选满两家即可对比月费、服务和资料来源。'}</p></div>
      {picks.length >= 2 && <Link href={compareHref(from)} className="btn-primary">查看对比 →</Link>}
    </div>
    {!!picks.length && <ul className="mb-0 mt-3 flex list-none flex-wrap gap-2 p-0">
      {picks.map(pick => <li key={pick.id} className="flex min-w-0 max-w-full items-center gap-1 rounded border border-line bg-brand-tint pl-2 text-sm">
        <span className="min-w-0 break-words">{pick.name}</span><button type="button" aria-label={'移除 ' + pick.name} className="min-h-11 min-w-11 font-bold text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" onClick={() => removeComparePick(pick.id)}>×</button>
      </li>)}
    </ul>}
  </section>
  {hasPicks && showDock && <aside aria-label="快捷机构对比"
    className="fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))_+_3.5rem)] left-[max(.75rem,env(safe-area-inset-left))] right-[max(.75rem,env(safe-area-inset-right))] z-20 flex min-h-11 min-w-0 items-center justify-between gap-2 rounded border border-brand-line bg-white px-2.5 text-sm shadow-card print:hidden md:hidden">
    <span className="min-w-0 font-semibold text-brand-dark" role="status">已选 {picks.length} 家</span>
    {picks.length >= 2
      ? <Link href={compareHref(from)} className="btn-primary shrink-0 px-2.5">查看对比 →</Link>
      : <a href="#mca-compare-tray" className="underlink inline-flex min-h-11 shrink-0 items-center">再选一家</a>}
  </aside>}

  </>;
}
export function DetailCompareActions({ pick }: { pick: ComparePick }) {
  const from = useSearchParams()?.get('from') ?? null;
  const count = useComparePicks().length;
  return <div className="flex min-w-0 flex-wrap items-center gap-3">
    <CompareToggle pick={pick} />
    {count >= 2 ? <Link href={compareHref(from)} className="underlink inline-flex min-h-11 items-center text-sm">查看已选 {count} 家 →</Link> : <span className="text-sm text-sub" role="status">已选 {count}/3 家</span>}
  </div>;
}
