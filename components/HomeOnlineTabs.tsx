'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

const tabs = [
  { id: 'personal', label: '个人事项' },
  { id: 'institution', label: '机构事项' },
  { id: 'guide', label: '官方入口' },
] as const;
type TabId = typeof tabs[number]['id'];

const guideLink = 'inline-flex min-h-12 items-center justify-between gap-3 rounded-md border-l-[3px] border-brand bg-brand-tint/70 px-4 py-2 text-[14px] text-brand-ink no-underline transition-colors hover:bg-brand-tint';

export function HomeOnlineTabs() {
  const [active, setActive] = useState<TabId>('personal');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(tabs[next].id);
    tabRefs.current[next]?.focus();
  }

  return <section id="online-services" aria-labelledby="online-services-title" className="min-w-0">
    <h3 id="online-services-title" className="m-0 text-[20px] font-semibold text-ink">办事指南</h3>
    <div role="tablist" aria-label="办事指南类别" className="mt-5 flex max-w-full gap-5 overflow-x-auto border-b border-line sm:gap-7">
      {tabs.map((tab, index) => <button key={tab.id} ref={element => { tabRefs.current[index] = element; }}
        id={'online-tab-' + tab.id} role="tab" type="button" aria-selected={active === tab.id}
        aria-controls={'online-panel-' + tab.id} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => setActive(tab.id)} onKeyDown={event => handleKey(event, index)}
        className={'min-h-11 shrink-0 whitespace-nowrap border-b-[3px] bg-transparent px-1 text-[15px] font-semibold transition-colors ' + (active === tab.id ? 'border-brand text-brand' : 'border-transparent text-body hover:text-brand')}>{tab.label}</button>)}
    </div>
    <div id="online-panel-personal" role="tabpanel" aria-labelledby="online-tab-personal" hidden={active !== 'personal'} className={active === 'personal' ? 'grid gap-3 pt-4' : 'hidden'}>
      <p className="m-0 text-[13px] leading-6 text-body">本站整理办事事项的办理口径；申请、备案与资格审核仍由民政部门受理，本站不接收申请。</p>
      <Link href="/quanguo/banshi/" className={guideLink}>查看个人办事事项说明 <span aria-hidden="true">→</span></Link>
      <Link href="/quanguo/cankao/" className={guideLink}>办理前查机构来源线索 <span aria-hidden="true">→</span></Link>
      <Link href="/rules/" className={guideLink}>办理前核对资料日期 <span aria-hidden="true">→</span></Link>
    </div>
    <div id="online-panel-institution" role="tabpanel" aria-labelledby="online-tab-institution" hidden={active !== 'institution'} className="pt-4">
      <p className="mb-4 text-[13px] leading-6 text-body">本站整理机构备案、等级评定等事项口径；机构备案或等级评定申请仍由民政部门受理，本站不接收申请。</p>
      <Link href="/quanguo/banshi/" className={guideLink}>查看机构办事事项说明 <span aria-hidden="true">→</span></Link>
    </div>
    <div id="online-panel-guide" role="tabpanel" aria-labelledby="online-tab-guide" hidden={active !== 'guide'} className={active === 'guide' ? 'grid gap-3 pt-4' : 'hidden'}>
      <Link href="/quanguo/banshi/" className={guideLink}>个人办事事项 <span aria-hidden="true">→</span></Link>
      <Link href="/quanguo/banshi/" className={guideLink}>机构办事事项 <span aria-hidden="true">→</span></Link>
    </div>
  </section>;
}
