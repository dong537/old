import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const preview = fileURLToPath(new URL('../scripts/preview.mjs', import.meta.url));
const nextConfig = fileURLToPath(new URL('../next.config.mjs', import.meta.url));

test('private preview keeps root and prefixed client bundles in separate caches', () => {
  const evaluate = (basePath: string) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { pathToFileURL } from 'node:url';
     import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
     const { default: config } = await import(pathToFileURL(process.argv[1]).href);
     process.stdout.write(config(PHASE_DEVELOPMENT_SERVER).distDir);`, nextConfig], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, ELDERCARE_PRIVATE_PREVIEW: '1', NEXT_PUBLIC_ELDERCARE_BASE_PATH: basePath },
    encoding: 'utf8', timeout: 10_000,
  });
  const root = evaluate('');
  const prefixed = evaluate('/eldercare');
  assert.equal(root.status, 0, root.stderr);
  assert.equal(prefixed.status, 0, prefixed.stderr);
  assert.notEqual(root.stdout, prefixed.stdout);
});

test('preview refuses a subpath when the build uses root asset URLs', () => {
  const root = mkdtempSync(join(tmpdir(), 'eldercare-preview-base-'));
  const out = join(root, 'out');
  const html = join(out, 'index.html');
  mkdirSync(out);
  writeFileSync(html, '<html><script src="/_next/static/chunks/app.js"></script></html>');
  try {
    const result = spawnSync(process.execPath, [preview], {
      cwd: root,
      env: { ...process.env, ELDERCARE_PREVIEW_BASE_PATH: '/eldercare', ELDERCARE_PREVIEW_PORT: '65534' },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build.*base path|构建.*路径前缀/i);
  } finally {
    unlinkSync(html);
    rmdirSync(out);
    rmdirSync(root);
  }
});
