import type { McaPreviewFactDto, McaPreviewPlatformDetailDto, McaPreviewResolved } from './mca-preview-dto';
import type { McaPreviewIndexRecord } from './mca-preview-types';

/** A dated, partial publication. It never changes the private snapshot's publishable=false flag. */
export interface McaObservedTimeRange { earliest: string; latest: string }

export interface McaPublicManifest {
  schemaVersion: 1;
  scope: 'partial_observed_mca_institutions';
  snapshotId: string;
  sourcePage: string;
  snapshotCapturedAtUtc: string;
  generatedAtUtc: string;
  recordCount: number;
  listObservedCount: number;
  withDetailCount: number;
  detailOnlyCount: number;
  nationalComplete: false;
  currentStatusVerified: false;
  sourceSnapshots: { lane: string; sha256: string; capturedAtUtc: string | null }[];
}

export type McaPublicIndexRecord = Omit<McaPreviewIndexRecord, 'detailPath'> & {
  detailPath: string | null;
  listedContactPhone: McaPreviewResolved<string>;
  serviceCategoryLabel: McaPreviewResolved<string>;
  subsidyCode: McaPreviewResolved<string>;
  dayCareBeds: McaPreviewResolved<number>;
  fullCareBeds: McaPreviewResolved<number>;
  listObservedAtUtc: McaObservedTimeRange | null;
};

export interface McaPublicIndex {
  schemaVersion: 1;
  snapshotId: string;
  records: McaPublicIndexRecord[];
}

export interface McaPublicDetailRecord {
  schemaVersion: 1;
  snapshotId: string;
  mcaId: string;
  sourcePage: string;
  detailObservedAtUtc: McaObservedTimeRange;
  platformDetail: McaPreviewPlatformDetailDto;
  facts: McaPreviewFactDto[];
  conflictLabels: string[];
}
