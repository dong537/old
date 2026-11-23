import { DirectoryPager, PageTitle, RecordFacts } from '@/components/DirectoryUi';
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
    <form action={sitePath('/quanguo/cankao/')} method="get" role="search" aria-label="检索本省养老机构来源线索" className="border border-line bg-white px-5 py-4 sm:px-6">
      <input type="hidden" name="province" value={province.slug} />
      <label htmlFor="reference-province-q" className="mb-2 block text-[14px] font-semibold">机构名称或场所地址</label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row"><input id="reference-province-q" type="search" name="q" maxLength={80} placeholder="在本省来源行中检索" className="input flex-1" /><button type="submit" className="btn-primary shrink-0">检索线索</button></div>
    </form>
    <div className="directory-workspace">
      <aside className="directory-sidebar" aria-label="地区分组">
        <details open className="filter-panel">
          <summary id="reference-province-city-title" className="cursor-pointer text-base font-semibold text-ink">城市与原表地区分组</summary>
          <ul className="m-0 mt-4 flex list-none flex-col gap-1 border-t border-hair p-0 pt-3 text-[14px]">
            {province.cities.map(city => <li key={city.slug} className="min-w-0">
              <a href={sitePath(referenceListHref({ province: province.slug, city: city.slug }))} className="flex min-h-10 items-center justify-between gap-2 rounded px-2 py-1 no-underline hover:bg-brand-tint"><span className="min-w-0 break-words">{city.name}</span><span className="shrink-0 text-[12px] text-sub">{city.count.toLocaleString('zh-CN')} 条</span></a>
            </li>)}
          </ul>
          <a href={sitePath(referenceListHref({ province: province.slug }))} className="btn-outline mt-4 w-full text-sm">按名称检索本省</a>
        </details>
      </aside>
      <div className="directory-results">
    <div className="results-heading">
      <h2 className="m-0 text-base font-semibold">来源行 {((page - 1) * 20 + 1).toLocaleString('zh-CN')}–{((page - 1) * 20 + records.length).toLocaleString('zh-CN')}</h2>
      <span className="text-[13px] text-sub">按工作表行序展示 · 同名不合并</span>
    </div>
    <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={province.name + '来源线索列表'}>
      {records.map(record => {
        const href = referenceProvinceRecordHref(province.slug, record.citySlug, record.id, page);
        return <li key={record.id} className="min-w-0">
          <article className="record-card">
            <div className="flex flex-col gap-3 px-5 py-4 sm:py-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="m-0 min-w-0 break-words text-[18px] font-semibold leading-snug"><a href={href} className="text-ink no-underline hover:text-brand">{record.name}</a></h3>
                <span className="tag shrink-0">企查查来源线索</span>
              </div>
              <p className="m-0 break-words text-[14px] text-body">地区：{record.region}</p>
              <p className="m-0 break-words text-[14px] text-body">原表地址字段（未核实）：{record.address ?? '暂无可公开地址'}</p>
              <RecordFacts items={[
                { label: '原表床位数', value: record.beds.toLocaleString('zh-CN') + ' 张' },
                { label: '护理型床位', value: null },
                { label: '月费用', value: null },
                { label: '机构星级', value: null },
              ]} />
            </div>            <footer aria-label="来源与核对" className="record-evidence">
              <span className="min-w-0 break-words">{manifest.source.title} · 工作表第 {record.sourceRow.toLocaleString('zh-CN')} 行 · 资料时点未知</span>
              <a href={href} className="inline-flex min-h-11 items-center font-semibold">查看线索与来源 →</a>
            </footer>
          </article>
        </li>;
      })}
    </ul>
    <DirectoryPager label="省级来源线索分页" page={page} pageCount={pageCount} hint="每页 20 条" hrefFor={next => referenceProvincePageHref(province.slug, next)} />
    <div className="card p-4 text-[13px] text-sub">
      本站于 <time dateTime={manifest.receivedAt}>{manifest.receivedAt}</time> 接收该文件；接收日不是资料截至日。<a href={sitePath('/data/qcc-institutions/manifest.v1.json')} className="underlink ml-2">查看公开快照清单</a>
    </div>
      </div>
    </div>
  </div>;
}
