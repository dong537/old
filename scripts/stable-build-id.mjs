import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const sourceDirectories = ['app', 'components', 'lib'];
const rootFiles = [
  'next.config.mjs',
  'package.json',
  'package-lock.json',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'tsconfig.json',
  'company-data.d.ts',
  'mca-preview-data.d.ts',
  'next-env.d.ts',
  'public/_headers',
  'scripts/stable-build-id.mjs',
  'scripts/build-data.ts',
  'scripts/build-service-data.ts',
];

function requireSource(root, relativePath, type) {
  const absolutePath = path.join(root, relativePath);
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Missing build ID input: ' + relativePath);
    throw error;
  }
  if (type === 'directory' ? !stats.isDirectory() : !stats.isFile()) {
    throw new Error('Missing build ID input: ' + relativePath);
  }
  return absolutePath;
}

function listSourceFiles(root, relativeDirectory, files) {
  const absoluteDirectory = requireSource(root, relativeDirectory, 'directory');
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(root, relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error('Unsupported build ID input: ' + relativePath);
    }
  }
}

/** Keep Next's build ID stable across editorial/data-only releases. */
export function computeStableBuildId(root, basePath) {
  const files = [...rootFiles];
  for (const directory of sourceDirectories) listSourceFiles(root, directory, files);
  files.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);

  const hash = createHash('sha256');
  hash.update('basePath\0').update(basePath).update('\0');
  for (const relativePath of files) {
    const bytes = readFileSync(requireSource(root, relativePath, 'file'));
    hash.update(relativePath).update('\0').update(String(bytes.length)).update('\0');
    hash.update(bytes);
  }
  return 'eldercare-' + hash.digest('hex').slice(0, 24);
}
