import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanPublicOutput } from '../scripts/check-public-output';

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 12);
const provinceSlug = 'p-' + digest('北京市');
const citySlug = 'c-' + digest('北京市|北京市');
const sourceSha = 'a'.repeat(64);

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'eldercare-qcc-institution-'));
  const base = path.join(root, 'data', 'qcc-institutions');
  const city = path.join(base, provinceSlug, citySlug);
  mkdirSync(city, { recursive: true });
  const manifest = {
    schemaVersion: 1, snapshotId: 'qi-test-1', receivedAt: '2026-11-17', rowCount: 1,
    source: { title: '企查查养老机构信息表', sha256: sourceSha, asOf: null },
    provinces: [{ slug: provinceSlug, name: '北京市', count: 1,
      cities: [{ slug: citySlug, name: '北京市', count: 1,
        indexPath: provinceSlug + '/' + citySlug + '/index.v1.json' }] }],
  };
  const indexRecord = {
    id: 'qi-' + sourceSha.slice(0, 12) + '-2', sourceRow: 2,
    name: '北京市东城区银杏舍养老服务中心', region: '北京市东城区',
    address: '北京市东城区东四十三条53号', beds: 37,
    chunk: 'chunk-001.v1.json',
  };
  const { chunk: _chunk, ...summary } = indexRecord;
  const detailRecord = { ...summary, creditCode: '52110101MJ0189463E', codeStatus: 'valid', sourceFields: {
    '统一社会信用代码': '52110101MJ0189463E', '地址': '[已遮蔽]',
    '行政区划代码': '110101000000', '机构名称': summary.name, '地区': summary.region,
    '床位数': 37, '省份': '河南省', '城市': '郑州市', '区县': '-', '经度': 113.5, '纬度': null,
  } };
  const index = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug, citySlug,
    records: [indexRecord] };
  const chunk = { schemaVersion: 1, snapshotId: manifest.snapshotId, provinceSlug, citySlug,
    records: [detailRecord] };
  const write = () => {
    writeFileSync(path.join(base, 'manifest.v1.json'), JSON.stringify(manifest));
    writeFileSync(path.join(city, 'index.v1.json'), JSON.stringify(index));
    writeFileSync(path.join(city, 'chunk-001.v1.json'), JSON.stringify(chunk));
  };
  write();
  return { root, base, city, manifest, index, chunk, write };
}

test('全国机构线索投影只接受完整关联的来源行', async () => {
  const files = fixture();
  try { assert.equal((await scanPublicOutput(files.root)).filesScanned, 3); }
  finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('全国机构线索投影拒绝未批准字段和错误代码原值', async () => {
  const files = fixture();
  try {
    Object.assign(files.chunk.records[0], { phone: '13800000000' });
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /白名单|联系信息|未经批准/);
    delete (files.chunk.records[0] as typeof files.chunk.records[0] & { phone?: string }).phone;
    files.chunk.records[0].creditCode = '000000000000000000';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /代码|校验|占位/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('全国机构线索投影拒绝缺失分块和跨地区索引', async () => {
  const files = fixture();
  try {
    files.index.citySlug = 'c-ffffffffffff';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /地区|城市|索引|不一致/);
    files.index.citySlug = citySlug;
    files.write();
    rmSync(path.join(files.city, 'chunk-001.v1.json'));
    await assert.rejects(scanPublicOutput(files.root), /分块|缺失/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('全国机构线索投影要求完整原始列且保留原始字符串与数字', async () => {
  const files = fixture();
  try {
    const raw = files.chunk.records[0].sourceFields as Record<string, unknown>;
    for (const value of ['-', '', null, 0, '0', '000000000000000000', 'NOT-A-CODE']) {
      raw['统一社会信用代码'] = value;
      files.write();
      assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
    }
    delete raw['经度'];
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /字段|白名单/);
    raw['经度'] = 113.5;
    raw['额外列'] = '不得投影';
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /字段|白名单/);
    delete raw['额外列'];
    raw['经度'] = { value: 113.5 };
    files.write();
    await assert.rejects(scanPublicOutput(files.root), /字段类型/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('全国机构线索投影拒绝数字与全角联系方式而保留代码和计数', async () => {
  const files = fixture();
  try {
    const raw = files.chunk.records[0].sourceFields as Record<string, unknown>;
    for (const [key, value] of [
      ['省份', 13800138000], ['城市', '１３８００１３８０００'],
      ['区县', '（０２０）１２３４５６７８'],
      ['统一社会信用代码', 'ｏｆｆｉｃｅ＠ｅｘａｍｐｌｅ．ｃｏｍ'],
      ['行政区划代码', 'office@example.com'],
    ] as const) {
      const original = raw[key];
      raw[key] = value;
      files.write();
      await assert.rejects(scanPublicOutput(files.root), /联系信息|遮蔽/, key);
      raw[key] = original;
    }
    Object.assign(raw, {
      '统一社会信用代码': '13800138000', '行政区划代码': 13800138000,
      '床位数': 13800138000, '经度': 13800138000, '纬度': 13800138000,
    });
    files.write();
    assert.equal((await scanPublicOutput(files.root)).filesScanned, 3);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test('全国机构线索投影拒绝标准字段中的全角联系方式', async () => {
  const files = fixture();
  try {
    for (const value of ['１３８００１３８０００', '（０２０）１２３４５６７８', 'ｏｆｆｉｃｅ＠ｅｘａｍｐｌｅ．ｃｏｍ']) {
      files.index.records[0].address = value;
      files.chunk.records[0].address = value;
      files.write();
      await assert.rejects(scanPublicOutput(files.root), /联系信息|遮蔽/, value);
    }
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});
