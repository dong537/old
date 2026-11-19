type JsonObject = Record<string, unknown>;

const linkPrefix = 'data/qcc-institution-links/';
const referencePrefix = 'data/qcc-institutions/';
const officialPrefix = 'data/national-official/';
const linkManifestPath = linkPrefix + 'manifest.v1.json';

function fail(reason: string): never { throw new Error('全国机构线索候选关联' + reason); }

function fields(value: unknown, expected: string[], where: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('结构错误：' + where);
  const obj = value as JsonObject;
  const keys = Object.keys(obj).sort();
  const allowed = [...expected].sort();
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    fail('字段不在白名单：' + where);
  }
  return obj;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\\/]/.test(value) && where.includes('slug')) {
    fail('文本无效：' + where);
  }
  return value;
}

function count(value: unknown, where: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('计数无效：' + where);
  return value as number;
}

function parse(content: string | undefined, where: string): JsonObject {
  if (content === undefined) fail('缺失文件：' + where);
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('结构错误：' + where);
    return value as JsonObject;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('全国机构线索候选关联')) throw error;
    fail('不是有效JSON：' + where);
  }
}

type Target = {
  kind: 'nationalOfficial' | 'guangdongOfficial'; id: string; name: string; province: string;
  provinceSlug: string | null; citySlug: string | null; city: string; sourceTitle: string;
};
type Reference = { name: string; province: string; provinceSlug: string; citySlug: string };

export function validateInstitutionReferenceLinks(
  linksFiles: ReadonlyMap<string, string>, referenceFiles: ReadonlyMap<string, string>,
  officialFiles: ReadonlyMap<string, string>, guangdongRaw: string | undefined,
): void {
  const referenceManifest = parse(referenceFiles.get(referencePrefix + 'manifest.v1.json'), 'reference manifest');
  const officialManifest = parse(officialFiles.get(officialPrefix + 'manifest.v1.json'), 'official manifest');
  const guangdong = parse(guangdongRaw, 'guangdong source');
  const manifest = fields(parse(linksFiles.get(linkManifestPath), linkManifestPath),
    ['schemaVersion', 'snapshotId', 'referenceSnapshotId', 'officialSnapshotId', 'guangdongSnapshotId',
      'linkedReferenceCount', 'matchCount', 'regionCount'], linkManifestPath);
  if (manifest.schemaVersion !== 1 || manifest.referenceSnapshotId !== referenceManifest.snapshotId ||
    manifest.officialSnapshotId !== officialManifest.snapshotId ||
    manifest.guangdongSnapshotId !== guangdong.snapshotId) fail('输入快照不一致');
  const snapshotId = str(manifest.snapshotId, 'snapshotId');
  const linkedReferenceCount = count(manifest.linkedReferenceCount, 'linkedReferenceCount');
  const matchCount = count(manifest.matchCount, 'matchCount');
  const regionCount = count(manifest.regionCount, 'regionCount');

  if (!Array.isArray(referenceManifest.provinces) || !Array.isArray(officialManifest.provinces) ||
    !Array.isArray(officialManifest.sources) || !Array.isArray(guangdong.records)) fail('输入清单结构错误');
  const references = new Map<string, Reference>();
  const regions = new Map<string, { provinceSlug: string; citySlug: string }>();
  for (const rawProvince of referenceManifest.provinces) {
    const province = rawProvince as JsonObject;
    const provinceName = str(province.name, 'reference province');
    const provinceSlug = str(province.slug, 'reference province slug');
    if (!Array.isArray(province.cities)) fail('参考城市清单无效');
    for (const rawCity of province.cities) {
      const city = rawCity as JsonObject;
      const citySlug = str(city.slug, 'reference city slug');
      const indexPath = referencePrefix + str(city.indexPath, 'reference indexPath');
      const index = parse(referenceFiles.get(indexPath), indexPath);
      if (index.snapshotId !== referenceManifest.snapshotId ||
        index.provinceSlug !== provinceSlug || index.citySlug !== citySlug ||
        !Array.isArray(index.records)) fail('参考索引快照或地区不一致：' + indexPath);
      const linkPath = linkPrefix + provinceSlug + '/' + citySlug + '/links.v1.json';
      regions.set(linkPath, { provinceSlug, citySlug });
      for (const rawRecord of index.records) {
        const record = rawRecord as JsonObject;
        const id = str(record.id, 'reference id');
        if (references.has(id)) fail('参考ID重复：' + id);
        references.set(id, { name: str(record.name, 'reference name'), province: provinceName,
          provinceSlug, citySlug });
      }
    }
  }
  if (regions.size !== regionCount) fail('地区文件数与清单不一致');

  const sourceTitles = new Map<string, { title: string; province: string }>();
  for (const rawSource of officialManifest.sources) {
    const source = rawSource as JsonObject;
    const id = str(source.id, 'official source id');
    sourceTitles.set(id, { title: str(source.title, 'official source title'),
      province: str(source.province, 'official source province') });
  }
  const targets = new Map<string, Target>();
  for (const rawProvince of officialManifest.provinces) {
    const province = rawProvince as JsonObject;
    const provinceName = str(province.name, 'official province');
    if (!Array.isArray(province.cities)) fail('官方城市清单无效');
    for (const rawCity of province.cities) {
      const city = rawCity as JsonObject;
      const cityName = str(city.name, 'official city');
      const indexPath = officialPrefix + str(city.indexPath, 'official indexPath');
      const index = parse(officialFiles.get(indexPath), indexPath);
      if (index.snapshotId !== officialManifest.snapshotId || !Array.isArray(index.records)) {
        fail('官方索引快照不一致：' + indexPath);
      }
      for (const rawRecord of index.records) {
        const record = rawRecord as JsonObject;
        const source = sourceTitles.get(str(record.sourceId, 'official sourceId'));
        if (!source || source.province !== provinceName) fail('官方来源归属不一致：' + indexPath);
        const id = str(record.id, 'official id');
        const key = 'nationalOfficial|' + id;
        if (targets.has(key)) fail('官方目标ID重复：' + id);
        targets.set(key, { kind: 'nationalOfficial', id, name: str(record.name, 'official name'),
          province: provinceName, provinceSlug: str(index.provinceSlug, 'official province slug'),
          citySlug: str(index.citySlug, 'official city slug'), city: cityName,
          sourceTitle: source.title });
      }
    }
  }
  for (const rawRecord of guangdong.records) {
    const record = rawRecord as JsonObject;
    const id = str(record.id, 'guangdong id');
    const key = 'guangdongOfficial|' + id;
    if (targets.has(key)) fail('广东目标ID重复：' + id);
    targets.set(key, { kind: 'guangdongOfficial', id, name: str(record.name, 'guangdong name'),
      province: '广东省', provinceSlug: null, citySlug: null,
      city: str(record.city, 'guangdong city'),
      sourceTitle: str(record.evidenceType, 'guangdong evidenceType') });
  }

  const expectedPaths = new Set([linkManifestPath, ...regions.keys()]);
  if (linksFiles.size !== expectedPaths.size || [...linksFiles.keys()].some(file => !expectedPaths.has(file))) {
    fail('地区链接文件缺失或存在未经批准文件');
  }
  let linked = 0;
  let matches = 0;
  const seenReferences = new Set<string>();
  for (const [file, region] of regions) {
    const cityLinks = fields(parse(linksFiles.get(file), file),
      ['schemaVersion', 'snapshotId', 'referenceSnapshotId', 'provinceSlug', 'citySlug', 'links'], file);
    if (cityLinks.schemaVersion !== 1 || cityLinks.snapshotId !== snapshotId ||
      cityLinks.referenceSnapshotId !== referenceManifest.snapshotId ||
      cityLinks.provinceSlug !== region.provinceSlug || cityLinks.citySlug !== region.citySlug ||
      !Array.isArray(cityLinks.links)) fail('链接文件快照或地区不一致：' + file);
    for (const rawLink of cityLinks.links) {
      const link = fields(rawLink, ['referenceId', 'matches'], file + ' link');
      const referenceId = str(link.referenceId, 'referenceId');
      const reference = references.get(referenceId);
      if (!reference || reference.provinceSlug !== region.provinceSlug ||
        reference.citySlug !== region.citySlug || seenReferences.has(referenceId) ||
        !Array.isArray(link.matches) || !link.matches.length) fail('参考记录关联无效或重复：' + referenceId);
      seenReferences.add(referenceId);
      linked++;
      const seenTargets = new Set<string>();
      for (const rawMatch of link.matches) {
        const match = fields(rawMatch,
          ['kind', 'id', 'provinceSlug', 'citySlug', 'city', 'sourceTitle'], file + ' target');
        const kind = match.kind;
        const id = str(match.id, 'target id');
        if (kind !== 'nationalOfficial' && kind !== 'guangdongOfficial') fail('目标类型无效');
        const key = kind + '|' + id;
        const target = targets.get(key);
        if (!target || seenTargets.has(key) || target.name !== reference.name ||
          target.province !== reference.province ||
          match.provinceSlug !== target.provinceSlug || match.citySlug !== target.citySlug ||
          match.city !== target.city || match.sourceTitle !== target.sourceTitle) {
          fail('官方目标匹配不一致：' + referenceId + ' → ' + key);
        }
        seenTargets.add(key);
        matches++;
      }
    }
  }
  if (linked !== linkedReferenceCount || matches !== matchCount) fail('关联计数不一致');
}
