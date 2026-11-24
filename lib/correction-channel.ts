const issueForm = 'https://github.com/dong537/qqqqq/issues/new?template=institution-correction.yml';

/** GitHub Issue Form 是公开受理渠道；打开表单本身不表示已提交。 */
export function correctionIssueHref(mcaId?: string): string {
  if (!mcaId) return issueForm;
  const url = new URL(issueForm);
  url.searchParams.set('title', '资料纠错：平台 ID ' + mcaId);
  return url.toString();
}
