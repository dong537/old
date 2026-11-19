import { parse } from 'csv-parse/sync';
import type { Company, CompanySnapshot, IdMapEntry, Institution } from './types';

export const SNAPSHOT_ID = 'gz-20260923';
export const COMPANY_QUERIED_AT = '2026-11-13';
export const OFFICIAL_SOURCE = {
  title: '广州市养老机构基本信息表',
  url: 'https://mzj.gz.gov.cn/gk/fwjgylb/content/post_11018696.html',
  publishedAt: '2026-09-23',
};
export const DISTRICTS = ['越秀区', '海珠区', '荔湾区', '天河区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '从化区', '增城区'];
const OFFICIAL_FIELDS = ['序号', '区', '机构名称', '地址', '电话号码', '备案床位数', '是否预收养老服务费', '是否收取押金', '是否收取会员费'];
const PRIVATE_FIELDS = ['原始序号', '区', '机构原名', '候选主体', '主体类型', '提取依据', '复核提示', '工商查询状态', '企业名称', '统一社会信用代码', '法定代表人', '登记状态', '成立日期', '注册资本', '实缴资本', '企业类型', '核准日期', '所属地区', '登记机关', '注册地址', '经营范围', '来源URL'];

function records(csv: string, fields: string[]): Record<string, string>[] {
  const rows = parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: false }) as string[][];
  if (!rows.length || rows[0].length !== fields.length || fields.some((field, index) => rows[0][index] !== field)) {
    throw new Error('CSV字段与已批准快照不一致，停止导入。');
  }
  return rows.slice(1).map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
}

function positiveRow(value: string, line: number): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`第${line}行原始序号无效。`);
  return Number(value);
}

function optionalText(value: string): string | null { return value.trim() ? value : null; }

function flag(value: string, field: string, sourceRow: number): boolean | null {
  if (value === '') return null;
  if (value === '是') return true;
  if (value === '否') return false;
  throw new Error(`原始序号${sourceRow}的${field}值无效。`);
}

export function parseOfficialCsv(csv: string, idMap: IdMapEntry[]): Institution[] {
  const rows = records(csv, OFFICIAL_FIELDS);
  if (rows.length !== 235) throw new Error('官方快照必须包含235条记录。');
  if (!Array.isArray(idMap) || idMap.length !== 235) throw new Error('稳定ID映射必须包含235条记录。');
  const mapping = new Map<number, IdMapEntry>();
  const ids = new Set<string>();
  for (const entry of idMap) {
    if (!entry || !Number.isInteger(entry.sourceRow) || !entry.name || !/^gz-\d{6}$/.test(entry.id) || Number(entry.id.slice(3)) > 235 || ids.has(entry.id) || mapping.has(entry.sourceRow)) {
      throw new Error('稳定ID映射存在无效或重复ID。');
    }
    ids.add(entry.id);
    mapping.set(entry.sourceRow, entry);
  }
  const seen = new Set<number>();
  const institutions = rows.map((row, index): Institution => {
    const sourceRow = positiveRow(row['序号'], index + 2);
    if (seen.has(sourceRow) || sourceRow !== index + 1) throw new Error(`原始序号${sourceRow}重复或未保持官方源序。`);
    seen.add(sourceRow);
    const entry = mapping.get(sourceRow);
    if (!entry || entry.name !== row['机构名称']) throw new Error(`原始序号${sourceRow}的名称与稳定ID映射不一致。`);
    if (!DISTRICTS.includes(row['区']) || !row['机构名称'].trim() || !row['地址'].trim()) throw new Error(`原始序号${sourceRow}的必填字段无效。`);
    const beds = row['备案床位数'];
    if (beds !== '' && (!/^\d+$/.test(beds) || !Number.isSafeInteger(Number(beds)))) throw new Error(`原始序号${sourceRow}的备案床位数无效。`);
    const qualityNotes: string[] = [];
    const addressDistrict = DISTRICTS.find((district) => row['地址'].includes(district));
    if (addressDistrict && addressDistrict !== row['区']) qualityNotes.push(`源表所属区为${row['区']}，地址包含${addressDistrict}；原文保留，请向机构或主管部门核实。`);
    const sourcePhone = optionalText(row['电话号码']);
    const digits = sourcePhone?.replace(/[\s-]/g, '') ?? '';
    // The committed CSV is a public copy. Its withheld marker preserves the
    // original privacy decision without putting mobile numbers in Git history.
    const phoneWithheld = sourcePhone === '[已遮蔽]' || /^1\d{10}$/.test(digits);
    const phone = phoneWithheld ? null : sourcePhone;
    const placeholder = /^0\d{2,3}0{7,8}$/.test(digits) || /^0+$/.test(digits);
    const dialable = !phoneWithheld && !placeholder && /^0\d{9,11}$/.test(digits);
    if (placeholder) qualityNotes.push('源表电话疑似占位号码，保留原文且不提供拨号链接，请另行核实。');
    else if (phone && !dialable) qualityNotes.push('源表电话格式需核实，保留原文且不提供拨号链接。');
    return {
      id: entry.id, sourceRow, name: row['机构名称'], district: row['区'], address: row['地址'], phone,
      phoneHref: dialable ? `tel:${digits}` : null,
      registeredBeds: beds === '' ? null : Number(beds),
      phoneWithheld,
      advanceFee: flag(row['是否预收养老服务费'], '是否预收养老服务费', sourceRow),
      deposit: flag(row['是否收取押金'], '是否收取押金', sourceRow),
      membershipFee: flag(row['是否收取会员费'], '是否收取会员费', sourceRow),
      qualityNotes,
    };
  });
  if (new Set(institutions.map((institution) => institution.district)).size !== DISTRICTS.length) {
    throw new Error('官方快照没有覆盖全部11区，停止生成。');
  }
  return institutions;
}

function normalizeParentheses(value: string): string { return value.replaceAll('（', '(').replaceAll('）', ')'); }

export function parsePrivateCsv(csv: string, institutions: Institution[]): CompanySnapshot {
  const rows = records(csv, PRIVATE_FIELDS);
  if (rows.length !== 235 || institutions.length !== 235) throw new Error('私有状态快照必须与235条官方记录完整对应。');
  const institutionsByRow = new Map(institutions.map((institution) => [institution.sourceRow, institution]));
  const companies = new Map<string, Company>();
  const links: CompanySnapshot['links'] = [];
  const institutionStatuses: CompanySnapshot['institutionStatuses'] = {};
  for (const row of rows) {
    const sourceRow = positiveRow(row['原始序号'], 0);
    const institution = institutionsByRow.get(sourceRow);
    if (!institution || row['机构原名'] !== institution.name || row['区'] !== institution.district) throw new Error(`原始序号${sourceRow}的机构原名或区与官方记录不一致。`);
    if (institutionStatuses[institution.id]) throw new Error(`原始序号${sourceRow}的私有状态重复。`);
    const status = row['工商查询状态'];
    if (status === '待识别企业主体' || status === '主体名称待复核') {
      if (row['企业名称'] || row['统一社会信用代码']) throw new Error(`原始序号${sourceRow}的未确认状态包含意外登记主体。`);
      institutionStatuses[institution.id] = status === '待识别企业主体' ? 'unidentified' : 'review';
      continue;
    }
    if (status !== '已查_名称一致' && status !== '已查_仅括号标点差异') throw new Error(`原始序号${sourceRow}的工商查询状态未知。`);
    const creditCode = row['统一社会信用代码'];
    if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(creditCode)) throw new Error(`原始序号${sourceRow}的统一社会信用代码格式无效。`);
    const candidateName = row['候选主体'];
    const name = row['企业名称'];
    const matchType = status === '已查_名称一致' ? 'exact' : 'parentheses';
    if (!candidateName || !name || (matchType === 'exact' ? candidateName !== name : normalizeParentheses(candidateName) !== normalizeParentheses(name) || candidateName === name)) {
      throw new Error(`原始序号${sourceRow}的企业名称与声明的匹配依据不一致。`);
    }
    const company: Company = {
      name, creditCode, legalRepresentative: optionalText(row['法定代表人']), status: optionalText(row['登记状态']),
      establishedAt: optionalText(row['成立日期']), registeredCapital: optionalText(row['注册资本']), paidInCapital: optionalText(row['实缴资本']),
      enterpriseType: optionalText(row['企业类型']), approvedAt: optionalText(row['核准日期']), region: optionalText(row['所属地区']),
      authority: optionalText(row['登记机关']), address: optionalText(row['注册地址']), businessScope: optionalText(row['经营范围']),
    };
    const existing = companies.get(creditCode);
    if (existing && JSON.stringify(existing) !== JSON.stringify(company)) throw new Error(`原始序号${sourceRow}对应的同一信用代码存在冲突登记字段。`);
    companies.set(creditCode, company);
    institutionStatuses[institution.id] = 'matched';
    links.push({ institutionId: institution.id, companyCreditCode: creditCode, candidateName, matchType,
      evidence: [row['提取依据'], row['复核提示']].filter(Boolean).join('；'), relationshipVerified: false, queriedAt: COMPANY_QUERIED_AT });
  }
  if (companies.size !== 126 || links.length !== 144 || links.filter((link) => link.matchType === 'exact').length !== 126 || links.filter((link) => link.matchType === 'parentheses').length !== 18 || Object.values(institutionStatuses).filter((status) => status === 'unidentified').length !== 86 || Object.values(institutionStatuses).filter((status) => status === 'review').length !== 5) {
    throw new Error('私有快照数量与已批准的126主体／144关联／86未识别／5待复核不一致。');
  }
  return { schemaVersion: 1, snapshotId: SNAPSHOT_ID, queriedAt: COMPANY_QUERIED_AT, companies: [...companies.values()], links, institutionStatuses };
}
