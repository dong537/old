'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { publicDirectoryReturnHref } from './mca-public-directory-filters';
import { sitePath } from '@/lib/site-path';

export function McaDetailReturnLink() {
  const href = publicDirectoryReturnHref(useSearchParams().get('from'));
  const hasFilterContext = href !== '/quanguo/pingtai/';

  return <a href={sitePath(href)} className="underlink inline-flex min-h-11 items-center text-sm font-semibold">
    ← {hasFilterContext ? '返回筛选结果' : '返回机构目录'}
  </a>;
}
