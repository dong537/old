'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SectionTitle } from '@/components/DirectoryUi';
import { PublicInstitutionBottomNav, PublicInstitutionDetailSections, PublicInstitutionHero, PublicInstitutionSummary } from '@/components/PublicInstitutionDetailSections';
import { mapOfficialInstitutionDetail } from '@/lib/institution-detail-dto';
import { findOfficialCity, findOfficialRecord, loadOfficialChunk, loadOfficialIndex, loadOfficialManifest, safeOfficialReturnPath } from '@/lib/national-official-search';
import type { NationalOfficialDetailRecord, NationalOfficialManifest } from '@/lib/national-official-types';
import { officialNameCaution, officialWorkbookRow } from '@/lib/national-official-presentation';
import { sitePath } from '@/lib/site-path';

type DetailState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'notfound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: NationalOfficialManifest; record: NationalOfficialDetailRecord; cityName: string; lookupKey: string };

export function NationalOfficialDetailContent({ manifest, record, from, cityName }: { manifest: NationalOfficialManifest; record: NationalOfficialDetailRecord; from: string | null; cityName?: string }) {
  const source = manifest.sources.find(item => item.id === record.sourceId);
  const listHref = safeOfficialReturnPath(from);
  const workbookRow = officialWorkbookRow(record);
  if (!source) return <div className="notice" role="alert">记录与来源清单不一致。<a href={sitePath(listHref)} className="underlink ml-2">返回来源目录</a></div>;
  const dto = mapOfficialInstitutionDetail(record, source);
  const toc = [
    { id: 'overview', label: '概况' },
    { id: 'fields', label: '基本信息' },
    { id: 'services', label: '服务信息' },
    { id: 'care', label: '机构养老' },
    { id: 'reviews', label: '用户评价' },
    { id: 'sources', label: '来源' },
    { id: 'checklist', label: '核对建议' },
  ];
  const verification = <div className="rounded-lg border border-brand-line bg-brand-tint p-5 text-[14px]">
    <h2 className="m-0 text-base font-semibold">核对这条官方记录</h2>
    <p className="mb-0 mt-3 text-body">这份资料不能作为当前联络方式或空床依据。了解服务前，请先对照原文的范围与资料日期。</p>
    <div className="mt-4 flex flex-col gap-2 border-t border-brand-line pt-3 font-semibold">
      <a href={source.url} target="_blank" rel="noopener noreferrer">打开官方原文核对 ↗</a>
      <a href={sitePath('#sources')}>查看来源与时间 →</a>
    </div>
  </div>;
  return <div className="institution-detail-page">
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="flex flex-wrap items-center gap-x-2 bg-[#F28C16] px-5 py-3 text-[13px] text-white sm:px-8 lg:px-20"><a href={sitePath('/quanguo/laiyuan/')} className="text-white underline-offset-4 hover:text-white hover:underline">全国官方来源记录</a><span aria-hidden="true">›</span><span>{source.province} · {cityName ?? source.city ?? '全省'}</span><span aria-hidden="true">›</span><span>来源第 {record.rowNumber} 条</span></nav>
    <div className="flex min-w-0 flex-col gap-5">
        <PublicInstitutionHero dto={dto} sourceLabel="官方公开来源 · 历史快照" sourceTitle={source.title + ' · 发布于 ' + (source.publishedAt ?? '原文未说明')} sourceDate={source.asOf} sourceHref={source.url} sourceLinkLabel="打开官方原文核对" returnHref={listHref} returnLabel={'返回来源目录' + (listHref !== '/quanguo/laiyuan/' ? '（保留筛选）' : '')}>
          {officialNameCaution(record) && <p className="mb-0 mt-3 text-[13px] text-caution">{officialNameCaution(record)}</p>}
          <p className="mb-0 mt-3 max-w-[850px] text-[13px] leading-6 text-body">这是官方公开材料中的一条来源记录，不证明当前在营、实际服务或空床；尚未确认与登记主体的运营关系。</p>
        </PublicInstitutionHero>
        <PublicInstitutionSummary dto={dto} />
        <PublicInstitutionDetailSections dto={dto} />
        <div>{verification}</div>
        <section id="sources" tabIndex={-1} className="section"><SectionTitle title="来源与范围" /><dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2"><div><dt className="text-sub">原文标题</dt><dd className="m-0">{source.title}</dd></div><div><dt className="text-sub">覆盖范围</dt><dd className="m-0">{source.scope}</dd></div><div><dt className="text-sub">发布日期</dt><dd className="m-0">{source.publishedAt ? <time dateTime={source.publishedAt}>{source.publishedAt}</time> : '原文未说明'}</dd></div><div><dt className="text-sub">资料截至</dt><dd className="m-0">{source.asOf ?? '原文未说明'}</dd></div><div><dt className="text-sub">来源定位</dt><dd className="m-0">来源第 {record.rowNumber} 条{workbookRow !== null ? ' · 工作表第 ' + workbookRow + ' 行' : null} · 本次快照 ID {record.id}</dd></div><div><dt className="text-sub">本站归档日期</dt><dd className="m-0"><time dateTime={manifest.archivedAt}>{manifest.archivedAt}</time></dd></div></dl><p className="mb-0 mt-4"><a href={source.url} target="_blank" rel="noopener noreferrer">打开官方原文核对 ↗</a></p><p className="mb-0 mt-2 break-all text-[13px] text-sub">冻结原件 SHA-256：<span className="font-mono">{source.sha256}</span></p></section>
        <section id="checklist" tabIndex={-1} className="section"><SectionTitle title="联系与探访前，建议核对" /><ul className="m-0 list-disc space-y-2 pl-5 text-body"><li>服务场所当前是否在营、是否接收所需照护需求及有无合适床位。</li><li>实际签约主体、服务内容、各项费用与退费条款是否与书面文件一致。</li></ul><p className="mb-0 mt-3 text-[13px] text-sub">各来源覆盖范围、资料时间和设施类型不同；原表可能包括敬老院、社区照料设施或医院。来源行不能相加为全国养老机构总数，也不能凭同名认定登记主体。</p></section>
      <PublicInstitutionBottomNav name={record.name} items={toc} />
    </div>
  </div>;
}

export function NationalOfficialDetailView() {
  const params = useSearchParams();
  const province = params.get('province') ?? '';
  const city = params.get('city') ?? '';
  const id = params.get('id') ?? '';
  const lookupKey = province + ':' + city + ':' + id;
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!/^[a-z0-9-]{1,80}$/.test(id) || !/^[a-z0-9-]{1,80}$/.test(province) || !/^[a-z0-9-]{1,80}$/.test(city)) {
      setState({ status: 'invalid' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadOfficialManifest(controller.signal).then(async manifest => {
      const location = findOfficialCity(manifest, province, city);
      if (!location) {
        if (!controller.signal.aborted) setState({ status: 'invalid' });
        return;
      }
      const index = await loadOfficialIndex(manifest, province, city, controller.signal);
      const indexed = findOfficialRecord(index.records, id);
      if (!indexed) {
        if (!controller.signal.aborted) setState({ status: 'notfound' });
        return;
      }
      const chunk = await loadOfficialChunk(manifest, index, indexed.chunk, controller.signal);
      const record = chunk.records.find(item => item.id === id);
      if (!record) throw new Error('官方来源详情与索引不一致。');
      if (!controller.signal.aborted) setState({ status: 'ready', manifest, record, cityName: location.city.name, lookupKey });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '官方来源详情读取失败。' });
    });
    return () => controller.abort();
  }, [lookupKey, attempt]);
  if (state.status === 'loading' || (state.status === 'ready' && state.lookupKey !== lookupKey)) return <div className="notice" role="status">正在加载官方来源详情…</div>;
  if (state.status === 'invalid' || state.status === 'notfound') return <div className="card p-8"><h1 className="m-0 text-xl font-semibold">{state.status === 'invalid' ? '地区或记录 ID 无效' : '未找到来源记录'}</h1><p className="mt-2 text-body">请从来源目录重新选择记录。</p><a href={sitePath('/quanguo/laiyuan/')} className="btn-outline mt-3">返回来源目录</a></div>;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button><a href={sitePath('/quanguo/laiyuan/')} className="underlink ml-4">返回来源目录</a></div>;
  return <NationalOfficialDetailContent manifest={state.manifest} record={state.record} cityName={state.cityName} from={params.get('from')} />;
}
