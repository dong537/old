export interface InstitutionRegistryLinksManifest {
  schemaVersion: 1;
  snapshotId: string;
  referenceSnapshotId: string;
  nationalSnapshotId: string;
  guangdongSnapshotId: string;
  referenceRowCount: number;
  eligibleReferenceCount: number;
  uniqueCodeHitCount: number;
  linkedReferenceCount: number;
  crossProvinceHitCount: number;
  ambiguousReferenceCount: number;
  regionCount: number;
}

export interface InstitutionRegistryTarget {
  kind: 'nationalRegistry' | 'guangdongRegistry';
  id: string;
  provinceSlug: string | null;
  citySlug: string | null;
  province: string;
  city: string;
  name: string;
}

export interface InstitutionRegistryCityLinks {
  schemaVersion: 1;
  snapshotId: string;
  referenceSnapshotId: string;
  provinceSlug: string;
  citySlug: string;
  links: { referenceId: string; target: InstitutionRegistryTarget }[];
}
