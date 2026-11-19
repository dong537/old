import { Suspense } from 'react';
import { NationalOfficialDetailView } from '@/components/NationalOfficialDetailView';
import { sitePath } from '@/lib/site-path';

export const metadata = {
  title: '全国官方养老服务来源记录详情',
  description: '查看官方公开材料中的来源行、当时字段及来源日期；不证明当前在营或空床。',
};

export default function NationalOfficialDetailPage() {
  return <Suspense fallback={<div className="notice">正在读取来源记录。若长时间未显示，请启用浏览器 JavaScript 后刷新，或<a href={sitePath('/quanguo/laiyuan/')} className="underlink">返回来源目录</a>。</div>}><NationalOfficialDetailView /></Suspense>;
}
