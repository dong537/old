'use client';
import { sitePath } from '@/lib/site-path';

import { useSearchParams } from 'next/navigation';
import { serviceReturnHref } from '@/lib/service-search';

export function ReturnToServices() {
  const params = useSearchParams();
  const from = params.get('from');
  const href = serviceReturnHref(from);
  return <a href={sitePath(href)} className="underlink text-sm">← 返回服务记录{href.includes('?') ? '（保留筛选）' : ''}</a>;
}
