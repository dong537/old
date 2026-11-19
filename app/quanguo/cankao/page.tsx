import { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { InstitutionReferenceDirectoryView } from '@/components/InstitutionReferenceDirectoryView';
import { InstitutionReferenceProvinceLinks } from '@/components/InstitutionReferenceProvinceLinks';
import { getReferenceProvinceManifest } from '@/lib/institution-reference-static';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国养老机构来源线索 · 企查查资料表',
  description: '按省市检索用户提供的企查查养老机构信息表，查看原表名称、地址、床位与来源行；不代表当前在营或全国全量。',
};

export default function InstitutionReferencePage() {
  const manifest = getReferenceProvinceManifest();
  return <div className="flex flex-col gap-6">
    <PageTitle title="全国养老机构来源线索" lead="按省市、名称或地址查找企查查来源表中的逐行线索，核对原表地区、床位和来源行；营业情况请再以官方及机构信息确认。" />
    <Suspense fallback={<div className="notice">正在读取来源清单。若长时间未显示，请启用浏览器 JavaScript 并刷新；也可<a href={sitePath('/data/qcc-institutions/manifest.v1.json')} className="underlink">查看公开清单 JSON</a>。</div>}><InstitutionReferenceDirectoryView /></Suspense>
    <InstitutionReferenceProvinceLinks provinces={manifest.provinces} />
  </div>;
}
