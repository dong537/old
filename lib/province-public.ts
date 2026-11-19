import snapshot from '../public/data/guangdong-source-records.v1.json';
import type { ProvinceCatalog } from './province-types';

// Static public projection only; the private research archive never enters this module.
export const provinceCatalog = snapshot as ProvinceCatalog;
