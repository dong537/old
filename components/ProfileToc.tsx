'use client';
import { sitePath } from '@/lib/site-path';

import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface ProfileTocItem {
  id: string;
  label: string;
  warn?: boolean;
}

function useActive(ids: string[], offset: number) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current = ids[0];
      for (const id of ids) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= offset) current = id;
      }
      setActive(atBottom ? ids[ids.length - 1] : current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids, offset]);
  return active;
}

function jump(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  section.focus({ preventScroll: true });
  section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(history.state, '', `#${id}`);
}

export function ProfileToc({ items, variant }: { items: readonly ProfileTocItem[]; variant: 'side' | 'bar' }) {
  const idsKey = items.map(item => item.id).join(',');
  const ids = useMemo(() => idsKey ? idsKey.split(',') : [], [idsKey]);
  const active = useActive(ids, variant === 'bar' ? 72 : 96);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant !== 'bar' || !barRef.current) return;
    const link = Array.from(barRef.current.querySelectorAll<HTMLElement>('[data-id]')).find(element => element.dataset.id === active);
    if (link) barRef.current.scrollLeft = link.offsetLeft - barRef.current.clientWidth / 2 + link.clientWidth / 2;
  }, [active, variant]);

  if (variant === 'bar') return <nav aria-label="本页目录" className="sticky top-0 z-20 -mx-4 border-b border-line bg-page/95 backdrop-blur sm:-mx-6 xl:hidden">
    <div ref={barRef} className="flex gap-1 overflow-x-auto px-4 sm:px-6">
      {items.map(item => <a key={item.id} data-id={item.id} href={sitePath(`#${item.id}`)} onClick={event => jump(event, item.id)} aria-current={active === item.id ? 'location' : undefined}
        className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] no-underline ${active === item.id ? 'border-brand font-semibold text-brand' : `border-transparent ${item.warn ? 'text-gradeD' : 'text-ink'} hover:text-brand`}`}>{item.label}</a>)}
    </div>
  </nav>;

  return <nav aria-label="本页目录" className="sticky top-4 hidden w-[120px] shrink-0 flex-col gap-1 xl:flex">
    <span className="px-3 pb-1 text-xs text-sub">本页目录</span>
    <ol className="m-0 flex list-none flex-col border-l border-line p-0">
      {items.map(item => <li key={item.id}><a href={sitePath(`#${item.id}`)} onClick={event => jump(event, item.id)} aria-current={active === item.id ? 'location' : undefined}
        className={`-ml-px block border-l-2 py-1.5 pl-3 pr-1 text-[14px] no-underline ${active === item.id ? 'border-brand font-semibold text-brand' : `border-transparent ${item.warn ? 'text-gradeD' : 'text-body'} hover:border-brand-line hover:text-brand`}`}>{item.label}</a></li>)}
    </ol>
    <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
      <a href={sitePath("#sources")} onClick={event => jump(event, 'sources')} className="px-3 font-semibold">核对资料来源</a>
      <a href={sitePath("#top")} onClick={event => jump(event, 'top')} className="px-3 text-sub hover:text-brand">回到顶部 ↑</a>
    </div>
  </nav>;
}
