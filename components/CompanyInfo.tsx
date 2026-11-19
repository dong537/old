import { getCompanyPreview, getCompanyStatus, privatePreview } from '@company-data';

export function CompanyInfo({ institutionId }: { institutionId: string }) {
  const preview = getCompanyPreview(institutionId);
  const status = getCompanyStatus(institutionId);
  if (!preview) return <div className="rounded-lg bg-page p-4 text-body">
    <p className="font-semibold">{privatePreview ? status === 'review' ? '主体名称有待人工复核' : '官方机构名称未明确企业主体' : '工商资料暂未公开'}</p>
    <p className="mt-2 text-sm">{privatePreview ? '当前没有可展示的企业登记关联。部分机构可能由事业单位或社会组织运营，不能因此判断机构没有登记。' : '第三方登记快照的公开使用范围尚未确认。请通过企业信用信息公示渠道核对实际签约主体；本页的官方名单收录不等于运营关系或服务质量核验。'}</p>
  </div>;
  const { company, link } = preview;
  const fields: [string, string | null][] = [
    ['企业名称', company.name], ['统一社会信用代码', company.creditCode], ['法定代表人', company.legalRepresentative], ['登记状态', company.status],
    ['成立日期', company.establishedAt], ['企业类型', company.enterpriseType], ['注册资本', company.registeredCapital], ['实缴资本', company.paidInCapital],
    ['核准日期', company.approvedAt], ['所属地区', company.region], ['登记机关', company.authority], ['注册地址', company.address], ['经营范围', company.businessScope],
  ];
  return <>
    <div className="notice mb-5"><strong>名称关联，运营关系尚未核实。</strong>工商登记信息不能证明该企业实际运营此养老场所，也不能证明服务质量。</div>
    <dl className="detail-grid">{fields.map(([label, value]) => <div key={label} className={label === '经营范围' || label === '注册地址' ? 'sm:col-span-2' : ''}><dt className="detail-label">{label}</dt><dd className="detail-value">{value || '来源未提供'}</dd></div>)}</dl>
    <div className="mt-6 border-t border-line pt-4 text-sm text-sub">
      <p>候选主体：{link.candidateName}</p><p className="mt-1">关联方式：{link.matchType === 'exact' ? '候选名称与登记名称一致' : '候选名称与登记名称仅中英文括号不同'}</p>
      <p className="mt-1">关联依据：{link.evidence}</p><p className="mt-1">数据来源：查企GO · 企业工商信息快照 · 查询日期 {link.queriedAt}</p>
    </div>
  </>;
}
