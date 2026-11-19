import Link from "next/link";

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface FilterDef {
  key: string;
  label: string;
  options: FilterOption[];
}

/** 筛选写进网址：每行一个条件，点「全部」去掉该条件 */
export function FilterRows({
  base,
  params,
  defs,
}: {
  base: string;
  params: Record<string, string | undefined>;
  defs: FilterDef[];
}) {
  const href = (key: string, value?: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== key) sp.set(k, v);
    if (value) sp.set(key, value);
    const s = sp.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };
  const active = defs.flatMap((d) => {
    const v = params[d.key];
    const o = d.options.find((x) => x.value === v);
    return v && o ? [{ key: d.key, label: `${d.label}：${o.label}` }] : [];
  });
  return (
    <div className="card flex flex-col gap-2.5 p-4">
      {defs.map((d) => (
        <div key={d.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
          <span className="w-[72px] shrink-0 text-[13px] text-sub">{d.label}</span>
          <Link
            href={href(d.key)}
            className={`chip px-2.5 py-1 text-[14px] no-underline ${!params[d.key] ? "bg-brand text-white hover:text-white" : "text-ink hover:text-brand"}`}
          >
            全部
          </Link>
          {d.options.map((o) => {
            const on = params[d.key] === o.value;
            return (
              <Link
                key={o.value}
                href={href(d.key, on ? undefined : o.value)}
                aria-current={on ? "true" : undefined}
                className={`chip px-2.5 py-1 text-[14px] no-underline ${
                  on ? "bg-brand text-white hover:text-white" : o.count === 0 ? "text-[#A0A5AC] hover:text-brand" : "text-ink hover:text-brand"
                }`}
              >
                {o.label}
                <span className={on ? "text-white/80" : "text-sub"}>{o.count}</span>
              </Link>
            );
          })}
        </div>
      ))}
      {(active.length > 0 || params.q) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-2.5 text-[13px]">
          <span className="text-sub">已选：</span>
          {params.q && (
            <Link href={href("q")} className="chip bg-brand-tint text-brand-ink no-underline">
              关键词：{params.q} ×
            </Link>
          )}
          {active.map((a) => (
            <Link key={a.key} href={href(a.key)} className="chip bg-brand-tint text-brand-ink no-underline">
              {a.label} ×
            </Link>
          ))}
          <Link href={base} className="text-sub">
            清空
          </Link>
        </div>
      )}
    </div>
  );
}

/** 每个筛选项的数量：用除这一项之外的其他条件过滤后再数 */
export function countBy<T>(
  items: T[],
  filters: Record<string, (item: T, value: string) => boolean>,
  params: Record<string, string | undefined>,
  key: string,
  value: string,
) {
  return items.filter((it) => {
    for (const [k, fn] of Object.entries(filters)) {
      const v = k === key ? value : params[k];
      if (v && !fn(it, v)) return false;
    }
    return true;
  }).length;
}

export function applyFilters<T>(items: T[], filters: Record<string, (item: T, value: string) => boolean>, params: Record<string, string | undefined>) {
  return items.filter((it) => Object.entries(filters).every(([k, fn]) => !params[k] || fn(it, params[k]!)));
}
