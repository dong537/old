'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SectionTitle } from '@/components/DirectoryUi';
import { ProfileToc, type ProfileTocItem } from '@/components/ProfileToc';
import { findNationalCity, findNationalRecord, loadNationalChunk, loadNationalCityIndex, loadNationalManifest, safeNationalReturnPath } from '@/lib/qcc-national-search';
import { isQccStatusCaution } from '@/lib/qcc-search';
import { QCC_SOURCE_FIELD_NAMES } from '@/lib/qcc-types';
import type { QccNationalDetailRecord, QccNationalManifest } from '@/lib/qcc-national-types';
import { sitePath } from '@/lib/site-path';

type DetailState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'notfound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: QccNationalManifest; record: QccNationalDetailRecord; lookupKey: string };

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

export function QccNationalDetailContent({ manifest, record, from }: { manifest: QccNationalManifest; record: QccNationalDetailRecord; from: string | null }) {
  const source = manifest.sourceFiles.find(file => file.id === record.sourceId);
  const listHref = safeNationalReturnPath(from);
  if (!source) return <div className="notice" role="alert">详情来源文件与快照清单不一致。<a href={sitePath(listHref)} className="underlink ml-2">返回候选目录</a></div>;
  const caution = isQccStatusCaution(record.registrationStatus);
  const toc: ProfileTocItem[] = [
    { id: 'overview', label: '概况' }, { id: 'fields', label: '登记信息' },
    { id: 'industry', label: '行业与经营' }, { id: 'identifiers', label: '登记标识' },
    { id: 'official', label: '官方来源核对' }, { id: 'sources', label: '来源' },
    { id: 'original', label: '原始字段' }, { id: 'checklist', label: '核对建议' },
  ];
  const verification = <div className="rounded-lg border border-brand-line bg-brand-tint p-5 text-[14px]">
    <h2 className="m-0 text-base font-semibold">核对这条登记主体候选</h2>
    <p className="mb-0 mt-3 text-body">工商登记快照不能证明该主体正在经营养老机构。请核对最新登记状态、官方机构记录及实际服务场所。</p>
    <div className="mt-4 flex flex-col gap-2 border-t border-brand-line pt-3 font-semibold">
      <a href={sitePath('#official')}>查看官方来源核对 →</a>
      <a href={sitePath('#sources')}>核对原始来源 →</a>
    </div>
  </div>;
  return <>
    <nav id="top" tabIndex={-1} aria-label="面包屑" className="flex flex-wrap items-center gap-x-2 text-[13px] text-sub"><a href={sitePath('/quanguo/zhuti/')}>全国登记主体候选</a><span aria-hidden="true">/</span><span>{record.province} · {record.city}</span><span aria-hidden="true">/</span><span>登记详情</span></nav>
    <ProfileToc items={toc} variant="bar" />
    <div className="flex items-start gap-6">
      <ProfileToc items={toc} variant="side" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section id="overview" tabIndex={-1} className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="border-b border-hair px-5 py-6 sm:px-8 sm:py-7">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] font-semibold"><span className="tag">登记主体候选</span><span className="break-words text-sub">企查查导出 · {source.filename} · <time dateTime={manifest.exportedAt}>{manifest.exportedAt}</time></span></div>
            <h1 className="m-0 break-words text-[27px] font-bold leading-tight sm:text-[33px]">{record.name}</h1>
            <p className="mb-0 mt-3 max-w-[680px] text-[14px] leading-6 text-body">登记主体不等于备案养老机构，也不证明当前提供养老服务或与官方来源存在运营关系。</p>
          </div>
          <dl className="m-0 grid gap-px bg-hair sm:grid-cols-2">
            <div className="bg-white px-5 py-4 sm:px-8"><dt className="text-xs text-sub">登记状态</dt><dd className={'m-0 mt-1 break-words font-semibold ' + (caution ? 'text-caution' : '')}>{shown(record.registrationStatus)}</dd></div>
            <div className="bg-white px-5 py-4 sm:px-8"><dt className="text-xs text-sub">主体类型</dt><dd className="m-0 mt-1 break-words font-semibold">{shown(record.subjectType)}</dd></div>
            <div className="bg-white px-5 py-4 sm:px-8"><dt className="text-xs text-sub">统一社会信用代码</dt><dd className="m-0 mt-1 break-all font-mono font-semibold">{shown(record.creditCode)}</dd></div>
            <div className="bg-white px-5 py-4 sm:px-8"><dt className="text-xs text-sub">所在地区</dt><dd className="m-0 mt-1 break-words font-semibold">{record.province} · {record.city}</dd></div>
          </dl>
          {caution && <div className="border-t border-caution-line bg-caution-bg px-5 py-3 text-[13px] text-caution sm:px-8" role="status">导出记录的登记状态为“{record.registrationStatus}”。请核对最新登记信息，勿据此判断当前服务。</div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hair bg-page px-5 py-3 text-[13px] text-sub sm:px-8"><span>原始文件第 {record.rowNumber} 行 · 档案编号 {record.id}</span><a href={sitePath(listHref)} className="underlink font-semibold">← 返回候选目录{listHref !== '/quanguo/zhuti/' ? '（保留筛选）' : ''}</a></div>
        </section>
        <div className="lg:hidden">{verification}</div>
    <section id="fields" tabIndex={-1} className="section"><SectionTitle title="登记信息" extra="空值可能来自原件缺失或公开遮蔽" /><DetailFields fields={[
      { label: '统一社会信用代码', value: record.creditCode },
      { label: '代码校验状态', value: codeValidityLabel(record.codeValidity) },
      { label: '主体类型', value: record.subjectType },
      { label: '登记状态', value: record.registrationStatus },
      { label: '省级地区', value: record.province },
      { label: '城市', value: record.city },
      { label: '区县', value: record.district },
      { label: '法定代表人 / 负责人', value: record.legalRepresentative },
      { label: '成立日期', value: record.establishedAt },
      { label: '注册资本', value: record.registeredCapital },
      { label: '营业期限', value: record.businessTerm },
      { label: '登记地址', value: record.address, wide: true, missingLabel: '公开版未提供' },
      { label: '通信地址', value: record.mailingAddress, wide: true, missingLabel: '公开版未提供' },
    ]} /></section>
    <section id="industry" tabIndex={-1} className="section"><SectionTitle title="行业与经营" /><DetailFields fields={[
      { label: '国标行业', value: record.nationalIndustry },
      { label: '企业规模（导出原值，不代表护理人员数）', value: record.companySize },
      { label: '参保人数', value: record.insuredPersons },
      { label: '参保年份', value: record.insuredYear },
      { label: '经营范围', value: record.businessScope, wide: true, missingLabel: '公开版未提供' },
    ]} /></section>
    <section id="identifiers" tabIndex={-1} className="section"><SectionTitle title="其他登记标识" /><DetailFields fields={[
      { label: '组织机构代码', value: record.organizationCode },
      { label: '注册号', value: record.registrationNo },
      { label: '纳税人识别号', value: record.taxId },
      { label: '曾用名', value: record.formerName },
      { label: '英文名', value: record.englishName },
    ]} /></section>
    <section id="official" tabIndex={-1} className="section"><SectionTitle title="官方机构来源核对" /><p className="m-0 text-[14px] text-body">本站收录广东及部分其他省市的官方养老服务来源行；当前这条登记主体与官方来源尚未自动关联。未出现关联不代表该主体未备案或不是养老机构，请向当地民政部门核对。</p><p className="mb-0 mt-3 text-[14px]"><a href={sitePath('/quanguo/laiyuan/')} className="mr-5">查看全国官方来源记录 →</a><a href="https://app.gjzwfw.gov.cn/jmopen/webapp/html5/qgyljgxxcx/index.html" target="_blank" rel="noopener noreferrer">前往民政部全国养老机构信息查询 ↗</a></p><p className="mb-0 mt-2 text-[13px] text-sub">请按地区、名称自行核对；查询结果不自动关联本条登记主体。</p></section>
    <section id="sources" tabIndex={-1} className="section"><SectionTitle title="来源与时间" /><p className="m-0 text-[14px] text-body">来源：企查查高级搜索导出快照；源文件“{source.filename}”，原始文件第 {record.rowNumber} 行；导出时间 <time dateTime={manifest.exportedAt}>{manifest.exportedAt}</time>。来源文件包含 {source.rowCount.toLocaleString('zh-CN')} 行候选记录。</p><p className="mb-0 mt-2 break-all text-[13px] text-sub">来源文件 SHA-256：<span className="font-mono">{source.sha256}</span></p><p className="mb-0 mt-2 text-[13px] text-sub">来源 ID：<span className="font-mono">{record.sourceId}</span>；公开主体 ID：<span className="font-mono">{record.id}</span>。两者仅用于定位本次快照。</p><p className="mb-0 mt-2 text-[13px] text-sub">登记地址空值可能为原件缺失或公开投影脱敏。代码校验仅检查号码格式与校验位，不代表已核实登记真实性、运营关系或当前在营。</p></section>
    <section id="original" tabIndex={-1} className="section"><SectionTitle title="企查查导出字段（37 列）" extra="联系方式及含联系信息的字段已遮蔽；其余为导出快照，不代表当前状态" /><dl className="m-0 grid gap-4 text-[14px] sm:grid-cols-2">{QCC_SOURCE_FIELD_NAMES.map(label => {
      const value = record.sourceFields[label];
      return <div key={label}><dt className="text-sub">{label}</dt><dd className="m-0 whitespace-pre-wrap break-all">{value === null ? '原表空值（null）' : value === '' ? '原表空字符串' : String(value)}</dd></div>;
    })}</dl></section>
    <section id="checklist" tabIndex={-1} className="section"><SectionTitle title="联系与探访前，建议核对" /><ul className="m-0 list-disc space-y-2 pl-5 text-body"><li>先核对该主体当前登记状态及其与具体养老服务场所的关系。</li><li>再向当地民政部门或场所确认机构备案、在营、服务、收费和床位情况。</li></ul></section>
      </div>
      <aside className="sticky top-4 hidden w-[320px] shrink-0 flex-col gap-4 lg:flex">{verification}</aside>
    </div>
  </>;
}

export function QccNationalDetailView() {
  const params = useSearchParams();
  const provinceSlug = params.get('province') ?? '';
  const citySlug = params.get('city') ?? '';
  const id = params.get('id') ?? '';
  const lookupKey = provinceSlug + ':' + citySlug + ':' + id;
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !/^[a-z0-9-]{1,80}$/.test(provinceSlug) || !/^[a-z0-9-]{1,80}$/.test(citySlug)) {
      setState({ status: 'invalid' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadNationalManifest(controller.signal).then(async manifest => {
      if (!findNationalCity(manifest, provinceSlug, citySlug)) {
        if (!controller.signal.aborted) setState({ status: 'invalid' });
        return;
      }
      const index = await loadNationalCityIndex(manifest, provinceSlug, citySlug, controller.signal);
      const located = findNationalRecord(index.records, id);
      if (!located) {
        if (!controller.signal.aborted) setState({ status: 'notfound' });
        return;
      }
      const chunk = await loadNationalChunk(manifest, index, located.chunk, controller.signal);
      const record = chunk.records.find(item => item.id === id);
      if (!record || record.rowNumber !== located.rowNumber || record.sourceId !== located.sourceId ||
        record.name !== located.name || record.province !== located.province || record.city !== located.city) {
        throw new Error('登记主体候选详情与城市索引不一致。');
      }
      if (!controller.signal.aborted) setState({ status: 'ready', manifest, record, lookupKey });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '登记主体候选详情读取失败。' });
    });
    return () => controller.abort();
  }, [lookupKey, attempt]);
  if (state.status === 'loading' || (state.status === 'ready' && state.lookupKey !== lookupKey)) return <div className="notice" role="status">正在加载登记主体候选详情…</div>;
  if (state.status === 'invalid' || state.status === 'notfound') return <div className="card p-8"><h1 className="m-0 text-xl font-semibold">{state.status === 'invalid' ? '地区或主体 ID 无效' : '未找到登记主体候选'}</h1><p className="mt-2 text-body">请从候选目录重新选择记录。</p><a href={sitePath('/quanguo/zhuti/')} className="btn-outline mt-3">返回候选目录</a></div>;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button><a href={sitePath('/quanguo/zhuti/')} className="underlink ml-4">返回候选目录</a></div>;
  return <QccNationalDetailContent manifest={state.manifest} record={state.record} from={params.get('from')} />;
}
