import Link from 'next/link';
import type { Metadata } from 'next';
import { PageTitle } from '@/components/DirectoryUi';

export const metadata: Metadata = {
  title: '养老服务消费补贴 · 中度以上失能老年人',
  description: '说明向中度以上失能老年人发放养老服务消费补贴项目：谁可领、依据是什么、如何申领，依据民政部、财政部相关通知。',
};

const faq = [
  {
    q: '这是什么补贴？',
    a: '向中度以上失能老年人发放的养老服务消费补贴，用于购买养老服务。自 2026 年 1 月 1 日起在全国范围内组织实施，通过补贴项目信息系统「民政通」运行。',
  },
  {
    q: '谁能领？',
    a: '经评估确定为中度以上失能的老年人。是否纳入，以本地民政部门组织的老年人能力评估结果为准，评估依据《老年人能力评估规范》（GB/T42195-2022）。',
  },
  {
    q: '怎么领？',
    a: '先完成老年人能力评估（失能等级达到中度以上），再按本地民政部门公布的方式申领。发放、使用与核销通过「民政通」系统办理；本站不接收申请，也不代发。',
  },
  {
    q: '补贴能买什么？',
    a: '用于购买养老服务（如机构照护、居家上门服务等），具体可用范围以本地公布的服务目录为准。本站不估算金额，也不承诺可用范围。',
  },
];

export default function SubsidyPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="养老服务消费补贴"
        lead="向中度以上失能老年人发放养老服务消费补贴，自 2026 年 1 月 1 日起全国实施。本页说明政策口径与申领要点，不接收申请、不代发，具体以当地民政部门为准。"
      />

      <section className="card flex flex-col divide-y divide-hair" aria-label="补贴常见问题">
        {faq.map((item) => (
          <details key={item.q} className="group px-5 py-4" open={item.q === '谁能领？'}>
            <summary className="cursor-pointer text-[16px] font-semibold marker:text-brand">{item.q}</summary>
            <p className="m-0 mt-2 text-[14px] leading-6 text-body">{item.a}</p>
          </details>
        ))}
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-label="政策依据">
        <h2 className="m-0 text-[15px] font-semibold">政策依据（本站已存档全文）</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
          <li>
            <Link href="/zhengce/c75f05e6deaf4569b173c7468d0c925f" className="text-brand underline-offset-4 hover:underline">
              民政部办公厅、财政部办公厅关于全面启动实施向中度以上失能老年人发放养老服务消费补贴项目的通知（民办函〔2025〕49号）
            </Link>
            <span className="ml-2 text-[12.5px] text-sub">2026-01-23</span>
          </li>
        </ul>
        <p className="m-0 text-[12.5px] leading-5 text-sub">
          依据《民政部 财政部关于实施向中度以上失能老年人发放养老服务消费补贴项目的通知》（民发〔2025〕37号）部署。
          申领资格、补贴金额与使用范围以当地民政、财政部门公布为准；补贴项目信息系统的在线申领需实名认证，本站不提供该功能。
        </p>
      </section>
    </div>
  );
}
