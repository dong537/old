"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export interface TocItem {
  id: string;
  label: string;
  /** 风险提示用红色 */
  warn?: boolean;
}

/** 滚动时高亮当前读到的模块：取顶部已经越过 offset 的最后一个 */
function useActive(ids: string[], offset: number) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      setActive(atBottom ? ids[ids.length - 1] : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids, offset]);
  return active;
}

function jump(e: React.MouseEvent, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

/**
 * 档案页的目录。宽屏（xl）在左侧跟着滚动，窄屏变成吸顶的横向标签。
 * 两种都放在页面里，用 CSS 决定显示哪一个。
 */
export function Toc({ items, variant, reportHref }: { items: TocItem[]; variant: "side" | "bar"; reportHref: string }) {
  const idsKey = items.map((i) => i.id).join(",");
  const ids = useMemo(() => idsKey.split(","), [idsKey]);
  const active = useActive(ids, variant === "bar" ? 72 : 96);
  const barRef = useRef<HTMLDivElement>(null);

  // 横向标签：当前项滚到可见范围
  useEffect(() => {
    if (variant !== "bar" || !barRef.current) return;
    const el = barRef.current.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (el) barRef.current.scrollLeft = el.offsetLeft - barRef.current.clientWidth / 2 + el.clientWidth / 2;
  }, [active, variant]);

  if (variant === "bar") {
    return (
      <nav aria-label="本页目录" className="sticky top-0 z-20 -mx-4 border-b border-line bg-page/95 backdrop-blur sm:-mx-6 xl:hidden">
        <div ref={barRef} className="flex gap-1 overflow-x-auto px-4 sm:px-6">
          {items.map((i) => (
            <a
              key={i.id}
              data-id={i.id}
              href={`#${i.id}`}
              onClick={(e) => jump(e, i.id)}
              aria-current={active === i.id ? "true" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] no-underline ${
                active === i.id ? "border-brand font-semibold text-brand" : `border-transparent ${i.warn ? "text-gradeD" : "text-ink"} hover:text-brand`
              }`}
            >
              {i.label}
            </a>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="本页目录" className="sticky top-4 hidden w-[120px] shrink-0 flex-col gap-1 xl:flex">
      <span className="px-3 pb-1 text-xs text-sub">本页目录</span>
      <ol className="m-0 flex list-none flex-col border-l border-line p-0">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              onClick={(e) => jump(e, i.id)}
              aria-current={active === i.id ? "true" : undefined}
              className={`-ml-px block border-l-2 py-1.5 pl-3 pr-1 text-[14px] no-underline ${
                active === i.id
                  ? "border-brand font-semibold text-brand"
                  : `border-transparent ${i.warn ? "text-gradeD" : "text-body"} hover:border-brand-line hover:text-brand`
              }`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
        <Link href={reportHref} className="px-3 font-semibold">信息有误？</Link>
        <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="px-3 text-sub hover:text-brand">
          回到顶部 ↑
        </a>
      </div>
    </nav>
  );
}
