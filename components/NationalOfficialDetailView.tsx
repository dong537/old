'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SectionTitle } from '@/components/DirectoryUi';
import { ProfileToc, type ProfileTocItem } from '@/components/ProfileToc';
import { findOfficialCity, findOfficialRecord, loadOfficialChunk, loadOfficialIndex, loadOfficialManifest, safeOfficialReturnPath } from '@/lib/national-official-search';
import type { NationalOfficialDetailRecord, NationalOfficialManifest } from '@/lib/national-official-types';
import { officialAddressLabel, officialNameCaution, officialWorkbookRow } from '@/lib/national-official-presentation';
import { sitePath } from '@/lib/site-path';

type DetailState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'notfound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: NationalOfficialManifest; record: NationalOfficialDetailRecord; cityName: string; lookupKey: string };

function shown(value: number | string | null, unit = ''): string {
  return value === null || value === '' ? '原表未提供' : String(value) + unit;
}

export function NationalOfficialDetailContent({ manifest, record, from, cityName }: { manifest: NationalOfficialManifest; record: NationalOfficialDetailRecord; from: string | null; cityName?: string }) {
  const source = manifest.sources.find(item => item.id === record.sourceId);
  const listHref = safeOfficialReturnPath(from);
  const workbookRow = officialWorkbookRow(record);
  if (!source) return <div className="notice" role="alert">记录与来源清单不一致。<a href={sitePath(listHref)} className="underlink ml-2">返回来源目录</a></div>;
  const toc: ProfileTocItem[] = [
    { id: 'overview', label: '概况' },
    { id: 'fields', label: '机构资料' },
    { id: 'sources', label: '来源' },
    { id: 'checklist', label: '核对建议' },
  ];
  const verification = <div className="card flex flex-col gap-3 p-5 text-[14px]">
    <h2 className="m-0 text-lg font-semibold">核对这条官方记录</h2>
    <p className="m-0 text-body">这份资料不能作为当前联络方式或空床依据。了解服务前，请先对照原文的范围与资料日期。</p>
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[13px]">打开官方原文核对 ↗</a>
    <a href={sitePath('#sources')} className="text-[13px]">查看来源与时间 →</a>
  </div>;
  return <>
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="text-[13px] text-sub"><a href={sitePath('/quanguo/laiyuan/')}>全国官方来源记录</a><span className="mx-2" aria-hidden="true">/</span>{source.province} · {cityName ?? source.city ?? '全省'}<span className="mx-2" aria-hidden="true">/</span>来源第 {record.rowNumber} 条</nav>
    <ProfileToc items={toc} variant="bar" />
    <div className="flex items-start gap-6">
      <ProfileToc items={toc} variant="side" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section id="overview" tabIndex={-1} className="section flex flex-col gap-3"><div className="flex flex-col gap-2"><span className="tag w-fit">官方公开来源 · 历史快照</span><h1 className="m-0 break-words text-[28px] font-bold leading-tight sm:text-[32px]">{record.name}</h1>{officialNameCaution(record) && <p className="m-0 text-[13px] text-caution">{officialNameCaution(record)}</p>}<p className="m-0 text-body">{officialAddressLabel(record)} · 床位数 {shown(record.beds, ' 张')}（来源快照）</p><p className="m-0 text-body">这是官方公开材料中的一条来源记录，不证明该场所当前在营、仍提供所列服务或有空床；也未确认与企查查登记主体的运营关系。</p></div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-sub"><span>来源第 {record.rowNumber} 条 · 档案编号 {record.id}</span><a href={sitePath(listHref)} className="underlink text-sm">← 返回来源目录{listHref !== '/quanguo/laiyuan/' ? '（保留筛选）' : ''}</a></div>
        </section>
        <div className="lg:hidden">{verification}</div>
        <section id="fields" tabIndex={-1} className="section"><SectionTitle title="原表字段" extra="按来源当时记载，不作为当前承诺" /><dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2"><div className="sm:col-span-2"><dt className="text-sub">地址</dt><dd className="m-0 break-words">{officialAddressLabel(record)}</dd></div><div><dt className="text-sub">床位数</dt><dd className="m-0">{shown(record.beds, ' 张')}（来源快照，不等于当前空床）</dd></div><div><dt className="text-sub">入住老年人总数</dt><dd className="m-0">{shown(record.residentCount, ' 人')}</dd></div><div><dt className="text-sub">从业人员数</dt><dd className="m-0">{shown(record.staffCount, ' 人')}</dd></div><div className="sm:col-span-2"><dt className="text-sub">提供服务内容</dt><dd className="m-0 whitespace-pre-wrap break-words">{shown(record.services)}</dd></div></dl></section>
        <section id="sources" tabIndex={-1} className="section"><SectionTitle title="来源与范围" /><dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2"><div><dt className="text-sub">原文标题</dt><dd className="m-0">{source.title}</dd></div><div><dt className="text-sub">覆盖范围</dt><dd className="m-0">{source.scope}</dd></div><div><dt className="text-sub">发布日期</dt><dd className="m-0">{source.publishedAt ? <time dateTime={source.publishedAt}>{source.publishedAt}</time> : '原文未说明'}</dd></div><div><dt className="text-sub">资料截至</dt><dd className="m-0">{source.asOf ?? '原文未说明'}</dd></div><div><dt className="text-sub">来源定位</dt><dd className="m-0">来源第 {record.rowNumber} 条{workbookRow !== null ? ' · 工作表第 ' + workbookRow + ' 行' : null} · 本次快照 ID {record.id}</dd></div><div><dt className="text-sub">本站归档日期</dt><dd className="m-0"><time dateTime={manifest.archivedAt}>{manifest.archivedAt}</time></dd></div></dl><p className="mb-0 mt-4"><a href={source.url} target="_blank" rel="noopener noreferrer">打开官方原文核对 ↗</a></p><p className="mb-0 mt-2 break-all text-[13px] text-sub">冻结原件 SHA-256：<span className="font-mono">{source.sha256}</span></p></section>
        <section id="checklist" tabIndex={-1} className="section"><SectionTitle title="联系与探访前，建议核对" /><ul className="m-0 list-disc space-y-2 pl-5 text-body"><li>服务场所当前是否在营、是否接收所需照护需求及有无合适床位。</li><li>实际签约主体、服务内容、各项费用与退费条款是否与书面文件一致。</li></ul><p className="mb-0 mt-3 text-[13px] text-sub">各来源覆盖范围、资料时间和设施类型不同；原表可能包括敬老院、社区照料设施或医院。来源行不能相加为全国养老机构总数，也不能凭同名认定登记主体。</p></section>
      </div>
      <aside className="sticky top-4 hidden w-[320px] shrink-0 flex-col gap-4 lg:flex">{verification}</aside>
    </div>
  </>;
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
