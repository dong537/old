import type { McaCatalogCsvFields } from './mca-catalog-types';

export interface HomeServiceRecord {
  id: string;
  name: string;
  province: string;
  city: string;
  area: string;
  address: string | null;
  categories: string[];
  projects: string[];
  evidence: ('服务类别' | '上门服务项目')[];
  updatedAtLocal: string;
  collectorStatus: 'ok' | 'stale';
}

export interface NationalHomeServiceCatalog {
  snapshotId: string;
  exportDate: string;
  provinces: string[];
  records: HomeServiceRecord[];
}

type HomeServiceSource = Pick<McaCatalogCsvFields,
  'org_id' | 'name' | 'area' | 'address' | 'services' | 'home_service_project' | 'updated_at' | 'status'>;

/** 只投影来源明示的类别或项目，不根据名称、标签或零元收费推断服务能力。 */
export function projectHomeService(index: { mcaId: string; regionPath: string | null }, source: HomeServiceSource): HomeServiceRecord | null {
  if (index.mcaId !== source.org_id) throw new Error('上门服务投影的平台 ID 与详情不一致。');
  const categories = (source.services ?? []).filter(value => /上门|居家/.test(value));
  const projects = [...new Set((source.home_service_project ?? '').split(/[,，、;；\n]+/).map(value => value.trim()).filter(Boolean))];
  if (categories.length === 0 && projects.length === 0) return null;
  const region = (index.regionPath ?? '').split('/').map(value => value.trim()).filter(Boolean);
  if (!region[0]) throw new Error('上门服务投影缺少可识别的机构地区：' + source.org_id);
  return {
    id: source.org_id, name: source.name, province: region[0], city: region[1] ?? '',
    area: source.area, address: source.address, categories, projects,
    evidence: [...(categories.length ? ['服务类别' as const] : []), ...(projects.length ? ['上门服务项目' as const] : [])],
    updatedAtLocal: source.updated_at, collectorStatus: source.status,
  };
}

export interface HomeServiceSelection { q: string; province: string; city: string; item: string }

const sortedUnique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));

export function filterHomeServices(records: readonly HomeServiceRecord[], params: URLSearchParams) {
  const selected: HomeServiceSelection = {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    province: (params.get('province') ?? '').trim().slice(0, 64),
    city: (params.get('city') ?? '').trim().slice(0, 64),
    item: (params.get('item') ?? '').trim().slice(0, 64),
  };
  const provinces = sortedUnique(records.map(record => record.province));
  const regional = records.filter(record => !selected.province || record.province === selected.province);
  const cities = sortedUnique(regional.map(record => record.city));
  const projects = sortedUnique(records.flatMap(record => record.projects));
  const words = selected.q.toLocaleLowerCase('zh-CN').split(/\s+/).filter(Boolean);
  const matches = regional.filter(record =>
    (!selected.city || record.city === selected.city) &&
    (!selected.item || record.projects.includes(selected.item)) &&
    words.every(word => [record.name, record.area, record.address ?? '', ...record.categories, ...record.projects].join(' ').toLocaleLowerCase('zh-CN').includes(word)),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / 12));
  const rawPage = params.get('page') ?? '1';
  const page = Math.min(pageCount, /^[1-9]\d{0,4}$/.test(rawPage) ? Number(rawPage) : 1);
  return { selected, provinces, cities, projects, total: matches.length, page, pageCount, items: matches.slice((page - 1) * 12, page * 12) };
}

export function homeServiceListHref(selected: HomeServiceSelection, page = 1): string {
  const params = new URLSearchParams();
  for (const key of ['q', 'province', 'city', 'item'] as const) if (selected[key]) params.set(key, selected[key]);
  if (page > 1) params.set('page', String(page));
  return '/quanguo/shangmen/' + (params.size ? '?' + params.toString() : '');
}
