import type { McaCatalogManifest } from './mca-catalog-types';

/** 口径只来自主目录清单；来源行、候选主体和平台 ID 不相加。 */
export function summarizeMcaCatalog(manifest: McaCatalogManifest) {
  return {
    recordCount: manifest.recordCount,
    detailCount: manifest.detailCount,
    indexOnlyCount: manifest.recordCount - manifest.detailCount,
    csvRowCount: manifest.csvRowCount,
    csvStaleCount: manifest.csvStaleCount,
    csvExportDate: manifest.csvExportDate,
    snapshotId: manifest.snapshotId,
    nationalComplete: manifest.nationalComplete,
    currentStatusVerified: manifest.currentStatusVerified,
  };
}
