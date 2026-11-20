'use client';

import { sitePath } from '@/lib/site-path';

export default function McaPreviewDetailError({ reset }: { error: Error; reset: () => void }) {
  return <div className="notice" role="alert">
    <h1 className="m-0 text-lg font-semibold">机构详情无法读取</h1>
    <p className="mb-3 mt-2">本机快照的详情文件缺失或损坏。请重新运行私有 JSON 清洗，再刷新页面；不要把该记录视为不存在。</p>
    <div className="flex flex-wrap gap-3"><button type="button" className="btn-outline" onClick={reset}>重试读取</button><a className="underlink inline-flex items-center" href={sitePath('/quanguo/mca-preview/')}>返回已观察列表</a></div>
  </div>;
}
