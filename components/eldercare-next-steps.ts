import type { CompareColumn } from './mca-compare-data';

export interface InstitutionCitation { name: string; capture: string; official: string; detailPath: string }
export const citationScope = '历史快照，不代表当前在营、空床或最新报价。';
export function citationText(citation: InstitutionCitation, origin: string): string {
  return [
    '机构：' + citation.name,
    '资料来源：全国养老服务信息平台',
    '采集记录：' + citation.capture,
    '官方原页：' + citation.official,
    '本站机构档案：' + new URL(citation.detailPath, origin).href,
    citationScope,
  ].join('\n');
}

export interface RegionalGuide { href: string; title: string; description: string }
const guangzhouGuides: RegionalGuide[] = [{
  href: '/guangzhou/changhuxian/', title: '广州长护险申请与评估指南',
  description: '查申请评估步骤、广州医保官方资料和办理入口。',
}];
export function getRegionalGuides(province: string, city: string): readonly RegionalGuide[] {
  return province === '广东省' && city === '广州市' ? guangzhouGuides : [];
}

type Facts = Pick<CompareColumn, 'total' | 'services' | 'date' | 'status'>;
export function visitFacts(result: { state: 'ready'; column: Facts } | { state: 'error' | 'index' } | undefined): Facts {
  if (result?.state === 'ready') {
    const check = (value: string) => value.includes('未提供') ? value + '，待核对' : value;
    return { total: check(result.column.total), services: check(result.column.services), date: check(result.column.date), status: result.column.status };
  }
  return { total:'待核对', services:'待核对', date:'待核对',
    status: !result ? '资料读取中…' : result.state === 'index' ? '仅有索引，未采到详情' : '本站详情未能载入，请核对原页' };
}
export const visitQuestions = [
  '现在有空床吗？可入住的日期和房型是什么？',
  '能否提供适合家中长者需要的照护？夜间怎样值守？',
  '请给书面费用明细：月费包含什么，护理或餐费是否另收？',
  '押金或预收费是多少？何时可退，退费条件写在哪？',
  '签约主体是谁？合同、收款方和公示名称是否一致？',
] as const;
