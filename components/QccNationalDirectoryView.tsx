'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { QccNationalIndex, QccNationalManifest } from '@/lib/qcc-national-types';
import type { QccIndex } from '@/lib/qcc-types';
import type { QccNationalSearchParams } from '@/lib/qcc-national-search';
import { findNationalCity, loadNationalCityIndex, loadNationalManifest, searchNationalQccRecords } from '@/lib/qcc-national-search';
import { isQccStatusCaution, loadQccIndex, qccStatusCategory, searchQccRecords } from '@/lib/qcc-search';
import { GUANGDONG_PROVINCE_SLUG, guangdongCityOptions, unifiedQccListHref } from '@/lib/qcc-unified-search';
import { sitePath } from '@/lib/site-path';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: QccNationalManifest; index: QccNationalIndex | null; guangdongIndex: QccIndex | null; locationKey: string };

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function QccNationalDirectoryContent({ manifest, index, guangdongIndex = null, query }: { manifest: QccNationalManifest; index: QccNationalIndex | null; guangdongIndex?: QccIndex | null; query: QccNationalSearchParams }) {
  const isGuangdong = query.province === GUANGDONG_PROVINCE_SLUG;
  const guangdongCities = guangdongIndex ? guangdongCityOptions(guangdongIndex) : [];
  const selectedProvince = isGuangdong ? { slug: GUANGDONG_PROVINCE_SLUG, name: '广东省', count: guangdongIndex?.records.length ?? 0, cities: guangdongCities } : manifest.provinces.find(item => item.slug === query.province);
  const selectedCity = selectedProvince?.cities.find(item => item.slug === query.city);
  const [draftProvince, setDraftProvince] = useState(selectedProvince?.slug ?? '');
  const provinceOptions = [
    ...manifest.provinces.map(item => ({ slug: item.slug, name: item.name, count: item.count })),
    { slug: GUANGDONG_PROVINCE_SLUG, name: '广东省', count: null },
  ].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  const draftCities = draftProvince === GUANGDONG_PROVINCE_SLUG ? guangdongCities : manifest.provinces.find(item => item.slug === draftProvince)?.cities ?? [];
  const invalidLocation = Boolean((query.province && !selectedProvince) || (query.city && !selectedCity));
  const result = invalidLocation ? null : isGuangdong && guangdongIndex ? { ...searchQccRecords(guangdongIndex.records, query), province: GUANGDONG_PROVINCE_SLUG } : selectedCity && index ? searchNationalQccRecords(index, query) : null;
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
  const returnTo = result ? unifiedQccListHref({ ...result, page: result.page }) : unifiedQccListHref({ province: query.province, city: query.city });
  const activeRecords = isGuangdong ? guangdongIndex?.records : index?.records;
  const types = activeRecords ? distinct(activeRecords.map(item => item.subjectType)) : [];
  const statuses = activeRecords ? distinct(activeRecords.map(item => qccStatusCategory(item.registrationStatus))) : [];

  return <div className="directory-workspace">
    <aside className="directory-sidebar" aria-label="查找条件">
      <details ref={filterRef} open className="filter-panel">
        <summary className="cursor-pointer text-[16px] font-semibold text-ink">查找条件</summary>
        <div className="mt-4 flex flex-col gap-4 border-t border-hair pt-4">
    <form action={sitePath('/quanguo/zhuti/')} method="get" aria-label="选择省份和城市" className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="national-province" className="text-[13px] font-semibold">省级地区</label><select id="national-province" name="province" value={draftProvince} onChange={event => setDraftProvince(event.target.value)} className="input"><option value="">选择省份</option>{provinceOptions.map(province => <option key={province.slug} value={province.slug}>{province.name}（{province.count === null ? '独立快照' : province.count.toLocaleString('zh-CN') + ' 条'}）</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="national-city" className="text-[13px] font-semibold">城市</label><select key={draftProvince} id="national-city" name="city" defaultValue={draftProvince === selectedProvince?.slug ? selectedCity?.slug ?? '' : ''} disabled={!draftProvince || (draftProvince === GUANGDONG_PROVINCE_SLUG && !guangdongIndex)} required={draftProvince !== GUANGDONG_PROVINCE_SLUG} className="input disabled:bg-page disabled:text-sub"><option value="">{draftProvince === GUANGDONG_PROVINCE_SLUG ? '全部城市' : '选择城市'}</option>{draftCities.map(city => <option key={city.slug} value={city.slug}>{city.name}（{city.count.toLocaleString('zh-CN')} 条）</option>)}</select></div>
      {query.q && <input type="hidden" name="q" value={query.q} />}
      <button type="submit" className="btn-primary w-full">查看候选</button>
    </form>
    {result && <form key={[result.province, result.city, result.q, result.type, result.status].join('|')} action={sitePath('/quanguo/zhuti/')} method="get" role="search" aria-label="检索全国登记主体候选" className="flex flex-col gap-3 border-t border-hair pt-4">
        <input type="hidden" name="province" value={result.province} />{result.city && <input type="hidden" name="city" value={result.city} />}
        <div className="flex min-w-0 flex-col gap-1"><label htmlFor="national-q" className="text-[13px] font-semibold">名称关键词</label><input id="national-q" name="q" type="search" defaultValue={result.q} maxLength={80} placeholder="输入登记主体名称" className="input" /></div>
        <div className="flex min-w-0 flex-col gap-1"><label htmlFor="national-type" className="text-[13px] font-semibold">主体类型</label><select id="national-type" name="type" defaultValue={result.type} className="input"><option value="">全部类型</option>{types.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
        <div className="flex min-w-0 flex-col gap-1"><label htmlFor="national-status" className="text-[13px] font-semibold">登记状态类别</label><select id="national-status" name="status" defaultValue={result.status} className="input"><option value="">全部状态</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select></div>
        <button type="submit" className="btn-primary w-full">检索候选</button>
      </form>}
        </div>
      </details>
    </aside>
    <div className="directory-results">
    <div className="notice"><p className="m-0">全国登记主体候选来自两批企查查宽口径导出快照。登记主体不等于备案养老机构，登记状态不证明目前提供养老服务。查询前请核对最新登记与服务状态。<a href={sitePath('/quanguo/laiyuan/')} className="underlink ml-1">查看已收录的官方来源记录</a>。</p></div>
    {invalidLocation && <div className="notice" role="alert">省市参数无效，请重新选择列表中的省份和城市。<a href={sitePath('/quanguo/zhuti/')} className="underlink ml-2">清除地区条件</a></div>}
    {!result && !invalidLocation && <div className="card p-6"><h2 className="m-0 text-lg font-semibold">选择省份和城市</h2><p className="mt-2 text-body">跨省快照选定城市后读取该城市索引；广东可先选省，再筛城市。跨省原始导出共 {manifest.rowCount.toLocaleString('zh-CN')} 行，广东由另一份快照按需读取；这些不是养老机构数量。</p></div>}
    {result && <>
      {(result.q || result.type || result.status) && <p className="m-0 text-[13px] text-sub">当前条件：{[result.q, result.type, result.status].filter(Boolean).join(' · ')} · <a href={sitePath(unifiedQccListHref({ province: result.province, city: result.city }))} className="underlink">清除筛选</a></p>}
      {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath(unifiedQccListHref({ province: result.province, city: result.city }))} className="underlink">查看当前地区全部候选</a></div>}
      <div className="results-heading"><p className="m-0 text-[15px]" role="status" aria-live="polite">{selectedProvince?.name} · {selectedCity?.name ?? '全部城市'} · 匹配 <b>{result.total}</b> 条登记主体候选</p><span className="text-[13px] text-sub">按导出行号顺序展示 · 同名不同来源行分别保留</span></div>
      {result.total === 0 ? <div className="card p-8 text-center"><h2 className="m-0 text-lg font-semibold">没有找到候选记录</h2><p className="mt-2 text-body">缩短关键词或放宽主体类型与登记状态后重试。</p><a href={sitePath(unifiedQccListHref({ province: result.province, city: result.city }))} className="btn-outline mt-3">查看当前地区全部候选</a></div> : <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="全国登记主体候选列表">{result.items.map(record => {
        const detailQuery = isGuangdong ? new URLSearchParams({ id: record.id, from: returnTo }) : new URLSearchParams({ province: result.province, city: result.city, id: record.id, from: returnTo });
        const detailHref = sitePath((isGuangdong ? '/guangdong/zhuti/detail/?' : '/quanguo/zhuti/detail/?') + detailQuery);
        const caution = isQccStatusCaution(record.registrationStatus);
        const sourceFile = 'sourceId' in record ? manifest.sourceFiles.find(file => file.id === record.sourceId)?.filename ?? '企查查导出快照' : '广东企查查导出快照';
        const exportedAt = isGuangdong && guangdongIndex ? guangdongIndex.exportedAt : manifest.exportedAt;
        return <li key={record.id} className="min-w-0"><article className="record-card"><div className="flex flex-col gap-3 px-5 py-4 sm:py-5"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="m-0 min-w-0 break-words text-[18px] font-semibold leading-snug"><a href={detailHref} className="text-ink no-underline hover:text-brand">{record.name}</a></h3><span className={'tag shrink-0 ' + (caution ? 'text-caution' : '')}>{record.registrationStatus || '登记状态未提供'}</span></div><p className="m-0 text-[14px] text-body">地区：{selectedProvince?.name} · {record.city}{record.district ? ' · ' + record.district : ''}</p><p className="m-0 text-[14px] text-body">主体类型：{record.subjectType || '类型未提供'}</p></div><footer aria-label="来源与核对" className="record-evidence"><span className="min-w-0 break-words">{sourceFile} · 原始文件第 {record.rowNumber} 行 · 导出时间 <time dateTime={exportedAt}>{exportedAt}</time></span><a href={detailHref} className="inline-flex min-h-11 items-center font-semibold">查看登记详情 →</a></footer></article></li>;
      })}</ul>}
      {result.total > 0 && <nav aria-label="候选记录分页" className="flex flex-wrap items-center justify-center gap-2">{result.page > 1 && <a href={sitePath(unifiedQccListHref({ ...result, page: result.page - 1 }))} className="btn-outline px-3 text-sm" rel="prev">上一页</a>}<span className="text-[13px] text-sub">第 {result.page} / {result.pageCount} 页 · 每页 20 条</span>{result.page < result.pageCount && <a href={sitePath(unifiedQccListHref({ ...result, page: result.page + 1 }))} className="btn-outline px-3 text-sm" rel="next">下一页</a>}</nav>}
    </>}
    <div className="card p-4"><h2 className="m-0 text-base font-semibold">按省市查登记主体</h2><p className="mb-0 mt-1 text-[14px] text-body">可选大陆 {manifest.provinces.length + 1} 个省级地区。广东与其他省份来自不同来源快照，记录保持原始行号与编号；这些记录不当作去重机构数。</p></div>
    <div className="card p-5 text-[13px] text-sub"><p className="m-0">{isGuangdong && guangdongIndex ? <>来源：广东企查查导出快照，导出时间 <time dateTime={guangdongIndex.exportedAt}>{guangdongIndex.exportedAt}</time>，原始行数 {guangdongIndex.records.length.toLocaleString('zh-CN')}。</> : <>来源：{manifest.sourceFiles.length} 份跨省企查查导出快照，导出时间 <time dateTime={manifest.exportedAt}>{manifest.exportedAt}</time>，原始行数 {manifest.rowCount.toLocaleString('zh-CN')}。</>} 这不是全国养老机构名录，也不是实时登记数据。</p><p className="mb-0 mt-2">广东与其他省份来自不同快照，记录保持各自来源和编号；不据此计算去重机构总数。</p><a href={sitePath(isGuangdong ? '/data/qcc/index.v1.json' : '/data/qcc-national/manifest.v1.json')} className="underlink mt-2 inline-block">查看当前来源快照清单 JSON</a></div>
    </div>
  </div>;
}

export function QccNationalDirectoryView() {
  const params = useSearchParams();
  const query: QccNationalSearchParams = { province: params.get('province') ?? '', city: params.get('city') ?? '', q: params.get('q') ?? '', type: params.get('type') ?? '', status: params.get('status') ?? '', page: params.get('page') ?? '1' };
  const locationKey = (query.province ?? '') + ':' + (query.city ?? '');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    const load = async () => {
      if (query.province === GUANGDONG_PROVINCE_SLUG) {
        const [manifest, guangdongIndex] = await Promise.all([loadNationalManifest(controller.signal), loadQccIndex(controller.signal)]);
        if (!controller.signal.aborted) setState({ status: 'ready', manifest, index: null, guangdongIndex, locationKey });
      } else {
        const manifest = await loadNationalManifest(controller.signal);
        const location = findNationalCity(manifest, query.province ?? '', query.city ?? '');
        const index = location ? await loadNationalCityIndex(manifest, location.province.slug, location.city.slug, controller.signal) : null;
        if (!controller.signal.aborted) setState({ status: 'ready', manifest, index, guangdongIndex: null, locationKey });
      }
    };
    void load().catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '登记主体候选数据读取失败。' });
    });
    return () => controller.abort();
  }, [locationKey, attempt]);
  if (state.status === 'loading' || (state.status === 'ready' && state.locationKey !== locationKey)) return <div className="notice" role="status">正在加载全国登记主体候选清单…</div>;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button><a href={sitePath('/quanguo/zhuti/')} className="underlink ml-4">返回地区选择</a></div>;
  return <QccNationalDirectoryContent key={locationKey} manifest={state.manifest} index={state.index} guangdongIndex={state.guangdongIndex} query={query} />;
}
