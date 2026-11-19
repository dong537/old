import { Suspense } from 'react';
import { InstitutionReferenceDetailView } from '@/components/InstitutionReferenceDetailView';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国养老机构来源线索详情',
  description: '查看企查查来源表中的一条养老机构线索和原表行号；资料时点及当前运营状态未核实。',
};

export default function InstitutionReferenceDetailPage() {
  return <Suspense fallback={<div className="notice">正在读取线索详情。若长时间未显示，请启用浏览器 JavaScript 后刷新，或<a href={sitePath('/quanguo/cankao/')} className="underlink">返回线索目录</a>。</div>}><InstitutionReferenceDetailView /></Suspense>;
}
