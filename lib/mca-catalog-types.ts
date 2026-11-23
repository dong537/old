import type { McaPublicIndexRecord } from './mca-public-types';

/** The locked input layout; images_json stays private until image URLs can be reviewed. */
export const MCA_CSV_COLUMNS = [
  'org_id', 'name', 'org_type', 'area', 'area_code', 'address', 'contact', 'phone',
  'found_date', 'building_area', 'tags', 'services', 'total_beds', 'beds',
  'nursing_beds', 'fee_month_min', 'fee_month_max', 'fee_bed_min', 'fee_bed_max',
  'fee_care_min', 'fee_care_max', 'fee_meal_min', 'fee_meal_max', 'intro',
  'service_detail', 'service_team', 'service_time', 'service_radius',
  'service_radius_explain', 'point', 'risk_level', 'evaluation', 'eval_count',
  'fee_detail_json', 'images_json', 'status', 'updated_at', 'cx_beds',
  'cx_nursing_beds', 'cx_fee_day_min', 'cx_fee_day_max', 'cx_fee_detail_json',
  'rt_beds', 'rt_nursing_beds', 'rt_fee_day_min', 'rt_fee_day_max',
  'rt_fee_detail_json', 'home_fee_time_min', 'home_fee_time_max',
  'home_service_project', 'assess_fee_home', 'assess_fee_site',
] as const;

export type McaCsvColumn = typeof MCA_CSV_COLUMNS[number];
export const MCA_CATALOG_CSV_FIELDS = MCA_CSV_COLUMNS.filter(
  (column): column is Exclude<McaCsvColumn, 'images_json'> => column !== 'images_json',
);

export interface McaCatalogChargeItem {
  serviceType: string | null;
  project: string | null;
  priceRangeText: string | null;
}

/** One typed value for each CSV column except images_json; null never means zero. */
export interface McaCatalogCsvFields {
  org_id: string;
  name: string;
  org_type: string;
  area: string;
  area_code: string;
  address: string | null;
  contact: string | null;
  phone: string | null;
  found_date: string | null;
  building_area: number | null;
  tags: string[] | null;
  services: string[] | null;
  total_beds: number | null;
  beds: number | null;
  nursing_beds: number | null;
  fee_month_min: number | null;
  fee_month_max: number | null;
  fee_bed_min: number | null;
  fee_bed_max: number | null;
  fee_care_min: number | null;
  fee_care_max: number | null;
  fee_meal_min: number | null;
  fee_meal_max: number | null;
  intro: string | null;
  service_detail: string | null;
  service_team: string | null;
  service_time: string | null;
  service_radius: string | null;
  service_radius_explain: string | null;
  point: string | null;
  risk_level: string | null;
  evaluation: number | null;
  eval_count: number | null;
  fee_detail_json: McaCatalogChargeItem[] | null;
  status: 'ok' | 'stale';
  /** Collector-local timestamp without a timezone; not the source's publication date. */
  updated_at: string;
  cx_beds: number | null;
  cx_nursing_beds: number | null;
  cx_fee_day_min: number | null;
  cx_fee_day_max: number | null;
  cx_fee_detail_json: McaCatalogChargeItem[] | null;
  rt_beds: number | null;
  rt_nursing_beds: number | null;
  rt_fee_day_min: number | null;
  rt_fee_day_max: number | null;
  rt_fee_detail_json: McaCatalogChargeItem[] | null;
  home_fee_time_min: number | null;
  home_fee_time_max: number | null;
  home_service_project: string | null;
  assess_fee_home: number | null;
  assess_fee_site: number | null;
}

export interface McaCatalogManifest {
  schemaVersion: 1;
  scope: 'partial_mca_csv_catalog';
  snapshotId: string;
  observedSnapshotId: string;
  sourceCsvSha256: string;
  csvExportDate: '2026-11-23';
  generatedAtUtc: string;
  csvRowCount: number;
  csvStaleCount: number;
  observedRecordCount: number;
  overlapCount: number;
  recordCount: number;
  detailCount: number;
  nationalComplete: false;
  currentStatusVerified: false;
}

export type McaCatalogIndexRecord = McaPublicIndexRecord & (
  | { sourceKind: 'observed'; collectorStatus: null; csvUpdatedAtLocal: null }
  | { sourceKind: 'csv'; collectorStatus: 'ok' | 'stale'; csvUpdatedAtLocal: string; detailPath: string; hasDetail: true }
);

export interface McaCatalogIndex {
  schemaVersion: 1;
  snapshotId: string;
  records: McaCatalogIndexRecord[];
}

export interface McaCatalogCsvDetail {
  schemaVersion: 1;
  snapshotId: string;
  mcaId: string;
  sourceKind: 'csv';
  fields: McaCatalogCsvFields;
}
