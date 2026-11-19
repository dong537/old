import { Suspense } from 'react';
import { QccNationalDetailView } from '@/components/QccNationalDetailView';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国登记主体候选详情 · 企查查导出快照',
  description: '查看登记主体候选的登记字段、来源文件、原始行号、来源哈希与代码校验状态。',
};

export default function QccNationalDetailPage() {
  return <Suspense fallback={<div className="notice">正在载入登记详情。<a href={sitePath('/quanguo/zhuti/')} className="underlink">返回候选目录</a></div>}><QccNationalDetailView /></Suspense>;
}
