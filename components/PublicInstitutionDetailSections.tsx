import type { DetailFact, PublicInstitutionDetailDto } from '@/lib/institution-detail-dto';
import { sitePath } from '@/lib/site-path';
import { InstitutionServiceIcon, type InstitutionServiceIconKind } from '@/components/InstitutionServiceIcon';

function valueText<T>(field: DetailFact<T>, format: (value: T) => string): string {
  return field.availability === 'recorded' && field.value !== null ? format(field.value) : '本来源未提供';
}

function SectionHeading({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <h2 className={'m-0 text-[19px] text-ink lg:text-[22px] ' + (accent
    ? 'border-l-[3px] border-brand pl-3 font-semibold' : 'font-normal')}>{children}</h2>;
}

export function PublicInstitutionHero({ dto, sourceLabel, sourceTitle, sourceDate, sourceHref, sourceLinkLabel = '打开来源原文', sourceLink, returnHref, returnLabel = '返回目录', returnLink, contactPhoneNode, children }: {
  dto: PublicInstitutionDetailDto;
  sourceLabel: string;
  sourceTitle: string;
  sourceDate: string | null;
  sourceHref?: string;
  sourceLinkLabel?: string;
  sourceLink?: React.ReactNode;
  returnHref: string;
  returnLabel?: string;
  returnLink?: React.ReactNode;
  contactPhoneNode?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const profile = dto.profile;
  return <section id="overview" tabIndex={-1} className="relative overflow-hidden border border-line bg-brand-tint bg-[linear-gradient(180deg,#E8F3F2_0%,#F5F7F8_100%)] px-5 py-6 sm:px-8 sm:py-8 lg:px-20 lg:pb-8 lg:pt-10">
    <div className="relative">
      <h1 className="m-0 max-w-[920px] break-words text-[27px] font-semibold leading-tight sm:text-[34px] lg:text-[36px]">{dto.name}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]"><strong className="rounded-sm bg-brand px-2 py-1 font-semibold text-white">{sourceLabel}</strong><span className="text-body">{sourceTitle} · 资料截至 {sourceDate ?? '原文未说明'}</span></div>
      <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-sm border border-brand-line bg-white/70 px-2 py-1">设施类型：{valueText(profile.facilityType, String)}</span>
        <span className="rounded-sm border border-brand-line bg-white/70 px-2 py-1">机构星级：{valueText(profile.starLevel, String)}</span>
        <span className="rounded-sm border border-brand-line bg-white/70 px-2 py-1">养老消费补贴：{valueText(profile.subsidyStatus, String)}</span>
        {profile.tags.availability === 'recorded'
          ? profile.tags.value?.length
            ? profile.tags.value.map(tag => <span key={tag} className="rounded-sm border border-brand-line bg-white/70 px-2 py-1">{tag}</span>)
            : <span className="rounded-sm border border-brand-line bg-white/70 px-2 py-1">机构标签：来源记录 0 项</span>
          : <span className="rounded-sm border border-brand-line bg-white/70 px-2 py-1">机构标签：本来源未提供</span>}
      </div>
      <p className="mb-0 mt-4 text-[14px] leading-6 text-body">功能定位：{valueText(profile.functionPositioning, String)}</p>
      <dl className="mb-0 mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-[13px] text-body">
        <div className="flex gap-1"><dt>评价：</dt><dd className="m-0">{dto.reviews.count.availability === 'recorded' && dto.reviews.count.value !== null ? dto.reviews.count.value.toLocaleString('zh-CN') + ' 条（来源记录）' : '评价未提供'}</dd></div>
        <div className="flex gap-1"><dt>评分：</dt><dd className="m-0">{valueText(dto.reviews.score, value => value.toLocaleString('zh-CN'))}</dd></div>
        <div className="flex gap-1"><dt>机构面积：</dt><dd className="m-0">{valueText(profile.areaSqm, value => value.toLocaleString('zh-CN') + ' ㎡')}</dd></div>
        <div className="flex gap-1"><dt>联系人：</dt><dd className="m-0">{valueText(profile.contactName, String)}</dd></div>
        <div className="flex gap-1"><dt>联系电话：</dt><dd className="m-0">{contactPhoneNode ?? valueText(profile.contactPhone, String)}</dd></div>
        <div className="flex min-w-0 gap-1"><dt className="shrink-0">详细地址：</dt><dd className="m-0 min-w-0 break-words">{valueText(dto.address, String)}</dd></div>
      </dl>
      {children}
      {profile.photos.availability === 'recorded' && profile.photos.value?.length
        ? <ul aria-label="机构照片" className="m-0 mt-5 grid max-w-[860px] list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">{profile.photos.value.map((photo, index) => <li key={photo.url + index} className="overflow-hidden border border-line bg-white/60"><img src={photo.url} alt={photo.alt} loading="lazy" className="aspect-[16/9] w-full object-cover" /><p className="m-0 px-3 py-2 text-[13px] text-body">{photo.alt}</p></li>)}</ul>
        : <div aria-label="机构照片" className="mt-5 flex min-h-36 max-w-[860px] items-center justify-center border border-dashed border-line bg-white/45 px-4 text-center text-[13px] text-body">机构照片：{profile.photos.availability === 'recorded' ? '来源记录 0 张' : '本来源未提供'}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] font-semibold">
        {sourceHref && <a href={sourceHref} target="_blank" rel="noopener noreferrer">{sourceLinkLabel} ↗</a>}
        {sourceLink}
        {returnLink ?? <a href={sitePath(returnHref)}>← {returnLabel}</a>}
      </div>
    </div>
  </section>;
}

export function PublicInstitutionBottomNav({ name, items }: { name: string; items: readonly { id: string; label: string }[] }) {
  return <nav aria-label="本页目录" className="flex min-w-0 max-w-full items-center justify-between gap-5 overflow-hidden border-t border-line bg-brand-tint px-4 py-3 sm:px-6">
    <strong className="hidden max-w-[250px] truncate text-[14px] lg:block" title={name}>{name}</strong>
    <div className="flex min-w-0 gap-4 overflow-x-auto whitespace-nowrap text-[13px] font-semibold sm:gap-6">{items.map(item => <a key={item.id} href={sitePath('#' + item.id)}>{item.label}</a>)}</div>
  </nav>;
}

function TextRow({ field, icon }: { field: DetailFact<string>; icon?: InstitutionServiceIconKind }) {
  return <div className="grid min-w-0 gap-2 border-b border-hair py-4 last:border-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-7">
    <dt className="flex items-start gap-2 text-[14px] font-medium text-body">{icon && <InstitutionServiceIcon kind={icon} />}{field.label}</dt>
    <dd className="m-0 min-w-0 whitespace-pre-wrap break-words text-[14px] leading-7 text-ink">{valueText(field, String)}</dd>
  </div>;
}

function feeValue(field: DetailFact<{ min: number; max: number }>) {
  const value = field.value;
  return <><span>{valueText(field, range => '¥' + range.min.toLocaleString('zh-CN') + '–' + range.max.toLocaleString('zh-CN') + ' 元/月')}</span>
    {value && (value.min === 0 || value.max === 0) && <small className="block font-normal text-caution">来源值为 0，不代表免费</small>}</>;
}

function FeeCell({ amount, note }: { amount: DetailFact<{ min: number; max: number }>; note: DetailFact<string> }) {
  return <>{feeValue(amount)}{note.availability === 'recorded' && note.value !== null && <small className="mt-1 block whitespace-pre-wrap break-words font-normal leading-5 text-body">{note.value}</small>}</>;
}

export function PublicInstitutionSummary({ dto }: { dto: PublicInstitutionDetailDto }) {
  return <section aria-label="床位与费用摘要" className="border-y border-line bg-white px-5 py-7 sm:px-8 lg:px-20 lg:py-8">
    <SectionHeading accent>机构养老</SectionHeading>
    <p className="mb-0 mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
      <span>{dto.beds.total.label}：<strong className="font-semibold">{valueText(dto.beds.total, value => value.toLocaleString('zh-CN') + ' 张')}</strong></span>
      <span>{dto.beds.nursing.label}：<strong className="font-semibold">{valueText(dto.beds.nursing, value => value.toLocaleString('zh-CN') + ' 张')}</strong></span>
    </p>
    <div className="mt-5 rounded-sm border border-line">
      <table aria-label="月费用明细" className="block w-full table-fixed text-[14px] sm:table"><tbody className="block sm:table-row-group">
        <tr className="grid grid-cols-[39%_61%] sm:table-row"><th scope="row" className="bg-white font-medium text-body sm:w-[19%]">月总费用</th><td className="font-semibold text-ink sm:w-[31%]"><FeeCell amount={dto.monthlyFees.total} note={dto.monthlyFeeNotes.total} /></td><th scope="row" className="bg-white font-medium text-body sm:w-[19%]">床位费用</th><td className="font-semibold text-ink sm:w-[31%]"><FeeCell amount={dto.monthlyFees.bed} note={dto.monthlyFeeNotes.bed} /></td></tr>
        <tr className="grid grid-cols-[39%_61%] sm:table-row"><th scope="row" className="bg-white font-medium text-body">护理费用</th><td className="font-semibold text-ink"><FeeCell amount={dto.monthlyFees.care} note={dto.monthlyFeeNotes.care} /></td><th scope="row" className="bg-white font-medium text-body">膳食费用</th><td className="font-semibold text-ink"><FeeCell amount={dto.monthlyFees.meal} note={dto.monthlyFeeNotes.meal} /></td></tr>
      </tbody></table>
    </div>
    <p className="mb-0 mt-3 text-[13px] text-sub">仅展示来源记录，不代表当前空床、实际报价或服务承诺。</p>
  </section>;
}

export function PublicInstitutionDetailSections({ dto, extraBasic }: { dto: PublicInstitutionDetailDto; extraBasic?: React.ReactNode }) {
  const chargeItems = dto.chargeItems.value;
  const chargeEmptyText = dto.chargeItems.availability === 'recorded'
    ? '本来源明确记录 0 项分项收费；请向机构核对当前书面报价。'
    : '本来源未提供分项收费表；请向机构核对当前书面报价。';
  const beds = [dto.beds.total, dto.beds.dayCare, dto.beds.fullCare, dto.beds.nursing];
  return <>
    <section id="fields" tabIndex={-1} className="border-y border-line bg-white px-5 py-7 sm:px-8 lg:px-20 lg:py-8"><SectionHeading>基本信息</SectionHeading>
      <div className="mt-5 text-[15px] leading-8 text-ink">
        <h3 className="sr-only">{dto.introduction.label}</h3>
        <p className="m-0 whitespace-pre-wrap break-words">{dto.introduction.availability === 'recorded' && dto.introduction.value !== null ? dto.introduction.value : '本来源未提供机构介绍。'}</p>
      </div>
      <dl className="mb-0 mt-4 border-t border-hair"><div className="grid gap-2 border-b border-hair py-4 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-7"><dt className="text-[14px] font-medium text-body">{dto.profile.areaSqm.label}</dt><dd className="m-0 text-[14px]">{valueText(dto.profile.areaSqm, value => value.toLocaleString('zh-CN') + ' ㎡')}</dd></div><TextRow field={dto.address} /></dl>
      {extraBasic}
      <p className="mb-0 mt-4 text-[13px] leading-6 text-sub">地区：{dto.region}。原表地址未经本站实地核验，请按来源原文核对。</p>
    </section>
    <section id="services" tabIndex={-1} className="border-y border-line bg-white px-5 py-7 sm:px-8 lg:px-20 lg:py-8"><SectionHeading>服务信息</SectionHeading>
      <dl className="mb-0 mt-4"><TextRow field={dto.services.content} icon="content" /><TextRow field={dto.services.team} icon="team" /><TextRow field={dto.services.time} icon="time" /><TextRow field={dto.services.range} icon="range" /><TextRow field={dto.services.notes} icon="notes" /></dl>
      <p className="mb-0 mt-3 text-[13px] text-sub">来源缺项表示未提供资料，不代表机构不提供该服务。</p>
    </section>
    <section id="care" tabIndex={-1} className="border-y border-line bg-white px-5 py-7 sm:px-8 lg:px-20 lg:py-8"><SectionHeading>机构养老</SectionHeading>
      <h3 className="mb-0 mt-5 text-[15px] font-semibold">床位信息</h3>
      <dl className="m-0 mt-2 flex flex-wrap gap-x-8 gap-y-3 border-b border-hair pb-4 text-[14px]">{beds.map(field => <div key={field.label} className="flex gap-1"><dt>{field.label}：</dt><dd className="m-0 font-semibold tabular-nums">{valueText(field, value => value.toLocaleString('zh-CN') + ' 张')}</dd></div>)}</dl>
      {(dto.beds.residents.availability === 'recorded' || dto.beds.staff.availability === 'recorded') && <dl className="m-0 flex flex-wrap gap-x-8 gap-y-3 border-b border-hair py-4 text-[14px]">{[dto.beds.residents, dto.beds.staff].map(field => <div key={field.label} className="flex gap-1"><dt>{field.label}：</dt><dd className="m-0 font-semibold tabular-nums">{valueText(field, value => value.toLocaleString('zh-CN') + ' 人')}</dd></div>)}</dl>}
      <h3 className="mb-0 mt-6 text-[15px] font-semibold">收费标准</h3>
      {dto.chargeItems.availability === 'recorded' && chargeItems && chargeItems.length > 0
        ? <div aria-label="分项收费（窄屏）" className="mt-3 space-y-3 sm:hidden">{chargeItems.map((item, index) => <div key={index} className="min-w-0 border border-hair p-4 text-[14px]"><h4 className="m-0 font-semibold">{item.name}</h4><p className="mb-0 mt-2 whitespace-pre-wrap break-words text-body">{item.description}</p><p className="mb-0 mt-2 whitespace-pre-wrap break-words">收费标准：{item.standard}</p></div>)}</div>
        : <p aria-label="分项收费（窄屏）" className="mb-0 mt-3 border border-hair p-4 text-[14px] text-sub sm:hidden">{chargeEmptyText}</p>}
      <div className="mt-3 hidden overflow-x-auto sm:block"><table aria-label="分项收费标准" className="min-w-[600px] border border-hair text-[14px]"><thead><tr><th scope="col" className="w-[22%] border border-hair bg-[#F2F2F2] text-center font-medium">项目名称</th><th scope="col" className="border border-hair bg-[#F2F2F2] text-center font-medium">项目说明</th><th scope="col" className="w-[24%] border border-hair bg-[#F2F2F2] text-center font-medium">收费标准</th></tr></thead><tbody>{dto.chargeItems.availability === 'recorded' && chargeItems && chargeItems.length > 0 ? chargeItems.map((item, index) => <tr key={index} className="even:bg-[#F2F2F2]"><td className="border border-hair text-center">{item.name}</td><td className="whitespace-pre-wrap border border-hair text-center">{item.description}</td><td className="whitespace-pre-wrap border border-hair text-center">{item.standard}</td></tr>) : <tr><td colSpan={3} className="border border-hair py-6 text-center text-sub">{chargeEmptyText}</td></tr>}</tbody></table></div>
      <p className="mb-0 mt-3 text-[13px] text-sub">床位数量为来源记录值，不代表当前空床。</p>
    </section>
    <section id="reviews" tabIndex={-1} className="border-y border-line bg-white px-5 py-7 sm:px-8 lg:px-20 lg:py-8"><SectionHeading>用户评价{dto.reviews.count.availability === 'recorded' && dto.reviews.count.value !== null ? '（' + dto.reviews.count.value.toLocaleString('zh-CN') + '）' : ''}</SectionHeading>
      <p className="mb-0 mt-6 py-8 text-center text-[14px] text-sub">{dto.reviews.count.availability === 'recorded' && dto.reviews.count.value === 0 ? '本来源记录 0 条评价，不代表零分差评。' : dto.reviews.count.availability === 'recorded' && dto.reviews.count.value !== null ? '本来源记录 ' + dto.reviews.count.value.toLocaleString('zh-CN') + ' 条评价；评分口径请以来源为准。' : '本来源未提供用户评价数据。'}</p>
    </section>
  </>;
}
