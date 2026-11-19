import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildProvinceReview } from '../scripts/province-pipeline';
import { matchEventCandidates } from '../scripts/event-candidates';

test('event name matches remain unverified identity candidates', () => {
  const result = matchEventCandidates([
    { event_id: 'e1', city: '清远', institution_name_as_published: '星光（中心）', source_url: 'https://example.org/e1', source_published_at: '2026-10-09', source_sha256: 'a'.repeat(64) },
    { event_id: 'e2', city: '汕头', institution_name_as_published: '未收录机构', source_url: 'https://example.org/e2', source_published_at: '2025-05-08', source_sha256: 'b'.repeat(64) },
  ], [{ candidateKey: 'candidate-1', city: '清远', normalizedName: '星光（中心）' }]);
  assert.equal(result.manifest.eventCount, 2);
  assert.equal(result.manifest.exactNameCandidates, 1);
  assert.equal(result.manifest.unmatched, 1);
  assert.deepEqual(result.links.map(link => link.candidateKey), ['candidate-1', null]);
  assert.ok(result.links.every(link => link.identityVerified === false));
  assert.equal(result.links[0].sourceSha256, 'a'.repeat(64));
});

test('duplicate event IDs and ambiguous candidate keys stop cleaning', () => {
  const item = { event_id: 'e1', city: '清远', institution_name_as_published: '星光', source_url: 'https://example.org/e1', source_published_at: '2026-10-09', source_sha256: 'a'.repeat(64) };
  assert.throws(() => matchEventCandidates([item, item], []), /重复事件/);
  assert.throws(() => matchEventCandidates([item], [
    { candidateKey: 'one', city: '清远', normalizedName: '星光' },
    { candidateKey: 'two', city: '清远', normalizedName: '星光' },
  ]), /候选键冲突/);
});

const source = 'data/private/guangdong-eldercare-source/';
const hasPrivateEvents = existsSync(source + 'events/20261114-reviewed/机构官方事件.json') && existsSync(source + 'exports/20261114_batch10/机构名录_逐条来源.csv');
test('reviewed real events are retained even where the institution snapshot has no exact name', { skip: !hasPrivateEvents }, () => {
  const events = JSON.parse(readFileSync(source + 'events/20261114-reviewed/机构官方事件.json', 'utf8')).events;
  const csv = readFileSync(source + 'exports/20261114_batch10/机构名录_逐条来源.csv', 'utf8');
  const groups = buildProvinceReview(csv).candidateGroups;
  const result = matchEventCandidates(events, groups);
  assert.equal(result.manifest.eventCount, 10);
  assert.equal(result.manifest.exactNameCandidates, 5);
  assert.equal(result.manifest.unmatched, 5);
  assert.ok(result.links.every(link => link.identityVerified === false));
});
