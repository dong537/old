'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { findOfficialCity, loadOfficialIndex, loadOfficialManifest, officialListHref, searchOfficialRecords } from '@/lib/national-official-search';
import type { OfficialSearchParams } from '@/lib/national-official-search';
import type { NationalOfficialIndex, NationalOfficialManifest } from '@/lib/national-official-types';
import { officialAddressLabel, officialNameCaution } from '@/lib/national-official-presentation';
import { guangdongOfficialCities, guangdongOfficialListHref, loadGuangdongSourceCatalog } from '@/lib/guangdong-official-search';
import { searchProvinceRecords } from '@/lib/province-search';
import type { ProvinceCatalog } from '@/lib/province-types';
import { sitePath } from '@/lib/site-path';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; manifest: NationalOfficialManifest; index: NationalOfficialIndex | null; guangdongCatalog: ProvinceCatalog | null; locationKey: string };

function GuangdongOfficialDirectoryContent({ catalog, manifest, query }: { catalog: ProvinceCatalog; manifest: NationalOfficialManifest; query: OfficialSearchParams }) {
  const cities = guangdongOfficialCities(catalog.records);
  const result = searchProvinceRecords(catalog.records, query);
  const [draftProvince, setDraftProvince] = useState('guangdong');
  const draftCities = draftProvince === 'guangdong' ? cities.map(city => ({ slug: city.name, ...city })) :
    (manifest.provinces.find(province => province.slug === draftProvince)?.cities ?? []).map(city => ({ slug: city.slug, name: city.name, count: city.count }));
  const returnTo = guangdongOfficialListHref({ city: result.city, q: result.q, page: result.page });
  const pendingKeyword = [...(query.q ?? '').trim()].slice(0, 80).join('');

  return <div className="flex flex-col gap-5">
    <form action={sitePath('/quanguo/laiyuan/')} method="get" aria-label="选择官方来源省份和城市" className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      {pendingKeyword && <input type="hidden" name="q" value={pendingKeyword} />}
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="official-province" className="text-[13px] font-semibold">省级地区</label><select id="official-province" name="province" value={draftProvince} onChange={event => setDraftProvince(event.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"><option value="guangdong">广东省（{catalog.records.length.toLocaleString('zh-CN')} 条）</option>{manifest.provinces.map(province => <option key={province.slug} value={province.slug}>{province.name}（{province.count.toLocaleString('zh-CN')} 条）</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="official-city" className="text-[13px] font-semibold">城市或范围</label><select key={draftProvince} id="official-city" name="city" defaultValue={draftProvince === 'guangdong' ? result.city : ''} required={draftProvince !== 'guangdong'} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"><option value="">{draftProvince === 'guangdong' ? '全部城市' : '选择城市或范围'}</option>{draftCities.map(city => <option key={city.slug} value={city.slug}>{city.name}（{city.count.toLocaleString('zh-CN')} 条）</option>)}</select></div>
      <button type="submit" className="btn-primary min-h-11 px-5">查看来源记录</button>
    </form>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="m-0 text-lg font-semibold">广东省 · {result.city || '全部城市'}</h2><span className="text-[13px] text-sub">广东来源批次 {catalog.records.length.toLocaleString('zh-CN')} 条</span></div>
    <form key={result.city + '|' + result.q} action={sitePath('/quanguo/laiyuan/')} method="get" role="search" aria-label="检索广东官方来源记录" className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><input type="hidden" name="province" value="guangdong" />{result.city && <input type="hidden" name="city" value={result.city} />}<div className="flex min-w-0 flex-col gap-1"><label htmlFor="official-q" className="text-[13px] font-semibold">来源名称或城市</label><input id="official-q" name="q" type="search" defaultValue={result.q} maxLength={80} placeholder="输入原文名称或城市" className="min-h-11 w-full rounded-lg border border-line px-3 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" /></div><button type="submit" className="btn-primary min-h-11 px-5">检索记录</button></form>
    {result.q && <p className="m-0 text-[13px] text-sub">当前关键词：{result.q} · <a href={sitePath(guangdongOfficialListHref({ city: result.city }))} className="underlink">清除关键词</a></p>}
    {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath(guangdongOfficialListHref({ city: result.city }))} className="underlink">查看当前范围全部记录</a></div>}
    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="m-0 text-[15px]" role="status" aria-live="polite">匹配 <b>{result.total}</b> 条广东官方来源记录</p><span className="text-[13px] text-sub">按冻结来源顺序 · 同名不合并</span></div>
    <p className="m-0 border-l-2 border-brand bg-brand-tint px-4 py-3 text-[13px] text-body" role="note">广东公开来源记录来自不同日期和地市，属于来源观察，不代表全省当前在营养老机构总数。每条卡片保留证据类型、发布日期、资料期和原文出口；不同批次不能相加。</p>
    {result.total === 0 ? <div className="card p-8 text-center"><h2 className="m-0 text-lg font-semibold">没有找到来源记录</h2><p className="mt-2 text-body">缩短关键词或选择全部城市后重试。</p><a href={sitePath(guangdongOfficialListHref({}))} className="btn-outline mt-3">查看广东全部记录</a></div> : <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="广东官方来源记录列表">{result.items.map(record => {
      const detailHref = '/guangdong/jigou/' + record.id + '/?from=' + encodeURIComponent(returnTo);
      return <li key={record.id} className="min-w-0"><article className="card flex flex-col gap-3 p-5">
        <h2 className="m-0 break-words text-[17px] font-semibold leading-snug"><a href={sitePath(detailHref)} className="text-ink no-underline hover:text-brand">{record.name}</a></h2>
        <p className="m-0 text-[14px] text-body">地区：{record.city}</p>
        {record.sourceStatusNote && <p className="m-0 break-words text-[13px] text-caution">原文状态提示：{record.sourceStatusNote}</p>}
        <footer aria-label="来源与核对" className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-hair pt-3 text-[13px]">
          <span className="break-words text-sub">广东官方来源行 · {record.evidenceType} · 发布于 {record.sourcePublishedAt ? <time dateTime={record.sourcePublishedAt}>{record.sourcePublishedAt}</time> : '原文未说明'} · 资料期 {record.sourceAsOf ?? '原文未说明'}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-2"><a href={sitePath(detailHref)} className="inline-flex min-h-11 items-center font-semibold">查看记录与来源 →</a><a href={record.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center">打开官方原文核对 ↗</a></span>
        </footer>
      </article></li>;
    })}</ul>}
    {result.total > 0 && <nav aria-label="广东官方来源记录分页" className="flex flex-wrap items-center justify-center gap-3">{result.page > 1 && <a href={sitePath(guangdongOfficialListHref({ ...result, page: result.page - 1 }))} className="btn-outline px-3 text-sm" rel="prev">上一页</a>}<span className="text-[13px] text-sub">第 {result.page} / {result.pageCount} 页 · 每页 20 条</span>{result.page < result.pageCount && <a href={sitePath(guangdongOfficialListHref({ ...result, page: result.page + 1 }))} className="btn-outline px-3 text-sm" rel="next">下一页</a>}</nav>}
    <p className="m-0 text-[13px] text-sub">本站于 <time dateTime={catalog.archivedAt}>{catalog.archivedAt}</time> 归档广东来源批次；归档日期不等于每条记录的资料期。<a href={sitePath('/data/guangdong-source-records.v1.json')} className="underlink ml-2">查看公开记录 JSON</a></p>
  </div>;
}

export function NationalOfficialDirectoryContent({ manifest, index, guangdongCatalog = null, query }: { manifest: NationalOfficialManifest; index: NationalOfficialIndex | null; guangdongCatalog?: ProvinceCatalog | null; query: OfficialSearchParams }) {
  if (query.province === 'guangdong') return guangdongCatalog ? <GuangdongOfficialDirectoryContent catalog={guangdongCatalog} manifest={manifest} query={query} /> : <div className="notice" role="alert">广东官方来源尚未载入，请重试。</div>;
  const selectedProvince = manifest.provinces.find(item => item.slug === query.province);
  const selectedCity = selectedProvince?.cities.find(item => item.slug === query.city);
  const [draftProvince, setDraftProvince] = useState(selectedProvince?.slug ?? '');
  const draftCities = manifest.provinces.find(item => item.slug === draftProvince)?.cities ?? [];
  const invalidLocation = Boolean((query.province && !selectedProvince) || (query.city && !selectedCity));
  const result = selectedCity && index ? searchOfficialRecords(index, query) : null;
  const citySources = selectedCity ? manifest.sources.filter(source => source.province === selectedProvince?.name && (source.city === null || source.city === selectedCity.name)) : [];
  const sourceById = new Map(manifest.sources.map(source => [source.id, source]));
  const returnTo = result ? officialListHref({ ...result, page: result.page }) : '/quanguo/laiyuan/';
  const pendingKeyword = [...(query.q ?? '').trim()].slice(0, 80).join('');

  return <div className="flex flex-col gap-5">
    <form action={sitePath('/quanguo/laiyuan/')} method="get" aria-label="选择官方来源省份和城市" className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      {pendingKeyword && <input type="hidden" name="q" value={pendingKeyword} />}
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="official-province" className="text-[13px] font-semibold">省级地区</label><select id="official-province" name="province" value={draftProvince} onChange={event => setDraftProvince(event.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"><option value="">选择已收录地区</option><option value="guangdong">广东省（另有来源批次）</option>{manifest.provinces.map(province => <option key={province.slug} value={province.slug}>{province.name}（{province.count.toLocaleString('zh-CN')} 条）</option>)}</select></div>
      <div className="flex min-w-0 flex-col gap-1"><label htmlFor="official-city" className="text-[13px] font-semibold">城市或范围</label><select key={draftProvince} id="official-city" name="city" defaultValue={draftProvince === selectedProvince?.slug ? selectedCity?.slug ?? '' : ''} disabled={!draftProvince || draftProvince === 'guangdong'} required={draftProvince !== 'guangdong'} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px]"><option value="">{draftProvince === 'guangdong' ? '进入后选择城市' : '选择城市或范围'}</option>{draftCities.map(city => <option key={city.slug} value={city.slug}>{city.name}（{city.count.toLocaleString('zh-CN')} 条）</option>)}</select></div>
      <button type="submit" className="btn-primary min-h-11 px-5">查看来源记录</button>
    </form>
    {!result && <p className="m-0 border-l-2 border-brand bg-brand-tint px-4 py-3 text-[14px] text-body" role="note">本站只展示已取得的官方逐名来源记录，尚非全国完整或当前在营名录；请先选择地区。</p>}
    {invalidLocation && <div className="notice" role="alert">地区参数无效，请重新选择已收录的省市。<a href={sitePath('/quanguo/laiyuan/')} className="underlink ml-2">清除条件</a></div>}
    {!selectedCity && !invalidLocation && <div className="card p-6"><h2 className="m-0 text-lg font-semibold">选择省份和地区范围</h2>{pendingKeyword && <p className="mt-2 text-body" role="status">先选择省份和地区范围，再检索“{pendingKeyword}”。</p>}<p className="mt-2 text-body">选定地区后读取该地区的来源索引。本站仅覆盖已取得的部分地区及历史材料；未收录地区可到<a href="https://app.gjzwfw.gov.cn/jmopen/webapp/html5/qgyljgxxcx/index.html" target="_blank" rel="noopener noreferrer">民政部全国养老机构信息查询</a>自行核对。</p></div>}
    {result && <>
      <details className="card p-4 text-[14px] text-body"><summary className="cursor-pointer font-semibold text-ink">{selectedProvince?.name} · {selectedCity?.name}来源范围（{citySources.length} 项）</summary>{citySources.map(source => <p className="mb-0 mt-2" key={source.id}>{source.title}：{source.scope}{/[。！？.!?；;]$/.test(source.scope) ? '' : '。'}发布于 {source.publishedAt ? <time dateTime={source.publishedAt}>{source.publishedAt}</time> : '原文未说明'}；资料期 {source.asOf ?? '原文未说明'}。<a href={source.url} target="_blank" rel="noopener noreferrer">查看官方原文 ↗</a></p>)}</details>
      <form key={result.province + '|' + result.city + '|' + result.q} action={sitePath('/quanguo/laiyuan/')} method="get" role="search" aria-label="检索官方来源记录" className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><input type="hidden" name="province" value={result.province} /><input type="hidden" name="city" value={result.city} /><div className="flex min-w-0 flex-col gap-1"><label htmlFor="official-q" className="text-[13px] font-semibold">名称或地址</label><input id="official-q" name="q" type="search" defaultValue={result.q} maxLength={80} placeholder="输入原表中的名称或地址" className="min-h-11 w-full rounded-lg border border-line px-3 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" /></div><button type="submit" className="btn-primary min-h-11 px-5">检索记录</button></form>
      {result.q && <p className="m-0 text-[13px] text-sub">当前关键词：{result.q} · <a href={sitePath(officialListHref({ province: result.province, city: result.city }))} className="underlink">清除关键词</a></p>}
      {result.issues.length > 0 && <div className="notice" role="status">{result.issues.join(' ')} <a href={sitePath(officialListHref({ province: result.province, city: result.city }))} className="underlink">查看当前地区全部记录</a></div>}
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="m-0 text-[15px]" role="status" aria-live="polite">匹配 <b>{result.total}</b> 条官方来源记录</p><span className="text-[13px] text-sub">按来源行序展示 · 同名不合并</span></div>
      <p className="m-0 border-l-2 border-brand bg-brand-tint px-4 py-3 text-[13px] text-body" role="note">官方逐名来源记录不等于完整或当前在营机构名录；原表可能包含社区服务中心、医院等类型。床位数是来源快照，不等于当前空床。逐条核对原文与资料期。</p>
      {result.total === 0 ? <div className="card p-8 text-center"><h2 className="m-0 text-lg font-semibold">没有找到来源记录</h2><p className="mt-2 text-body">缩短关键词后重试。</p><a href={sitePath(officialListHref({ province: result.province, city: result.city }))} className="btn-outline mt-3">查看当前地区全部记录</a></div> : <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="全国官方来源记录列表">{result.items.map(record => {
        const source = sourceById.get(record.sourceId);
        const query = new URLSearchParams({ province: result.province, city: result.city, id: record.id, from: returnTo });
        const href = sitePath('/quanguo/laiyuan/detail/?' + query);
        return <li key={record.id} className="min-w-0"><article className="card flex flex-col gap-3 p-5">
          <h2 className="m-0 break-words text-[17px] font-semibold leading-snug"><a href={href} className="text-ink no-underline hover:text-brand">{record.name}</a></h2>
          {officialNameCaution(record) && <p className="m-0 text-[13px] text-caution">{officialNameCaution(record)}</p>}
          <div className="grid gap-2 text-[14px] text-body sm:grid-cols-2"><p className="m-0 break-words">地址：{officialAddressLabel(record)}</p><p className="m-0">床位数 {record.beds === null ? '原表未提供' : record.beds.toLocaleString('zh-CN') + ' 张（来源快照）'}</p></div>
          <footer aria-label="来源与核对" className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-hair pt-3 text-[13px]">
            <span className="break-words text-sub">官方来源行 · {source?.title ?? '来源未找到'} · 来源第 {record.rowNumber} 条 · 发布于 {source?.publishedAt ? <time dateTime={source.publishedAt}>{source.publishedAt}</time> : '原文未说明'} · 资料期 {source?.asOf ?? '原文未说明'}</span>
            <span className="flex flex-wrap gap-x-4 gap-y-2"><a href={href} className="inline-flex min-h-11 items-center font-semibold">查看记录与来源 →</a>{source && <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center">打开官方原文核对 ↗</a>}</span>
          </footer>
        </article></li>;
      })}</ul>}
      {result.total > 0 && <nav aria-label="官方来源记录分页" className="flex flex-wrap items-center justify-center gap-3">{result.page > 1 && <a href={sitePath(officialListHref({ ...result, page: result.page - 1 }))} className="btn-outline px-3 text-sm" rel="prev">上一页</a>}<span className="text-[13px] text-sub">第 {result.page} / {result.pageCount} 页 · 每页 20 条</span>{result.page < result.pageCount && <a href={sitePath(officialListHref({ ...result, page: result.page + 1 }))} className="btn-outline px-3 text-sm" rel="next">下一页</a>}</nav>}
    </>}
    <p className="m-0 text-[13px] text-sub">按省份查看官方来源：当前跨省来源 {manifest.rowCount.toLocaleString('zh-CN')} 条；广东公开来源另有独立批次，不合并为机构总数。本地归档于 <time dateTime={manifest.archivedAt}>{manifest.archivedAt}</time>，不是逐条核验日期。<a href={sitePath('/data/national-official/manifest.v1.json')} className="underlink ml-2">查看来源清单 JSON</a></p>
  </div>;
}

export function NationalOfficialDirectoryView() {
  const params = useSearchParams();
  const query: OfficialSearchParams = { province: params.get('province') ?? '', city: params.get('city') ?? '', q: params.get('q') ?? '', page: params.get('page') ?? '1' };
  const locationKey = (query.province ?? '') + ':' + (query.city ?? '');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadOfficialManifest(controller.signal).then(async manifest => {
      const location = findOfficialCity(manifest, query.province ?? '', query.city ?? '');
      const [index, guangdongCatalog] = await Promise.all([
        location ? loadOfficialIndex(manifest, location.province.slug, location.city.slug, controller.signal) : Promise.resolve(null),
        query.province === 'guangdong' ? loadGuangdongSourceCatalog(controller.signal) : Promise.resolve(null),
      ]);
      if (!controller.signal.aborted) setState({ status: 'ready', manifest, index, guangdongCatalog, locationKey });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '官方来源记录读取失败。' });
    });
    return () => controller.abort();
  }, [locationKey, attempt]);
  if (state.status === 'loading' || (state.status === 'ready' && state.locationKey !== locationKey)) return <div className="notice" role="status">正在加载官方来源清单…</div>;
  if (state.status === 'error') return <div className="notice" role="alert"><p className="m-0">{state.message}</p><button type="button" className="btn-outline mt-3" onClick={() => setAttempt(value => value + 1)}>重试读取</button><a href={sitePath('/quanguo/laiyuan/')} className="underlink ml-4">返回地区选择</a></div>;
  return <NationalOfficialDirectoryContent key={locationKey} manifest={state.manifest} index={state.index} guangdongCatalog={state.guangdongCatalog} query={query} />;
}
