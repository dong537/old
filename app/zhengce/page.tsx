import Link from 'next/link';
import type { Metadata } from 'next';
import { PageTitle } from '@/components/DirectoryUi';
import { PolicyListTabs } from '@/components/PolicyListTabs';
import {
  listSection,
  policyManifest,
} from '@/lib/policy-content';
import { policySections, sectionLabel } from '@/lib/policy-content-types';

export const metadata: Metadata = {
  title: '政策与资讯 · 养老服务政策文件、法规、标准与动态',
  description: '整理全国养老服务信息平台刊载的政策文件、法律法规、标准规范与资讯动态，标注来源与发布时间，全文来自官方平台接口快照。',
};

export default function PolicyPage() {
  const items = policySections.flatMap((k) =>
    listSection(k).map((i) => ({ ...i, sectionLabel: sectionLabel[i.section] })),
  );
  const totalCount = policyManifest.sections.filter((s) => s.key !== 'anquan').reduce((n, s) => n + s.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="政策与资讯"
        lead={`整理全国养老服务信息平台刊载的政策文件、法律法规、标准规范与资讯动态，共 ${totalCount} 条（${policyManifest.capturedAt} 快照）。标题、来源、文号与发布时间来自官方接口；全文已按快照存档，逐条标注来源。`}
        extra={
          <Link href="/anquan/" className="text-[13px] text-sub underline-offset-4 hover:underline">
            安全提示专栏 →
          </Link>
        }
      />

      <PolicyListTabs items={items} />

      <p className="m-0 text-[12px] leading-5 text-sub">
        数据来源：全国养老服务信息平台「政策与内容」接口（/ylxxptapi/mhpt/mhcontent），快照 {policyManifest.capturedAt}。
        政策文件以官方原文为准；本页存档的全文不替代官方发布渠道，办理与适用以发文机关解释为准。
      </p>
    </div>
  );
}
