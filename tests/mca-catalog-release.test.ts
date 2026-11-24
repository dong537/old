import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogSnapshotMismatchError, claimCatalogReload, requireMatchingCatalogSnapshot } from '../lib/mca-catalog-release';

test('只把目录快照版本不一致识别为跨发布状态', () => {
  assert.doesNotThrow(() => requireMatchingCatalogSnapshot('catalog-a', 'catalog-a'));
  assert.throws(() => requireMatchingCatalogSnapshot('catalog-b', 'catalog-a'), CatalogSnapshotMismatchError);
});

test('同一个旧目录快照在当前标签页只自动刷新一次', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(claimCatalogReload(storage, 'catalog-old'), true);
  assert.equal(claimCatalogReload(storage, 'catalog-old'), false);
  assert.equal(claimCatalogReload(storage, 'catalog-new'), true);
});

test('无法保存刷新状态时明确失败，不进入无限刷新', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('storage unavailable'); },
  };
  assert.throws(() => claimCatalogReload(storage, 'catalog-old'), /storage unavailable/);
});
