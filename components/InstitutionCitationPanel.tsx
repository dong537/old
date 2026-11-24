'use client';

import React, { useRef, useState } from 'react';
import { citationScope, citationText, type InstitutionCitation } from './eldercare-next-steps';

export function InstitutionCitationPanel({ citation }: { citation: InstitutionCitation }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [fallback, setFallback] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  async function copyCitation() {
    const value = citationText(citation, window.location.origin);
    try {
      await navigator.clipboard.writeText(value);
      setCopy('copied'); setFallback('');
    } catch {
      setFallback(value); setCopy('manual');
      requestAnimationFrame(() => { field.current?.focus(); field.current?.select(); });
    }
  }
  return <section aria-labelledby="institution-citation-title" className="my-4 rounded border border-line bg-brand-tint/40 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="institution-citation-title" className="m-0 text-base font-semibold">引用这条资料</h3>
      <button type="button" className="btn-outline min-h-11" onClick={copyCitation}>复制资料引用</button>
    </div>
    <dl className="mb-0 mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-sub">机构</dt><dd className="m-0 break-words">{citation.name}</dd></div>
      <div className="min-w-0"><dt className="text-sub">采集记录</dt><dd className="m-0 break-words">{citation.capture}</dd></div>
      <div className="min-w-0"><dt className="text-sub">官方出处</dt><dd className="m-0"><a href={citation.official} className="underlink" rel="noopener noreferrer" target="_blank">全国养老服务信息平台原页 ↗</a></dd></div>
      <div className="min-w-0"><dt className="text-sub">引用链接</dt><dd className="m-0"><a href={citation.detailPath} className="underlink">本站机构档案</a></dd></div>
    </dl>
    <p className="mb-0 mt-2 text-xs text-sub">{citationScope}</p>
    <div role="status" className="text-sm text-brand-dark">{copy === 'copied' ? '已复制资料引用。' : copy === 'manual' ? '自动复制不可用，可手动复制下方文字。' : ''}</div>
    {fallback && <textarea ref={field} aria-label="可手动复制的资料引用" readOnly value={fallback} className="input mt-2 block min-h-32 w-full p-2 text-sm" />}
  </section>;
}
