import React, { Suspense } from 'react';
import { PageTitle } from '@/components/DirectoryUi';
import { NationalHomeServiceContent, NationalHomeServiceDirectory } from '@/components/NationalHomeServiceDirectory';
import { getNationalHomeServices } from '@/lib/national-home-services-static';

export const metadata = {
  title: '找上门服务 · 按地区和项目查找养老服务',
  description: '按地区、名称与列示项目筛选上门养老服务线索，查看机构资料和官网来源。当前为部分地区的来源快照，请核对实际服务范围、项目及收费。',
};

export default function NationalHomeServicesPage() {
  const catalog = getNationalHomeServices();
  return <div className="flex min-w-0 flex-col gap-6"><PageTitle title="找上门服务" lead="老人住在家里，先按机构所在地和项目找服务线索，再核对能否上门、提供哪些服务及如何收费。这里展示已有来源明示的内容。" /><Suspense fallback={<NationalHomeServiceContent catalog={catalog} query="" />}><NationalHomeServiceDirectory catalog={catalog} /></Suspense></div>;
}
