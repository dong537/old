'use client';

import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/DirectoryUi';
import { findQccRecord, isQccStatusCaution, loadQccChunk, loadQccIndex, loadQccLinks, subjectIdsForSource } from '@/lib/qcc-search';
import type { QccDetailRecord } from '@/lib/qcc-types';
import { sitePath } from '@/lib/site-path';

type CandidateState =
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; candidates: QccDetailRecord[] };

export function QccCandidateList({ candidates, sourceRecordId }: { candidates: QccDetailRecord[]; sourceRecordId?: string }) {
  if (candidates.length === 0) return null;
  return <section className="section"><SectionTitle title="登记主体候选" extra={candidates.length + ' 条同城同名候选'} /><p className="m-0 text-[14px] text-body">这些登记主体与本条官方来源记录同城同名，属于待核对的候选关联；运营关系未核实。请逐条核对代码、地址、登记状态与原始来源。</p><ul className="m-0 flex list-none flex-col gap-3 p-0">{candidates.map(candidate => {
    const query = new URLSearchParams({ id: candidate.id });
    if (sourceRecordId) query.set('source', sourceRecordId);
    const caution = isQccStatusCaution(candidate.registrationStatus);
    return <li key={candidate.id} className="card p-4"><div className="flex flex-wrap items-start justify-between gap-2"><a href={sitePath('/guangdong/zhuti/detail/?' + query)} className="break-words font-semibold">{candidate.name}</a><span className={'tag ' + (caution ? 'text-caution' : '')}>{candidate.registrationStatus || '登记状态未提供'}</span></div><p className="mb-0 mt-2 break-all text-[13px] text-sub">统一社会信用代码：{candidate.creditCode || '导出未提供'} · 导出第 {candidate.rowNumber} 行</p><p className="mb-0 mt-1 text-[13px] text-sub">{candidate.city}{candidate.district ? ' · ' + candidate.district : ''} · {candidate.subjectType || '类型未提供'}</p></li>;
  })}</ul></section>;
}

export function QccCandidateLinks({ sourceRecordId }: { sourceRecordId: string }) {
  const [state, setState] = useState<CandidateState>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'checking' });
    loadQccLinks(controller.signal).then(async links => {
      const ids = subjectIdsForSource(links, sourceRecordId);
      if (ids.length === 0) {
        setState({ status: 'none' });
        return;
      }
      setState({ status: 'loading' });
      const index = await loadQccIndex(controller.signal);
      if (links.snapshotId !== index.snapshotId) throw new Error('候选关联与主体索引快照不一致。');
      const located = ids.map(id => findQccRecord(index.records, id));
      if (located.some(item => !item)) throw new Error('候选关联指向不存在的登记主体。');
      const chunks = [...new Set(located.map(item => item!.chunk))];
      const loaded = await Promise.all(chunks.map(chunk => loadQccChunk(chunk, index.snapshotId, controller.signal)));
      const details = new Map(loaded.flatMap(chunk => chunk.records).map(record => [record.id, record]));
      const candidates = ids.map(id => details.get(id));
      if (candidates.some(item => !item)) throw new Error('候选登记主体详情缺失。');
      setState({ status: 'ready', candidates: candidates as QccDetailRecord[] });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '候选关联读取失败。' });
    });
    return () => controller.abort();
  }, [sourceRecordId, attempt]);
  if (state.status === 'checking' || state.status === 'none') return null;
  if (state.status === 'loading') return <div className="notice" role="status">正在加载同城同名登记主体候选…</div>;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取候选</button></div>;
  return <QccCandidateList candidates={state.candidates} sourceRecordId={sourceRecordId} />;
}

