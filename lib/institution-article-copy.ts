/** Labels for a source-only snapshot versus a separately reviewed article. */
export function articlePageCopy(slug: string) {
  if (slug === 'csv-snapshot-review') return {
    breadcrumb: '历史快照资料说明',
    category: '历史快照资料说明',
    evidenceDateLabel: '资料快照观察日期：',
    notice: '本站资料整理，不代表专家审核或机构当前状态。本文仅依据注明日期的历史快照；空床、价格与服务请向机构核实。',
  };
  return {
    breadcrumb: '机构解读',
    category: '机构资料解读',
    evidenceDateLabel: '依据资料观察于：',
    notice: '本文依据注明时点的来源资料整理，不代表机构当前在营、实时空床或最新报价；服务和收费请向机构核实。',
  };
}
