export interface Institution {
  id: string;
  sourceRow: number;
  name: string;
  district: string;
  address: string;
  phone: string | null;
  phoneHref: string | null;
  phoneWithheld: boolean;
  registeredBeds: number | null;
  advanceFee: boolean | null;
  deposit: boolean | null;
  membershipFee: boolean | null;
  qualityNotes: string[];
}

export interface IdMapEntry { sourceRow: number; name: string; id: string }

export interface Catalog {
  schemaVersion: 1;
  snapshotId: string;
  source: { title: string; url: string; publishedAt: string };
  institutions: Institution[];
}

export interface Company {
  name: string;
  creditCode: string;
  legalRepresentative: string | null;
  status: string | null;
  establishedAt: string | null;
  registeredCapital: string | null;
  paidInCapital: string | null;
  enterpriseType: string | null;
  approvedAt: string | null;
  region: string | null;
  authority: string | null;
  address: string | null;
  businessScope: string | null;
}

export interface InstitutionCompanyLink {
  institutionId: string;
  companyCreditCode: string;
  candidateName: string;
  matchType: 'exact' | 'parentheses';
  evidence: string;
  relationshipVerified: false;
  queriedAt: string;
}

export type CompanyStatus = 'matched' | 'unidentified' | 'review' | 'not-published';

export interface CompanySnapshot {
  schemaVersion: 1;
  snapshotId: string;
  queriedAt: string;
  companies: Company[];
  links: InstitutionCompanyLink[];
  institutionStatuses: Record<string, Exclude<CompanyStatus, 'not-published'>>;
}

export interface CompanyPreview { company: Company; link: InstitutionCompanyLink }
