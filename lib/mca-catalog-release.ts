export class CatalogSnapshotMismatchError extends Error {
  constructor(readonly actualSnapshotId: string, readonly expectedSnapshotId: string) {
    super('目录清单与机构索引属于不同发布版本，请刷新页面。');
    this.name = 'CatalogSnapshotMismatchError';
  }
}

export function requireMatchingCatalogSnapshot(actualSnapshotId: string, expectedSnapshotId: string): void {
  if (actualSnapshotId !== expectedSnapshotId) {
    throw new CatalogSnapshotMismatchError(actualSnapshotId, expectedSnapshotId);
  }
}

type ReloadStorage = Pick<Storage, 'getItem' | 'setItem'>;
const RELOAD_KEY = 'mca-catalog-reload-snapshot-id';

export function claimCatalogReload(storage: ReloadStorage, snapshotId: string): boolean {
  if (storage.getItem(RELOAD_KEY) === snapshotId) return false;
  storage.setItem(RELOAD_KEY, snapshotId);
  return true;
}
