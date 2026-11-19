import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildServiceCatalog, type ServiceManifest } from '../lib/service-import';
import type { ServiceSource } from '../lib/service-types';

async function main(): Promise<void> {
  const root = process.cwd();
  const archivePath = path.join(root, 'data/raw/services');
  const manifest = JSON.parse(await readFile(path.join(archivePath, 'source-manifest.json'), 'utf8')) as ServiceManifest;
  const files: Record<string, string> = {};
  for (const archive of manifest.archives) {
    for (const file of [archive.htmlFile, archive.tableFile]) {
      if (file.includes('/') || file.includes('\\')) throw new Error('服务归档清单包含无效文件名。');
      files[file] = await readFile(path.join(archivePath, file), 'utf8');
    }
  }
  const catalog = buildServiceCatalog(manifest, files);
  const output = path.join(root, 'public/data/guangzhou-services.v1.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Generated ${catalog.records.length} service records from ${catalog.sources.length} official sources.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
