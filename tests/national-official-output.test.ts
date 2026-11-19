import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanPublicOutput } from '../scripts/check-public-output';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'eldercare-official-output-'));
  const base = path.join(root, 'data', 'national-official');
  const city = path.join(base, 'chongqing', 'chongqing');
  mkdirSync(city, { recursive: true });
  const source = {
    id: 'cq-source', province: '重庆市', city: '重庆市', scope: '重庆市来源表',
    title: '养老服务机构', url: 'https://mzj.cq.gov.cn/example.html',
    publishedAt: '2025-12-22', asOf: null, sha256: 'a'.repeat(64), rowCount: 1,
  };
  const manifest = {
    schemaVersion: 1, snapshotId: 'official-test-1', archivedAt: '2026-11-17',
    rowCount: 1, sources: [source], provinces: [{
      slug: 'chongqing', name: '重庆市', count: 1, cities: [{
        slug: 'chongqing', name: '重庆市', count: 1, indexPath: 'chongqing/chongqing/index.v1.json',
      }],
    }],
  };
  const indexRecord = {
    id: 'official-cq-1', sourceId: source.id, rowNumber: 1, name: '测试养老服务中心',
    address: '重庆市测试路1号', beds: 100, chunk: 'chunk-001.v1.json',
  };
  const { chunk: _chunk, ...detailRecord } = indexRecord;
  const index = {
    schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'chongqing',
    citySlug: 'chongqing', records: [indexRecord],
  };
  const chunk = {
    schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'chongqing',
    citySlug: 'chongqing', records: [{ ...detailRecord, residentCount: 20, staffCount: 10, services: '生活照料' }],
  };
  const write = () => {
    writeFileSync(path.join(base, 'manifest.v1.json'), JSON.stringify(manifest));
    writeFileSync(path.join(city, 'index.v1.json'), JSON.stringify(index));
    writeFileSync(path.join(city, 'chunk-001.v1.json'), JSON.stringify(chunk));
  };
  write();
  return { root, base, city, manifest, index, chunk, write };
}

test('official projection accepts only a complete, linked source snapshot', async () => {
  const files = fixture();
  try { assert.equal((await scanPublicOutput(files.root)).filesScanned, 3); }
  finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('Wenzhou ZIP source rows start at 2 because row 1 is the header', async () => {
  const files = fixture();
  try {
    files.manifest.sources[0].id = 'zj-wz-20220826';
    files.index.records[0].sourceId = 'zj-wz-20220826';
    files.chunk.records[0].sourceId = 'zj-wz-20220826';
    files.index.records[0].rowNumber = 2;
    files.chunk.records[0].rowNumber = 2;
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
    files.index.records[0].rowNumber = 1;
    files.chunk.records[0].rowNumber = 1;
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /来源行号无效|超范围/);
    files.index.records[0].rowNumber = 3;
    files.chunk.records[0].rowNumber = 3;
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /来源行号无效|超范围/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection accepts explicit unknown source dates, provincewide scope and address', async () => {
  const files = fixture();
  try {
    Object.assign(files.manifest.sources[0], { city: null, publishedAt: null });
    Object.assign(files.index.records[0], { address: null, beds: 0 });
    Object.assign(files.chunk.records[0], { address: null, beds: 0 });
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
    Object.assign(files.manifest.sources[0], { publishedAt: 'not-a-date' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|日期/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection preserves a month-end source period and permits a pinned XLSX input', async () => {
  const files = fixture();
  try {
    Object.assign(files.manifest.sources[0], { asOf: '2026年2月底' });
    files.write();
    const lock = { schemaVersion: 1 as const, sources: [{
      id: files.manifest.sources[0].id, filename: 'hunan-2025.xlsx',
      sha256: files.manifest.sources[0].sha256, bytes: 131638, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    Object.assign(files.manifest.sources[0], { asOf: '2026年99月底' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /官方|日期|资料期/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection permits a pinned PDF source input', async () => {
  const files = fixture();
  try {
    const lock = { schemaVersion: 1 as const, sources: [{
      id: files.manifest.sources[0].id, filename: 'shijiazhuang-2026.pdf',
      sha256: files.manifest.sources[0].sha256, bytes: 334248, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection permits a pinned DOCX source but never publishes the original', async () => {
  const files = fixture();
  try {
    const lock = { schemaVersion: 1 as const, sources: [{
      id: files.manifest.sources[0].id, filename: 'beijing-stars-20251231.docx',
      sha256: files.manifest.sources[0].sha256, bytes: 279087, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    writeFileSync(path.join(files.base, 'source.docx'), 'private original');
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /DOCX|原件/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection permits only the pinned Luxi CSV and its exact government catalog', async () => {
  const files = fixture();
  try {
    const source = files.manifest.sources[0];
    source.id = 'sd-hz-luxi-20250627';
    source.url = 'https://data.sd.gov.cn/portal/catalog/CD7009EDC99348728AAAD80F06AE1BFE';
    files.index.records[0].sourceId = source.id;
    files.chunk.records[0].sourceId = source.id;
    files.write();
    const lock = { schemaVersion: 1 as const, sources: [{
      id: source.id, filename: 'shandong-luxi-20250627.csv',
      sha256: source.sha256, bytes: 3199, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    writeFileSync(path.join(files.base, 'raw.csv'), 'private source');
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /CSV|原件/);
    rmSync(path.join(files.base, 'raw.csv'));
    source.url = 'https://data.sd.gov.cn/portal/catalog/OTHER';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /官方来源URL未经批准/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test(`official projection pins the Tai'an CSV source and historical scope`, async () => {
  const files = fixture();
  try {
    const source = files.manifest.sources[0];
    source.id = 'sd-taian-20250724';
    source.title = '泰安市养老机构信息';
    source.scope = '2025-07-24 版本文件93条；2026-08-01 版本仅10行；山东公共数据开放网';
    source.url = 'https://data.sd.gov.cn/portal/catalog/19223520c2494a94af3ccbacfc17cf91';
    source.province = '山东省';
    source.city = '泰安';
    source.publishedAt = '2025-07-29';
    files.manifest.provinces[0].name = '山东省';
    files.manifest.provinces[0].cities[0].name = '泰安';
    files.index.records[0].sourceId = source.id;
    files.chunk.records[0].sourceId = source.id;
    files.write();
    const lock = { schemaVersion: 1 as const, sources: [{
      id: source.id, filename: 'shandong-taian-20250724.csv',
      sha256: source.sha256, bytes: 11662, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    source.url = 'https://data.sd.gov.cn/portal/catalog/OTHER';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /泰安官方来源/);
    source.url = 'https://data.sd.gov.cn/portal/catalog/19223520c2494a94af3ccbacfc17cf91';
    source.scope = '仅泰安';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /泰安官方来源/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection pins Jinan historical subset and exact catalog', async () => {
  const files = fixture();
  try {
    const source = files.manifest.sources[0];
    source.id = 'sd-jinan-20250721';
    source.title = '济南市养老机构基本信息数据';
    source.scope = '2025-07-21版本CSV的135条历史来源行；2023年08月至2024年05月；2026-07-21版本仅20行；不能据此推断其余机构停业';
    source.url = 'https://data.sd.gov.cn/portal/catalog/7900f7ace36c4faca8a17b5af1d9d784';
    source.province = '山东省';
    source.city = '济南';
    source.publishedAt = '2023-08-21';
    files.manifest.provinces[0].name = '山东省';
    files.manifest.provinces[0].cities[0].name = '济南';
    files.index.records[0].sourceId = source.id;
    files.chunk.records[0].sourceId = source.id;
    files.write();
    const lock = { schemaVersion: 1 as const, sources: [{
      id: source.id, filename: 'shandong-jinan-202507210938.csv',
      sha256: source.sha256, bytes: 11655, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    source.scope = '2026年在营135家';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /济南官方来源/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection pins Weifang 2025 statistics and exact catalog', async () => {
  const files = fixture();
  try {
    const source = files.manifest.sources[0];
    source.id = 'sd-weifang-20261110';
    source.title = '养老机构信息';
    source.scope = '潍坊市民政局开放数据187条；2025-04-10逐行统计时间；不证明当前在营；床位不是当前空床；山东公共数据开放网';
    source.url = 'https://data.sd.gov.cn/portal/catalog/4e8ac605705540028fe52860b69a386a';
    source.province = '山东省';
    source.city = '潍坊';
    source.publishedAt = '2026-08-11';
    Object.assign(source, { asOf: '2025-04-10' });
    files.manifest.provinces[0].name = '山东省';
    files.manifest.provinces[0].cities[0].name = '潍坊';
    files.index.records[0].sourceId = source.id;
    files.chunk.records[0].sourceId = source.id;
    files.write();
    const lock = { schemaVersion: 1 as const, sources: [{
      id: source.id, filename: 'shandong-weifang-20261110.csv',
      sha256: source.sha256, bytes: 21887, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    Object.assign(source, { asOf: '2026-11-10' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /潍坊官方来源/);
    Object.assign(source, { asOf: '2025-04-10' });
    source.url = 'https://data.sd.gov.cn/portal/catalog/OTHER';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /潍坊官方来源/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection pins Panzhihua open-data URL and the 100-bed limit', async () => {
  const files = fixture();
  try {
    const source = files.manifest.sources[0];
    source.id = 'sc-pzh-20260901';
    source.province = '四川省';
    source.city = '攀枝花';
    source.title = '攀枝花市_市民政局_养老机构信息一览表';
    source.scope = '仅床位数100张以上的养老机构；不代表全市全量或当前在营；攀枝花市民政局无条件开放目录';
    source.url = 'https://pzhdata.cn/oportal/catalog/43f1109ec4c04fde854889873395d4cd';
    source.publishedAt = '2026-09-01';
    files.manifest.provinces[0].name = '四川省';
    files.manifest.provinces[0].cities[0].name = '攀枝花';
    files.index.records[0].sourceId = source.id;
    files.chunk.records[0].sourceId = source.id;
    files.write();
    const lock = { schemaVersion: 1 as const, sources: [{
      id: source.id, filename: 'panzhihua-43f1109ec4c04fde854889873395d4cd-full-20261117.json',
      sha256: source.sha256, bytes: 4333, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    source.url = 'https://pzhdata.cn/oportal/catalog/OTHER';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /攀枝花官方来源/);
    source.url = 'https://pzhdata.cn/oportal/catalog/43f1109ec4c04fde854889873395d4cd';
    source.scope = '仅攀枝花';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /攀枝花官方来源/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection pins four Dazhou county previews and their narrow scopes', async () => {
  const counties = [
    { id: 'sc-dz-xuanhan-20260722', county: '宣汉县', title: '宣汉县养老机构信息', date: '2024-10-30', catalog: '98c83f7a84a0488290df5a2025ad6932' },
    { id: 'sc-dz-wanyuan-20260722', county: '万源市', title: '万源市养老机构信息', date: '2022-04-21', catalog: '567ef5ba62324c16a39e16dfe43094bd' },
    { id: 'sc-dz-dazhu-20260722', county: '大竹县', title: '大竹县养老机构信息', date: '2024-10-30', catalog: '2bba3e7042374a84bf1c479e066a5c0f' },
    { id: 'sc-dz-kaijiang-20260722', county: '开江县', title: '开江县养老机构地址信息', date: '2021-12-07', catalog: '3583b17b10e544e080458b8107e9364c' },
  ];
  for (const county of counties) {
    const files = fixture();
    try {
      const source = files.manifest.sources[0];
      source.id = county.id;
      source.province = '四川省';
      source.city = '达州';
      source.title = county.title;
      source.publishedAt = county.date;
      source.scope = '仅达州市' + county.county + '；来源第N条按冻结预览位次，不等于原表序号；不代表全市或该区县当前在营全量；仅展示名称与地址';
      source.url = 'https://www.dazhoudata.cn/oportal/catalog/' + county.catalog;
      files.manifest.provinces[0].name = '四川省';
      files.manifest.provinces[0].cities[0].name = '达州';
      files.index.records[0].sourceId = source.id;
      files.chunk.records[0].sourceId = source.id;
      files.write();
      const lock = { schemaVersion: 1 as const, sources: [{
        id: source.id, filename: 'dazhou-' + county.catalog + '-preview-20261117.json',
        sha256: source.sha256, bytes: 100, rowCount: 1,
      }] };
      assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
      source.url = 'https://www.dazhoudata.cn/oportal/catalog/OTHER';
      files.write();
      await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /达州区县官方来源/);
      source.url = 'https://www.dazhoudata.cn/oportal/catalog/' + county.catalog;
      source.scope = '仅达州市' + county.county;
      files.write();
      await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /达州区县官方来源/);
    } finally { rmSync(files.root, { recursive: true, force: true }); }
  }
});

test('official projection pins Tianjin open-data URL and attribution', async () => {
  const files = fixture();
  try {
    const source = files.manifest.sources[0];
    source.id = 'tj-nankai-20220411';
    source.title = '南开区养老机构';
    source.scope = '天津市信息资源统一开放平台；仅南开区；来源第N条按冻结预览顺序，不等于原表序号';
    source.url = 'https://open.data.tj.gov.cn/sjjk/45e4998327f34ddd8dab66770999e631.htm';
    files.index.records[0].sourceId = source.id;
    files.chunk.records[0].sourceId = source.id;
    files.write();
    const lock = { schemaVersion: 1 as const, sources: [{
      id: source.id, filename: 'tianjin-nankai-preview-20261117.html',
      sha256: source.sha256, bytes: 65220, rowCount: 1,
    }] };
    assert.equal((await scanPublicOutput(files.root, [], [], false, undefined, true, lock)).filesScanned, 3);
    source.scope = '仅南开区；来源第N条按冻结预览顺序，不等于原表序号';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /天津官方来源URL或归属未经批准/);
    source.scope = '天津市信息资源统一开放平台；来源第N条按冻结预览顺序，不等于原表序号';
    source.url = 'https://open.data.tj.gov.cn/sjjk/OTHER.htm';
    files.write();
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /天津官方来源URL或归属未经批准/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection pins Zhejiang raw count while preserving sparse public CSV ordinals', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eldercare-zhejiang-output-'));
  try {
    const base = path.join(root, 'data', 'national-official');
    const city = path.join(base, 'zhejiang', 'hangzhou');
    mkdirSync(city, { recursive: true });
    const source = {
      id: 'zj-prov-20260902', province: '浙江省', city: null,
      scope: '浙江省数据开放平台 2026-11-17下载；仅五市；数据开放授权许可使用协议约束',
      title: '养老机构信息',
      url: 'https://data.zjzwfw.gov.cn/dopServer/index.html#/dataCatalogDetail?id=hjiVC2086lVfI5xHiciluQ%3D%3D',
      publishedAt: null, asOf: null, sha256: 'a'.repeat(64), rowCount: 674,
    };
    const lock = { schemaVersion: 1 as const, sources: [{
      id: source.id, filename: 'zhejiang-provincial-yljg-20260902.csv',
      sha256: source.sha256, bytes: 114573, rowCount: 1147,
    }] };
    const ordinals = Array.from({ length: 674 }, (_, i) => i === 673 ? 1147 : i + 1);
    const records = ordinals.map((rowNumber, index) => ({
      id: source.id + '-' + String(rowNumber).padStart(4, '0'), sourceId: source.id,
      rowNumber, name: '测试养老机构' + rowNumber, address: null, beds: 100,
      chunk: 'chunk-' + String(Math.floor(index / 100) + 1).padStart(3, '0') + '.v1.json',
    }));
    const manifest = {
      schemaVersion: 1, snapshotId: 'zhejiang-test-1', archivedAt: '2026-11-17',
      rowCount: 674, sources: [source], provinces: [{ slug: 'zhejiang', name: '浙江省',
        count: 674, cities: [{ slug: 'hangzhou', name: '杭州市', count: 674,
          indexPath: 'zhejiang/hangzhou/index.v1.json' }],
      }],
    };
    const write = () => {
      writeFileSync(path.join(base, 'manifest.v1.json'), JSON.stringify(manifest));
      writeFileSync(path.join(city, 'index.v1.json'), JSON.stringify({
        schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'zhejiang',
        citySlug: 'hangzhou', records,
      }));
      for (let i = 0; i < 7; i++) {
        writeFileSync(path.join(city, 'chunk-' + String(i + 1).padStart(3, '0') + '.v1.json'), JSON.stringify({
          schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug: 'zhejiang', citySlug: 'hangzhou',
          records: records.slice(i * 100, (i + 1) * 100).map(({ chunk: _chunk, ...record }) => ({
            ...record, residentCount: null, staffCount: null, services: null,
          })),
        }));
      }
    };
    write();
    assert.equal((await scanPublicOutput(root, [], [], false, undefined, true, lock)).filesScanned, 9);
    lock.sources[0].rowCount = 674;
    await assert.rejects(scanPublicOutput(root, [], [], false, undefined, true, lock), /官方来源快照与锁定清单不一致/);
    lock.sources[0].rowCount = 1147;
    source.url = 'https://data.zjzwfw.gov.cn/dopServer/index.html#/dataCatalogDetail?id=OTHER';
    write();
    await assert.rejects(scanPublicOutput(root, [], [], false, undefined, true, lock), /浙江官方来源URL/);
    source.url = 'https://data.zjzwfw.gov.cn/dopServer/index.html#/dataCatalogDetail?id=hjiVC2086lVfI5xHiciluQ%3D%3D';
    records[673].rowNumber = 1148;
    records[673].id = source.id + '-1148';
    records[673].chunk = 'chunk-007.v1.json';
    write();
    await assert.rejects(scanPublicOutput(root, [], [], false, undefined, true, lock), /官方来源地区或来源行号/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('official projection rejects a malformed archive date', async () => {
  const files = fixture();
  try {
    files.manifest.archivedAt = 'yesterday';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|日期|archivedAt/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects extra fields and contact text in any record', async () => {
  const files = fixture();
  try {
    Object.assign(files.index.records[0], { phone: '13800000000' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|白名单|联系信息/);
    delete (files.index.records[0] as typeof files.index.records[0] & { phone?: string }).phone;
    files.chunk.records[0].services = '电话 +86 138-0000-0000';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|联系信息|手机号/);
    files.chunk.records[0].services = 'help@example.com';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|联系信息|邮箱/);
    files.chunk.records[0].services = '生活照料';
    files.index.records[0].beds = 13800000000;
    files.chunk.records[0].beds = 13800000000;
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /联系信息|手机号|数量/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects an empty address but preserves explicit unknown', async () => {
  const files = fixture();
  try {
    Object.assign(files.index.records[0], { address: '' });
    Object.assign(files.chunk.records[0], { address: '' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|地址|无效文本/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects a landline embedded in public text', async () => {
  const files = fixture();
  try {
    files.chunk.records[0].services = '生活照料；电话 023-12345678';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|联系信息|电话/);
    files.chunk.records[0].services = '生活照料；电话 （０２３）１２３４５６７８';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|联系信息|电话/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects raw HTML, XLSX and unlisted JSON paths', async () => {
  const files = fixture();
  try {
    writeFileSync(path.join(files.base, 'source.html'), '<p>原始来源</p>');
    await assert.rejects(scanPublicOutput(files.root), /官方|未经批准|原件/);
    rmSync(path.join(files.base, 'source.html'));
    mkdirSync(path.join(files.root, 'data', 'raw'), { recursive: true });
    writeFileSync(path.join(files.root, 'data', 'raw', 'source.html'), '<p>原始来源</p>');
    await assert.rejects(scanPublicOutput(files.root), /私有|原件|未经批准/);
    rmSync(path.join(files.root, 'data', 'raw', 'source.html'));
    writeFileSync(path.join(files.base, 'source.xlsx'), 'private workbook');
    await assert.rejects(scanPublicOutput(files.root), /XLSX|原件/);
    rmSync(path.join(files.base, 'source.xlsx'));
    writeFileSync(path.join(files.city, 'chunk-999.v1.json'), JSON.stringify(files.chunk));
    await assert.rejects(scanPublicOutput(files.root), /官方|多余|分块/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection accepts the identified Darzhou government open-data portal only', async () => {
  const files = fixture();
  try {
    const source = files.manifest.sources[0];
    source.id = 'sc-dz-20260814';
    source.province = '四川省';
    source.city = '达州';
    source.title = '达州市养老机构基本信息';
    source.publishedAt = '2024-01-10';
    source.url = 'https://www.dazhoudata.cn/oportal/catalog/8295bd1137254b6699c69992f30de94d';
    files.manifest.provinces[0].name = '四川省';
    files.manifest.provinces[0].cities[0].name = '达州';
    files.index.records[0].sourceId = source.id;
    files.chunk.records[0].sourceId = source.id;
    files.write();
    await scanPublicOutput(files.root);
    source.url = 'https://www.dazhoudata.cn.evil.example/other';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方来源URL未经批准/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects snapshot, region, identity and missing chunk drift', async () => {
  const files = fixture();
  try {
    files.chunk.snapshotId = 'other-snapshot';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|快照|不一致/);
    files.chunk.snapshotId = files.manifest.snapshotId;
    files.index.citySlug = 'jiangsu';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|地区|城市|不一致/);
    files.index.citySlug = 'chongqing';
    files.chunk.records[0].rowNumber = 2;
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|行号|不一致/);
    files.chunk.records[0].rowNumber = 1;
    files.write();
    rmSync(path.join(files.city, 'chunk-001.v1.json'));
    await assert.rejects(scanPublicOutput(files.root), /官方|分块|缺失/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects lost or duplicate source rows', async () => {
  const files = fixture();
  try {
    files.manifest.rowCount = 2;
    files.manifest.sources[0].rowCount = 2;
    files.manifest.provinces[0].count = 2;
    files.manifest.provinces[0].cities[0].count = 2;
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|行数|来源行|不一致/);
    files.index.records.push({ ...files.index.records[0], id: 'official-cq-2' });
    files.chunk.records.push({ ...files.chunk.records[0], id: 'official-cq-2' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /官方|来源行|重复/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('release scan can require an official manifest', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eldercare-required-official-'));
  try {
    writeFileSync(path.join(root, 'index.html'), '<h1>existing site</h1>');
    await assert.rejects(scanPublicOutput(root, [], [], false, undefined, true), /官方|缺失|manifest/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('official projection must match the pinned source manifest', async () => {
  const files = fixture();
  try {
    const lock = { schemaVersion: 1 as const, sources: [{
      id: files.manifest.sources[0].id, filename: 'source.html',
      sha256: 'b'.repeat(64), bytes: 100, rowCount: 1,
    }] };
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /官方|锁定|来源|不一致/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects a raw source HTML hidden outside its data directory', async () => {
  const files = fixture();
  try {
    const raw = '<html><body>测试原始来源</body></html>';
    const hash = createHash('sha256').update(raw).digest('hex');
    files.manifest.sources[0].sha256 = hash;
    files.write();
    writeFileSync(path.join(files.root, 'leaked.html'), raw);
    const lock = { schemaVersion: 1 as const, sources: [{
      id: files.manifest.sources[0].id, filename: 'source.html', sha256: hash, bytes: Buffer.byteLength(raw), rowCount: 1,
    }] };
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /官方|原件|HTML/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('official projection rejects a frozen source PDF hidden outside its data directory', async () => {
  const files = fixture();
  try {
    const raw = Buffer.from('%PDF-1.4\nprivate frozen source\n');
    const hash = createHash('sha256').update(raw).digest('hex');
    files.manifest.sources[0].sha256 = hash;
    files.write();
    writeFileSync(path.join(files.root, 'leaked.pdf'), raw);
    const lock = { schemaVersion: 1 as const, sources: [{
      id: files.manifest.sources[0].id, filename: 'shijiazhuang-2026.pdf',
      sha256: hash, bytes: raw.length, rowCount: 1,
    }] };
    await assert.rejects(scanPublicOutput(files.root, [], [], false, undefined, true, lock), /官方来源原始PDF/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});
