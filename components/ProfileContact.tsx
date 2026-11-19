import { sitePath } from '@/lib/site-path';
import React from 'react';
import { WITHHELD_PHONE_MESSAGE } from '@/lib/phone-display';

export function ProfileContact({ phone, phoneHref, phoneWithheld = false, sourceUrl }: { phone: string | null; phoneHref: string | null; phoneWithheld?: boolean; sourceUrl: string }) {
  return <div className="card flex flex-col gap-3 p-5">
    <h2 className="m-0 text-lg font-semibold">预约探访</h2>
    <p className="m-0 text-body">本目录尚未开通在线预约。安排探访前，请先核对官方名单并联系机构。</p>
    <p className="m-0 break-words text-lg font-semibold">
      {phoneWithheld ? <span>{WITHHELD_PHONE_MESSAGE}</span> : phoneHref ? <a href={sitePath(phoneHref)}>{phone}</a> : phone ? <span>{phone} <span className="text-[13px] font-normal text-risk">（待核实）</span></span> : <span>原表未提供电话</span>}
    </p>
    <button type="button" className="w-full rounded-lg border border-line bg-page px-4 py-2 text-[13px] font-medium text-sub" disabled>在线预约暂未开放</button>
    <p className="m-0 text-xs text-sub">展示的电话来自官方公开名单，接通情况尚未核实。本页不收集联系方式或老人健康信息。</p>
    <a href={sitePath(sourceUrl)} target="_blank" rel="noopener noreferrer" className="text-[13px]">查看官方名单核对 <span aria-hidden="true">↗</span><span className="sr-only">（新窗口打开）</span></a>
  </div>;
}
