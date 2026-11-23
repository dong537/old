'use client';

import Link from 'next/link';
import React, { useState } from 'react';

type Category = 'institution' | 'homeService';

type Metric = {
  title: string;
  question: string;
  missing: string;
  method: string;
};

const metrics: Record<Category, readonly Metric[]> = {
  institution: [
    {
      title: '收费透明',
      question: '哪些机构的费用能够按同一口径比较？',
      missing: '尚缺同一护理需求、费用组成、适用地区和生效日期的完整可比报价。',
      method: '先核对收费项目、单位、适用护理等级和生效日期，再按相同口径统计完整报价的比例；缺项与无法比较的记录不参与排序。',
    },
    {
      title: '回访兑现',
      question: '入住后的服务承诺是否得到履行？',
      missing: '尚缺经核验的服务承诺、家属回访记录和可重复计算的样本。',
      method: '需要先确定承诺与回访的配对规则、回访时段和有效样本，再公布兑现比例、样本量与排除原因。',
    },
    {
      title: '报错响应',
      question: '资料错误和服务投诉能否得到处理？',
      missing: '尚缺可追溯的报错、受理时间、处理结果和复核记录。',
      method: '需要记录每条问题的受理与完成时间，并核验处理结果；只统计有完整时间与结果证据的事件。',
    },
  ],
  homeService: [
    {
      title: '收费透明',
      question: '上门服务的项目与价格是否能比较？',
      missing: '尚缺服务项目、计价单位、地区、适用时段与收费组成一致的完整报价。',
      method: '按相同服务项目、服务时长、地区和收费口径比较完整报价；不能把不同服务包或机构住宿费混排。',
    },
    {
      title: '回访兑现',
      question: '约定的上门服务是否按时交付？',
      missing: '尚缺可核验的订单、服务记录和家属回访样本。',
      method: '需将服务约定、履约记录和回访逐单关联，公开有效订单数与统计时段后才能计算。',
    },
    {
      title: '报错响应',
      question: '上门服务的问题能否及时处理？',
      missing: '尚缺问题受理、处理时间、结果和家属确认的连续记录。',
      method: '按同类问题核算有完整处理证据的响应情况，公开样本和未结事项，不以单方宣称代替结果。',
    },
  ],
};

export function NationalRankingView({ snapshotDate, recordCount, csvRowCount }: {
  snapshotDate: string;
  recordCount: number;
  csvRowCount: number;
}) {
  const [category, setCategory] = useState<Category>('institution');
  const label = category === 'institution' ? '养老机构' : '上门服务';

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap gap-2" role="group" aria-label="榜单类别">
      {([['institution', '养老机构'], ['homeService', '上门服务']] as const).map(([value, text]) =>
        <button
          key={value}
          type="button"
          aria-pressed={category === value}
          onClick={() => setCategory(value)}
          className={'min-h-11 rounded-lg border px-4 py-2 text-[15px] font-medium transition-colors motion-reduce:transition-none ' + (category === value
            ? 'border-brand bg-brand text-white'
            : 'border-line bg-white text-ink hover:border-brand hover:text-brand')}
        >{text}</button>,
      )}
    </div>

    <div className="notice" role="status" aria-live="polite">
      <strong>{label}单项榜单本期未发布。</strong> 当前缺少经核验、同口径的收费、回访及报错处理证据；资料记录数不等于符合排名条件的机构数。
      <span className="mt-1 block text-[13px]">现有机构目录共收录 {recordCount.toLocaleString('zh-CN')} 条记录，其中 {csvRowCount.toLocaleString('zh-CN')} 条来自 {snapshotDate} 的 CSV 导出快照。该快照不是全国全量或实时营业名单。</span>
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {metrics[category].map(metric => <section key={metric.title} className="card flex min-w-0 flex-col gap-4 p-5 sm:p-6" aria-label={label + metric.title + '榜'}>
        <div>
          <h2 className="m-0 text-[18px] font-semibold text-ink">{metric.title}</h2>
          <p className="m-0 mt-1 text-[14px] leading-6 text-body">{metric.question}</p>
        </div>
        <div className="rounded-lg border border-line bg-page px-4 py-5 text-center">
          <strong className="block text-[17px] text-ink">本期未发布</strong>
          <p className="m-0 mt-2 text-[13px] leading-5 text-sub">{metric.missing}</p>
        </div>
        <details className="mt-auto border-t border-hair pt-3 text-[13px]">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-brand-ink">怎么算的</summary>
          <p className="m-0 pb-1 leading-6 text-body">{metric.method}</p>
          <p className="m-0 pb-1 leading-6 text-sub">目前没有可发布的参与样本与统计时段，因此不生成名次或分数。</p>
        </details>
      </section>)}
    </div>

    <p className="m-0 text-[14px] leading-6 text-body">可以先去<Link href="/quanguo/pingtai/" className="underlink">全国养老机构资料</Link>按地区查找来源记录，并在<Link href="/rules/" className="underlink">来源与方法</Link>了解本站如何区分机构线索与核验结果。</p>
  </div>;
}
