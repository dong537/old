export type ServiceRecordType = 'annual-assessment' | 'designation-notice';

export interface ServiceSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  accessedAt: string;
  kind: ServiceRecordType;
  period: string;
  limitations: string;
}

export interface ServiceRecord {
  id: string;
  sourceId: string;
  sourceRow: number;
  name: string;
  address: string | null;
  district: string | null;
  districtBasis: 'source' | 'address-text' | null;
  recordType: ServiceRecordType;
  providerType: string | null;
  assessmentGrade: string | null;
  serviceCategory: string | null;
  serviceItems: string | null;
}

export interface ServiceCatalog {
  schemaVersion: 1;
  snapshotId: string;
  sources: ServiceSource[];
  records: ServiceRecord[];
}
