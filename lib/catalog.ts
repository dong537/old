import snapshot from '../public/data/guangzhou-institutions.v1.json';
import type { Catalog } from './types';

// This module deliberately imports only the public snapshot, never private data.
export const catalog = snapshot as Catalog;
export const districts: string[] = [...new Set(catalog.institutions.map((institution) => institution.district))];
export function getInstitution(id: string) { return catalog.institutions.find((institution) => institution.id === id) ?? null; }
