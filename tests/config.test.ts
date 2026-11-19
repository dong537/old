import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

test('production build phase rejects private alias despite NODE_ENV=development', () => {
  const script = `
    import config from './next.config.mjs';
    try { config('phase-production-build'); process.exit(11); }
    catch (error) { if (!String(error.message).includes('Private preview')) process.exit(12); }
    const local = config('phase-development-server');
    if (local.distDir !== '.next-local') process.exit(13);
    const alias = local.webpack({ resolve: { alias: {} } }).resolve.alias['@company-data'];
    if (!alias.endsWith('companies-local.ts')) process.exit(14);
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: resolve('.'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'development', ELDERCARE_PRIVATE_PREVIEW: '1' },
  }));
});

test('public build always aliases the public no-company implementation', () => {
  const script = `
    import config from './next.config.mjs';
    const publicConfig = config('phase-production-build');
    if (publicConfig.distDir !== '.next') process.exit(21);
    const alias = publicConfig.webpack({ resolve: { alias: {} } }).resolve.alias['@company-data'];
    if (!alias.endsWith('companies-public.ts')) process.exit(22);
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: resolve('.'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', ELDERCARE_PRIVATE_PREVIEW: '' },
  }));
});

test('static hosting headers disable framing, MIME sniffing and sensitive browser permissions', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
  assert.match(headers, /X-Frame-Options:\s*DENY/);
  assert.match(headers, /Referrer-Policy:\s*strict-origin-when-cross-origin/);
  assert.match(headers, /Permissions-Policy:\s*camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(headers, /X-Robots-Tag:\s*noindex, nofollow/);
});

test('local release checks the locked nationwide institution workbook', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(packageJson.scripts['qcc-institutions:check'], 'python scripts/build-qcc-institutions.py --check');
  assert.equal(packageJson.scripts['qcc-institution-links:check'], 'python scripts/build-qcc-institution-links.py --check');
  assert.match(packageJson.scripts['verify:local-release'], /qcc-institutions:check/);
  assert.match(packageJson.scripts['verify:local-release'], /qcc-institution-links:check/);
});

test('default development command starts the real nationwide directory', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(packageJson.scripts.dev, 'npm run dev:directory');
  assert.equal(packageJson.scripts['dev:prototype'], 'node scripts/prototype.mjs');
});
