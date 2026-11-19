import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve('.');
const prototypeRoot = path.join(projectRoot, 'prototype');

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : [filename];
  });
}

function runConfig(script: string, mode: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ELDERCARE_PROTOTYPE_LOCAL: mode },
  });
}

test('prototype provenance covers and preserves every copied UI and demo-domain source', () => {
  const manifest = JSON.parse(readFileSync(path.join(prototypeRoot, 'source-manifest.json'), 'utf8')) as {
    sourceDirectory: string;
    files: { path: string; sha256: string }[];
  };
  assert.equal(manifest.sourceDirectory, 'dist(1)');
  assert.ok(Array.isArray(manifest.files));
  assert.ok(manifest.files.length >= 50, 'the complete prototype source must be retained');
  const paths = manifest.files.map((file) => file.path);
  assert.equal(new Set(paths).size, paths.length, 'manifest paths must be unique');

  const expected = [
    ...['app', 'components', 'lib'].flatMap((directory) => filesUnder(path.join(prototypeRoot, directory))),
    path.join(prototypeRoot, 'tailwind.config.ts'),
    path.join(prototypeRoot, 'postcss.config.mjs'),
  ].map((filename) => path.relative(prototypeRoot, filename).split(path.sep).join('/'))
    .filter((filename) => filename !== 'app/robots.ts');
  assert.deepEqual([...paths].sort(), expected.sort(), 'manifest must cover all copied source files');

  for (const file of manifest.files) {
    assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'), 'manifest path stays within prototype');
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const actual = createHash('sha256').update(readFileSync(path.join(prototypeRoot, file.path))).digest('hex');
    assert.equal(actual, file.sha256, `copied source changed: ${file.path}`);
  }
});

test('prototype config rejects missing or invalid local mode and every non-development phase', () => {
  const rejectedModes = ['', '0', 'true'];
  for (const mode of rejectedModes) {
    const result = runConfig(`
      import assert from 'node:assert/strict';
      import config from './prototype/next.config.mjs';
      assert.equal(typeof config, 'function');
      for (const phase of ['phase-development-server', 'phase-production-build', 'phase-production-server']) {
        assert.throws(() => config(phase), /Local prototype/);
      }
    `, mode);
    assert.equal(result.status, 0, result.stderr || String(result.error));
  }
  const local = runConfig(`
    import assert from 'node:assert/strict';
    import config from './prototype/next.config.mjs';
    for (const phase of ['phase-production-build', 'phase-production-server', 'phase-export', 'unknown-phase']) {
      assert.throws(() => config(phase), /Local prototype/);
    }
  `, '1');
  assert.equal(local.status, 0, local.stderr || String(local.error));
});

test('allowed local prototype responds with noindex and nofollow for every route', () => {
  const result = runConfig(`
    import assert from 'node:assert/strict';
    import config from './prototype/next.config.mjs';
    const local = config('phase-development-server');
    assert.equal(typeof local.headers, 'function');
    const rules = await local.headers();
    const allRoutes = rules.find(rule => rule.source === '/:path*');
    assert.ok(allRoutes, 'robots header covers every route');
    const robots = allRoutes.headers.find(header => header.key.toLowerCase() === 'x-robots-tag');
    assert.ok(robots, 'every route has an X-Robots-Tag');
    assert.match(robots.value, /(?:^|[,\\s])noindex(?:$|[,\\s])/i);
    assert.match(robots.value, /(?:^|[,\\s])nofollow(?:$|[,\\s])/i);
  `, '1');
  assert.equal(result.status, 0, result.stderr || String(result.error));
});

test('prototype launcher rejects an out-of-range PORT before starting a server', () => {
  const result = spawnSync(process.execPath, ['scripts/prototype.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 8_000,
    env: { ...process.env, PORT: '70000' },
  });
  assert.equal(result.signal, null, 'invalid PORT must terminate immediately rather than require a timeout');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PORT/);
});
