import type { Metadata } from 'next';
import { PageTitle } from '@/components/DirectoryUi';
import { listSection, policyManifest } from '@/lib/policy-content';

export const metadata: Metadata = {
  title: '安全教育 · 养老机构消防安全提示',
  description: '整理全国养老服务信息平台「安全教育」栏目的养老机构消防安全宣传内容，标注发布时间与来源。',
};

function formatDate(s?: string) {
  if (!s) return '';
  return s.slice(0, 10);
}

export default function SafetyPage() {
  const items = listSection('anquan');

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="安全教育"
        lead={`整理全国养老服务信息平台「安全教育」栏目刊载的养老机构消防安全宣传内容，共 ${items.length} 条（${policyManifest.capturedAt} 快照）。该栏目内容以视频为主，本页列出标题与发布时间，不托管视频文件。`}
      />

      <ol className="m-0 flex list-none flex-col divide-y divide-line border-y border-line p-0" aria-label="安全教育内容列表">
        {items.map((item, index) => (
          <li key={item.id} className="flex gap-4 px-2 py-3.5 sm:px-3">
            <span className="w-8 shrink-0 text-right font-mono text-[13px] text-sub">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 break-words text-[15px] font-medium text-ink">{item.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-sub">
                {item.releaseTime && <time dateTime={formatDate(item.releaseTime)}>{formatDate(item.releaseTime)}</time>}
                <span>消防安全宣传</span>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="m-0 text-[12px] leading-5 text-sub">
        数据来源：全国养老服务信息平台「安全教育」接口（/ylxxptapi/mhpt/mhcontent/page?type=12），快照 {policyManifest.capturedAt}。
        视频内容版权归原发布方；如需观看，请到官方平台对应栏目。
      </p>
    </div>
  );
}
