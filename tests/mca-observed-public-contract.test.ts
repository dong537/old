import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateMcaObservedOutput } from '../scripts/check-mca-observed-output';

test('committed MCA partial snapshot matches its public projection contract', () => {
  const root = path.resolve('public/data/mca-observed');
  const files = new Map<string, string>();
  function walk(folder: string): void {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.set(path.relative(path.resolve('public'), file).split(path.sep).join('/'), readFileSync(file, 'utf8'));
    }
  }
  walk(root);
  validateMcaObservedOutput(files);
  const manifest = JSON.parse(files.get('data/mca-observed/manifest.v1.json')!);
  const index = JSON.parse(files.get('data/mca-observed/index.v1.json')!);
  assert.equal(manifest.scope, 'partial_observed_mca_institutions');
  assert.equal(manifest.nationalComplete, false);
  assert.equal(manifest.recordCount, 3726);
  assert.equal(manifest.listObservedCount, 3716);
  assert.equal(manifest.withDetailCount, 131);
  assert.equal(manifest.detailOnlyCount, 10);
  assert.equal(index.records.filter((record: { hasDetail: boolean }) => !record.hasDetail).length, 3595);
});
