import { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { QccNationalDirectoryView } from '@/components/QccNationalDirectoryView';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国登记主体候选 · 企查查导出快照',
  description: '按省市、名称、主体类型和登记状态检索全国登记主体候选。广东与其他省份保留各自快照，宽口径导出不是养老机构名录或实时状态。',
};

export default function QccNationalDirectoryPage() {
  return <div className="flex flex-col gap-6">
    <PageTitle title="全国登记主体候选" lead="按省市、名称、主体类型和登记状态检索企查查导出快照。不同地区保留各自来源；候选记录不计作养老机构数量。" />
    <Suspense fallback={<div className="notice">正在载入地区清单。若长时间未显示，请启用浏览器 JavaScript 并刷新；也可<a href={sitePath('/data/qcc-national/manifest.v1.json')} className="underlink">查看跨省清单 JSON</a>或<a href={sitePath('/data/qcc/index.v1.json')} className="underlink">广东索引 JSON</a>。</div>}><QccNationalDirectoryView /></Suspense>
  </div>;
}
