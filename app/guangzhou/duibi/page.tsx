import { sitePath } from '@/lib/site-path';
import { Suspense } from 'react';
import { catalog } from '@/lib/catalog';
import { ComparisonView } from '@/components/ComparisonView';

export const metadata = { title: '广州养老机构对比 · 官方名单字段' };

export default function ComparisonPage() {
  return <Suspense fallback={<div className="section-panel"><h1 className="text-2xl">机构对比</h1><p className="mt-3 text-body">正在读取所选机构。若页面未继续加载，请<a href={sitePath("/guangzhou/jigou/")} className="underlink">返回目录</a>查看官方资料。</p></div>}>
    <ComparisonView catalog={catalog} />
  </Suspense>;
}
