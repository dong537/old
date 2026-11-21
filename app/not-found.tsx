import { sitePath } from '@/lib/site-path';
export default function NotFound() {
  return <div className="mx-auto max-w-xl py-16 text-center"><p className="eyebrow">404 · 未找到页面</p><h1 className="mt-3 text-3xl">没有找到这个页面</h1><p className="mt-4 text-body">链接可能有误，或这条资料尚未收录。请回到全国目录，按省市或机构名称重新查找。</p><a href={sitePath("/quanguo/cankao/")} className="btn-primary mt-7">查找养老机构</a></div>;
}
