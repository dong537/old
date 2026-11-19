'use client';

import { useSearchParams } from 'next/navigation';
import { sitePath } from '@/lib/site-path';

export function safeProvinceReturnPath(from: string | null): string {
  const fallback = '/guangdong/jigou/';
  const national = '/quanguo/laiyuan/';
  if (!from || from.length > 1536) return fallback;
  const isNational = /^\/quanguo\/laiyuan\/(?:\?[^#\r\n]*)?$/.test(from);
  if (!isNational && !/^\/guangdong\/jigou\/(?:\?[^#\r\n]*)?$/.test(from)) return fallback;
  const query = from.slice((isNational ? national : fallback).length);
  if (!query) return isNational ? fallback : from;
  const params = new URLSearchParams(query.slice(1));
  const allowed = new Set(isNational ? ['province', 'city', 'q', 'page'] : ['city', 'q', 'page']);
  const seen = new Set<string>();
  for (const [key, value] of params) {
    if (!allowed.has(key) || seen.has(key)) return fallback;
    if (key === 'province' && value !== 'guangdong') return fallback;
    if (key === 'city' && (value.length > 80 || /[\u0000-\u001f\u007f]/u.test(value))) return fallback;
    if (key === 'q' && ([...value].length > 80 || /[\u0000-\u001f\u007f]/u.test(value))) return fallback;
    if (key === 'page' && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) return fallback;
    seen.add(key);
  }
  if (isNational && params.get('province') !== 'guangdong') return fallback;
  return from;
}

export function ProvinceReturnToList() {
  const from = useSearchParams().get('from');
  const href = safeProvinceReturnPath(from);
  return <a href={sitePath(href)} className="underlink text-sm">← 返回{href.startsWith('/quanguo/laiyuan/') ? '全国官方来源' : '全省来源目录'}{href !== '/guangdong/jigou/' ? '（保留筛选）' : ''}</a>;
}
