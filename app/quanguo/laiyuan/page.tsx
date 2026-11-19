import { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { NationalOfficialDirectoryView } from '@/components/NationalOfficialDirectoryView';
import { OfficialCoverageView } from '@/components/OfficialCoverageView';
import { assertOfficialCoverageSnapshot, buildOfficialCoverage } from '@/lib/official-coverage';
import { sitePath } from '@/lib/site-path';
import referenceManifest from '@/public/data/qcc-institutions/manifest.v1.json';
import officialManifest from '@/public/data/national-official/manifest.v1.json';
import guangdongSources from '@/public/data/guangdong-source-records.v1.json';

export const metadata = {
  title: '全国官方养老服务来源记录',
  description: '按省市检索已核验原件的养老服务逐名来源行，核对发布日、资料期、覆盖范围和来源行序；不代表全国完整或当前在营机构。',
};

export default function NationalOfficialPage() {
  const coverage = buildOfficialCoverage(referenceManifest.provinces, officialManifest.provinces, guangdongSources.records.length);
  assertOfficialCoverageSnapshot(coverage, referenceManifest.rowCount, officialManifest.rowCount, guangdongSources.records.length);
  return <div className="flex flex-col gap-6">
    <PageTitle title="全国官方养老服务来源记录" lead="查看已取得的广东与其他地区官方逐名来源。先选省市，再按名称检索；来源行不等于当前在营机构。" />
    <Suspense fallback={<div className="notice">正在载入来源清单。若长时间未显示，请启用浏览器 JavaScript 并刷新；也可<a href={sitePath('/data/national-official/manifest.v1.json')} className="underlink">查看公开清单 JSON</a>。</div>}><NationalOfficialDirectoryView /></Suspense>
    <OfficialCoverageView coverage={coverage} />
  </div>;
}
