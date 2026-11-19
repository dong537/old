function safeSourceHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function ProvinceSourceLink({ url }: { url: string }) {
  const href = safeSourceHref(url);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="underlink">查看官方原始来源 <span className="sr-only">（新窗口打开）</span><span aria-hidden="true">↗</span></a>
    : <span className="text-caution">来源链接格式无效，请勿据此判断资料内容。</span>;
}
