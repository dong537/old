import { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { QccDirectoryView } from '@/components/QccDirectoryView';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '广东登记主体候选库 · 企查查导出快照',
  description: '检索企查查广东登记主体导出快照。宽口径结果未逐条核实养老关联，记录不是实时状态。',
};

export default function QccDirectoryPage() {
  return <div className="flex flex-col gap-6">
    <PageTitle title="广东登记主体候选库" lead="按名称、城市、主体类型和登记状态查询企查查导出快照；记录与养老服务的关联未逐条核实，也不计作养老机构数量。" />
    <Suspense fallback={<div className="notice">正在载入主体检索。若长时间未显示，请启用浏览器 JavaScript 并刷新；也可<a href={sitePath('/data/qcc/index.v1.json')} className="underlink">查看公开索引 JSON</a>。</div>}><QccDirectoryView /></Suspense>
  </div>;
}

