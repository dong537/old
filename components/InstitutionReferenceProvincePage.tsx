import { PageTitle } from '@/components/DirectoryUi';
import { referenceListHref } from '@/lib/institution-reference-search';
import { referenceProvincePageHref, referenceProvinceRecordHref } from '@/lib/institution-reference-static';
import type { ReferenceProvincePageData } from '@/lib/institution-reference-static';
import { sitePath } from '@/lib/site-path';

export function InstitutionReferenceProvincePage({ data }: { data: ReferenceProvincePageData }) {
  const { manifest, province, page, pageCount, records } = data;
  return <div className="flex flex-col gap-5">
    <nav aria-label="面包屑" className="text-[13px] text-sub">
      <a href={sitePath('/quanguo/cankao/')} className="underlink">全国养老机构来源线索</a>
      <span className="mx-2" aria-hidden="true">/</span>{province.name}
    </nav>
    <PageTitle title={province.name + '养老机构来源线索'} lead="按来源表原始行序查看名称、地区、地址字段和床位记录；这些来源线索不代表当前在营或官方备案。" />
    <div className="notice" role="note">
      来源：{manifest.source.title}。本省快照共 {province.count.toLocaleString('zh-CN')} 条来源行，资料时点未知，不代表全国全量或当前在营；原表床位不等于当前空床，地址字段未核实。
    </div>
    <section className="section" aria-labelledby="reference-province-city-title">
      <h2 id="reference-province-city-title" className="m-0 text-base font-semibold">城市与原表地区分组</h2>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-[13px]">
        {province.cities.map(city => <li key={city.slug}>
          <a href={sitePath(referenceListHref({ province: province.slug, city: city.slug }))} className="underlink">{city.name}（{city.count.toLocaleString('zh-CN')} 条）</a>
        </li>)}
      </ul>
    </section>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="m-0 text-base font-semibold">来源行 {((page - 1) * 20 + 1).toLocaleString('zh-CN')}–{((page - 1) * 20 + records.length).toLocaleString('zh-CN')}</h2>
      <span className="text-[13px] text-sub">按工作表行序展示 · 同名不合并</span>
    </div>
    <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={province.name + '来源线索列表'}>
      {records.map(record => {
        const href = referenceProvinceRecordHref(province.slug, record.citySlug, record.id, page);
        return <li key={record.id} className="min-w-0">
          <article className="card flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="m-0 min-w-0 break-words text-[17px] font-semibold leading-snug"><a href={href} className="text-ink no-underline hover:text-brand">{record.name}</a></h3>
              <span className="tag shrink-0">企查查来源线索</span>
            </div>
            <p className="m-0 break-words text-[14px] text-body">地区：{record.region}</p>
            <p className="m-0 break-words text-[14px] text-body">原表地址字段（未核实）：{record.address ?? '暂无可公开地址'}</p>
            <p className="m-0 text-[13px] text-sub">工作表第 {record.sourceRow.toLocaleString('zh-CN')} 行 · 原表床位数 {record.beds.toLocaleString('zh-CN')} 张（资料时点未知）</p>
            <a href={href} className="text-[13px]">查看线索与来源 →</a>
          </article>
        </li>;
      })}
    </ul>
    <nav aria-label="省级来源线索分页" className="flex flex-wrap items-center justify-center gap-3">
      {page > 1 && <a href={referenceProvincePageHref(province.slug, page - 1)} className="btn-outline px-3 text-sm" rel="prev">上一页</a>}
      <span className="text-[13px] text-sub">第 {page} / {pageCount} 页 · 每页20条</span>
      {page < pageCount && <a href={referenceProvincePageHref(province.slug, page + 1)} className="btn-outline px-3 text-sm" rel="next">下一页</a>}
    </nav>
    <div className="card p-4 text-[13px] text-sub">
      本站于 <time dateTime={manifest.receivedAt}>{manifest.receivedAt}</time> 接收该文件；接收日不是资料截至日。<a href={sitePath('/data/qcc-institutions/manifest.v1.json')} className="underlink ml-2">查看公开快照清单</a>
    </div>
  </div>;
}
