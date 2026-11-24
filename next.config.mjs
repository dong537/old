import { existsSync } from 'node:fs';
import path from 'node:path';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import { computeStableBuildId } from './scripts/stable-build-id.mjs';

const privatePreview = process.env.ELDERCARE_PRIVATE_PREVIEW === '1';
const basePath = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH ?? '';
const isolatedExportDir = process.env.ELDERCARE_EXPORT_DIR;
if (basePath && basePath !== '/eldercare') {
  throw new Error('NEXT_PUBLIC_ELDERCARE_BASE_PATH only supports /eldercare.');
}
if (isolatedExportDir !== undefined) {
  // Next 15 treats a custom distDir as the export directory when output is 'export'.
  // Require a fresh, purpose-named sibling so the existing out/ is never removed.
  if (!/^out-ui-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(isolatedExportDir)
    || path.isAbsolute(isolatedExportDir) || isolatedExportDir.includes('/')
    || isolatedExportDir.includes(path.win32.sep)) {
    throw new Error('ELDERCARE_EXPORT_DIR must be a directory name like out-ui-20261124 (no path separators).');
  }
  if (existsSync(path.resolve(process.cwd(), isolatedExportDir))) {
    throw new Error('ELDERCARE_EXPORT_DIR already exists: ' + isolatedExportDir + '. Choose a fresh directory name.');
  }
}

/** @type {import('next').NextConfig} */
const config = (phase) => {
  if (privatePreview && phase !== PHASE_DEVELOPMENT_SERVER) {
    throw new Error('Private preview is only available during local development.');
  }
  if (isolatedExportDir !== undefined && (privatePreview || phase === PHASE_DEVELOPMENT_SERVER)) {
    throw new Error('ELDERCARE_EXPORT_DIR is only available for public production builds.');
  }
  return {
    output: 'export',
    generateBuildId: async () => computeStableBuildId(process.cwd(), basePath),
    ...(basePath ? { basePath } : {}),
    outputFileTracingRoot: process.cwd(),
    trailingSlash: true,
    poweredByHeader: false,
    experimental: { cpus: 1 },
    // NEXT_PUBLIC_* values are compiled into client chunks; never share them across base paths.
    distDir: privatePreview ? (basePath ? '.next-local-eldercare' : '.next-local') : (isolatedExportDir ?? '.next'),
    images: { unoptimized: true },
    webpack(config) {
      config.resolve.alias['@company-data'] = path.resolve(
        process.cwd(), privatePreview ? 'lib/companies-local.ts' : 'lib/companies-public.ts',
      );
      config.resolve.alias['@mca-preview-data'] = path.resolve(
        process.cwd(), privatePreview ? 'lib/mca-preview-local.ts' : 'lib/mca-preview-public.ts',
      );
      return config;
    },
  };
};
export default config;
