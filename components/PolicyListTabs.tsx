'use client';

import Link from 'next/link';
import { useState } from 'react';
import { policySections, sectionLabel, type PolicyItem, type PolicySectionKey } from '@/lib/policy-content-types';

type ItemWithLabel = PolicyItem & { sectionLabel: string };

function formatDate(s?: string) {
  if (!s) return '';
  return s.slice(0, 10);
}

export function PolicyListTabs({ items }: { items: ItemWithLabel[] }) {
  const [active, setActive] = useState<'all' | PolicySectionKey>('all');
  const tabs: { key: 'all' | PolicySectionKey; label: string }[] = [
    { key: 'all', label: '全部' },
    ...policySections.map((k) => ({ key: k as PolicySectionKey, label: sectionLabel[k] })),
  ];
  const visible = active === 'all' ? items : items.filter((i) => i.section === active);

  return (
    <>
      <nav aria-label="政策内容分类" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={
              'rounded-lg px-3 py-1.5 text-sm ' +
              (active === tab.key ? 'bg-brand text-white' : 'bg-page text-ink-2 hover:bg-brand-soft hover:text-brand')
            }
          >
            {tab.label}
            <span className="ml-1 text-[12px] opacity-70 tabular">
              {tab.key === 'all' ? items.length : items.filter((i) => i.section === tab.key).length}
            </span>
          </button>
        ))}
      </nav>

      <ol className="m-0 flex list-none flex-col divide-y divide-line border-y border-line p-0" aria-label="政策内容列表">
        {visible.map((item) => (
          <li key={item.id} className="group flex gap-4 px-2 py-3.5 sm:px-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/zhengce/${item.id}/`}
                className="block break-words text-[15px] font-medium text-ink no-underline group-hover:text-brand"
              >
                {item.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-sub">
                <span className="rounded bg-brand-tint/70 px-1.5 py-0.5 text-brand-ink">{item.sectionLabel}</span>
                {item.docNo && <span className="font-mono">{item.docNo}</span>}
                {item.source && <span>来源：{item.source}</span>}
                {item.releaseTime && <time dateTime={formatDate(item.releaseTime)}>{formatDate(item.releaseTime)}</time>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
