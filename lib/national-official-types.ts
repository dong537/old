export interface NationalOfficialSource {
  id: string;
  province: string;
  city: string | null;
  scope: string;
  title: string;
  url: string;
  publishedAt: string | null;
  asOf: string | null;
  sha256: string;
  rowCount: number;
}

export interface NationalOfficialCity {
  slug: string;
  name: string;
  count: number;
  indexPath: string;
}

export interface NationalOfficialProvince {
  slug: string;
  name: string;
  count: number;
  cities: NationalOfficialCity[];
}

export interface NationalOfficialManifest {
  schemaVersion: 1;
  snapshotId: string;
  archivedAt: string;
  rowCount: number;
  sources: NationalOfficialSource[];
  provinces: NationalOfficialProvince[];
}

export interface NationalOfficialIndexRecord {
  id: string;
  sourceId: string;
  rowNumber: number;
  name: string;
  address: string | null;
  beds: number | null;
  chunk: string;
}

export interface NationalOfficialIndex {
  schemaVersion: 1;
  snapshotId: string;
  provinceSlug: string;
  citySlug: string;
  records: NationalOfficialIndexRecord[];
}

export interface NationalOfficialDetailRecord extends Omit<NationalOfficialIndexRecord, 'chunk'> {
  residentCount: number | null;
  staffCount: number | null;
  services: string | null;
}

export interface NationalOfficialChunk {
  schemaVersion: 1;
  snapshotId: string;
  provinceSlug: string;
  citySlug: string;
  records: NationalOfficialDetailRecord[];
}
