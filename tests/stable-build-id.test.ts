import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'scripts/stable-build-id.mjs')).href;
const requiredFiles = [
  'next.config.mjs', 'package.json', 'package-lock.json', 'postcss.config.mjs',
  'tailwind.config.ts', 'tsconfig.json', 'company-data.d.ts',
  'mca-preview-data.d.ts', 'next-env.d.ts', 'public/_headers',
  'scripts/stable-build-id.mjs', 'scripts/build-data.ts', 'scripts/build-service-data.ts',
];

function fixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eldercare-build-id-'));
  for (const directory of ['app', 'components', 'lib']) mkdirSync(path.join(root, directory));
  for (const file of requiredFiles) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `fixture ${file}\n`);
  }
  writeFileSync(path.join(root, 'app/page.tsx'), 'export default function Page() { return null; }\n');
  writeFileSync(path.join(root, 'components/Card.tsx'), 'export const card = true;\n');
  writeFileSync(path.join(root, 'lib/model.ts'), 'export const version = 1;\n');
  return root;
}

function buildId(root: string, basePath = '/eldercare'): string {
  const source = `import { computeStableBuildId } from ${JSON.stringify(moduleUrl)}; ` +
    `process.stdout.write(computeStableBuildId(${JSON.stringify(root)}, ${JSON.stringify(basePath)}));`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('same code and deployment prefix produce the same safe build ID', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = buildId(root);
  assert.match(first, /^eldercare-[a-f0-9]{24}$/);
  assert.equal(buildId(root), first);
});

test('data and editorial changes do not change the code build ID', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = buildId(root);
  for (const file of ['public/data/mca-catalog/index.v1.json', 'content/institution-articles/a.json', 'data/source.csv']) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'changed source data\n');
  }
  assert.equal(buildId(root), baseline);
});

test('runtime code, dependency lock and base path each change the build ID', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = buildId(root);
  writeFileSync(path.join(root, 'app/page.tsx'), 'export default function Page() { return 1; }\n');
  const afterCode = buildId(root);
  assert.notEqual(afterCode, baseline);
  writeFileSync(path.join(root, 'package-lock.json'), '{"version":2}\n');
  assert.notEqual(buildId(root), afterCode);
  assert.notEqual(buildId(root, ''), buildId(root, '/eldercare'));
});

test('changing a data projection generator changes the build ID', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = buildId(root);
  writeFileSync(path.join(root, 'scripts/build-data.ts'), 'changed projection logic\n');
  assert.notEqual(buildId(root), baseline);
});

test('missing runtime source fails instead of reusing an old build ID', t => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  rmSync(path.join(root, 'lib'), { recursive: true });
  assert.throws(() => buildId(root), /Missing build ID input/);
});
