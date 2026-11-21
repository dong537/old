import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Guangdong source record uses the nationwide full-width official-style detail shell', () => {
  const source = readFileSync('app/guangdong/jigou/[id]/page.tsx', 'utf8');
  assert.match(source, /<PublicInstitutionBottomNav name=\{record\.name\} items=\{toc\} \/>/);
  assert.match(source, /mapProvinceSourceDetail\(record\)/);
  assert.match(source, /<PublicInstitutionHero/);
  assert.match(source, /<PublicInstitutionSummary dto=\{dto\}/);
  assert.match(source, /<PublicInstitutionDetailSections dto=\{dto\}/);
  assert.doesNotMatch(source, /<ProfileToc|variant="side"/);
  for (const anchor of ['overview', 'fields', 'services', 'care', 'reviews', 'sources', 'checklist']) {
    assert.ok(source.includes(`{ id: '${anchor}'`), `missing navigation target ${anchor}`);
  }
  assert.match(source, /<QccCandidateLinks/);
  assert.match(source, /<ProvinceCoverageNote/);
  assert.match(source, /sameName.length > 1/);
  assert.match(source, /不能统称已登记养老机构/);
});
