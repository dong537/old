import Link from 'next/link';
import { PageTitle } from '@/components/DirectoryUi';
import { correctionIssueHref } from '@/lib/correction-channel';

export const metadata = {
  title: '资料纠错 · 提供可核实的来源证据',
  description: '通过公开工单报告养老机构资料错误，了解受理、核实和更新流程。',
};

export default function CorrectionPage() {
  return <div className="flex min-w-0 flex-col gap-6">
    <PageTitle title="资料纠错" lead="发现本站资料与来源不符时，请提供可核实的证据，帮助我们修正快照。" />
    <section className="card max-w-3xl p-5 sm:p-7" aria-labelledby="correction-channel-title">
      <h2 id="correction-channel-title" className="m-0 text-lg font-semibold text-ink">提交公开纠错工单</h2>
      <p className="mb-0 mt-3 text-sm leading-7 text-body">本站目前使用 GitHub Issues 接收纠错。提交需要 GitHub 账号，工单内容公开可见；尚未开通纠错邮箱。请勿填写老人病历、身份证、私人电话号码或其他个人敏感信息。</p>
      <ol className="mb-0 mt-4 flex flex-col gap-2 pl-5 text-sm leading-7 text-body">
        <li>复制争议页面链接和页面标示的记录定位；民政部平台目录填写平台 ID，其他目录填写记录 ID 或来源文件与行号。</li>
        <li>提供新的官方原文或机构可公开核验资料链接、资料日期和具体差异。</li>
        <li>创建工单后，项目所有者核实来源；能证实的修订公开投影并重新发布，无法证实的标记待核或说明不更改的理由。</li>
      </ol>
      <a href={correctionIssueHref()} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5 inline-flex min-h-11 items-center justify-center px-5">打开 GitHub 纠错表单 ↗</a>
      <p className="mb-0 mt-3 text-xs leading-6 text-sub">打开表单不代表已提交或受理；请确认 GitHub 上的工单已创建。本站目前不承诺处理时限。若暂时无法使用 GitHub，请先在原平台或发布单位核对，待本站增设其他真实渠道。</p>
    </section>
    <p className="m-0 text-sm text-sub"><Link href="/rules/#freshness" className="underlink">查看资料日期与更新口径 →</Link></p>
  </div>;
}
