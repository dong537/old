'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SectionTitle } from '@/components/DirectoryUi';
import { PublicInstitutionBottomNav, PublicInstitutionDetailSections, PublicInstitutionHero, PublicInstitutionSummary } from '@/components/PublicInstitutionDetailSections';
import { mapReferenceInstitutionDetail } from '@/lib/institution-detail-dto';
import { mcaPublicNameSearchHref } from '@/lib/mca-public-ui';
import { loadReferenceCityLinks, loadReferenceLinksManifest, officialCandidateHref } from '@/lib/institution-reference-links';
import { institutionRegistryCandidateHref, loadInstitutionRegistryCityLinks, loadInstitutionRegistryLinksManifest } from '@/lib/institution-registry-links';
import {
  findReferenceCity, findReferenceRecord, loadReferenceChunk, loadReferenceIndex,
  loadReferenceManifest, safeReferenceReturnPath,
} from '@/lib/institution-reference-search';
import type { ReferenceDetailRecord, ReferenceIndex, ReferenceManifest, ReferenceOfficialMatch } from '@/lib/institution-reference-types';
import { REFERENCE_SOURCE_FIELD_NAMES } from '@/lib/institution-reference-types';
import type { InstitutionRegistryTarget } from '@/lib/institution-registry-types';
import { sitePath } from '@/lib/site-path';

type DetailState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'notfound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: ReferenceManifest; index: ReferenceIndex; record: ReferenceDetailRecord; provinceName: string; cityName: string; lookupKey: string };

type CandidateState<T> =
  | { status: 'loading'; key: string }
  | { status: 'error'; key: string; message: string }
  | { status: 'ready'; key: string; items: T[] };

function codeLabel(record: ReferenceDetailRecord): string {
  if (record.codeStatus === 'valid') return record.creditCode ?? '原表代码未通过校验';
  if (record.codeStatus === 'missing') return '原表未提供';
  if (record.codeStatus === 'placeholder') return '原表为占位代码，不用于匹配';
  return '原表代码未通过校验，不用于匹配';
}

export function InstitutionReferenceDetailContent({ manifest, record, officialCandidates, officialError, onOfficialRetry, registryCandidates, registryError, onRegistryRetry, provinceName, cityName, from }: { manifest: ReferenceManifest; record: ReferenceDetailRecord; officialCandidates?: ReferenceOfficialMatch[]; officialError?: string; onOfficialRetry?: () => void; registryCandidates?: InstitutionRegistryTarget[]; registryError?: string; onRegistryRetry?: () => void; provinceName: string; cityName: string; from: string | null }) {
  const listHref = safeReferenceReturnPath(from);
  const dto = mapReferenceInstitutionDetail(record);
  const toc = [
    { id: 'overview', label: '概况' },
    { id: 'fields', label: '基本信息' },
    { id: 'services', label: '服务信息' },
    { id: 'care', label: '机构养老' },
    { id: 'reviews', label: '用户评价' },
    { id: 'official', label: '官方来源候选' },
    { id: 'registry', label: '主体候选' },
    { id: 'sources', label: '来源' },
    { id: 'original', label: '原始字段' },
    { id: 'checklist', label: '核对建议' },
  ];
  const verification = <div className="rounded-lg border border-brand-line bg-brand-tint p-5 text-[14px]">
    <h2 className="m-0 text-base font-semibold">核对这条机构线索</h2>
    <p className="mb-0 mt-3 text-body">本表没有已核实的机构联系电话、实时空床或预约入口。先看官方同名来源和登记主体候选，再向服务场所确认当前情况。</p>
    <div className="mt-4 flex flex-col gap-2 border-t border-brand-line pt-3 font-semibold">
      <a href={sitePath('#official')}>查看官方来源候选 →</a>
      <a href={sitePath(mcaPublicNameSearchHref(record.name))}>在民政部平台部分采集快照按名称查找（候选，未核同一机构） →</a>
      <a href={sitePath('#registry')}>查看登记主体候选 →</a>
      <a href={sitePath('#sources')}>核对原始来源 →</a>
    </div>
  </div>;
  return <div className="institution-detail-page">
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="flex flex-wrap items-center gap-x-2 bg-brand px-5 py-3 text-[13px] text-white sm:px-8 lg:px-20"><a href={sitePath('/quanguo/cankao/')} className="text-white underline-offset-4 hover:text-white hover:underline">全国养老机构来源线索</a><span aria-hidden="true">›</span><span>{provinceName} · {cityName}</span><span aria-hidden="true">›</span><span>工作表第 {record.sourceRow} 行</span></nav>
    <div className="flex min-w-0 flex-col gap-5">
    <PublicInstitutionHero dto={dto} sourceLabel="来源表记录 · 资料时点未知" sourceTitle={manifest.source.title + ' · 工作表第 ' + record.sourceRow + ' 行'} sourceDate={null} returnHref={listHref} returnLabel={'返回线索目录' + (listHref !== '/quanguo/cankao/' ? '（保留筛选）' : '')}>
      <p className="mb-0 mt-3 max-w-[850px] text-[13px] leading-6 text-body">这是来源表中的一条线索，不是官方备案或营业状态证明；此场所与登记主体的关系也未核实。</p>
    </PublicInstitutionHero>
    <PublicInstitutionSummary dto={dto} />
    <PublicInstitutionDetailSections dto={dto} extraBasic={<dl className="m-0 border-t border-hair pt-3 text-[14px]"><div className="grid gap-1 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-5"><dt className="text-sub">统一社会信用代码</dt><dd className="m-0 break-all font-mono">{codeLabel(record)}</dd></div></dl>} />
    <div>{verification}</div>
    <section id="official" tabIndex={-1} className="section">
      <SectionTitle title="同省同名官方来源候选" extra="名称匹配，身份未核实" />
      <p className="mt-0 text-[14px] text-body">这些关联仅按同一省份与机构名称相同建立，尚未确认是否为同一场所、运营主体或当前在营机构。请打开官方来源逐条核对。</p>
      {officialError ? <div className="notice text-[14px]" role="alert">官方来源候选暂时不可用：{officialError} <button type="button" className="underlink" onClick={onOfficialRetry}>重试候选关联</button></div> : officialCandidates === undefined ? <p className="m-0 text-[14px] text-sub" role="status">正在读取官方来源候选…</p> : officialCandidates.length > 0 ? <ul className="m-0 list-none space-y-3 p-0" aria-label="同省同名官方来源候选">{officialCandidates.map(match => <li key={match.kind + ':' + match.id + ':' + match.provinceSlug + ':' + match.citySlug} className="card p-4"><span className="tag">候选匹配 · 身份未核实</span><p className="mb-1 mt-2 break-words text-[14px]">官方来源 · {match.city} · {match.sourceTitle}</p><a href={officialCandidateHref(match)} className="text-[13px]">查看官方来源记录 →</a></li>)}</ul> : <p className="m-0 text-[14px] text-sub">本站已收录的官方来源中未发现同省同名记录；不证明机构不存在。</p>}
    </section>
    <section id="registry" tabIndex={-1} className="section">
      <SectionTitle title="同省信用代码相同的登记主体候选" extra="代码匹配，场所及运营关系未核实" />
      <p className="mt-0 text-[14px] text-body">仅当双方公开投影中的统一社会信用代码有效、相同且同省，并且该代码只命中一条登记主体记录时列出。代码相同不证明该主体经营本场所，也不证明当前在营；多条线索也可能指向同一登记主体，不能据此计算独立养老机构数。</p>
      {record.codeStatus !== 'valid' ? <p className="m-0 text-[14px] text-sub">该线索没有可用于精确匹配的有效公开信用代码。</p> : registryError ? <div className="notice text-[14px]" role="alert">登记主体候选暂时不可用：{registryError} <button type="button" className="underlink" onClick={onRegistryRetry}>重试候选关联</button></div> : registryCandidates === undefined ? <p className="m-0 text-[14px] text-sub" role="status">正在读取登记主体候选…</p> : registryCandidates.length > 0 ? <ul className="m-0 list-none space-y-3 p-0" aria-label="信用代码相同的登记主体候选">{registryCandidates.map(target => <li key={target.kind + ':' + target.id} className="card p-4"><span className="tag">信用代码相同 · 关系未核实</span><p className="mb-1 mt-2 break-words text-[14px] font-semibold">{target.name}</p><p className="mb-2 mt-0 text-[13px] text-sub">{target.province} · {target.city} · {target.name === record.name ? '名称相同，关系仍未核实' : '名称不同，仅说明代码相同'}</p><a href={institutionRegistryCandidateHref(target)} className="text-[13px]">查看登记主体记录 →</a></li>)}</ul> : <p className="m-0 text-[14px] text-sub">本次公开快照未找到符合上述条件的同省唯一登记主体候选；不证明该机构没有登记主体。</p>}
    </section>
    <section id="sources" tabIndex={-1} className="section"><SectionTitle title="来源与核对" /><dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2"><div><dt className="text-sub">来源文件</dt><dd className="m-0">{manifest.source.title}</dd></div><div><dt className="text-sub">资料截至</dt><dd className="m-0">资料时点未知</dd></div><div><dt className="text-sub">来源定位</dt><dd className="m-0">工作表第 {record.sourceRow} 行 · 快照记录 {record.id}</dd></div><div><dt className="text-sub">本站接收日期</dt><dd className="m-0"><time dateTime={manifest.receivedAt}>{manifest.receivedAt}</time></dd></div></dl><p className="mb-0 mt-4 break-all text-[13px] text-sub">来源文件 SHA-256：<span className="font-mono">{manifest.source.sha256}</span></p><p className="mb-0 mt-3 text-[13px]"><a href={sitePath('/quanguo/laiyuan/')}>查看已取得的官方逐名来源记录 →</a></p></section>
    <section id="original" tabIndex={-1} className="section">
      <SectionTitle title="原始来源字段（完整 11 列）" extra="保留原表列，联系方式已遮蔽" />
      <p className="mt-0 text-[14px] text-body">以下保留原表 11 列，包含无效或占位代码；含联系方式的地址及其他自由文本已遮蔽。补充省市区县为原始来源值，未用于地区归属；坐标为原始来源值，未用于地区归属，也未核实定位准确性。资料时点未知，原表床位数不等于当前空床。</p>
      <dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2">{REFERENCE_SOURCE_FIELD_NAMES.map(field => {
        const value = record.sourceFields[field];
        const supplemental = ['省份', '城市', '区县', '经度', '纬度'].includes(field);
        return <div key={field} className={field === '地址' ? 'sm:col-span-2' : undefined}>
          <dt className="text-sub">{field}（原始来源值{supplemental ? '，未用于地区归属' : ''}）</dt>
          <dd className="m-0 whitespace-pre-wrap break-words">{value === null ? '原表空值（null）' : value === '' ? '原表空字符串（\"\"）' : String(value)}</dd>
        </div>;
      })}</dl>
    </section>
    <section id="checklist" tabIndex={-1} className="section"><SectionTitle title="联系与探访前，建议核对" /><ul className="m-0 list-disc space-y-2 pl-5 text-body"><li>当前是否在营、能否提供所需照护服务，以及是否有合适床位。</li><li>实际服务场所、登记及签约主体是否一致，费用与退费如何书面约定。</li></ul><p className="mb-0 mt-3 text-[13px] text-sub">原表“省份、城市、区县、经纬度”存在互相冲突的行，本站仅按行政区划代码和“地区”列交叉核对后分组；补充地区和坐标原值在上方单独展示，未用于地区归属。来源行不能相加为独立机构数量。原表地址字段未经核实，不能用于导航。摘要地址可能因原表空白、含联系方式或以机构名称占位而不展示；原始来源字段保留 11 列，含联系方式的地址已遮蔽。</p></section>
      <PublicInstitutionBottomNav name={record.name} items={toc} />
    </div>
  </div>;
}

export function InstitutionReferenceDetailView() {
  const params = useSearchParams();
  const province = params.get('province') ?? '';
  const city = params.get('city') ?? '';
  const id = params.get('id') ?? '';
  const lookupKey = province + ':' + city + ':' + id;
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const candidateKey = lookupKey + ':' + attempt;
  const [officialState, setOfficialState] = useState<CandidateState<ReferenceOfficialMatch>>({ status: 'loading', key: '' });
  const [registryState, setRegistryState] = useState<CandidateState<InstitutionRegistryTarget>>({ status: 'loading', key: '' });
  const [officialAttempt, setOfficialAttempt] = useState(0);
  const [registryAttempt, setRegistryAttempt] = useState(0);
  useEffect(() => {
    if (!/^[a-z0-9-]{1,80}$/.test(id) || !/^[a-z0-9-]{1,80}$/.test(province) || !/^[a-z0-9-]{1,80}$/.test(city)) {
      setState({ status: 'invalid' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadReferenceManifest(controller.signal).then(async manifest => {
      const location = findReferenceCity(manifest, province, city);
      if (!location) {
        if (!controller.signal.aborted) setState({ status: 'invalid' });
        return;
      }
      const index = await loadReferenceIndex(manifest, province, city, controller.signal);
      const indexed = findReferenceRecord(index.records, id);
      if (!indexed) {
        if (!controller.signal.aborted) setState({ status: 'notfound' });
        return;
      }
      const chunk = await loadReferenceChunk(manifest, index, indexed.chunk, controller.signal);
      const record = chunk.records.find(item => item.id === id);
      if (!record) throw new Error('线索详情与城市索引不一致。');
      if (!controller.signal.aborted) setState({ status: 'ready', manifest, index, record, provinceName: location.province.name, cityName: location.city.name, lookupKey });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '养老机构线索详情读取失败。' });
    });
    return () => controller.abort();
  }, [lookupKey, attempt]);
  useEffect(() => {
    if (state.status !== 'ready' || state.lookupKey !== lookupKey) return;
    const controller = new AbortController();
    setOfficialState({ status: 'loading', key: candidateKey });
    loadReferenceLinksManifest(state.manifest, controller.signal).then(manifest =>
      loadReferenceCityLinks(manifest, state.manifest, state.index, controller.signal),
    ).then(cityLinks => {
      if (!controller.signal.aborted) setOfficialState({ status: 'ready', key: candidateKey, items: cityLinks.links.find(item => item.referenceId === state.record.id)?.matches ?? [] });
    }).catch(error => {
      if (!controller.signal.aborted) setOfficialState({ status: 'error', key: candidateKey, message: error instanceof Error ? error.message : '官方来源候选读取失败。' });
    });
    return () => controller.abort();
  }, [state, lookupKey, candidateKey, officialAttempt]);
  useEffect(() => {
    if (state.status !== 'ready' || state.lookupKey !== lookupKey) return;
    if (state.record.codeStatus !== 'valid') {
      setRegistryState({ status: 'ready', key: candidateKey, items: [] });
      return;
    }
    const controller = new AbortController();
    setRegistryState({ status: 'loading', key: candidateKey });
    loadInstitutionRegistryLinksManifest(state.manifest, controller.signal).then(manifest =>
      loadInstitutionRegistryCityLinks(manifest, state.manifest, state.index, controller.signal),
    ).then(cityLinks => {
      if (!controller.signal.aborted) setRegistryState({ status: 'ready', key: candidateKey, items: cityLinks.links.filter(item => item.referenceId === state.record.id).map(item => item.target) });
    }).catch(error => {
      if (!controller.signal.aborted) setRegistryState({ status: 'error', key: candidateKey, message: error instanceof Error ? error.message : '登记主体候选读取失败。' });
    });
    return () => controller.abort();
  }, [state, lookupKey, candidateKey, registryAttempt]);
  if (state.status === 'loading' || (state.status === 'ready' && state.lookupKey !== lookupKey)) return <div className="notice" role="status">正在加载来源线索详情…</div>;
  if (state.status === 'invalid' || state.status === 'notfound') return <div className="card p-8"><h1 className="m-0 text-xl font-semibold">{state.status === 'invalid' ? '地区或记录 ID 无效' : '未找到来源线索'}</h1><p className="mt-2 text-body">请从线索目录重新选择记录。</p><a href={sitePath('/quanguo/cankao/')} className="btn-outline mt-3">返回线索目录</a></div>;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button><a href={sitePath('/quanguo/cankao/')} className="underlink ml-4">返回线索目录</a></div>;
  const official = officialState.key === candidateKey ? officialState : { status: 'loading' as const };
  const registry = registryState.key === candidateKey ? registryState : { status: 'loading' as const };
  return <InstitutionReferenceDetailContent manifest={state.manifest} record={state.record} provinceName={state.provinceName} cityName={state.cityName} from={params.get('from')} officialCandidates={official.status === 'ready' ? official.items : undefined} officialError={official.status === 'error' ? official.message : undefined} onOfficialRetry={() => setOfficialAttempt(value => value + 1)} registryCandidates={registry.status === 'ready' ? registry.items : undefined} registryError={registry.status === 'error' ? registry.message : undefined} onRegistryRetry={() => setRegistryAttempt(value => value + 1)} />;
}
