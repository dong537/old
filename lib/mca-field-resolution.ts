/** Resolve one facility-level fact after an explicit source-record match.
 * Legal-entity registration and facility attributes have different owners.
 */
export type FacilityFieldValue = string | number | boolean | readonly string[];

export type FacilitySemanticField =
  | 'facilityName' | 'facilityAddress' | 'facilityType' | 'listedBeds'
  | 'nursingBeds' | 'serviceFunctions';

export interface FacilityFieldEvidence<T extends FacilityFieldValue = FacilityFieldValue> {
  field: FacilitySemanticField;
  value: T | null;
  source: 'mca-platform' | 'local-official' | 'qcc';
  recordId: string;
  subject: 'facility' | 'legal-entity';
  /** Retrieval date. This is not automatically the source's update date. */
  capturedAt: string;
  asOf: string | null;
}

interface FacilityRecordLink {
  localRecordId: string;
  mcaRecordId: string;
}

export type FacilityRecordMatch =
  | (FacilityRecordLink & { status: 'candidate' })
  | (FacilityRecordLink & { status: 'verified'; verificationEvidence: string; reviewedAt: string });

export interface FacilityFieldResolution<T extends FacilityFieldValue> {
  selected: FacilityFieldEvidence<T> | null;
  alternatives: FacilityFieldEvidence<T>[];
  /** Unverified platform value stays separate from this facility's facts. */
  candidate: FacilityFieldEvidence<T> | null;
  conflict: boolean;
  reason: 'mca-preferred' | 'existing-retained' | 'match-unverified' | 'no-value';
}

function hasValue(value: FacilityFieldValue | null): boolean {
  if (value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function sameValue(a: FacilityFieldValue, b: FacilityFieldValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}

export function resolveMcaFacilityField<T extends FacilityFieldValue>(
  existing: FacilityFieldEvidence<T> | null,
  platform: FacilityFieldEvidence<T> | null,
  match: FacilityRecordMatch | null,
): FacilityFieldResolution<T> {
  if ((existing?.subject !== undefined && existing.subject !== 'facility') ||
      (platform?.subject !== undefined && platform.subject !== 'facility')) {
    throw new Error('Only facility facts can be resolved here.');
  }
  if (platform && platform.source !== 'mca-platform') throw new Error('Platform evidence source must be MCA.');
  if (existing && existing.source === 'mca-platform') throw new Error('Existing evidence must be from another source.');
  if (existing && platform && existing.field !== platform.field) throw new Error('Facility field semantics differ.');
  if ([existing, platform].some(evidence => typeof evidence?.value === 'number' && !Number.isFinite(evidence.value))) {
    throw new Error('Facility numeric facts must be finite.');
  }
  if (match && (existing && match.localRecordId !== existing.recordId ||
      platform && match.mcaRecordId !== platform.recordId)) {
    throw new Error('Facility record IDs do not match the reviewed link.');
  }
  if (match?.status === 'verified' &&
      (!match.verificationEvidence.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(match.reviewedAt))) {
    throw new Error('Verified facility match requires verification evidence and date.');
  }

  const localValue = existing && hasValue(existing.value) ? existing : null;
  const platformValue = platform && hasValue(platform.value) ? platform : null;
  if (match?.status !== 'verified') {
    return { selected: localValue, alternatives: [], candidate: platformValue, conflict: false,
      reason: 'match-unverified' };
  }
  if (platformValue) {
    return { selected: platformValue, alternatives: localValue ? [localValue] : [], candidate: null,
      conflict: Boolean(localValue && !sameValue(localValue.value!, platformValue.value!)),
      reason: 'mca-preferred' };
  }
  return { selected: localValue, alternatives: [], candidate: null, conflict: false,
    reason: localValue ? 'existing-retained' : 'no-value' };
}
