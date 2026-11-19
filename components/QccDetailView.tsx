'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SectionTitle } from '@/components/DirectoryUi';
import { ProfileToc, type ProfileTocItem } from '@/components/ProfileToc';
import { findQccRecord, isQccStatusCaution, loadQccChunk, loadQccIndex, loadQccLinks, safeQccReturnPath, verifiedSourceForSubject } from '@/lib/qcc-search';
import { QCC_SOURCE_FIELD_NAMES } from '@/lib/qcc-types';
import type { QccDetailRecord, QccIndex } from '@/lib/qcc-types';
import { sitePath } from '@/lib/site-path';

type DetailState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'notfound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: QccIndex; record: QccDetailRecord; verifiedSource: string | null; sourceError: string | null };

function shown(value: string | number | null): string {
  return value === null || value === '' ? '导出未提供' : String(value);
}

function codeValidityLabel(value: string | null): string {
  const labels: Record<string, string> = {
    valid: '格式与校验位通过', missing: '导出未提供', invalid: '未通过校验',
    invalid_format: '格式不符', invalid_checksum: '校验位不符',
  };
  return value === null ? '导出未提供' : labels[value] ?? value;
}

function DetailFields({ fields }: { fields: { label: string; value: string | number | null; wide?: boolean; missingLabel?: string }[] }) {
  return <dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2">{fields.map(field => <div key={field.label} className={field.wide ? 'sm:col-span-2' : ''}><dt className="text-sub">{field.label}</dt><dd className="m-0 whitespace-pre-wrap break-words">{field.value === null && field.missingLabel ? field.missingLabel : shown(field.value)}</dd></div>)}</dl>;
}

function subjectReturnPath(from: string | null): string {
  const safe = safeQccReturnPath(from);
  return safe === '/guangdong/zhuti/' && from !== safe ? '/quanguo/zhuti/' : safe;
}

export function QccDetailContent({ index, record, from, verifiedSource, sourceError = null }: { index: QccIndex; record: QccDetailRecord; from: string | null; verifiedSource: string | null; sourceError?: string | null }) {
  const listHref = subjectReturnPath(from);
  const sourceHref = verifiedSource && /^gd-src-\d{6}$/.test(verifiedSource) ? '/guangdong/jigou/' + verifiedSource + '/' : null;
  const caution = isQccStatusCaution(record.registrationStatus);
  const toc: ProfileTocItem[] = [
    { id: 'overview', label: '概况' }, { id: 'fields', label: '登记信息' },
    { id: 'industry', label: '行业与经营' }, { id: 'original', label: '原始字段' },
    { id: 'identifiers', label: '登记标识' }, { id: 'official', label: '官方来源核对' },
    { id: 'sources', label: '来源' }, { id: 'checklist', label: '核对建议' },
  ];
  const verification = <div className="card flex flex-col gap-3 p-5 text-[14px]">
    <h2 className="m-0 text-lg font-semibold">核对这条登记主体候选</h2>
    <p className="m-0 text-body">登记主体与养老服务场所的运营关系尚未确认。请先核对官方来源记录，再确认最新登记状态和实际服务。</p>
    <a href={sitePath('#official')} className="text-[13px]">查看官方来源核对 →</a>
    <a href={sitePath('#sources')} className="text-[13px]">核对原始来源 →</a>
  </div>;
  return <>
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="text-[13px] text-sub"><a href={sitePath('/quanguo/zhuti/')}>全国登记主体候选</a><span className="mx-2" aria-hidden="true">/</span><span>广东省 · {record.city}</span><span className="mx-2" aria-hidden="true">/</span>登记详情</nav>
    <ProfileToc items={toc} variant="bar" />
    <div className="flex items-start gap-6">
      <ProfileToc items={toc} variant="side" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section id="overview" tabIndex={-1} className="section flex flex-col gap-3">
          <div className="flex flex-col gap-2"><span className={'tag w-fit ' + (caution ? 'text-caution' : '')}>登记主体候选 · {shown(record.registrationStatus)}</span><h1 className="m-0 break-words text-[28px] font-bold leading-tight sm:text-[32px]">{record.name}</h1><p className="m-0 text-body">这条登记主体记录来自导出快照。登记主体不等于养老机构，登记状态也不证明目前提供养老服务。</p></div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-sub"><span>原始文件第 {record.rowNumber} 行 · 档案编号 {record.id}</span><div className="flex flex-wrap gap-3"><a href={sitePath(listHref)} className="underlink text-sm">← 返回登记主体目录{listHref !== '/guangdong/zhuti/' && listHref !== '/quanguo/zhuti/' ? '（保留筛选）' : ''}</a>{sourceHref && <a href={sitePath(sourceHref)} className="underlink text-sm">← 返回官方来源记录</a>}</div></div>
          {caution && <div className="notice text-caution" role="status">导出记录的登记状态为“{record.registrationStatus}”。请核对最新登记信息，勿据此判断当前服务。</div>}
        </section>
        <div className="lg:hidden">{verification}</div>
    <section id="fields" tabIndex={-1} className="section"><SectionTitle title="登记信息" extra="缺失值按导出原样说明" /><DetailFields fields={[
      { label: '统一社会信用代码', value: record.creditCode },
      { label: '代码校验状态', value: codeValidityLabel(record.codeValidity) },
      { label: '主体类型', value: record.subjectType },
      { label: '登记状态', value: record.registrationStatus },
      { label: '城市', value: record.city },
      { label: '区县', value: record.district },
      { label: '法定代表人 / 负责人', value: record.legalRepresentative },
      { label: '成立日期', value: record.establishedAt },
      { label: '注册资本', value: record.registeredCapital },
      { label: '营业期限', value: record.businessTerm },
      { label: '登记地址', value: record.address, wide: true, missingLabel: '公开版未提供' },
      { label: '通信地址', value: record.mailingAddress, wide: true },
    ]} /></section>
    <section id="industry" tabIndex={-1} className="section"><SectionTitle title="行业与经营" /><DetailFields fields={[
      { label: '国标行业', value: record.nationalIndustry },
      { label: '企业规模（导出原值，不代表护理人员数）', value: record.companySize },
      { label: '参保人数', value: record.insuredPersons },
      { label: '参保年份', value: record.insuredYear },
      { label: '经营范围', value: record.businessScope, wide: true },
    ]} /></section>
    <section id="original" tabIndex={-1} className="section"><SectionTitle title="企查查导出字段（37 列）" extra="联系方式及含联系信息的字段已遮蔽；其余为导出快照，不代表当前状态" /><dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2">{QCC_SOURCE_FIELD_NAMES.map(label => {
      const value = record.sourceFields[label];
      return <div key={label}><dt className="text-sub">{label}</dt><dd className="m-0 whitespace-pre-wrap break-all">{value === null ? '原表空值（null）' : value === '' ? '原表空字符串' : String(value)}</dd></div>;
    })}</dl></section>
    <section id="identifiers" tabIndex={-1} className="section"><SectionTitle title="其他登记标识" /><DetailFields fields={[
      { label: '组织机构代码', value: record.organizationCode },
      { label: '注册号', value: record.registrationNo },
      { label: '纳税人识别号', value: record.taxId },
      { label: '曾用名', value: record.formerName },
      { label: '英文名', value: record.englishName },
    ]} /></section>
    <section id="official" tabIndex={-1} className="section"><SectionTitle title="官方机构来源核对" /><p className="m-0 text-[14px] text-body">登记主体候选与官方机构来源的运营关系尚未核实；名称或代码相似也不能直接认定为同一机构。</p>{sourceError ? <div className="notice mt-3" role="alert">{sourceError}</div> : sourceHref ? <p className="mb-0 mt-3 text-[14px]"><a href={sitePath(sourceHref)}>查看官方来源候选记录 →</a></p> : <p className="mb-0 mt-3 text-[14px] text-sub">当前没有可展示的官方来源候选关联；这不证明该主体未备案或未经营养老服务。</p>}<p className="mb-0 mt-3 text-[14px]"><a href={sitePath('/quanguo/laiyuan/')}>查看全国官方来源记录 →</a></p></section>
    <section id="sources" tabIndex={-1} className="section"><SectionTitle title="来源与时间" /><p className="m-0 text-[14px] text-body">来源：企查查高级搜索导出快照；导出时间 <time dateTime={index.exportedAt}>{index.exportedAt}</time>；原始文件唯一工作表第 {record.rowNumber} 行。公开主体 ID 为 <span className="break-all font-mono">{record.id}</span>，只用于定位本次快照。</p><p className="m-0 break-all text-[13px] text-sub">原始文件 SHA-256：{index.sourceSha256}</p><p className="m-0 text-[13px] text-sub">登记地址空值可能为原件缺失或公开投影脱敏。快照字段可能缺失或变化，代码校验只校验号码格式与校验位，不代表已核实登记真实性、运营关系或当前在营。</p></section>
    <section id="checklist" tabIndex={-1} className="section"><SectionTitle title="联系与探访前，建议核对" /><ul className="m-0 list-disc space-y-2 pl-5 text-body"><li>核对最新登记状态，以及该主体与具体养老服务场所的关系。</li><li>向当地民政部门或场所确认备案、在营、服务、收费和床位情况。</li></ul></section>
      </div>
      <aside className="sticky top-4 hidden w-[320px] shrink-0 flex-col gap-4 lg:flex">{verification}</aside>
    </div>
  </>;
}

export function QccDetailView() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const source = params.get('source');
  const returnPath = subjectReturnPath(params.get('from'));
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      setState({ status: 'invalid' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadQccIndex(controller.signal).then(async index => {
      const located = findQccRecord(index.records, id);
      if (!located) {
        setState({ status: 'notfound' });
        return;
      }
      const chunk = await loadQccChunk(located.chunk, index.snapshotId, controller.signal);
      const record = chunk.records.find(item => item.id === id);
      if (!record || record.rowNumber !== located.rowNumber || record.name !== located.name) throw new Error('登记主体详情与索引不一致。');
      let verifiedSource: string | null = null;
      let sourceError: string | null = null;
      if (source && /^gd-src-\d{6}$/.test(source)) {
        try {
          const links = await loadQccLinks(controller.signal);
          verifiedSource = verifiedSourceForSubject(links, index.snapshotId, source, id);
        } catch {
          if (controller.signal.aborted) return;
          sourceError = '来源候选关联暂时无法核验，返回来源链接未显示。';
        }
      }
      if (!controller.signal.aborted) setState({ status: 'ready', index, record, verifiedSource, sourceError });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '登记主体候选详情读取失败。' });
    });
    return () => controller.abort();
  }, [id, source, attempt]);
  if (state.status === 'loading') return <div className="notice" role="status">正在加载登记主体候选详情…</div>;
  if (state.status === 'invalid' || state.status === 'notfound') return <div className="card p-8"><h1 className="m-0 text-xl font-semibold">{state.status === 'invalid' ? '登记主体候选 ID 无效' : '未找到登记主体候选'}</h1><p className="mt-2 text-body">请从主体目录重新选择记录。</p><a href={sitePath(returnPath)} className="btn-outline mt-3">返回登记主体目录</a></div>;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button><a href={sitePath(returnPath)} className="underlink ml-4">返回主体目录</a></div>;
  return <QccDetailContent index={state.index} record={state.record} from={params.get('from')} verifiedSource={state.verifiedSource} sourceError={state.sourceError} />;
}

