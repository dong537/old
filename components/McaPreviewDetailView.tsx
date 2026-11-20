import React, { Suspense } from 'react';
import { mcaOfficialDetailHref } from '@/lib/mca-preview-ui';
import type { McaPreviewDetailDto, McaPreviewFactDto } from '@/lib/mca-preview-dto';
import type { McaJsonValue, McaPreviewField, McaPreviewSource } from '@/lib/mca-preview-types';
import { sitePath } from '@/lib/site-path';
import { McaPreviewReturnLink } from '@/components/McaPreviewReturnLink';

export interface McaPreviewDetailProps { dto: McaPreviewDetailDto }

const factGroups: { title: string; keys: readonly McaPreviewField[] }[] = [
  { title: '基本信息', keys: ['name', 'facilityTypeCode', 'facilityTypeLabel', 'areaCode', 'regionLabel', 'regionPath', 'address'] },
  { title: '床位与费用', keys: ['listedBeds', 'nursingBeds', 'listedMonthlyFeeMin', 'listedMonthlyFeeMax'] },
  { title: '平台标签与评价', keys: ['platformStarCode', 'evaluationCount', 'overallEvaluation', 'functionPositioningLabel', 'platformTagsRaw'] },
];

function sourceValue(source: McaPreviewSource, key: string): string {
  const value = source[key];
  if (value === null || value === undefined) return '未提供';
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value);
}

function FactGrid({ facts }: { facts: readonly McaPreviewFactDto[] }) {
  return <dl className="m-0 grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">{facts.map(fact => <div key={fact.key} className="min-w-0">
    <dt className="text-sub">{fact.label}</dt>
    <dd className={'m-0 break-words font-medium' + (fact.state === 'conflict' ? ' text-caution' : '')}>{fact.text}
      {fact.warning && <span className="block text-xs font-normal text-caution">{fact.warning}</span>}</dd>
    {fact.source && <p className="mb-0 mt-1 break-words text-xs text-sub">来源：{fact.source.channelLabel} · {fact.source.fetchedAtUtc ?? '采集时间未提供'} · <a href="#mca-preview-original" className="underlink">查看原始证据</a></p>}
  </div>)}</dl>;
}

function RawObservation({ title, source, sourceFields }: { title: string; source: McaPreviewSource; sourceFields: Record<string, McaJsonValue> }) {
  return <details className="card min-w-0 p-4"><summary className="cursor-pointer font-semibold">{title} · {sourceValue(source, 'fetchedAtUtc')}</summary>
    <dl className="mt-4 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-sub">采集时间 UTC</dt><dd className="m-0 break-all">{sourceValue(source, 'fetchedAtUtc')}</dd></div>
      <div className="min-w-0"><dt className="text-sub">来源镜像</dt><dd className="m-0 break-all">{sourceValue(source, 'mirror')}</dd></div>
      <div className="min-w-0"><dt className="text-sub">源文件 SHA-256</dt><dd className="m-0 break-all font-mono text-xs">{sourceValue(source, 'fileSha256')}</dd></div>
      <div className="min-w-0"><dt className="text-sub">响应 SHA-256</dt><dd className="m-0 break-all font-mono text-xs">{sourceValue(source, 'responseSha256')}</dd></div>
      <div className="min-w-0 sm:col-span-2"><dt className="text-sub">私有原件定位（不提供外链）</dt><dd className="m-0 break-all font-mono text-xs">{sourceValue(source, 'sourceRelativePath')}</dd></div>
      {source.rowNumber !== undefined && <div><dt className="text-sub">响应行号</dt><dd className="m-0">{sourceValue(source, 'rowNumber')}</dd></div>}
    </dl>
    <h4 className="mb-2 mt-5 font-semibold">原始字段（仅本机预览，未解释的键保持原样）</h4>
    <pre className="m-0 max-h-[520px] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-page p-4 text-xs leading-relaxed text-ink">{JSON.stringify(sourceFields, null, 2)}</pre>
  </details>;
}

export function McaPreviewDetailView({ dto }: McaPreviewDetailProps) {
  const { card, facts, snapshotId, conflictLabels, listObservations, detailObservations } = dto;
  const groupedKeys = new Set(factGroups.flatMap(group => group.keys));
  const otherFacts = facts.filter(fact => !groupedKeys.has(fact.key));
  return <div className="flex flex-col gap-5">
    <nav aria-label="面包屑" className="text-sm text-sub"><a href={sitePath('/quanguo/mca-preview/')} className="underlink">平台观察记录</a><span className="mx-2" aria-hidden="true">/</span>{card.displayName}</nav>
    <div className="rounded-xl border border-caution-line bg-caution-bg px-4 py-3 text-sm text-caution" role="note">
      <strong>仅供本机开发预览。</strong> 原始响应可能含联系信息和未解释字段，不得把本页或其 JSON 文件纳入正式公开构建。
    </div>
    <header className="section space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="tag">民政部平台采集观察</span>
      <span className="text-sm text-sub">{card.hasDetail ? '已存双端点详情' : '尚无双端点详情'}</span></div>
      <h1 className="m-0 break-words text-[28px] font-bold leading-tight sm:text-[32px]">{card.displayName}</h1>
      <p className="m-0 text-body">{card.displayRegion} · {card.displayAddress}</p>
      <dl className="m-0 grid gap-3 rounded-lg border border-line bg-page p-4 text-sm sm:grid-cols-3">
        <div className="min-w-0"><dt className="text-xs text-sub">设施类型原标签</dt><dd className="m-0 break-words font-semibold">{card.displayType}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-sub">平台列示床位</dt><dd className="m-0 font-semibold">{card.bedsText}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-sub">月费用</dt><dd className="m-0 break-words font-semibold">{card.feeText ?? '未提供'}{card.feeWarning && <span className="block text-xs font-normal text-caution">原值为 0，不代表免费。</span>}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><a href={mcaOfficialDetailHref(card.mcaId)} target="_blank" rel="noopener noreferrer">打开官网原页核对 ↗</a>
        <Suspense fallback={<a href={sitePath('/quanguo/mca-preview/')} className="underlink">← 返回观察记录</a>}><McaPreviewReturnLink /></Suspense></div>
      <details className="text-xs text-sub"><summary className="cursor-pointer">查看平台 ID 与快照标识</summary>
        <dl className="mb-0 mt-2 grid gap-2 sm:grid-cols-2"><div className="min-w-0"><dt>平台 ID</dt><dd className="m-0 break-all font-mono text-ink">{card.mcaId}</dd></div>
          <div className="min-w-0"><dt>快照</dt><dd className="m-0 break-all font-mono text-ink">{snapshotId}</dd></div></dl>
      </details>
    </header>
    {conflictLabels.length > 0 && <div className="notice" role="alert">以下字段在采集观察中有冲突，摘要不选边：{conflictLabels.join('、')}。请展开来源原件逐项核对。</div>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start"><div className="min-w-0 space-y-5">
      <section className="section" aria-labelledby="mca-preview-fields"><div><h2 id="mca-preview-fields" className="m-0 text-lg font-semibold">已识别的平台字段</h2>
        <p className="mb-0 mt-2 text-sm text-sub">按已有页面标签和观察值显示，不证明实时在营、可用床位、资格或费用承诺。0 与缺值分开。</p></div>
        <div className="mt-5 space-y-6">{factGroups.map(group => <section key={group.title} aria-label={group.title}>
          <h3 className="mb-3 mt-0 text-base font-semibold">{group.title}</h3>
          <FactGrid facts={facts.filter(fact => group.keys.includes(fact.key))} />
        </section>)}
          {otherFacts.length > 0 && <section aria-label="其他已识别字段"><h3 className="mb-3 mt-0 text-base font-semibold">其他已识别字段</h3><FactGrid facts={otherFacts} /></section>}
        </div>
      </section>
      <section className="section" aria-labelledby="mca-preview-original"><div><h2 id="mca-preview-original" className="m-0 text-lg font-semibold">原始响应与采集证据</h2>
        <p className="mb-0 mt-2 text-sm text-sub">原键仅作取证，不把未释义路径写成业务字段；以下内容仅在本机隔离开发环境查看。</p></div>
        <div className="space-y-3">{listObservations.map((observation, index) => <RawObservation key={'list-' + index} title={'列表观察 ' + (index + 1)} source={observation.source} sourceFields={observation.sourceFields} />)}
          {detailObservations.map((observation, index) => <div key={'detail-' + index} className="space-y-3">
            <h3 className="m-0 text-base font-semibold">双详情观察 {index + 1}</h3>
            <RawObservation title="基本详情原字段" source={observation.endpoints.orgBaseDetail.source} sourceFields={observation.endpoints.orgBaseDetail.sourceFields} />
            <RawObservation title="养老详情原字段" source={observation.endpoints.yangLaoOrgDetail.source} sourceFields={observation.endpoints.yangLaoOrgDetail.sourceFields} />
          </div>)}
          {listObservations.length === 0 && detailObservations.length === 0 && <p className="m-0 text-sm text-caution">此平台 ID 暂无可读取原件；请核对快照生成结果。</p>}
        </div>
      </section>
    </div><aside className="section lg:sticky lg:top-4" aria-label="核对提示"><h2 className="m-0 text-base font-semibold">如何理解这条记录</h2>
      <p className="m-0 text-sm text-body">当前仅证明采集快照里出现过这个平台 ID。机构现况、空床、可约时间及各字段有效期仍需向来源核实。</p>
      <dl className="m-0 space-y-3 text-sm"><div><dt className="text-sub">列表观察</dt><dd className="m-0">{listObservations.length} 次</dd></div>
        <div><dt className="text-sub">双详情观察</dt><dd className="m-0">{detailObservations.length} 次</dd></div>
        <div><dt className="text-sub">字段冲突</dt><dd className="m-0">{conflictLabels.length} 项</dd></div></dl>
      <a href={mcaOfficialDetailHref(card.mcaId)} target="_blank" rel="noopener noreferrer" className="btn-outline">打开官网原页</a>
    </aside></div>
  </div>;
}
