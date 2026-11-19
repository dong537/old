import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { OFFICIAL_SOURCE, parseOfficialCsv } from '../lib/import';
import type { IdMapEntry } from '../lib/types';
import { assertPrivateOutputPath, buildProvinceReview } from './province-pipeline';

export function buildGuangzhouCrosswalk(officialCsv: string, idMap: IdMapEntry[], provinceCsv: string) {
  const official = parseOfficialCsv(officialCsv, idMap);
  const observations = buildProvinceReview(provinceCsv).observations.filter(item => item.city === '广州' && item.sourceUrl === OFFICIAL_SOURCE.url);
  if (observations.length !== official.length) throw new Error('广州同源观察数量与官方源记录不对应。');
  const officialByRow = new Map(official.map(item => [item.sourceRow, item]));
  const seen = new Set<number>();
  const links = observations.map(item => {
    const pointer = /^原始序号:([1-9]\d*)$/.exec(item.sourcePointer);
    const sourceRow = pointer ? Number(pointer[1]) : null;
    const original = sourceRow === null ? null : officialByRow.get(sourceRow);
    if (!original || original.name !== item.name || seen.has(sourceRow!)) {
      throw new Error('广州官方同源观察的原始序号或名称无法一一对应。');
    }
    seen.add(sourceRow!);
    return {
      publicInstitutionId: original.id, observationId: item.id, candidateKey: item.candidateKey,
      sourceRow: original.sourceRow, sourceUrl: OFFICIAL_SOURCE.url,
      evidence: 'same_official_source_row_and_name' as const,
      identityVerified: false as const,
    };
  }).sort((a, b) => a.sourceRow - b.sourceRow);
  if (seen.size !== official.length) throw new Error('广州官方源记录未能全部对应。');
  return {
    manifest: {
      schemaVersion: 1 as const, sourceRecords: official.length, linkedObservations: links.length,
      officialInputSha256: createHash('sha256').update(officialCsv).digest('hex'),
      provinceInputSha256: createHash('sha256').update(provinceCsv).digest('hex'),
      interpretation: '仅证明两份导出引用同一官方源行；不证明跨期同名观察、服务点或运营主体为同一实体。',
    },
    links,
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const sourceRoot = path.join(root, 'data/private/guangdong-eldercare-source');
  const [officialCsv, mapText, provinceCsv] = await Promise.all([
    readFile('data/raw/family_fields_official.csv', 'utf8'),
    readFile('data/raw/id-map.json', 'utf8'),
    readFile(path.join(sourceRoot, 'exports/20261114_batch10/机构名录_逐条来源.csv'), 'utf8'),
  ]);
  const result = buildGuangzhouCrosswalk(officialCsv, JSON.parse(mapText) as IdMapEntry[], provinceCsv);
  const destination = path.join(sourceRoot, 'research-batch11/guangzhou-crosswalk.json');
  assertPrivateOutputPath(root, destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log('广州同源记录：' + result.links.length + ' 条一一对应；跨期身份仍未核实。');
}

if (path.basename(process.argv[1] ?? '') === 'guangzhou-crosswalk.ts') {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
