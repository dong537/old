import type { QccDetailRecord, QccIndexRecord } from './qcc-types';

export interface QccNationalSourceFile {
  id: string;
  filename: string;
  sha256: string;
  rowCount: number;
}

export interface QccNationalCity {
  slug: string;
  name: string;
  count: number;
  indexPath: string;
}

export interface QccNationalProvince {
  slug: string;
  name: string;
  count: number;
  cities: QccNationalCity[];
}

export interface QccNationalManifest {
  schemaVersion: 1;
  snapshotId: string;
  exportedAt: string;
  rowCount: number;
  sourceFiles: QccNationalSourceFile[];
  provinces: QccNationalProvince[];
}

export interface QccNationalIndexRecord extends QccIndexRecord {
  province: string;
  sourceId: string;
}

export interface QccNationalIndex {
  schemaVersion: 1;
  snapshotId: string;
  provinceSlug: string;
  citySlug: string;
  records: QccNationalIndexRecord[];
}

export interface QccNationalDetailRecord extends QccDetailRecord {
  province: string;
  sourceId: string;
}

export interface QccNationalChunk {
  schemaVersion: 1;
  snapshotId: string;
  provinceSlug: string;
  citySlug: string;
  records: QccNationalDetailRecord[];
}
