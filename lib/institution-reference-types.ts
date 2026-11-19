export type ReferenceCodeStatus = 'valid' | 'missing' | 'placeholder' | 'invalid';

export const REFERENCE_SOURCE_FIELD_NAMES = [
  '统一社会信用代码', '地址', '行政区划代码', '机构名称', '地区', '床位数',
  '省份', '城市', '区县', '经度', '纬度',
] as const;

export interface ReferenceCity {
  slug: string;
  name: string;
  count: number;
  indexPath: string;
}

export interface ReferenceProvince {
  slug: string;
  name: string;
  count: number;
  cities: ReferenceCity[];
}

export interface ReferenceManifest {
  schemaVersion: 1;
  snapshotId: string;
  receivedAt: string;
  rowCount: number;
  source: { title: string; sha256: string; asOf: null };
  provinces: ReferenceProvince[];
}

export interface ReferenceIndexRecord {
  id: string;
  sourceRow: number;
  name: string;
  region: string;
  address: string | null;
  beds: number;
  chunk: string;
}

export interface ReferenceIndex {
  schemaVersion: 1;
  snapshotId: string;
  provinceSlug: string;
  citySlug: string;
  records: ReferenceIndexRecord[];
}

export interface ReferenceDetailRecord extends Omit<ReferenceIndexRecord, 'chunk'> {
  creditCode: string | null;
  codeStatus: ReferenceCodeStatus;
  sourceFields: Record<string, string | number | null>;
}

export interface ReferenceChunk {
  schemaVersion: 1;
  snapshotId: string;
  provinceSlug: string;
  citySlug: string;
  records: ReferenceDetailRecord[];
}

export interface ReferenceLinksManifest {
  schemaVersion: 1;
  snapshotId: string;
  referenceSnapshotId: string;
  officialSnapshotId: string;
  guangdongSnapshotId: string;
  linkedReferenceCount: number;
  matchCount: number;
  regionCount: number;
}

export interface ReferenceOfficialMatch {
  kind: 'nationalOfficial' | 'guangdongOfficial';
  id: string;
  provinceSlug: string | null;
  citySlug: string | null;
  city: string;
  sourceTitle: string;
}

export interface ReferenceLinksCityFile {
  schemaVersion: 1;
  snapshotId: string;
  referenceSnapshotId: string;
  provinceSlug: string;
  citySlug: string;
  links: { referenceId: string; matches: ReferenceOfficialMatch[] }[];
}
