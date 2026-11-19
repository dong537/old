export interface QccIndexRecord {
  id: string;
  rowNumber: number;
  name: string;
  city: string;
  district: string | null;
  subjectType: string | null;
  registrationStatus: string | null;
  chunk: string;
}

export interface QccIndex {
  schemaVersion: 1;
  snapshotId: string;
  exportedAt: string;
  sourceSha256: string;
  records: QccIndexRecord[];
}

export const QCC_SOURCE_FIELD_NAMES = [
  '企业名称', '登记状态', '法定代表人', '注册资本', '成立日期', '统一社会信用代码',
  '注册地址', '注册地址邮编', '所属省份', '所属城市', '所属区县', '有效手机号',
  '更多电话', '邮箱', '企业(机构)类型', '纳税人识别号', '注册号', '组织机构代码',
  '参保人数', '参保人数所属年报', '营业期限', '国标行业门类', '国标行业大类',
  '国标行业中类', '国标行业小类', '企查查行业门类', '企查查行业大类',
  '企查查行业中类', '企查查行业小类', '企业规模', '曾用名', '英文名',
  '官网网址', '通信地址', '通信地址邮编', '企业简介', '经营范围',
] as const;

export interface QccDetailRecord extends Omit<QccIndexRecord, 'chunk'> {
  sourceFields: Record<string, string | number | null>;
  creditCode: string | null;
  codeValidity: string | null;
  legalRepresentative: string | null;
  establishedAt: string | null;
  registeredCapital: string | null;
  organizationCode: string | null;
  registrationNo: string | null;
  taxId: string | null;
  businessTerm: string | null;
  insuredPersons: string | null;
  insuredYear: string | null;
  nationalIndustry: string | null;
  address: string | null;
  mailingAddress: string | null;
  businessScope: string | null;
  formerName: string | null;
  englishName: string | null;
  companySize: string | null;
}

export interface QccChunk {
  schemaVersion: 1;
  snapshotId: string;
  records: QccDetailRecord[];
}

export interface QccLinks {
  schemaVersion: 1;
  snapshotId: string;
  links: { sourceRecordId: string; subjectIds: string[] }[];
}

