'use client';

export default function McaPreviewError({ reset }: { error: Error; reset: () => void }) {
  return <div className="notice" role="alert">
    <h1 className="m-0 text-lg font-semibold">本机快照无法读取</h1>
    <p className="mb-3 mt-2">私有 JSON 快照缺失或结构损坏。请重新运行清洗构建，然后重试读取。</p>
    <button type="button" className="btn-outline" onClick={reset}>重试读取</button>
  </div>;
}
