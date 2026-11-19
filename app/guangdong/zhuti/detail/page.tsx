import { Suspense } from 'react';
import { QccDetailView } from '@/components/QccDetailView';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国登记主体候选详情 · 企查查导出快照',
  description: '查看广东来源批次的登记主体候选字段、来源行号与代码校验状态；养老服务关联未逐条核实。',
};

export default function QccSubjectDetailPage() {
  return <Suspense fallback={<div className="notice">正在载入登记详情。<a href={sitePath('/quanguo/zhuti/')} className="underlink">返回全国主体目录</a></div>}><QccDetailView /></Suspense>;
}

