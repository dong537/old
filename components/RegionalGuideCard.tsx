import React from 'react';
import { sitePath } from '@/lib/site-path';
import { getRegionalGuides } from './eldercare-next-steps';

export function RegionalGuideCard({ province, city }: { province: string; city: string }) {
  const guides = getRegionalGuides(province, city);
  if (!guides.length) return null;
  return <section aria-label="当地办事指南" className="card min-w-0 border-l-4 border-l-brand p-4">
    <h2 className="m-0 text-base font-semibold">当地办事指南 · {city}</h2>
    <ul className="mb-0 mt-2 grid list-none gap-2 p-0">
      {guides.map(guide => <li key={guide.href}>
        <a href={sitePath(guide.href)} className="underlink inline-flex min-h-11 items-center font-medium">{guide.title} →</a>
        <p className="m-0 text-sm text-sub">{guide.description}</p>
      </li>)}
    </ul>
  </section>;
}
