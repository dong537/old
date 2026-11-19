import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { catalog } from './catalog';
import type { CompanyPreview, CompanySnapshot, CompanyStatus } from './types';

if (process.env.NODE_ENV !== 'development' || process.env.ELDERCARE_PRIVATE_PREVIEW !== '1') {
  throw new Error('工商快照仅允许显式本机开发预览，禁止生产模式。');
}

const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), 'data/private/generated/company-preview.json'), 'utf8')) as CompanySnapshot;
const knownInstitutionIds = new Set(catalog.institutions.map((institution) => institution.id));
const companyCodes = new Set(snapshot.companies.map((company) => company.creditCode));
const linkedInstitutions = new Set(snapshot.links.map((link) => link.institutionId));
if (snapshot.schemaVersion !== 1 || snapshot.companies.length !== 126 || companyCodes.size !== 126 || snapshot.links.length !== 144 ||
  linkedInstitutions.size !== 144 || Object.keys(snapshot.institutionStatuses).length !== knownInstitutionIds.size ||
  Object.entries(snapshot.institutionStatuses).some(([id, status]) => !knownInstitutionIds.has(id) || !['matched', 'unidentified', 'review'].includes(status)) ||
  snapshot.links.some((link) => !knownInstitutionIds.has(link.institutionId) || !companyCodes.has(link.companyCreditCode) || link.relationshipVerified !== false ||
    snapshot.institutionStatuses[link.institutionId] !== 'matched') ||
  [...knownInstitutionIds].some((id) => !snapshot.institutionStatuses[id])) {
  throw new Error('私有工商派生快照无效，请先运行 npm run data:private。');
}
const companies = new Map(snapshot.companies.map((company) => [company.creditCode, company]));
const links = new Map(snapshot.links.map((link) => [link.institutionId, link]));

export const privatePreview = true;
export function getCompanyPreview(id: string): CompanyPreview | null {
  const link = links.get(id);
  if (!link) return null;
  const company = companies.get(link.companyCreditCode);
  if (!company) throw new Error('私有机构关联缺少登记主体。');
  return { company, link };
}
export function getCompanyStatus(id: string): CompanyStatus { return snapshot.institutionStatuses[id] ?? 'unidentified'; }
