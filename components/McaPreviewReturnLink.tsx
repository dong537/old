'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { safeMcaPreviewReturnPath } from '@/lib/mca-preview-ui';
import { sitePath } from '@/lib/site-path';

export function McaPreviewReturnLink() {
  const params = useSearchParams();
  const returnPath = safeMcaPreviewReturnPath(params?.get('from') ?? null);
  return <a href={sitePath(returnPath)} className="underlink">← 返回观察记录{returnPath !== '/quanguo/mca-preview/' ? '（保留筛选）' : ''}</a>;
}
