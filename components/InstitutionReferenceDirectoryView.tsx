'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  findReferenceCity, loadReferenceIndex, loadReferenceManifest, loadReferenceProvinceIndexes,
  referenceListHref, searchReferenceProvinceRecords, searchReferenceRecords,
} from '@/lib/institution-reference-search';
import type { ReferenceSearchParams } from '@/lib/institution-reference-search';
import type { ReferenceIndex, ReferenceManifest } from '@/lib/institution-reference-types';
import { sitePath } from '@/lib/site-path';
import { DirectoryPager, ListSkeleton, RecordFacts } from './DirectoryUi';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: ReferenceManifest; index: ReferenceIndex | null; provinceIndexes: ReferenceIndex[] | null; locationKey: string };

export function InstitutionReferenceDirectoryContent({ manifest, index, provinceIndexes = null, query }: { manifest: ReferenceManifest; index: ReferenceIndex | null; provinceIndexes?: ReferenceIndex[] | null; query: ReferenceSearchParams }) {
  const selectedProvince = manifest.provinces.find(item => item.slug === query.province);
  const selectedCity = selectedProvince?.cities.find(item => item.slug === query.city);
  const [draftProvince, setDraftProvince] = useState(selectedProvince?.slug ?? '');
  const draftCities = manifest.provinces.find(item => item.slug === draftProvince)?.cities ?? [];
  const invalidLocation = Boolean((query.province && !selectedProvince) || (query.city && !selectedCity));
  const result = selectedCity && index ? searchReferenceRecords(index, query) :
    selectedProvince && !query.city && provinceIndexes ? searchReferenceProvinceRecords(manifest, provinceIndexes, query) : null;
  const filterRef = useRef<HTMLDetailsElement>(null);
  const hasResult = Boolean(result);
  useEffect(() => {
    const filter = filterRef.current;
    if (!filter) return;
    const mobile = window.matchMedia('(max-width: 1023px)');
    const sync = () => { filter.open = !hasResult || !mobile.matches; };
    sync();
    mobile.addEventListener('change', sync);
    return () => mobile.removeEventListener('change', sync);
  }, [hasResult]);
  const returnTo = result ? referenceListHref({ ...result, page: result.page }) : '/quanguo/cankao/';
  const pendingKeyword = [...(query.q ?? '').trim()].slice(0, 80).join('');

  return <div className="flex min-w-0 flex-col gap-5">
    <form key={returnTo + '|' + pendingKeyword} action={sitePath('/quanguo/cankao/')} method="get" role="search" aria-label="检索养老机构来源线索" className="border border-line bg-white px-5 py-4 sm:px-6">
      {selectedProvince && <input type="hidden" name="province" value={selectedProvince.slug} />}
      {selectedCity && <input type="hidden" name="city" value={selectedCity.slug} />}
      <label htmlFor="reference-q" className="mb-2 block text-[14px] font-semibold">机构名称或场所地址</label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row"><input id="reference-q" name="q" type="search" defaultValue={result?.q ?? pendingKeyword} maxLength={80} placeholder="输入机构名称或地址" className="input flex-1" /><button type="submit" className="btn-primary shrink-0">检索线索</button></div>
    </form>
    <div className="directory-workspace">
    <aside className="directory-sidebar" aria-label="查找条件">
      <details ref={filterRef} open className="filter-panel">
        <summary className="cursor-pointer text-[16px] font-semibold text-ink">查找条件</summary>
        <div className="mt-4 flex flex-col gap-4 border-t border-hair pt-4">
    <form action={sitePath('/quanguo/cankao/')} method="get" aria-label="选择线索省份和可选城市" className="flex flex-col gap-3">
      {pendingKeyword && <input type="hidden" name="q" value={pendingKeyword} />}
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="reference-province" className="text-[13px] font-semibold">省级地区</label><select id="reference-province" name="province" value={draftProvince} onChange={event => setDraftProvince(event.target.value)} required className="input"><option value="">选择省份</option>{manifest.provinces.map(province => <option key={province.slug} value={province.slug}>{province.name}（{province.count.toLocaleString('zh-CN')} 条）</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="reference-city" className="text-[13px] font-semibold">城市或原表地区分组（可选）</label><select key={draftProvince} id="reference-city" name="city" defaultValue={draftProvince === selectedProvince?.slug ? selectedCity?.slug ?? '' : ''} disabled={!draftProvince} className="input disabled:bg-page disabled:text-sub"><option value="">全部地区</option>{draftCities.map(city => <option key={city.slug} value={city.slug}>{city.name}（{city.count.toLocaleString('zh-CN')} 条）</option>)}</select></div>
      <button type="submit" className="btn-primary w-full">查看线索</button>
    </form>
        </div>
      </details>
    </aside>
    <div className="directory-results">
    {!result && <p className="m-0 border-l-2 border-brand bg-brand-tint px-4 py-3 text-[14px] text-body" role="note">这是企查查来源线索，不是官方备案名单；资料时点未知，当前在营与床位情况需另行核实。</p>}
    {invalidLocation && <div className="notice" role="alert">地区参数无效，请重新选择省市。<a href={sitePath('/quanguo/cankao/')} className="underlink ml-2">清除条件</a></div>}
    {!selectedProvince && !invalidLocation && <div className="card p-6"><h2 className="m-0 text-lg font-semibold">选择省份</h2>{pendingKeyword && <p className="mt-2 text-body" role="status">先选择省份，再检索“{pendingKeyword}”。</p>}<p className="mt-2 text-body">选定省份后读取该省的来源行；可进一步限定城市或原表地区分组。地市根据原表行政区划和“地区”字段分组，原表未标明的地方单列。</p></div>}
    {result && <>
      <div className="results-heading"><h2 className="m-0 text-lg font-semibold">{selectedProvince?.name} · {selectedCity?.name ?? '全部地区'}</h2><span className="text-[13px] text-sub">此范围 {(selectedCity?.count ?? selectedProvince?.count ?? 0).toLocaleString('zh-CN')} 条来源行</span></div>
      {result.q && <p className="m-0 text-[13px] text-sub">当前关键词：{result.q} · <a href={sitePath(referenceListHref({ province: result.province, city: result.city }))} className="underlink">清除关键词</a></p>}
      {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath(referenceListHref({ province: result.province, city: result.city }))} className="underlink">查看当前地区全部线索</a></div>}
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="m-0 text-[15px]" role="status" aria-live="polite">匹配 <b>{result.total}</b> 条来源线索</p><span className="text-[13px] text-sub">按工作表行序展示 · 同名不合并</span></div>
      <p className="source-rule m-0" role="note">{manifest.source.title} · 资料时点未知。来源行不是已核实机构数，原表床位不等于当前空床。列表地址可能因原表空白、含联系方式或以机构名称占位而不展示；原始地址和经纬度未经核实，不能用于导航。</p>
      {result.total === 0 ? <div className="card p-8 text-center"><h2 className="m-0 text-lg font-semibold">没有找到线索</h2><p className="mt-2 text-body">缩短关键词或换一个地区重试。</p><a href={sitePath(referenceListHref({ province: result.province, city: result.city }))} className="btn-outline mt-3">查看当前地区全部线索</a></div> : <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="全国养老机构来源线索列表">{result.items.map(record => {
        const search = new URLSearchParams({ province: result.province, city: record.citySlug, id: record.id, from: returnTo });
        const href = sitePath('/quanguo/cankao/detail/?' + search);
        return <li key={record.id} className="min-w-0"><article className="record-card">
          <div className="flex flex-col gap-3 px-5 py-4 sm:py-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="m-0 min-w-0 break-words text-[18px] font-semibold leading-snug"><a href={href} className="text-ink no-underline hover:text-brand">{record.name}</a></h3><span className="tag shrink-0">企查查来源线索</span></div>
            <div className="grid gap-2 text-[14px] text-body"><p className="m-0 break-words">地区：{record.region}</p><p className="m-0 break-words">原表地址字段（未核实）：{record.address ?? '暂无可公开地址'}</p></div>
            <RecordFacts items={[
              { label: '原表床位数', value: record.beds.toLocaleString('zh-CN') + ' 张' },
              { label: '护理型床位', value: null },
              { label: '月费用', value: null },
              { label: '机构星级', value: null },
            ]} />
          </div>
          <footer aria-label="来源与核对" className="record-evidence">
            <span className="min-w-0 break-words">{manifest.source.title} · 工作表第 {record.sourceRow} 行 · 资料时点未知</span>
            <a href={href} className="inline-flex min-h-11 items-center font-semibold">查看线索与来源 →</a>
          </footer>
        </article></li>;
      })}</ul>}
      {result.total > 0 && <DirectoryPager label="来源线索分页" page={result.page} pageCount={result.pageCount} hint="每页 20 条" hrefFor={next => sitePath(referenceListHref({ ...result, page: next }))} />}
    </>}
    <details className="card p-4 text-[14px] text-body"><summary className="cursor-pointer font-semibold text-ink">查看来源定位，再核对官方资料</summary><p className="mb-0 mt-3">文件覆盖 {manifest.provinces.length} 个省级分组、{manifest.rowCount.toLocaleString('zh-CN')} 条来源行。重复名称及同一登记代码对应多处场所均保留为原始行，不计作独立在营机构数。原始 XLSX 未公开，所列工作表行号用于资料复核；打开详情可查看全部 11 个原列名和非联系字段原值，含联系方式的自由文本整格显示“[已遮蔽]”，私有原件保留不变。检索和地区分组仍使用整理后的字段。</p><p className="mb-0 mt-2">本站于 <time dateTime={manifest.receivedAt}>{manifest.receivedAt}</time> 接收此文件；接收日不是资料截至日。<a href={sitePath('/data/qcc-institutions/manifest.v1.json')} className="underlink ml-2">查看公开快照清单</a></p><a href={sitePath('/quanguo/laiyuan/')} className="mt-3 inline-block font-semibold">查看官方来源记录 →</a></details>
    </div>
    </div>
  </div>;
}

export function InstitutionReferenceDirectoryView() {
  const params = useSearchParams();
  const query: ReferenceSearchParams = { province: params.get('province') ?? '', city: params.get('city') ?? '', q: params.get('q') ?? '', page: params.get('page') ?? '1' };
  const locationKey = (query.province ?? '') + ':' + (query.city ?? '');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadReferenceManifest(controller.signal).then(async manifest => {
      const location = findReferenceCity(manifest, query.province ?? '', query.city ?? '');
      const province = manifest.provinces.find(item => item.slug === query.province);
      const index = location ? await loadReferenceIndex(manifest, location.province.slug, location.city.slug, controller.signal) : null;
      const provinceIndexes = !query.city && province ? await loadReferenceProvinceIndexes(manifest, province.slug, controller.signal) : null;
      if (!controller.signal.aborted) setState({ status: 'ready', manifest, index, provinceIndexes, locationKey });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '养老机构线索读取失败。' });
    });
    return () => controller.abort();
  }, [locationKey, attempt]);
  if (state.status === 'loading' || (state.status === 'ready' && state.locationKey !== locationKey)) return <ListSkeleton label="正在加载来源线索…" />;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button><a href={sitePath('/quanguo/cankao/')} className="underlink ml-4">返回地区选择</a></div>;
  return <InstitutionReferenceDirectoryContent key={locationKey} manifest={state.manifest} index={state.index} provinceIndexes={state.provinceIndexes} query={query} />;
}
