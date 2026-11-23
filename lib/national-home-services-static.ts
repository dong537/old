import { mcaCatalogLoader } from './mca-catalog-static';
import { projectHomeService, type NationalHomeServiceCatalog } from './national-home-services';

let cache: NationalHomeServiceCatalog | undefined;

/** 构建期读取锁定 CSV 的已校验投影；文件缺失或来源不一致时直接阻止构建。 */
export function getNationalHomeServices(): NationalHomeServiceCatalog {
  if (cache) return cache;
  const manifest = mcaCatalogLoader.getManifest();
  const records = mcaCatalogLoader.getIndex().records.flatMap(index => {
    if (index.sourceKind !== 'csv') return [];
    const detail = mcaCatalogLoader.getCsvDetail(index.mcaId);
    if (!detail) throw new Error('上门服务来源详情缺失：' + index.mcaId);
    const projected = projectHomeService(index, detail.fields);
    return projected ? [projected] : [];
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  cache = {
    snapshotId: manifest.snapshotId, exportDate: manifest.csvExportDate,
    provinces: [...new Set(records.map(record => record.province))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    records,
  };
  return cache;
}
