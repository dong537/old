'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { mcaPublicReturnHref } from '@/lib/mca-public-ui';
import { sitePath } from '@/lib/site-path';

export function McaDetailReturnLink() {
  const href = mcaPublicReturnHref(useSearchParams().get('from'));
  const hasFilterContext = href !== '/quanguo/pingtai/';

  return <a href={sitePath(href)} className="mt-5 inline-flex min-h-11 items-center font-semibold">
    ← {hasFilterContext ? '返回筛选结果' : '返回机构目录'}
  </a>;
}
