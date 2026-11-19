import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildProvinceCatalog } from '../lib/province-catalog';

const SOURCE_PATH = 'data/private/guangdong-eldercare-source/research-batch15/cleaned/versions/v1-aa3bf6d7cd70aaae/cumulative-roster-candidates.csv';
const SOURCE_SHA256 = '487c4d1ae1760c8561edb2fbb033541f27b3796e4a949b3ad8461b49b6f9d5b6';
const OUTPUT_PATH = 'public/data/guangdong-source-records.v1.json';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('仅支持无参数生成或 --check 验证。');
  }
  const root = process.cwd();
  const input = await readFile(path.join(root, SOURCE_PATH));
  const sha256 = createHash('sha256').update(input).digest('hex');
  if (sha256 !== SOURCE_SHA256) throw new Error('省级来源输入 SHA-256 不符，停止生成。');
  const catalog = buildProvinceCatalog(input.toString('utf8'));
  const json = JSON.stringify(catalog, null, 2) + '\n';
  const output = path.join(root, OUTPUT_PATH);
  if (args[0] === '--check') {
    if (await readFile(output, 'utf8') !== json) throw new Error('省级公开 JSON 与冻结投影不一致。');
    console.log('Verified ' + catalog.records.length + ' public source records across 21 cities.');
    return;
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, json, 'utf8');
  console.log('Generated ' + catalog.records.length + ' public source records across 21 cities.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
