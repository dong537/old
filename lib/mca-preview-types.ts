/** Private, observed MCA records. This is not a publishable nationwide catalog. */
export interface McaPreviewManifest {
  schemaVersion: 1;
  snapshotId: string;
  scope: 'private_mca_observed_institutions';
  publishable: false;
  nationalComplete: false;
  snapshotVerified: false;
  fieldSemantics: 'partially_mapped';
  privacyReview: 'required';
  sourceSnapshots: { lane: string; sha256: string; capturedAtUtc: string | null }[];
  recordCount: number;
  withDetailCount: number;
  listObservationCount: number;
  detailObservationCount: number;
  withConflictCount: number;
  fieldPathCount: number;
  ignored: Record<string, number>;
  indexPath: 'index.json';
  fieldCatalogPath: 'field-catalog.json';
  detailDirectory: 'details';
}

export const mcaPreviewFields = [
  'name', 'facilityTypeCode', 'facilityTypeLabel', 'areaCode', 'regionLabel',
  'regionPath', 'address', 'listedBeds', 'nursingBeds',
  'listedMonthlyFeeMin', 'listedMonthlyFeeMax',
  'platformStarCode', 'evaluationCount', 'overallEvaluation',
  'functionPositioningLabel', 'platformTagsRaw',
] as const;
export type McaPreviewField = typeof mcaPreviewFields[number];

export interface McaPreviewIndexRecord {
  mcaId: string;
  detailPath: string;
  name: string | null;
  facilityTypeCode: string | null;
  facilityTypeLabel: string | null;
  areaCode: string | null;
  regionLabel: string | null;
  regionPath: string | null;
  address: string | null;
  listedBeds: number | null;
  nursingBeds: number | null;
  listedMonthlyFeeMin: number | null;
  listedMonthlyFeeMax: number | null;
  platformStarCode: string | null;
  evaluationCount: number | null;
  overallEvaluation: number | null;
  functionPositioningLabel: string | null;
  platformTagsRaw: string | null;
  hasDetail: boolean;
  listObservationCount: number;
  detailObservationCount: number;
  conflictFields: McaPreviewField[];
}

export interface McaPreviewIndex {
  schemaVersion: 1;
  snapshotId: string;
  publishable: false;
  records: McaPreviewIndexRecord[];
}

export type McaJsonValue = null | boolean | number | string | McaJsonValue[] | { [key: string]: McaJsonValue };
export interface McaPreviewSource { [key: string]: McaJsonValue }
export interface McaPreviewObservation { source: McaPreviewSource; sourceFields: Record<string, McaJsonValue> }
export interface McaPreviewDetailObservation {
  source: McaPreviewSource;
  endpoints: { orgBaseDetail: McaPreviewObservation; yangLaoOrgDetail: McaPreviewObservation };
}
export interface McaPreviewDetail {
  schemaVersion: 1;
  mcaId: string;
  publishable: false;
  selectedFieldSources: Partial<Record<McaPreviewField, { channel: string; source: McaPreviewSource }>>;
  conflictFields: McaPreviewField[];
  listObservations: McaPreviewObservation[];
  detailObservations: McaPreviewDetailObservation[];
}

export interface McaPreviewCatalog { manifest: McaPreviewManifest; index: McaPreviewIndex }
export interface McaPreviewDetailResult { record: McaPreviewIndexRecord; detail: McaPreviewDetail; manifest: McaPreviewManifest }
