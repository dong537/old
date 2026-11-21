'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

const tabs = [
  { id: 'personal', label: '个人事项' },
  { id: 'institution', label: '机构事项' },
  { id: 'guide', label: '办事指南' },
] as const;
type TabId = typeof tabs[number]['id'];

const guideLink = 'inline-flex min-h-12 items-center justify-between gap-3 border-l-[3px] border-[#E87919] bg-[#FFF1D8] px-4 py-2 text-[14px] text-[#8F321D] no-underline hover:bg-[#FFE8BD]';

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
    <h2 id="online-services-title" className="m-0 text-[23px] font-semibold text-[#C7112D]">在线办理</h2>
    <div role="tablist" aria-label="在线办理类别" className="mt-5 flex gap-5 border-b border-[#EAD8BE] sm:gap-7">
      {tabs.map((tab, index) => <button key={tab.id} ref={element => { tabRefs.current[index] = element; }}
        id={'online-tab-' + tab.id} role="tab" type="button" aria-selected={active === tab.id}
        aria-controls={'online-panel-' + tab.id} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => setActive(tab.id)} onKeyDown={event => handleKey(event, index)}
        className={'min-h-11 border-b-[3px] bg-transparent px-1 text-[15px] font-semibold ' + (active === tab.id ? 'border-[#E87919] text-[#A4541D]' : 'border-transparent text-body hover:text-brand')}>{tab.label}</button>)}
    </div>
    <div id="online-panel-personal" role="tabpanel" aria-labelledby="online-tab-personal" hidden={active !== 'personal'} className={active === 'personal' ? 'grid gap-3 pt-4' : 'hidden'}>
      <p className="m-0 text-[13px] leading-6 text-body">官网办理事项与地区资格请到原站核对；本站不接收申请。</p>
      <a href="https://yanglao.mca.gov.cn/#/index/personGuideList" target="_blank" rel="noopener noreferrer" className={guideLink}>查看官网个人办事指南 <span aria-hidden="true">↗</span></a>
      <Link href="/quanguo/cankao/" className={guideLink}>办理前查机构来源线索 <span aria-hidden="true">→</span></Link>
      <Link href="/rules/" className={guideLink}>办理前核对资料日期 <span aria-hidden="true">→</span></Link>
    </div>
    <div id="online-panel-institution" role="tabpanel" aria-labelledby="online-tab-institution" hidden={active !== 'institution'} className="pt-4">
      <p className="mb-4 text-[13px] leading-6 text-body">官网办理事项与地区资格请到原站核对；本站不接收机构备案或等级评定申请。</p>
      <a href="https://yanglao.mca.gov.cn/#/index/institutionGuideList" target="_blank" rel="noopener noreferrer" className={guideLink}>查看机构办事指南 <span aria-hidden="true">↗</span></a>
    </div>
    <div id="online-panel-guide" role="tabpanel" aria-labelledby="online-tab-guide" hidden={active !== 'guide'} className={active === 'guide' ? 'grid gap-3 pt-4' : 'hidden'}>
      <a href="https://yanglao.mca.gov.cn/#/index/personGuideList" target="_blank" rel="noopener noreferrer" className={guideLink}>个人办事指南 <span aria-hidden="true">↗</span></a>
      <a href="https://yanglao.mca.gov.cn/#/index/institutionGuideList" target="_blank" rel="noopener noreferrer" className={guideLink}>机构办事指南 <span aria-hidden="true">↗</span></a>
    </div>
  </section>;
}
