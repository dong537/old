import type { CompanyPreview, CompanyStatus } from './types';
export const privatePreview = false;
export function getCompanyPreview(_id: string): CompanyPreview | null { return null; }
export function getCompanyStatus(_id: string): CompanyStatus { return 'not-published'; }
