import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('one shared back-to-top control and focus target are wired into the root layout', () => {
  const layout=readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8');
  assert.equal((layout.match(/<BackToTop\s*\/>/g) ?? []).length,1);
  assert.match(layout,/id="page-top" tabIndex=\{-1\}/);
});
