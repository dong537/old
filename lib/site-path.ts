function basePath(): string {
  return process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH === '/eldercare' ? '/eldercare' : '';
}

/** Prefix only same-site absolute paths; external, telephone and fragment links stay intact. */
export function sitePath(href: string): string {
  const base = basePath();
  if (!base || !href.startsWith('/') || href.startsWith('//') || href === base || href.startsWith(`${base}/`)) return href;
  return base + href;
}

/** Convert a browser pathname back to the route path used by the directory. */
export function logicalPathname(pathname: string): string {
  const base = basePath();
  if (!base || (pathname !== base && !pathname.startsWith(`${base}/`))) return pathname;
  return pathname.slice(base.length) || '/';
}
