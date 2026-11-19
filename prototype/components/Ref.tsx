/** 百科式角标，指向页面底部的来源列表 */
export function Ref({ n }: { n: number }) {
  return (
    <a href={`#ref-${n}`} className="ml-0.5 align-super text-[10px] font-normal text-brand no-underline" aria-label={`来源 ${n}`}>
      [{n}]
    </a>
  );
}
