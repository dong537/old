import { sitePath } from '@/lib/site-path';
import type { catalog } from '@/lib/catalog';

export function SourceNote({ source, detailed = false }: { source: typeof catalog.source; detailed?: boolean }) {
  return <div className="text-sm leading-relaxed text-sub">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="tag">官方公开资料</span>
      <a href={sitePath(source.url)} target="_blank" rel="noopener noreferrer" className="underlink">广州市民政局 · {source.title} <span className="sr-only">（新窗口打开）</span><span aria-hidden="true">↗</span></a>
    </div>
    <p className="mt-2">名单发布日期：<time dateTime={source.publishedAt}>{source.publishedAt}</time>。资料为当时的公开快照，实际情况请联系机构核实。</p>
    <p className="mt-2"><a href={sitePath("/data/guangzhou-institutions.v1.json")} className="underlink">查看站内公开快照</a>（由官方名单导入生成，不是官方原页）。</p>
    {detailed && <p className="mt-2">本页依据官方原表展示机构名称、行政区、地址、备案床位及三项预收费标记；手机号格式的来源电话在站内暂不展示。每条档案可以回到同一份原表核对。</p>}
  </div>;
}
