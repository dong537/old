'use client';
import { sitePath } from '@/lib/site-path';

import { useSearchParams } from 'next/navigation';

export function ReturnToList() {
  const params = useSearchParams();
  const from = params.get('from') ?? '';
  const safe = /^\/guangzhou\/jigou\/(?:\?[^#]*)?$/.test(from);
  return <a href={sitePath(safe ? from : '/guangzhou/jigou/')} className="underlink text-sm">← 返回机构列表{safe && from.includes('?') ? '（保留筛选）' : ''}</a>;
}
