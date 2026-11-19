import { sitePath } from '@/lib/site-path';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { SectionTitle } from '@/components/DirectoryUi';
import { ReturnToServices } from '@/components/ReturnToServices';
import { serviceCatalog } from '@/lib/services';
import { RECORD_TYPE_LABELS } from '@/lib/service-search';

export const dynamicParams = false;
export function generateStaticParams() { return serviceCatalog.records.map(({ id }) => ({ id })); }
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = serviceCatalog.records.find(record => record.id === id);
  return { title: item ? `${item.name} · ${RECORD_TYPE_LABELS[item.recordType]}` : '未找到公开记录' };
}

export default async function ServiceRecordPage({ params }: Props) {
  const { id } = await params;
  const record = serviceCatalog.records.find(item => item.id === id);
  if (!record) notFound();
  const source = serviceCatalog.sources.find(item => item.id === record.sourceId);
  if (!source) throw new Error(`服务记录缺少来源：${record.id}`);
  const fields: { label: string; value: string | number | null; provenance?: string }[] = [
    { label: '服务地址', value: record.address },
    { label: '所属区', value: record.district, provenance: record.districtBasis === 'address-text' ? '根据服务地址文字整理；原表未单列所属区' : undefined },
    { label: '机构类别', value: record.providerType },
    { label: '考核等次', value: record.assessmentGrade },
    { label: '服务类别', value: record.serviceCategory },
    { label: '服务项目', value: record.serviceItems },
  ];
  const value = (v: string | number | null) => v === null || v === '' ? '原表未提供' : String(v);
  return <>
    <nav aria-label="面包屑" className="text-[13px] text-sub"><a href={sitePath("/guangzhou/shangmen/")} className="text-sub">养老服务公开记录</a> / {RECORD_TYPE_LABELS[record.recordType]} / {record.name}</nav>
    <section className="section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2"><span className="tag w-fit">{RECORD_TYPE_LABELS[record.recordType]}</span><h1 className="m-0 break-words text-[26px] font-bold leading-tight">{record.name}</h1><p className="m-0 break-words text-body">{record.address ?? '原表未提供地址'}</p></div>
        <span className="chip bg-brand-tint text-brand-ink">记录资料，不是当前状态证明</span>
      </div>
      <div className="notice">{source.limitations}</div>
      <dl className="grid grid-cols-2 gap-4 rounded-lg bg-page p-4 sm:grid-cols-4">
        <div><dt className="text-xs text-sub">发布单位</dt><dd className="m-0 font-semibold">{source.publisher}</dd></div>
        <div><dt className="text-xs text-sub">资料发布日期</dt><dd className="m-0 font-semibold"><time dateTime={source.publishedAt}>{source.publishedAt}</time></dd></div>
        <div><dt className="text-xs text-sub">资料期间</dt><dd className="m-0 font-semibold">{source.period}</dd></div>
        <div><dt className="text-xs text-sub">原始行号</dt><dd className="m-0 font-semibold">第 {record.sourceRow} 条</dd></div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-3">
        <span className="break-all text-xs text-sub">记录编号 {record.id}</span>
        <Suspense fallback={<a href={sitePath("/guangzhou/shangmen/")} className="underlink text-sm">← 返回服务记录</a>}><ReturnToServices /></Suspense>
      </div>
    </section>
    <section className="section" aria-label="来源记录字段">
      <SectionTitle title="公开记录字段" extra="保留来源表原始口径；未提供字段不推断" />
      <div className="table-wrap" role="region" aria-label="公开记录字段表，可横向滚动" tabIndex={0}><table className="min-w-[560px]">
        <thead><tr><th scope="col" className="w-[150px]">项目</th><th scope="col">内容</th><th scope="col" className="w-[210px]">来源行</th></tr></thead>
        <tbody>{fields.map(({ label, value: fieldValue, provenance }) => <tr key={label}><th scope="row" className="border-t border-hair bg-white font-semibold text-ink">{label}</th><td>{value(fieldValue)}</td><td className="text-body"><a href={sitePath(source.url)} target="_blank" rel="noreferrer">{source.title} · 第 {record.sourceRow} 条</a>{provenance && <div className="mt-1 text-xs text-sub">{provenance}</div>}</td></tr>)}</tbody>
      </table></div>
    </section>
    <section className="section">
      <SectionTitle title="来源与使用范围" />
      <dl className="detail-grid"><div><dt className="detail-label">来源名称</dt><dd className="detail-value"><a href={sitePath(source.url)} target="_blank" rel="noreferrer">{source.title}</a></dd></div><div><dt className="detail-label">官方发布</dt><dd className="detail-value">{source.publisher}</dd></div><div><dt className="detail-label">来源发布日期</dt><dd className="detail-value">{source.publishedAt}</dd></div><div><dt className="detail-label">资料期间</dt><dd className="detail-value">{source.period}</dd></div></dl>
      <p className="m-0 text-[13px] text-sub">本页记录用于核对公开来源，不能代替医保经办机构对参保资格、当前定点状态、服务能力和待遇结算范围的确认。</p>
      <a href={sitePath("/guangzhou/changhuxian/")}>查看长护险申请指南 →</a>
    </section>
  </>;
}
