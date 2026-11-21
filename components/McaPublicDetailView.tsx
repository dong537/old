import React from 'react';
import type { McaPreviewResolved, McaPreviewSubServiceDto } from '@/lib/mca-preview-dto';
import type { McaObservedTimeRange, McaPublicDetailRecord, McaPublicIndexRecord, McaPublicManifest } from '@/lib/mca-public-types';
import { mcaOfficialDetailHref } from '@/lib/mca-preview-ui';
import { sitePath } from '@/lib/site-path';

function valueText<T>(field: McaPreviewResolved<T>, format: (value: T) => string): string {
  if (field.state === 'conflict') return '多次观察值冲突，待核对';
  if (field.value === null) return '采集快照未提供';
  return format(field.value);
}

function FieldRow<T>({ label, field, format }: { label: string; field: McaPreviewResolved<T>; format: (value: T) => string }) {
  return <div className="grid min-w-0 gap-1.5 border-b border-hair py-3 last:border-0 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-5"><dt className="text-sm font-medium text-body">{label}</dt><dd className={'m-0 min-w-0 whitespace-pre-wrap break-words text-sm ' + (field.state === 'conflict' ? 'text-caution' : 'text-ink')}>{valueText(field, format)}</dd></div>;
}

function FeeRow({ item }: { item: McaPublicDetailRecord['platformDetail']['feeSummary'][number] }) {
  return <div className="border-b border-hair py-3 last:border-0"><div className="flex flex-wrap items-baseline justify-between gap-3 text-sm"><span className="font-medium">{item.label}</span><span className={'font-semibold tabular-nums ' + (item.range.state === 'conflict' ? 'text-caution' : 'text-ink')}>{valueText(item.range, range => range[0].toLocaleString('zh-CN') + '–' + range[1].toLocaleString('zh-CN') + ' 元/月')}</span></div>{item.range.value?.includes(0) && <p className="mb-0 mt-1 text-xs text-caution">原值为 0，不代表免费。</p>}<p className="mb-0 mt-1 text-xs text-sub">费用说明：{valueText(item.description, String)}</p></div>;
}

function ObservedTimeRange({ range }: { range: McaObservedTimeRange }) {
  return <><time dateTime={range.earliest}>{range.earliest}</time>{range.earliest !== range.latest && <> 至 <time dateTime={range.latest}>{range.latest}</time></>}</>;
}

function hasSubService(data: McaPreviewSubServiceDto): boolean {
  return data.beds.state !== 'missing' || data.nursingBeds.state !== 'missing' ||
    data.fee.state !== 'missing' || data.project.state !== 'missing' || data.charges.state !== 'missing';
}

function SubServiceBlock({ title, data }: { title: string; data: McaPreviewSubServiceDto }) {
  if (!hasSubService(data)) return null;
  return <div className="border-b border-hair py-4 last:border-0">
    <h3 className="m-0 text-base font-semibold">{title}</h3>
    <dl className="mb-0 mt-2">
      {data.beds.state !== 'missing' && <FieldRow label="床位数" field={data.beds} format={value => value.toLocaleString('zh-CN') + ' 个'} />}
      {data.nursingBeds.state !== 'missing' && <FieldRow label="护理型床位" field={data.nursingBeds} format={value => value.toLocaleString('zh-CN') + ' 个'} />}
      {data.project.state !== 'missing' && <FieldRow label="服务项目" field={data.project} format={String} />}
      {data.fee.state !== 'missing' && <FieldRow label={'费用（' + data.unit + '）'} field={data.fee} format={range => range[0].toLocaleString('zh-CN') + '–' + range[1].toLocaleString('zh-CN')} />}
    </dl>
    {data.charges.state === 'observed' && data.charges.value !== null && data.charges.value.length > 0 && <dl className="mb-0 mt-2 divide-y divide-hair border border-hair">
      {data.charges.value.map((item, index) => <div key={item.id ?? index} className="grid gap-2 p-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_10rem]">
        <dt className="font-medium">{item.name ?? '未提供项目名称'}</dt>
        <dd className="m-0 break-words">{item.description ?? '未提供项目说明'}</dd>
        <dd className="m-0 break-words font-semibold tabular-nums">{item.standard ?? '未提供收费标准'}</dd>
      </div>)}
    </dl>}
  </div>;
}

export function McaPublicDetailView({ record, detail, manifest }: {
  record: McaPublicIndexRecord; detail: McaPublicDetailRecord; manifest: McaPublicManifest;
}) {
  const data = detail.platformDetail;
  const name = record.conflictFields.includes('name') ? '机构名称观察值冲突' : record.name ?? '平台未提供机构名称';
  const tags = data.tags.state === 'observed' ? data.tags.value ?? [] : [];
  // 兼容尚未重建的旧快照 JSON：缺 subServices 时整块不渲染，而不是报错
  const sub = data.subServices as typeof data.subServices | undefined;
  const showSub = sub !== undefined && (hasSubService(sub.respite) || hasSubService(sub.dayCare) || hasSubService(sub.homeVisit) ||
    sub.assessment.home.state !== 'missing' || sub.assessment.site.state !== 'missing');
  return <div className="institution-detail-page min-w-0 overflow-x-clip bg-white">
    <nav aria-label="面包屑" className="flex flex-wrap gap-2 bg-brand px-5 py-2.5 text-sm text-white sm:px-8 lg:px-20"><a href={sitePath('/quanguo/pingtai/')} className="text-white hover:text-white">民政部平台采集快照</a><span aria-hidden="true">›</span><span className="min-w-0 break-words">{name}</span></nav>
    <header className="border-b border-line bg-[#F3F7F8] px-5 py-7 sm:px-8 lg:px-20 lg:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><h1 className="m-0 break-words text-[27px] font-semibold leading-tight sm:text-[34px] lg:text-[36px]">{name}</h1><p className="mb-0 mt-2 text-sm text-body">民政部平台已采双端点详情 · 历史观察快照</p></div><a href={mcaOfficialDetailHref(record.mcaId)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center border border-brand-line bg-white/75 px-3 text-sm font-semibold">打开官网原页核对 ↗</a></div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded border border-line bg-white/70 px-2 py-1">设施类型：{valueText(data.identity.facilityType, String)}</span><span className="rounded border border-line bg-white/70 px-2 py-1">星级原码：{valueText(data.identity.starCode, String)}</span><span className="rounded border border-line bg-white/70 px-2 py-1">补贴原码：{valueText(data.subsidyCode, String)}</span><span className="rounded border border-line bg-white/70 px-2 py-1">功能定位：{valueText(data.identity.functionPositioning, String)}</span>{tags.map(tag => <span key={tag} className="rounded border border-line bg-white/70 px-2 py-1">{tag}</span>)}</div>
      <dl className="mb-0 mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><div><dt className="inline text-body">地区：</dt><dd className="m-0 inline break-words">{valueText(data.identity.region, value => value.replaceAll('/', ' / '))}</dd></div><div><dt className="inline text-body">详细地址：</dt><dd className="m-0 inline break-words">{valueText(data.identity.address, String)}</dd></div><div><dt className="inline text-body">联系人：</dt><dd className="m-0 inline break-words">{valueText(data.contactName, String)}</dd></div><div><dt className="inline text-body">联系电话：</dt><dd className="m-0 inline break-all">{valueText(data.contactPhone, String)}</dd></div></dl>
      <p className="mb-0 mt-3 text-xs leading-5 text-sub">联系人与电话均来自来源快照；联系前请核对。图片记录 {valueText(data.photoCount, count => count.toLocaleString('zh-CN') + ' 项')}，当前没有可展示的图片 URL。</p>
    </header>
    {detail.conflictLabels.length > 0 && <div role="alert" className="border-b border-caution-line bg-caution-bg px-5 py-3 text-sm text-caution sm:px-8 lg:px-20">索引字段观察冲突：{detail.conflictLabels.join('、')}。本页不替来源选定冲突值，请到官网核对。</div>}
    <section aria-labelledby="mca-public-fees" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-fees" className="m-0 border-l-[3px] border-brand pl-3 text-xl font-semibold">床位与月费用</h2><dl className="mb-0 mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2"><FieldRow label="平台列示总床位" field={data.beds.total} format={value => value.toLocaleString('zh-CN') + ' 个'} /><FieldRow label="平台列示护理型床位" field={data.beds.nursing} format={value => value.toLocaleString('zh-CN') + ' 个'} /></dl><div className="mt-4 grid gap-x-8 border-t border-hair sm:grid-cols-2">{data.feeSummary.map(item => <FeeRow key={item.code} item={item} />)}</div><p className="mb-0 mt-3 text-xs text-sub">平台列示床位不等于当前空床；月费为来源记录，不是本站报价。</p></section>
    <section aria-labelledby="mca-public-basic" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-basic" className="m-0 text-xl font-semibold">基本信息</h2><p className="mb-0 mt-4 whitespace-pre-wrap break-words text-[15px] leading-8">{valueText(data.introduction, String)}</p><dl className="mb-0 border-t border-hair"><FieldRow label="机构面积" field={data.areaSqm} format={value => value.toLocaleString('zh-CN') + ' ㎡'} /><FieldRow label="平台原始坐标（未定位核验）" field={data.pointRaw} format={String} /></dl></section>
    <section aria-labelledby="mca-public-service" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-service" className="m-0 text-xl font-semibold">服务信息</h2><dl className="mb-0 mt-3"><FieldRow label="服务内容" field={data.service.content} format={String} /><FieldRow label="服务团队" field={data.service.team} format={String} /><FieldRow label="服务时间" field={data.service.hours} format={String} /><FieldRow label="服务范围" field={data.service.scope} format={String} /><FieldRow label="服务说明" field={data.service.explanation} format={String} /></dl></section>
    {record.listObservationCount > 0 && <section aria-labelledby="mca-public-list-fields" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-list-fields" className="m-0 text-xl font-semibold">平台列表补充字段</h2><p className="mb-0 mt-2 text-xs text-sub">以下为平台列表采集原值，与详情字段分开保留；联系电话、床位和补贴信息均需核对时效。</p><dl className="mb-0 mt-3"><FieldRow label="平台列表服务类别" field={record.serviceCategoryLabel} format={String} /><FieldRow label="平台列表联系电话原值" field={record.listedContactPhone} format={String} /><FieldRow label="平台列表补贴原码" field={record.subsidyCode} format={String} /><FieldRow label="平台列表日托床位" field={record.dayCareBeds} format={value => value.toLocaleString('zh-CN') + ' 个'} /><FieldRow label="平台列表全托床位" field={record.fullCareBeds} format={value => value.toLocaleString('zh-CN') + ' 个'} /></dl></section>}
    <section aria-labelledby="mca-public-care" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-care" className="m-0 text-xl font-semibold">机构养老</h2><dl className="mb-0 mt-3"><FieldRow label="总床位" field={data.beds.total} format={value => value.toLocaleString('zh-CN') + ' 个'} /><FieldRow label="日托床位" field={data.beds.dayCare} format={value => value.toLocaleString('zh-CN') + ' 个'} /><FieldRow label="全托床位" field={data.beds.fullCare} format={value => value.toLocaleString('zh-CN') + ' 个'} /><FieldRow label="护理型床位" field={data.beds.nursing} format={value => value.toLocaleString('zh-CN') + ' 个'} /></dl><h3 className="mb-0 mt-5 text-base font-semibold">分项收费</h3>{data.charges.state === 'conflict' ? <p className="text-caution">收费项目多次观察冲突，待核对。</p> : data.charges.value === null ? <p className="text-sub">采集快照未提供分项收费。</p> : data.charges.value.length === 0 ? <p className="text-sub">来源记录 0 项分项收费。</p> : <dl className="mb-0 mt-2 divide-y divide-hair border border-hair">{data.charges.value.map((item, index) => <div key={item.id ?? index} className="grid gap-2 p-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_10rem]"><dt className="font-medium">{item.name ?? '未提供项目名称'}</dt><dd className="m-0 break-words">{item.description ?? '未提供项目说明'}</dd><dd className="m-0 break-words font-semibold tabular-nums">{item.standard ?? '未提供收费标准'}</dd></div>)}</dl>}</section>
    {showSub && sub !== undefined && <section aria-labelledby="mca-public-subservices" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-subservices" className="m-0 text-xl font-semibold">其他服务类型</h2><p className="mb-0 mt-2 text-xs leading-5 text-sub">喘息、日托、上门与能力评估是平台详情中与“机构养老”并列的独立服务块，其床位与费用不可与机构养老合并计算。</p><div className="mt-3"><SubServiceBlock title="喘息服务" data={sub.respite} /><SubServiceBlock title="日托服务" data={sub.dayCare} /><SubServiceBlock title="上门服务" data={sub.homeVisit} />{(sub.assessment.home.state !== 'missing' || sub.assessment.site.state !== 'missing') && <div className="border-b border-hair py-4 last:border-0"><h3 className="m-0 text-base font-semibold">能力评估</h3><dl className="mb-0 mt-2"><FieldRow label="上门评估费（元）" field={sub.assessment.home} format={value => value.toLocaleString('zh-CN')} /><FieldRow label="站点评估费（元）" field={sub.assessment.site} format={value => value.toLocaleString('zh-CN')} /></dl></div>}</div></section>}
    <section aria-labelledby="mca-public-reviews" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-reviews" className="m-0 text-xl font-semibold">平台评价</h2><p className="mb-0 mt-4 text-sm">{data.evaluation.text}</p><p className="mb-0 mt-1 text-xs text-sub">综合评价原值的量表未核对；本站不展示评价正文。</p></section>
    <section aria-labelledby="mca-public-facts" className="border-b border-hair px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-facts" className="m-0 text-xl font-semibold">全部已映射索引字段</h2><p className="mb-0 mt-2 text-xs text-sub">逐字段保留采集状态和原平台标签；未释义的原始响应不在公开页展示。</p><dl className="mb-0 mt-3 grid gap-x-8 sm:grid-cols-2">{detail.facts.map(fact => <div key={fact.key} className="border-b border-hair py-3 text-sm"><dt className="font-medium">{fact.label}</dt><dd className={'m-0 mt-1 break-words ' + (fact.state === 'conflict' ? 'text-caution' : '')}>{fact.text}</dd>{fact.warning && <dd className="m-0 mt-1 text-xs text-caution">{fact.warning}</dd>}{fact.source && <dd className="m-0 mt-1 text-xs text-sub">{fact.source.channelLabel} · {fact.source.fetchedAtUtc ?? '采集时间未提供'}</dd>}</div>)}</dl></section>
    <section aria-labelledby="mca-public-source" className="px-5 py-7 sm:px-8 lg:px-20"><h2 id="mca-public-source" className="m-0 text-xl font-semibold">来源与时间</h2><p className="mb-0 mt-3 text-sm text-body">平台 ID：<span className="break-all font-mono">{record.mcaId}</span></p><p className="mb-0 mt-2 break-words text-sm text-body">该机构详情采集时间：<ObservedTimeRange range={detail.detailObservedAtUtc} /> · 详情观察 {record.detailObservationCount} 次</p>{record.listObservedAtUtc && <p className="mb-0 mt-2 break-words text-sm text-body">该机构列表采集时间：<ObservedTimeRange range={record.listObservedAtUtc} /> · 列表观察 {record.listObservationCount} 次</p>}<p className="mb-0 mt-2 break-words text-sm text-sub">本批次最晚采集时间：<time dateTime={manifest.snapshotCapturedAtUtc}>{manifest.snapshotCapturedAtUtc}</time></p><p className="mb-0 mt-2 text-sm text-body">来源页面：<a href={detail.sourcePage} target="_blank" rel="noopener noreferrer">全国养老服务信息平台 ↗</a></p><p className="mb-0 mt-2 text-sm text-caution">快照不代表实时在营、实时空床或最新报价；请联系机构并核对官网原页。</p><a href={sitePath('/quanguo/pingtai/')} className="mt-4 inline-flex min-h-10 items-center font-semibold">← 返回平台采集快照目录</a></section>
  </div>;
}
