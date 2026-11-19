import { createHash } from 'node:crypto';

type Obj = Record<string, unknown>;
type NationalManifest = { snapshotId: string; rowCount: number; provinces: { slug: string; name: string; count: number; cities: { slug: string; name: string; count: number; indexPath: string }[] }[] };
type NationalIndex = { snapshotId: string; provinceSlug: string; citySlug: string; records: { id: string; name: string; province: string; city: string; chunk: string }[] };
type NationalChunk = { snapshotId: string; provinceSlug: string; citySlug: string; records: { id: string; name: string; province: string; city: string; creditCode: string | null; codeValidity: string | null }[] };
type Target = { kind: 'nationalRegistry' | 'guangdongRegistry'; id: string; provinceSlug: string | null; citySlug: string | null; province: string; city: string; name: string };

const linksPrefix = 'data/qcc-institution-registry-links/';
const referencePrefix = 'data/qcc-institutions/';
const nationalPrefix = 'data/qcc-national/';
const guangdongPrefix = 'data/qcc/';
const alphabet = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
const mobile = /(?<!\d)(?:(?:\+|00)86[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)/;
const landline = /(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)/;
const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function fail(reason: string): never { throw new Error('机构线索—登记主体关联' + reason); }
function fields(value: unknown, allowed: string[], where: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('结构错误：' + where);
  const obj = value as Obj;
  const keys = Object.keys(obj).sort();
  const expected = [...allowed].sort();
  if (keys.length !== expected.length || keys.some((key, at) => key !== expected[at])) fail('字段不在白名单：' + where);
  return obj;
}
function count(value: unknown, where: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('计数无效：' + where);
  return value as number;
}
function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value) ||
    mobile.test(value) || landline.test(value) || email.test(value)) fail('文本无效或含联系信息：' + where);
  return value;
}
function token(value: unknown, pattern: RegExp, where: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail('标识或路径无效：' + where);
  return value;
}
function parse(content: string | undefined, where: string): Obj {
  if (content === undefined) fail('缺失文件：' + where);
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('结构错误：' + where);
    return value as Obj;
  }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('机构线索—登记主体关联')) throw error;
    fail('不是有效JSON：' + where);
  }
}
function validCode(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9A-Z]{18}$/.test(value) || /^0{18}$/.test(value)) return false;
  const digits = [...value].map(char => alphabet.indexOf(char));
  if (digits.some(digit => digit < 0)) return false;
  const total = weights.reduce((sum, weight, at) => sum + weight * digits[at], 0);
  return digits[17] === (31 - total % 31) % 31;
}
function registryCode(value: Obj, where: string): string | null {
  if (value.codeValidity !== 'valid') return null;
  if (!validCode(value.creditCode)) fail('目标代码无效：' + where);
  return value.creditCode;
}
function referenceCode(value: Obj, where: string): string | null {
  if (value.codeStatus !== 'valid') return null;
  if (!validCode(value.creditCode)) fail('线索代码无效：' + where);
  return value.creditCode;
}
function addCode(byCode: Map<string, Target[]>, code: string | null, target: Target): void {
  if (!code) return;
  const targets = byCode.get(code) ?? [];
  targets.push(target);
  byCode.set(code, targets);
}

export function validateInstitutionRegistryLinks(
  linksFiles: ReadonlyMap<string, string>, referenceFiles: ReadonlyMap<string, string>,
  nationalManifest: NationalManifest, nationalIndexes: ReadonlyMap<string, NationalIndex>,
  nationalChunks: ReadonlyMap<string, NationalChunk>, guangdongFiles: ReadonlyMap<string, string>,
): void {
  const referenceManifest = parse(referenceFiles.get(referencePrefix + 'manifest.v1.json'), '线索manifest');
  const guangdongIndex = parse(guangdongFiles.get(guangdongPrefix + 'index.v1.json'), '广东主体索引');
  const manifest = fields(parse(linksFiles.get(linksPrefix + 'manifest.v1.json'), '关联manifest'), [
    'schemaVersion', 'referenceSnapshotId', 'nationalSnapshotId', 'guangdongSnapshotId', 'snapshotId',
    'referenceRowCount', 'eligibleReferenceCount', 'uniqueCodeHitCount', 'linkedReferenceCount',
    'crossProvinceHitCount', 'ambiguousReferenceCount', 'regionCount',
  ], '关联manifest');
  if (manifest.schemaVersion !== 1 || manifest.referenceSnapshotId !== referenceManifest.snapshotId ||
    manifest.nationalSnapshotId !== nationalManifest.snapshotId ||
    manifest.guangdongSnapshotId !== guangdongIndex.snapshotId) fail('输入快照不一致');
  const basis = { schemaVersion: 1, referenceSnapshotId: manifest.referenceSnapshotId,
    nationalSnapshotId: manifest.nationalSnapshotId, guangdongSnapshotId: manifest.guangdongSnapshotId };
  const expectedSnapshot = 'v1-' + createHash('sha256').update(JSON.stringify(basis) + '\n').digest('hex').slice(0, 16);
  if (manifest.snapshotId !== expectedSnapshot) fail('关联快照不一致');
  const referenceRowCount = count(manifest.referenceRowCount, 'referenceRowCount');
  const eligibleCount = count(manifest.eligibleReferenceCount, 'eligibleReferenceCount');
  const uniqueCount = count(manifest.uniqueCodeHitCount, 'uniqueCodeHitCount');
  const linkedCount = count(manifest.linkedReferenceCount, 'linkedReferenceCount');
  const crossCount = count(manifest.crossProvinceHitCount, 'crossProvinceHitCount');
  const ambiguousCount = count(manifest.ambiguousReferenceCount, 'ambiguousReferenceCount');
  const regionCount = count(manifest.regionCount, 'regionCount');
  if (referenceRowCount !== referenceManifest.rowCount || uniqueCount !== linkedCount + crossCount ||
    uniqueCount + ambiguousCount > eligibleCount) fail('manifest计数不一致');

  const byCode = new Map<string, Target[]>();
  const seenTargets = new Set<string>();
  for (const province of nationalManifest.provinces) {
    for (const city of province.cities) {
      const indexPath = nationalPrefix + city.indexPath;
      const index = nationalIndexes.get(indexPath);
      if (!index || index.snapshotId !== nationalManifest.snapshotId || index.provinceSlug !== province.slug ||
        index.citySlug !== city.slug || index.records.length !== city.count) fail('全国主体索引不一致：' + indexPath);
      for (const record of index.records) {
        const chunkPath = nationalPrefix + province.slug + '/' + city.slug + '/' + record.chunk;
        const chunk = nationalChunks.get(chunkPath);
        const detail = chunk?.records.find(item => item.id === record.id);
        if (!chunk || chunk.snapshotId !== nationalManifest.snapshotId || chunk.provinceSlug !== province.slug ||
          chunk.citySlug !== city.slug || !detail || detail.name !== record.name ||
          detail.province !== province.name || detail.city !== city.name ||
          record.province !== province.name || record.city !== city.name) fail('全国主体目标缺失或地区不一致：' + record.id);
        if (seenTargets.has('nationalRegistry|' + record.id)) fail('全国主体目标重复：' + record.id);
        seenTargets.add('nationalRegistry|' + record.id);
        addCode(byCode, registryCode(detail as Obj, record.id), { kind: 'nationalRegistry', id: record.id,
          provinceSlug: province.slug, citySlug: city.slug, province: province.name, city: city.name, name: record.name });
      }
    }
  }
  if (!Array.isArray(guangdongIndex.records)) fail('广东主体索引结构错误');
  const guangdongChunks = new Map<string, Obj>();
  for (const rawRecord of guangdongIndex.records) {
    const record = rawRecord as Obj;
    const id = token(record.id, /^gd-qcc-[a-f0-9]{20}$/, '广东主体ID');
    const chunkName = token(record.chunk, /^chunk-\d{3}\.v1\.json$/, '广东主体分块');
    const chunkPath = guangdongPrefix + chunkName;
    let chunk = guangdongChunks.get(chunkPath);
    if (!chunk) { chunk = parse(guangdongFiles.get(chunkPath), chunkPath); guangdongChunks.set(chunkPath, chunk); }
    if (chunk.snapshotId !== guangdongIndex.snapshotId || !Array.isArray(chunk.records)) fail('广东主体分块快照不一致');
    const detail = (chunk.records as Obj[]).find(item => item.id === id);
    if (!detail || detail.name !== record.name || detail.city !== record.city) fail('广东主体目标缺失或地区不一致：' + id);
    if (seenTargets.has('guangdongRegistry|' + id)) fail('广东主体目标重复：' + id);
    seenTargets.add('guangdongRegistry|' + id);
    addCode(byCode, registryCode(detail, id), { kind: 'guangdongRegistry', id,
      provinceSlug: null, citySlug: null, province: '广东省',
      city: str(record.city, '广东主体城市'), name: str(record.name, '广东主体名称') });
  }

  if (!Array.isArray(referenceManifest.provinces)) fail('线索地区清单无效');
  const expectedPaths = new Set<string>([linksPrefix + 'manifest.v1.json']);
  let actualReferences = 0;
  let eligible = 0;
  let unique = 0;
  let linked = 0;
  let cross = 0;
  let ambiguous = 0;
  for (const rawProvince of referenceManifest.provinces) {
    const province = rawProvince as Obj;
    const provinceName = str(province.name, '线索省份');
    const p = token(province.slug, /^p-[a-f0-9]{12}$/, '线索省份slug');
    if (!Array.isArray(province.cities)) fail('线索省份路径无效');
    for (const rawCity of province.cities) {
      const city = rawCity as Obj;
      const c = token(city.slug, /^c-[a-f0-9]{12}$/, '线索城市slug');
      const indexPath = referencePrefix + p + '/' + c + '/index.v1.json';
      if (city.indexPath !== p + '/' + c + '/index.v1.json') fail('线索城市索引路径无效');
      const index = parse(referenceFiles.get(indexPath), indexPath);
      if (index.snapshotId !== referenceManifest.snapshotId || index.provinceSlug !== p ||
        index.citySlug !== c || !Array.isArray(index.records) || index.records.length !== city.count) fail('线索城市索引不一致');
      const linkPath = linksPrefix + p + '/' + c + '/links.v1.json';
      expectedPaths.add(linkPath);
      const cityLinks = fields(parse(linksFiles.get(linkPath), linkPath),
        ['schemaVersion', 'snapshotId', 'referenceSnapshotId', 'provinceSlug', 'citySlug', 'links'], linkPath);
      if (cityLinks.schemaVersion !== 1 || cityLinks.snapshotId !== manifest.snapshotId ||
        cityLinks.referenceSnapshotId !== referenceManifest.snapshotId || cityLinks.provinceSlug !== p ||
        cityLinks.citySlug !== c || !Array.isArray(cityLinks.links)) fail('链接地区或快照不一致：' + linkPath);
      let linkAt = 0;
      const chunks = new Map<string, Obj>();
      for (const rawRecord of index.records) {
        const record = rawRecord as Obj;
        const id = token(record.id, /^qi-[a-f0-9]{12}-[1-9][0-9]*$/, '线索ID');
        const chunkName = token(record.chunk, /^chunk-\d{3}\.v1\.json$/, '线索分块');
        const chunkPath = referencePrefix + p + '/' + c + '/' + chunkName;
        let chunk = chunks.get(chunkPath);
        if (!chunk) { chunk = parse(referenceFiles.get(chunkPath), chunkPath); chunks.set(chunkPath, chunk); }
        if (chunk.snapshotId !== referenceManifest.snapshotId || !Array.isArray(chunk.records)) fail('线索分块快照不一致');
        const detail = (chunk.records as Obj[]).find(item => item.id === id);
        if (!detail || detail.name !== record.name || detail.sourceRow !== record.sourceRow) fail('线索详情与索引不一致：' + id);
        actualReferences++;
        const code = referenceCode(detail, id);
        if (!code) continue;
        eligible++;
        const targets = byCode.get(code) ?? [];
        if (targets.length > 1) { ambiguous++; continue; }
        if (!targets.length) continue;
        unique++;
        const target = targets[0];
        if (target.province !== provinceName) { cross++; continue; }
        const rawLink = (cityLinks.links as unknown[])[linkAt];
        const link = fields(rawLink, ['referenceId', 'target'], linkPath + ' 关联');
        const actualTarget = fields(link.target,
          ['kind', 'id', 'provinceSlug', 'citySlug', 'province', 'city', 'name'], linkPath + ' 目标');
        if (link.referenceId !== id || Object.entries(target).some(([key, value]) => actualTarget[key] !== value)) {
          fail('目标代码、ID或地区路由匹配不一致：' + id);
        }
        linkAt++;
        linked++;
      }
      if (linkAt !== cityLinks.links.length) fail('链接行数或顺序与代码匹配结果不一致：' + linkPath);
    }
  }
  if (linksFiles.size !== expectedPaths.size || [...linksFiles.keys()].some(file => !expectedPaths.has(file))) {
    fail('地区链接文件缺失或含未经批准文件');
  }
  if (expectedPaths.size !== regionCount + 1 || actualReferences !== referenceRowCount ||
    eligible !== eligibleCount || unique !== uniqueCount || linked !== linkedCount ||
    cross !== crossCount || ambiguous !== ambiguousCount) fail('关联manifest计数不一致');
}
