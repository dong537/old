import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMcaFacilityField, type FacilityFieldEvidence } from '../lib/mca-field-resolution';

const local: FacilityFieldEvidence<string> = {
  field: 'facilityName',
  value: '旧称养老院',
  source: 'local-official',
  recordId: 'gz-000180',
  subject: 'facility',
  capturedAt: '2026-11-17',
  asOf: '2021-12-31',
};
const mca: FacilityFieldEvidence<string> = {
  ...local, value: '新称养老院', source: 'mca-platform', recordId: 'mca-123',
  capturedAt: '2026-11-18', asOf: null,
};
const verified = { status: 'verified' as const, localRecordId: local.recordId, mcaRecordId: mca.recordId,
  verificationEvidence: '同一场所：官方来源编号与地址核对', reviewedAt: '2026-11-18' };

test('verified same-facility values prefer MCA and retain source-level conflict', () => {
  const result = resolveMcaFacilityField(local, mca, verified);
  assert.deepEqual(result, {
    selected: mca, alternatives: [local], candidate: null, conflict: true, reason: 'mca-preferred',
  });
  assert.equal(result.selected?.asOf, null);
  assert.equal(result.alternatives[0]?.asOf, '2021-12-31');
});

test('unknown MCA value cannot erase a known value, but zero is valid', () => {
  const beds: FacilityFieldEvidence<number> = { ...local, field: 'listedBeds', value: 100 };
  const mcaBeds: FacilityFieldEvidence<number> = { ...mca, field: 'listedBeds', value: null };
  assert.equal(resolveMcaFacilityField(beds, mcaBeds, verified).selected, beds);
  const zero = { ...mcaBeds, value: 0 };
  const result = resolveMcaFacilityField(beds, zero, verified);
  assert.equal(result.selected, zero);
  assert.equal(result.conflict, true);
  assert.equal(resolveMcaFacilityField(local, { ...mca, value: '   ' }, verified).selected, local);
});

test('candidate match keeps MCA separate and cannot overwrite local facility', () => {
  const result = resolveMcaFacilityField(local, mca, { ...verified, status: 'candidate' });
  assert.deepEqual(result, {
    selected: local, alternatives: [], candidate: mca, conflict: false, reason: 'match-unverified',
  });
});

test('different field semantics and legal entity values cannot be merged', () => {
  assert.throws(() => resolveMcaFacilityField(local, { ...mca, field: 'facilityAddress' }, verified), /field/i);
  assert.throws(() => resolveMcaFacilityField(local, { ...mca, subject: 'legal-entity' }, verified), /facility/i);
  assert.throws(() => resolveMcaFacilityField(local, mca, { ...verified, mcaRecordId: 'other' }), /record/i);
});

test('equal normalized values are not reported as conflicts', () => {
  const result = resolveMcaFacilityField(local, { ...mca, value: local.value }, verified);
  assert.equal(result.selected?.source, 'mca-platform');
  assert.equal(result.conflict, false);
  assert.deepEqual(result.alternatives, [local]);
});

test('verified links require review evidence before platform values override', () => {
  assert.throws(() => resolveMcaFacilityField(local, mca,
    { ...verified, verificationEvidence: ' ' }), /verification/i);
});

test('non-finite numeric values are rejected instead of selected', () => {
  const beds: FacilityFieldEvidence<number> = { ...local, field: 'listedBeds', value: 100 };
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalid: FacilityFieldEvidence<number> = { ...mca, field: 'listedBeds', value };
    assert.throws(() => resolveMcaFacilityField(beds, invalid, verified), /finite/i);
  }
});
