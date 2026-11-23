import React from 'react';
import type { McaPreviewResolved, McaPreviewSubServiceDto } from '@/lib/mca-preview-dto';
import type { McaObservedTimeRange, McaPublicDetailRecord, McaPublicIndexRecord, McaPublicManifest } from '@/lib/mca-public-types';
import { mapMcaPublicDetailDisplay, type McaPublicDetailDisplayDto } from '@/lib/mca-public-detail-display';
import { mapMcaCatalogDisplay, type McaCatalogDisplayDto } from '@/lib/mca-catalog-display';
import type { McaCatalogCsvDetail, McaCatalogIndexRecord, McaCatalogManifest } from '@/lib/mca-catalog-types';
import { institutionArticleHref, type InstitutionArticleSummary } from '@/lib/institution-articles';
import { sitePath } from '@/lib/site-path';
import { McaDetailReturnLink } from './McaDetailReturnLink';

function valueText<T>(field: McaPreviewResolved<T>, format: (value: T) => string): string {
  if (field.state === 'conflict') return '多次观察值冲突，待核对';
  if (field.value === null) return '采集快照未提供';
  return format(field.value);
}

function numberText(value: number): string { return value.toLocaleString('zh-CN') + ' 个'; }
function moneyRange(range: [number, number], unit: string): string {
  return range[0].toLocaleString('zh-CN') + '–' + range[1].toLocaleString('zh-CN') + ' ' + unit;
}

function FieldRow<T>({ label, field, format }: { label: string; field: McaPreviewResolved<T>; format: (value: T) => string }) {
  return <div className="grid min-w-0 gap-1 border-b border-hair py-3 last:border-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5">
    <dt className="text-sm text-body">{label}</dt>
    <dd className={'m-0 min-w-0 whitespace-pre-wrap break-words text-sm font-medium leading-6 ' + (field.state === 'conflict' ? 'text-caution' : 'text-ink')}>{valueText(field, format)}</dd>
  </div>;
}

function ObservedTimeRange({ range }: { range: McaObservedTimeRange }) {
  return <><time dateTime={range.earliest}>{range.earliest}</time>{range.earliest !== range.latest && <> 至 <time dateTime={range.latest}>{range.latest}</time></>}</>;
}

function FeeRow({ item }: { item: McaPublicDetailDisplayDto['monthlyFees'][number] }) {
  return <div className="grid min-w-0 gap-1 border-b border-hair py-3 last:border-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5">
    <dt className="text-sm text-body">{item.label}</dt>
    <dd className="m-0 min-w-0 text-sm">
      <strong className={'font-semibold tabular-nums ' + (item.range.state === 'conflict' ? 'text-caution' : 'text-ink')}>{valueText(item.range, range => moneyRange(range, '元/月'))}</strong>
      {item.range.value?.includes(0) && <span className="ml-2 text-xs text-caution">原值为 0，不代表免费</span>}
      {item.description.state !== 'missing' && <p className={'mb-0 mt-1 whitespace-pre-wrap break-words text-xs leading-5 ' + (item.description.state === 'conflict' ? 'text-caution' : 'text-sub')}>{valueText(item.description, String)}</p>}
    </dd>
  </div>;
}

function ChargeRows({ charges, unit = '' }: { charges: McaPreviewResolved<{ id: string | null; name: string | null; description: string | null; standard: string | null }[]>; unit?: string }) {
  if (charges.state === 'conflict') return <p className="text-sm text-caution">分项收费多次观察值冲突，待核对官网原页。</p>;
  if (charges.value === null) return <p className="text-sm text-sub">采集快照未提供分项收费。</p>;
  if (charges.value.length === 0) return <p className="text-sm text-sub">来源记录 0 项分项收费。</p>;
  return <dl className="mb-0 mt-3 divide-y divide-hair border-y border-hair">
    {charges.value.map((item, index) => <div key={item.id ?? index} className="grid min-w-0 gap-1 py-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_minmax(8rem,auto)] sm:gap-4">
      <dt className="font-medium">{item.name ?? '未提供项目名称'}</dt>
      <dd className="m-0 min-w-0 whitespace-pre-wrap break-words text-body">{item.description ?? '未提供项目说明'}</dd>
      <dd className="m-0 min-w-0 whitespace-pre-wrap break-words font-semibold tabular-nums">{item.standard ?? '未提供收费标准'}{unit}</dd>
    </div>)}
  </dl>;
}

function hasSubService(data: McaPreviewSubServiceDto): boolean {
  return data.beds.state !== 'missing' || data.nursingBeds.state !== 'missing' ||
    data.fee.state !== 'missing' || data.project.state !== 'missing' || data.charges.state !== 'missing';
}

function SubServiceBlock({ title, data }: { title: string; data: McaPreviewSubServiceDto }) {
  if (!hasSubService(data)) return null;
  return <div className="border-t border-hair py-5 first:border-0 first:pt-0">
    <h3 className="m-0 text-base font-semibold">{title}</h3>
    <dl className="mb-0 mt-2">
      {data.beds.state !== 'missing' && <FieldRow label="床位数" field={data.beds} format={numberText} />}
      {data.nursingBeds.state !== 'missing' && <FieldRow label="护理型床位" field={data.nursingBeds} format={numberText} />}
      {data.fee.state !== 'missing' && <FieldRow label={'费用（' + data.unit + '）'} field={data.fee} format={range => moneyRange(range, data.unit)} />}
      {data.fee.value?.includes(0) && <p className="mb-0 mt-1 text-xs text-caution">原值为 0，不代表免费。</p>}
      {data.project.state !== 'missing' && <FieldRow label="服务项目" field={data.project} format={String} />}
    </dl>
    {data.charges.state !== 'missing' && <ChargeRows charges={data.charges} />}
  </div>;
}

const navItems = [
  { id: 'mca-public-fees', label: '床位与收费' },
  { id: 'mca-public-basic', label: '机构介绍' },
  { id: 'mca-public-service', label: '服务信息' },
  { id: 'mca-public-contact', label: '联系核对' },
  { id: 'mca-public-articles', label: '相关文章' },
  { id: 'mca-public-source', label: '来源资料' },
] as const;

export function McaPublicDetailView({ record, detail, manifest, articles = [] }: {
  record: McaPublicIndexRecord; detail: McaPublicDetailRecord; manifest: McaPublicManifest; articles?: InstitutionArticleSummary[];
}) {
  return <McaDetailContent dto={mapMcaPublicDetailDisplay(record, detail, manifest)} articles={articles} />;
}

export function McaCatalogDetailView({ record, detail, manifest, articles = [] }: {
  record: McaCatalogIndexRecord; detail: McaCatalogCsvDetail; manifest: McaCatalogManifest; articles?: InstitutionArticleSummary[];
}) {
  return <McaDetailContent dto={mapMcaCatalogDisplay(record, detail, manifest)} articles={articles} />;
}

function McaDetailContent({ dto, articles }: { dto: McaPublicDetailDisplayDto | McaCatalogDisplayDto; articles: InstitutionArticleSummary[] }) {
  const { overview, capacity, source } = dto;
  const csvSource = 'sourceKind' in source ? source : null;
  const observedSource = 'sourceKind' in source ? null : source;
  const monthlyTotal = dto.monthlyFees.find(item => item.code === '04')?.range;
  const nav = [navItems[0], navItems[1], navItems[2], ...(dto.hasSubServices ? [{ id: 'mca-public-subservices', label: '其他服务' }] : []), navItems[3], ...(articles.length ? [navItems[4]] : []), navItems[5]];

  return <div className="institution-detail-page min-w-0 bg-page">
    <div className="border-b border-line bg-white">
      <div className="container-site pb-6 pt-4 sm:pb-8 sm:pt-5">
        <nav aria-label="面包屑" className="mb-5 flex flex-wrap gap-2 text-[13px] text-sub">
          <a href={sitePath('/quanguo/pingtai/')} className="text-brand">找养老机构</a><span aria-hidden="true">›</span><span className="min-w-0 break-words">{dto.name}</span>
        </nav>
        <header id="mca-public-overview" className="border-l-[3px] border-brand pl-4 sm:pl-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
            <div className="min-w-0">
              <p className="m-0 text-[12px] font-semibold tracking-wide text-brand">全国养老服务信息平台 · 机构资料快照</p>
              <h1 className="mb-0 mt-2 break-words text-[clamp(1.6rem,3.2vw,2.25rem)] font-semibold leading-tight text-ink">{dto.name}</h1>
              <p className="mb-0 mt-3 break-words text-sm leading-6 text-body">{valueText(overview.region, value => value.replaceAll('/', ' / '))}{overview.facilityType.state === 'observed' && <> · {overview.facilityType.value}</>}</p>
              <p className="mb-0 mt-1 break-words text-sm leading-6 text-ink"><span className="text-body">地址：</span>{valueText(overview.address, String)}</p>
            </div>
            <a href={source.sourcePage} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-md border border-brand-line bg-brand-tint px-4 text-sm font-semibold no-underline hover:bg-white sm:w-auto">打开官网原页核对 ↗</a>
          </div>
          <dl aria-label="机构关键事实" className="mb-0 mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t border-hair pt-3 text-sm"><div className="flex gap-2"><dt className="text-body">平台列示床位</dt><dd className="m-0 font-semibold tabular-nums">{valueText(capacity.total, numberText)}</dd></div><div className="flex gap-2"><dt className="text-body">月费参考</dt><dd className="m-0 font-semibold tabular-nums">{monthlyTotal?.state === 'observed' && monthlyTotal.value ? monthlyTotal.value[0] === 0 ? '来源含原值 0，请核对' : monthlyTotal.value[0].toLocaleString('zh-CN') + ' 元/月起' : monthlyTotal ? valueText(monthlyTotal, range => moneyRange(range, '元/月')) : '采集快照未提供'}</dd></div></dl>
          <p className="mb-0 mt-3 text-xs leading-5 text-sub">{csvSource ? <>采集器记录时间：{csvSource.csvUpdatedAtLocal.replace('T', ' ')}（本地时间，时区未提供）</> : observedSource && <>详情采集于 <time dateTime={observedSource.detailObservedAtUtc.earliest}>{observedSource.detailObservedAtUtc.earliest.slice(0, 10)}</time>{observedSource.detailObservedAtUtc.earliest.slice(0, 10) !== observedSource.detailObservedAtUtc.latest.slice(0, 10) && <>—<time dateTime={observedSource.detailObservedAtUtc.latest}>{observedSource.detailObservedAtUtc.latest.slice(0, 10)}</time></>}</>}；历史快照不代表当前在营、空床或最新报价。</p>
        </header>
      </div>
    </div>

    {observedSource && observedSource.conflictLabels.length > 0 && <div role="alert" className="border-b border-caution-line bg-caution-bg"><div className="container-site py-3 text-sm text-caution">索引字段观察冲突：{observedSource.conflictLabels.join('、')}。请到官网核对，本页不替来源选定冲突值。</div></div>}
    {csvSource?.collectorStatus === 'stale' && <div role="alert" className="border-b border-caution-line bg-caution-bg"><div className="container-site py-3 text-sm text-caution">资料待刷新：采集器将此条标记为 stale。这不是机构停业或注销状态，请打开官网原页核对。</div></div>}

    <div className="container-site grid min-w-0 gap-5 py-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:py-8">
      <nav aria-label="本页目录" className="sticky top-0 z-10 flex min-w-0 gap-4 overflow-x-auto border-b border-line bg-page py-2 text-sm font-medium whitespace-nowrap lg:top-5 lg:flex-col lg:gap-0 lg:overflow-visible lg:rounded-md lg:border lg:bg-white lg:p-3">
        {nav.map(item => <a key={item.id} href={'#' + item.id} className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-1 no-underline hover:border-brand lg:w-full lg:border-b-0 lg:rounded-md lg:px-3 lg:hover:bg-brand-tint">{item.label}</a>)}
      </nav>

      <div className="min-w-0 space-y-5">
        <section id="mca-public-fees" className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
          <h2 className="m-0 text-xl font-semibold">床位与收费</h2>
          <p className="mb-0 mt-1 text-xs leading-5 text-sub">床位为平台列示数量，不等于当前空床；收费为历史快照，不是本站报价。</p>
          <dl className="mb-0 mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-hair py-4 sm:grid-cols-4">
            {[{ label: '总床位', field: capacity.total }, { label: '护理型床位', field: capacity.nursing }, { label: '日托床位', field: capacity.dayCare }, { label: '全托床位', field: capacity.fullCare }].map(item => <div key={item.label} className="min-w-0"><dt className="text-xs text-body">{item.label}</dt><dd className={'m-0 mt-1 break-words text-base font-semibold tabular-nums ' + (item.field.state === 'conflict' ? 'text-caution' : 'text-ink')}>{valueText(item.field, numberText)}</dd></div>)}
          </dl>
          <h3 className="mb-0 mt-5 text-base font-semibold">月费用</h3>
          <dl className="mb-0 mt-2 border-t border-hair">{dto.monthlyFees.map(item => <FeeRow key={item.code} item={item} />)}</dl>
          <h3 className="mb-0 mt-6 text-base font-semibold">分项收费</h3>
          <ChargeRows charges={dto.charges} />
        </section>

        <section id="mca-public-basic" className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
          <h2 className="m-0 text-xl font-semibold">机构介绍</h2>
          <p className="mb-0 mt-4 whitespace-pre-wrap break-words text-[15px] leading-7">{valueText(dto.introduction, String)}</p>
          <dl className="mb-0 mt-4 border-t border-hair">
            {'foundDate' in dto && <FieldRow label="平台列示日期（原值）" field={dto.foundDate} format={String} />}
            <FieldRow label="机构面积" field={dto.areaSqm} format={value => value.toLocaleString('zh-CN') + ' ㎡'} />
            <FieldRow label="功能定位" field={overview.functionPositioning} format={String} />
            <FieldRow label="平台标签原文（资格未核）" field={overview.tags} format={value => value.length ? value.join('、') : '来源记录 0 项'} />
          </dl>
        </section>

        <section id="mca-public-service" className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
          <h2 className="m-0 text-xl font-semibold">服务信息</h2>
          <p className="mb-0 mt-1 text-xs text-sub">来源缺项不代表机构不提供相应服务。</p>
          <dl className="mb-0 mt-4 border-t border-hair">{dto.serviceFields.map(item => <FieldRow key={item.label} label={item.label} field={item.field} format={String} />)}</dl>
        </section>

        {dto.hasSubServices && <section id="mca-public-subservices" className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
          <h2 className="m-0 text-xl font-semibold">其他服务类型</h2>
          <p className="mb-0 mt-1 text-xs leading-5 text-sub">喘息、日托、上门和能力评估是独立服务；床位与费用不并入机构养老。</p>
          <div className="mt-4"><SubServiceBlock title="喘息服务" data={dto.subServices.respite} /><SubServiceBlock title="日托服务" data={dto.subServices.dayCare} /><SubServiceBlock title="上门服务" data={dto.subServices.homeVisit} />
            {(dto.subServices.assessment.home.state !== 'missing' || dto.subServices.assessment.site.state !== 'missing') && <div className="border-t border-hair py-5">
              <h3 className="m-0 text-base font-semibold">能力评估</h3>
              <dl className="mb-0 mt-2"><FieldRow label="上门评估费（元）" field={dto.subServices.assessment.home} format={value => value.toLocaleString('zh-CN')} /><FieldRow label="站点评估费（元）" field={dto.subServices.assessment.site} format={value => value.toLocaleString('zh-CN')} /></dl>
              {(dto.subServices.assessment.home.value === 0 || dto.subServices.assessment.site.value === 0) && <p className="mb-0 mt-1 text-xs text-caution">原值为 0，不代表免费。</p>}
            </div>}
          </div>
        </section>}

        <section id="mca-public-contact" className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
          <h2 className="m-0 text-xl font-semibold">联系与核对</h2>
          <dl className="mb-0 mt-3 border-t border-hair"><FieldRow label="联系人" field={overview.contactName} format={String} />
            <div className="grid min-w-0 gap-1 border-b border-hair py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5"><dt className="text-sm text-body">联系电话</dt><dd className="m-0 break-all text-sm font-medium">{overview.contactHref ? <a href={overview.contactHref}>{valueText(overview.contactPhone, String)}</a> : valueText(overview.contactPhone, String)}</dd></div>
          </dl>
          <p className="mb-0 mt-3 text-xs leading-5 text-sub">联系方式来自来源快照；联系前请核对。</p>
          <p className="mb-0 mt-2 text-xs leading-5 text-sub">{dto.evaluationSummary}</p>
        </section>

        {articles.length > 0 && <section id="mca-public-articles" className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
          <h2 className="m-0 text-xl font-semibold">机构相关文章</h2>
          <p className="mb-0 mt-2 text-sm leading-6 text-sub">本站依据注明时点的资料整理文章；文章不替代机构档案，也不证明当前在营、空床或最新报价。</p>
          <ul className="mb-0 mt-4 divide-y divide-hair border-t border-hair pl-0">
            {articles.map(article => <li key={article.slug} className="list-none py-4">
              <a href={sitePath(institutionArticleHref(source.mcaId, article.slug))} className="block min-h-11 max-w-full break-words py-2.5 text-base font-semibold leading-6 text-brand-ink underline-offset-4 hover:underline">{article.title}</a>
              <p className="mb-0 mt-1 break-words text-sm leading-6 text-body">{article.summary}</p>
              <p className="mb-0 mt-2 break-words text-xs leading-5 text-sub">发布于 <time dateTime={article.publishedAt}>{article.publishedAt}</time> · 资料观察于 <time dateTime={article.evidenceAsOf}>{article.evidenceAsOf}</time></p>
            </li>)}
          </ul>
        </section>}

        <section id="mca-public-source" className="scroll-mt-20 rounded-card border border-line bg-white p-5 shadow-card sm:p-7">
          <h2 className="m-0 text-xl font-semibold">来源与时间</h2>
          <p className="mb-0 mt-3 text-sm text-body">平台 ID：<span className="break-all font-mono">{source.mcaId}</span></p>
          {observedSource && <><p className="mb-0 mt-2 break-words text-sm text-body">该机构详情采集时间：<ObservedTimeRange range={observedSource.detailObservedAtUtc} /> · 详情观察 {observedSource.detailObservationCount} 次</p>
            {observedSource.listObservedAtUtc && <p className="mb-0 mt-2 break-words text-sm text-body">该机构列表采集时间：<ObservedTimeRange range={observedSource.listObservedAtUtc} /> · 列表观察 {observedSource.listObservationCount} 次</p>}
            <p className="mb-0 mt-2 text-sm text-sub">本批次最晚采集时间：<time dateTime={observedSource.snapshotCapturedAtUtc}>{observedSource.snapshotCapturedAtUtc}</time></p></>}
          {csvSource && <><p className="mb-0 mt-2 break-words text-sm text-body">采集器记录时间（本地时间，时区未提供）：{csvSource.csvUpdatedAtLocal}</p>
            <p className="mb-0 mt-2 text-sm text-sub">CSV 文件日期：{csvSource.csvExportDate} · 采集状态原值：{csvSource.collectorStatus}（不是机构在营状态）</p></>}
          <p className="mb-0 mt-2 text-sm text-body">来源页面：<a href={source.sourcePage} target="_blank" rel="noopener noreferrer">全国养老服务信息平台 ↗</a></p>
          <p className="mb-0 mt-4 text-sm text-caution">快照不代表实时在营、实时空床或最新报价；请联系机构并核对官网原页。</p>
          {observedSource ? <details className="rounded-md border border-line bg-page p-4 open:bg-white">
            <summary className="min-h-10 cursor-pointer font-medium text-brand-ink">来源原值</summary>
            <div className="mt-4 border-t border-hair pt-3">
              <p className="mb-0 text-xs leading-5 text-sub">以下保留未释义的原码、原始坐标与完整索引字段，仅供核对；不能据此推断等级、补贴或定位。</p>
              <dl className="mb-0 mt-3"><FieldRow label="星级原码" field={observedSource.starCode} format={String} /><FieldRow label="补贴原码" field={observedSource.subsidyCode} format={String} /><FieldRow label="平台原始坐标（未定位核验）" field={observedSource.pointRaw} format={String} /></dl>
              {observedSource.listObservationCount > 0 && <><h3 className="mb-0 mt-5 text-base font-semibold">平台列表补充字段</h3><dl className="mb-0 mt-2">{observedSource.listExtras.map(item => <FieldRow key={item.label} label={item.label} field={item.field} format={value => typeof value === 'number' ? numberText(value) : value} />)}</dl></>}
              <h3 className="mb-0 mt-5 text-base font-semibold">全部已映射索引字段</h3>
              <dl className="mb-0 mt-2 grid gap-x-8 sm:grid-cols-2">{observedSource.facts.map(fact => <div key={fact.key} className="min-w-0 border-b border-hair py-3 text-sm"><dt className="font-medium">{fact.label}</dt><dd className={'m-0 mt-1 break-words ' + (fact.state === 'conflict' ? 'text-caution' : '')}>{fact.text}</dd>{fact.warning && <dd className="m-0 mt-1 text-xs text-caution">{fact.warning}</dd>}{fact.source && <dd className="m-0 mt-1 text-xs text-sub">{fact.source.channelLabel} · {fact.source.fetchedAtUtc ?? '采集时间未提供'}</dd>}</div>)}</dl>
            </div>
          </details> : csvSource && <details className="rounded-md border border-line bg-page p-4 open:bg-white">
            <summary className="min-h-10 cursor-pointer font-medium text-brand-ink">来源原值</summary>
            <div className="mt-4 border-t border-hair pt-3">
              <p className="mb-0 text-xs leading-5 text-sub">以下保留本次 CSV 中可公开的 51 个字段及原始口径。风险原码不代表本站评级，采集状态不代表机构在营。</p>
              <dl className="mb-0 mt-3 grid gap-x-8 sm:grid-cols-2">{csvSource.rawFields.map(field => <div key={field.key} className="min-w-0 border-b border-hair py-3 text-sm">
                <dt className="font-medium">{field.label} <code className="break-all text-xs font-normal text-sub">{field.key}</code></dt>
                <dd className="m-0 mt-1 whitespace-pre-wrap break-words text-body">{field.text}</dd>
              </div>)}</dl>
              <p className="mb-0 mt-3 break-all text-xs text-sub">CSV 原件 SHA-256：{csvSource.sourceCsvSha256}</p>
            </div>
          </details>}
          <React.Suspense fallback={<a href={sitePath('/quanguo/pingtai/')} className="mt-5 inline-flex min-h-11 items-center font-semibold">← 返回机构目录</a>}>
            <McaDetailReturnLink />
          </React.Suspense>
        </section>
      </div>
    </div>
  </div>;
}
