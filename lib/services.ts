import serviceCatalogJson from '../public/data/guangzhou-services.v1.json';
import type { ServiceCatalog, ServiceRecord } from './service-types';

export const serviceCatalog = serviceCatalogJson as ServiceCatalog;

export function getServiceRecord(id: string): ServiceRecord | undefined {
  return serviceCatalog.records.find(record => record.id === id);
}
