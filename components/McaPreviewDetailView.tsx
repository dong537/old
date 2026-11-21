import React, { Suspense } from 'react';
import { mcaOfficialDetailHref } from '@/lib/mca-preview-ui';
import type { McaPreviewDetailDto, McaPreviewFactDto, McaPreviewResolved, McaPreviewSubServiceDto } from '@/lib/mca-preview-dto';
import type { McaJsonValue, McaPreviewField, McaPreviewSource } from '@/lib/mca-preview-types';
import { sitePath } from '@/lib/site-path';
import { McaPreviewReturnLink } from '@/components/McaPreviewReturnLink';
import { McaPreviewEvidenceLink } from '@/components/McaPreviewEvidenceLink';
import { InstitutionServiceIcon, type InstitutionServiceIconKind } from '@/components/InstitutionServiceIcon';

function hasSubServiceDto(data: McaPreviewSubServiceDto): boolean {
  return data.beds.state !== 'missing' || data.nursingBeds.state !== 'missing' ||
    data.fee.state !== 'missing' || data.project.state !== 'missing' || data.charges.state !== 'missing';
}

function SubServiceBlock({ title, data }: { title: string; data: McaPreviewSubServiceDto }) {
  if (!hasSubServiceDto(data)) return null;
  return <div className="border-b border-hair py-5 last:border-0">
    <h3 className="m-0 text-[15px] font-medium">{title}</h3>
    <dl className="m-0 mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
      {data.beds.state !== 'missing' && <div className="flex gap-1"><dt>床位数：</dt><dd className="m-0 font-medium tabular-nums">{valueText(data.beds, value => value.toLocaleString('zh-CN') + ' 个')}</dd></div>}
      {data.nursingBeds.state !== 'missing' && <div className="flex gap-1"><dt>护理型床位：</dt><dd className="m-0 font-medium tabular-nums">{valueText(data.nursingBeds, value => value.toLocaleString('zh-CN') + ' 个')}</dd></div>}
      {data.fee.state !== 'missing' && <div className="flex gap-1"><dt>费用（{data.unit}）：</dt><dd className="m-0 font-semibold tabular-nums">{feeText(data.fee)}</dd></div>}
    </dl>
    {data.project.state !== 'missing' && <p className="mb-0 mt-2 text-sm">服务项目：{valueText(data.project, String)}</p>}
    {data.charges.state === 'observed' && data.charges.value !== null && data.charges.value.length > 0 && <div className="mt-3 overflow-x-auto"><table className="border border-hair text-[14px]"><thead><tr><th className="border border-hair bg-brand-tint text-center">项目名称</th><th className="border border-hair bg-brand-tint text-center">项目说明</th><th className="border border-hair bg-brand-tint text-center">收费标准</th></tr></thead><tbody>{data.charges.value.map((item, index) => <tr key={item.id ?? index} className="even:bg-page"><td className="break-words border border-hair text-center">{item.name ?? '未提供'}</td><td className="break-words border border-hair text-center">{item.description ?? '未提供'}</td><td className="break-words border border-hair text-center">{item.standard ?? '未提供'}</td></tr>)}</tbody></table></div>}
  </div>;
}

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
    {fact.source && <p className="mb-0 mt-1 break-words text-xs text-sub">来源：{fact.source.channelLabel} · {fact.source.fetchedAtUtc ?? '采集时间未提供'} · <McaPreviewEvidenceLink /></p>}
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

function valueText<T>(field: McaPreviewResolved<T>, format: (value: T) => string): string {
  if (field.state === 'conflict') return '非空观察值冲突，请核对原始证据';
  return field.value === null ? '未提供' : format(field.value);
}

function DetailRow({ label, field, unit = '', icon }: { label: string; field: McaPreviewResolved<string | number>; unit?: string; icon?: InstitutionServiceIconKind }) {
  return <div className="grid min-w-0 gap-2 border-b border-hair py-4 text-[15px] last:border-b-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-7">
    <dt className="flex items-start gap-2 font-medium text-ink">{icon && <InstitutionServiceIcon kind={icon} />}{label}</dt><dd className={'m-0 min-w-0 whitespace-pre-wrap break-words leading-7 ' + (field.state === 'conflict' ? 'text-caution' : 'text-ink')}>{valueText(field, value => typeof value === 'number' ? value.toLocaleString('zh-CN') + unit : value)}</dd>
  </div>;
}

function feeText(range: McaPreviewResolved<[number, number]>): string {
  return valueText(range, ([min, max]) => '¥' + min.toLocaleString('zh-CN') + '–' + max.toLocaleString('zh-CN') + ' 元/月');
}

function sourceContactText(field: McaPreviewResolved<string>): string {
  if (field.state === 'conflict') return '多次观察值不同，待核对原始证据';
  return field.value === null ? '本来源未提供' : field.value;
}

function PhotoStrip({ count }: { count: McaPreviewResolved<number> }) {
  const message = count.state === 'conflict' ? '图片记录观察值冲突，暂不展示'
    : count.value === null ? '本来源未提供可公开的机构照片'
      : count.value === 0 ? '原平台记录 0 张图片' : null;
  if (message) return <div aria-label="机构照片" role="group" className="mt-5 flex min-h-28 max-w-[860px] items-center justify-center border border-dashed border-[#D9B98D] bg-white/65 px-4 py-5 text-center text-sm text-sub sm:min-h-36">{message}</div>;
  return <div aria-label="机构照片" role="group" className="mt-5 max-w-[860px]">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {Array.from({ length: Math.min(count.value ?? 0, 3) }, (_, index) => <div key={index} aria-label={'图片记录 ' + (index + 1)} className="flex aspect-[16/9] items-center justify-center rounded-sm border border-dashed border-[#D9B98D] bg-white/65 px-3 text-center text-sm text-sub">原平台图片 {index + 1} · 暂未展示</div>)}
    </div>
    <p className="mb-0 mt-2 text-xs text-sub">平台含 {count.value} 项图片记录；图片地址及公开展示许可尚未核验。</p>
  </div>;
}

export function McaPreviewDetailView({ dto }: McaPreviewDetailProps) {
  const { card, facts, snapshotId, conflictLabels, listObservations, detailObservations, platformDetail } = dto;
  const groupedKeys = new Set(factGroups.flatMap(group => group.keys));
  const otherFacts = facts.filter(fact => !groupedKeys.has(fact.key));
  const tags = platformDetail.tags.value ?? [];
  return <div className="institution-detail-page flex min-w-0 flex-col gap-0 overflow-x-clip bg-white">
    <nav aria-label="面包屑" className="flex flex-wrap gap-x-2 bg-brand px-5 py-2.5 text-sm text-white sm:px-8 lg:px-20"><a href={sitePath('/quanguo/mca-preview/')} className="text-white underline-offset-4 hover:text-white hover:underline">平台观察记录</a><span aria-hidden="true">›</span><span className="min-w-0 break-words">{card.displayName}</span></nav>
    <header className="min-w-0 border-b border-line bg-[linear-gradient(120deg,#FFF7E6_0%,#FFEAC2_100%)] px-5 py-6 sm:px-8 sm:py-8 lg:px-20 lg:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-5">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <h1 className="m-0 break-words text-[27px] font-semibold leading-tight sm:text-[34px] lg:text-[36px]">{card.displayName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="rounded-sm bg-brand px-2 py-0.5 font-semibold text-white">民政部平台采集观察</span><span className="text-sub">{card.hasDetail ? '已存双端点详情' : '尚无双端点详情'}</span></div>
        </div>
        <a className="inline-flex min-h-10 items-center rounded border border-[#E4A969] bg-white/75 px-3 text-sm font-semibold" href={mcaOfficialDetailHref(card.mcaId)} target="_blank" rel="noopener noreferrer">打开官网原页核对 ↗</a>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-body">
        <span className="rounded-sm border border-line bg-white/70 px-2 py-1">设施类型原标签：{valueText(platformDetail.identity.facilityType, String)}</span>
        <span className="rounded-sm border border-line bg-white/70 px-2 py-1">机构星级原码：{valueText(platformDetail.identity.starCode, String)}</span>
        {platformDetail.subsidyCode.state === 'observed' && platformDetail.subsidyCode.value === '1' && <span className="rounded-sm bg-brand px-2 py-1 font-semibold text-white">养老消费补贴（原平台标识）</span>}
        {platformDetail.subsidyCode.state === 'observed' && platformDetail.subsidyCode.value !== '1' && <span className="rounded-sm border border-line bg-white/70 px-2 py-1">养老消费补贴原码：{valueText(platformDetail.subsidyCode, String)}（含义待核）</span>}
        {platformDetail.subsidyCode.state === 'missing' && <span className="rounded-sm border border-line bg-white/70 px-2 py-1">养老消费补贴：未提供</span>}
        {platformDetail.subsidyCode.state === 'conflict' && <span className="text-caution">补贴标识观察值冲突</span>}
        {platformDetail.tags.state === 'conflict' ? <span className="text-caution">平台标签观察值冲突</span> : tags.length ? tags.map(tag => <span key={tag} className="rounded-sm border border-line bg-white/70 px-2 py-1">{tag}</span>) : <span className="rounded-sm border border-line bg-white/70 px-2 py-1">平台标签：未提供</span>}
        {platformDetail.identity.functionPositioning.state !== 'missing' && <span className="rounded-sm border border-line bg-white/70 px-2 py-1">功能定位：{valueText(platformDetail.identity.functionPositioning, String)}{platformDetail.identity.functionPositioning.state === 'observed' ? '（原标签）' : ''}</span>}
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 pt-3 text-[13px] text-body"><div className="flex gap-1"><dt>平台评价：</dt><dd className="m-0">{platformDetail.evaluation.text}</dd></div><div className="flex gap-1"><dt>机构面积：</dt><dd className="m-0">{valueText(platformDetail.areaSqm, value => value.toLocaleString('zh-CN') + '㎡')}</dd></div><div className="flex gap-1"><dt>联系人：</dt><dd className="m-0 break-words">{sourceContactText(platformDetail.contactName)}</dd></div><div className="flex gap-1"><dt>联系电话：</dt><dd className="m-0 break-all">{sourceContactText(platformDetail.contactPhone)}</dd></div><div className="flex min-w-0 gap-1"><dt className="shrink-0">详细地址：</dt><dd className="m-0 break-words">{valueText(platformDetail.identity.region, value => value.replaceAll('/', ' / '))} · {valueText(platformDetail.identity.address, String)}</dd></div></dl>
      <p className="mb-0 mt-2 text-xs leading-5 text-sub">联系人和电话为原平台快照值，未经本站核验；标签、星级和补贴资格也待核对。</p>
      <PhotoStrip count={platformDetail.photoCount} />
    </header>
    {conflictLabels.length > 0 && <div className="border-x border-b border-caution-line bg-caution-bg px-5 py-3 text-sm text-caution sm:px-8" role="alert">以下索引字段有冲突，摘要不选边：{conflictLabels.join('、')}。请展开原始证据逐项核对。</div>}

    <section className="min-w-0 border-b border-hair bg-white px-5 py-7 sm:px-8 lg:px-20 lg:py-9" aria-labelledby="mca-preview-fees"><h2 id="mca-preview-fees" className="m-0 border-l-[3px] border-[#D80B25] pl-3 text-lg font-semibold lg:text-[22px]">机构养老</h2>
      <dl className="m-0 mt-4 flex flex-wrap gap-x-8 gap-y-2 border-b border-hair pb-4 text-sm"><div className="flex items-baseline gap-2"><dt>平台列示总床位</dt><dd className="m-0 font-semibold tabular-nums">{valueText(platformDetail.beds.total, value => value.toLocaleString('zh-CN') + ' 个')}</dd></div><div className="flex items-baseline gap-2"><dt>平台列示护理型床位</dt><dd className="m-0 font-semibold tabular-nums">{valueText(platformDetail.beds.nursing, value => value.toLocaleString('zh-CN') + ' 个')}</dd></div></dl>
      <dl aria-label="月费用摘要（窄屏）" className="m-0 mt-4 divide-y divide-hair border border-hair md:hidden">{platformDetail.feeSummary.map(item => <div key={item.code} className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-2 px-3 py-3 text-sm"><dt className="font-medium text-body">{item.label}</dt><dd className="m-0 min-w-0 break-words text-right font-semibold tabular-nums text-ink"><span className={item.range.state === 'conflict' ? 'text-caution' : ''}>{feeText(item.range)}</span>{item.range.value?.includes(0) && <span className="block text-xs font-normal text-caution">原值为 0，不代表免费。</span>}{item.description.state !== 'missing' && <span className="block text-xs font-normal text-sub">说明：{valueText(item.description, value => value)}</span>}</dd></div>)}</dl>
      <div className="mt-4 hidden max-w-full overflow-x-auto md:block"><table aria-label="月费用摘要" className="min-w-[560px] border border-hair text-sm"><tbody>{[0, 2].map(start => <tr key={start}>{platformDetail.feeSummary.slice(start, start + 2).map(item => <React.Fragment key={item.code}><th scope="row" className="w-[18%] border-r border-hair bg-white font-medium text-body">{item.label}</th><td className="w-[32%] border-r border-hair text-right font-semibold tabular-nums text-ink"><span className={item.range.state === 'conflict' ? 'text-caution' : ''}>{feeText(item.range)}</span>{item.range.value?.includes(0) && <span className="block text-xs font-normal text-caution">原值为 0，不代表免费。</span>}{item.description.state !== 'missing' && <span className="block text-xs font-normal text-sub">说明：{valueText(item.description, value => value)}</span>}</td></React.Fragment>)}</tr>)}</tbody></table></div>
      <p className="mb-0 mt-3 text-xs text-sub">类别码 01–04 仅按已观察的私有样本与官网页面对应；金额为平台列示元/月，不代表最新报价。</p>
    </section>
    <section className="min-w-0 border-b border-t-[24px] border-hair border-t-[#FAFAFA] bg-white px-5 py-8 sm:px-8 lg:px-20 lg:py-10" aria-labelledby="mca-preview-basic"><h2 id="mca-preview-basic" className="m-0 text-lg font-medium lg:text-[22px]">基本信息</h2>
      <p className="mb-0 mt-5 whitespace-pre-wrap break-words text-[15px] leading-8 lg:text-[16px]">{valueText(platformDetail.introduction, String)}</p>
    </section>
    <section className="min-w-0 border-b border-t-[24px] border-hair border-t-[#FAFAFA] bg-white px-5 py-8 sm:px-8 lg:px-20 lg:py-10" aria-labelledby="mca-preview-service"><h2 id="mca-preview-service" className="m-0 text-lg font-medium lg:text-[22px]">服务信息</h2>
      <dl className="m-0 mt-4"><DetailRow label="服务内容" field={platformDetail.service.content} icon="content" /><DetailRow label="服务团队" field={platformDetail.service.team} icon="team" /><DetailRow label="服务时间" field={platformDetail.service.hours} icon="time" /><DetailRow label="服务范围" field={platformDetail.service.scope} icon="range" /><DetailRow label="服务说明" field={platformDetail.service.explanation} icon="notes" /></dl>
    </section>
    <section className="min-w-0 border-t-[24px] border-t-[#FAFAFA] bg-white px-5 pb-2 pt-8 sm:px-8 lg:px-20 lg:pt-10" aria-labelledby="mca-preview-beds"><h2 id="mca-preview-beds" className="m-0 text-lg font-medium lg:text-[22px]">机构养老</h2>
      <h3 className="mb-0 mt-5 text-[15px] font-medium">床位信息</h3>
      <dl className="m-0 mt-2 flex flex-wrap gap-x-5 gap-y-2 border-b border-hair py-4 text-[15px]">{([['总床位', platformDetail.beds.total], ['日托床位', platformDetail.beds.dayCare], ['全托床位', platformDetail.beds.fullCare], ['护理型床位', platformDetail.beds.nursing]] as const).map(([label, field]) => <div key={label} className="flex gap-1 border-r border-hair pr-5 last:border-r-0"><dt>{label}：</dt><dd className="m-0 font-medium tabular-nums">{valueText(field, value => value.toLocaleString('zh-CN') + ' 个')}</dd></div>)}</dl>
      <p className="m-0 py-3 text-xs text-sub">平台列示床位不是当前空床；日托床位原值为 0 时保留为 0，不改写成“未提供”。</p>
    </section>
    <section className="min-w-0 border-b border-hair bg-white px-5 pb-8 pt-3 sm:px-8 lg:px-20 lg:pb-10" aria-labelledby="mca-preview-charges"><h2 id="mca-preview-charges" className="m-0 text-[15px] font-medium">收费标准</h2>
      {platformDetail.charges.state === 'conflict' ? <p className="m-0 text-caution" role="alert">收费项目在多次非空观察中有冲突，请核对原始证据。</p> : platformDetail.charges.value === null ? <p className="m-0 text-body">未取得收费项目表。</p> : platformDetail.charges.value.length === 0 ? <p className="m-0 text-body">原平台未列出收费项目。</p> : <>
        <div className="space-y-3 sm:hidden">{platformDetail.charges.value.map((item, index) => <div key={item.id ?? index} className="rounded border border-line p-4 text-sm"><h3 className="m-0 font-semibold">{item.name ?? '项目名称未提供'}</h3><p className="mb-0 mt-2 break-words text-body">{item.description ?? '项目说明未提供'}</p><p className="mb-0 mt-2 break-words font-medium">收费标准：{item.standard ?? '未提供'}</p></div>)}</div>
        <div className="mt-3 hidden overflow-x-auto sm:block"><table className="border border-hair text-[14px]"><thead><tr><th className="w-[20%] border border-hair bg-[#F2F2F2] text-center">项目名称</th><th className="border border-hair bg-[#F2F2F2] text-center">项目说明</th><th className="w-[20%] border border-hair bg-[#F2F2F2] text-center">收费标准</th></tr></thead><tbody>{platformDetail.charges.value.map((item, index) => <tr key={item.id ?? index} className="even:bg-[#F2F2F2]"><td className="break-words border border-hair text-center">{item.name ?? '未提供'}</td><td className="break-words border border-hair text-center">{item.description ?? '未提供'}</td><td className="break-words border border-hair text-center">{item.standard ?? '未提供'}</td></tr>)}</tbody></table></div>
      </>}
    </section>
    {platformDetail.subServices && (hasSubServiceDto(platformDetail.subServices.respite) || hasSubServiceDto(platformDetail.subServices.dayCare) || hasSubServiceDto(platformDetail.subServices.homeVisit) || platformDetail.subServices.assessment.home.state !== 'missing' || platformDetail.subServices.assessment.site.state !== 'missing') && <section className="min-w-0 border-b border-t-[24px] border-hair border-t-[#FAFCFD] bg-white px-5 py-8 sm:px-8 lg:px-20 lg:py-10" aria-labelledby="mca-preview-subservices">
      <h2 id="mca-preview-subservices" className="m-0 text-lg font-medium lg:text-[22px]">其他服务类型</h2>
      <p className="mb-0 mt-2 text-xs leading-5 text-sub">喘息、日托、上门与能力评估是平台详情中与“机构养老”并列的独立服务块，床位与费用不可合并计算。</p>
      <div className="mt-4">
        <SubServiceBlock title="喘息服务" data={platformDetail.subServices.respite} />
        <SubServiceBlock title="日托服务" data={platformDetail.subServices.dayCare} />
        <SubServiceBlock title="上门服务" data={platformDetail.subServices.homeVisit} />
        {(platformDetail.subServices.assessment.home.state !== 'missing' || platformDetail.subServices.assessment.site.state !== 'missing') && <div className="border-b border-hair py-5 last:border-0"><h3 className="m-0 text-[15px] font-medium">能力评估</h3><dl className="m-0 mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[15px]"><div className="flex gap-1"><dt>上门评估费：</dt><dd className="m-0 font-medium tabular-nums">{valueText(platformDetail.subServices.assessment.home, value => value.toLocaleString('zh-CN') + ' 元')}</dd></div><div className="flex gap-1"><dt>站点评估费：</dt><dd className="m-0 font-medium tabular-nums">{valueText(platformDetail.subServices.assessment.site, value => value.toLocaleString('zh-CN') + ' 元')}</dd></div></dl></div>}
      </div>
    </section>}
    <section className="min-w-0 border-b border-t-[24px] border-hair border-t-[#FAFAFA] bg-white px-5 py-8 sm:px-8 lg:px-20 lg:py-10" aria-labelledby="mca-preview-evaluation"><h2 id="mca-preview-evaluation" className="m-0 text-lg font-medium lg:text-[22px]">用户评价{platformDetail.evaluation.count.state === 'observed' ? '（' + platformDetail.evaluation.count.value + '）' : ''}</h2><div className="my-6 flex min-h-40 items-center justify-center bg-[#FAFAFA] px-4 text-center sm:min-h-56"><p className={'m-0 text-sm ' + (platformDetail.evaluation.state === 'conflict' ? 'text-caution' : 'text-sub')}>{platformDetail.evaluation.text}</p></div><p className="m-0 text-xs text-sub">平台评价与机构星级是不同口径；本机快照不包含评价正文。</p></section>

    <aside className="border-b border-caution-line bg-caution-bg px-5 py-5 text-[13px] leading-6 text-caution sm:px-8 lg:px-20" role="note"><strong>仅供本机开发预览。</strong> 联系人和电话是原平台快照值，本站尚未核对其时效或公开使用范围；不得把本页或其 JSON 文件直接纳入正式公开构建。机构填写内容、床位与费用均不是本站实时核验或服务承诺；0、缺值和冲突分别显示。</aside>
    <div className="px-5 pt-6 text-sm sm:px-8 lg:px-20"><Suspense fallback={<a href={sitePath('/quanguo/mca-preview/')} className="underlink">← 返回观察记录</a>}><McaPreviewReturnLink /></Suspense></div>
    <details className="section mx-5 mt-7 sm:mx-8 lg:mx-20"><summary className="cursor-pointer font-semibold">补充字段与原始码（私有）</summary><div className="space-y-6"><div><h2 className="m-0 text-lg font-semibold">已识别的平台字段</h2><p className="mb-0 mt-2 text-sm text-sub">这些原码和来源仅用于对照，不证明当前在营、资格或费用承诺。</p></div>{factGroups.map(group => <section key={group.title} aria-label={group.title}><h3 className="mb-3 mt-0 text-base font-semibold">{group.title}</h3><FactGrid facts={facts.filter(fact => group.keys.includes(fact.key))} /></section>)}{otherFacts.length > 0 && <section aria-label="其他已识别字段"><h3 className="mb-3 mt-0 text-base font-semibold">其他已识别字段</h3><FactGrid facts={otherFacts} /></section>}</div></details>
    <details id="mca-preview-original" className="section mx-5 mt-5 sm:mx-8 lg:mx-20"><summary className="cursor-pointer text-lg font-semibold">原始响应与采集证据（私有）</summary>
      <p className="mb-4 mt-2 text-sm text-sub">原键仅作取证，未释义路径不写成业务字段；以下内容仅在本机隔离开发环境查看。</p>
      <div className="space-y-3">{listObservations.map((observation, index) => <RawObservation key={'list-' + index} title={'列表观察 ' + (index + 1)} source={observation.source} sourceFields={observation.sourceFields} />)}{detailObservations.map((observation, index) => <div key={'detail-' + index} className="space-y-3"><h3 className="m-0 text-base font-semibold">双详情观察 {index + 1}</h3><RawObservation title="基本详情原字段" source={observation.endpoints.orgBaseDetail.source} sourceFields={observation.endpoints.orgBaseDetail.sourceFields} /><RawObservation title="养老详情原字段" source={observation.endpoints.yangLaoOrgDetail.source} sourceFields={observation.endpoints.yangLaoOrgDetail.sourceFields} /></div>)}{listObservations.length === 0 && detailObservations.length === 0 && <p className="m-0 text-sm text-caution">此平台 ID 暂无可读取原件；请核对快照生成结果。</p>}</div>
    </details>
    <details className="text-xs text-sub"><summary className="cursor-pointer">查看平台 ID 与快照标识、观察次数</summary><dl className="mb-0 mt-2 grid gap-2 sm:grid-cols-2"><div><dt>平台 ID</dt><dd className="m-0 break-all font-mono">{card.mcaId}</dd></div><div><dt>快照</dt><dd className="m-0 break-all font-mono">{snapshotId}</dd></div><div><dt>列表观察</dt><dd className="m-0">{listObservations.length} 次</dd></div><div><dt>双详情观察</dt><dd className="m-0">{detailObservations.length} 次</dd></div></dl></details>
  </div>;
}
