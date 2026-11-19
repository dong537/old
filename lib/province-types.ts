export interface ProvinceSourceRecord {
  id: string;
  city: string;
  name: string;
  evidenceType: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  sourceAsOf: string | null;
  sourceStatusNote: string | null;
}

export interface ProvinceCatalog {
  schemaVersion: 1;
  snapshotId: string;
  archivedAt: string;
  records: ProvinceSourceRecord[];
}
