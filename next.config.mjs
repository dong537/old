import path from 'node:path';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

const privatePreview = process.env.ELDERCARE_PRIVATE_PREVIEW === '1';
const basePath = process.env.NEXT_PUBLIC_ELDERCARE_BASE_PATH ?? '';
if (basePath && basePath !== '/eldercare') {
  throw new Error('NEXT_PUBLIC_ELDERCARE_BASE_PATH only supports /eldercare.');
}

/** @type {import('next').NextConfig} */
const config = (phase) => {
  if (privatePreview && phase !== PHASE_DEVELOPMENT_SERVER) {
    throw new Error('Private preview is only available during local development.');
  }
  return {
    output: 'export',
    ...(basePath ? { basePath } : {}),
    outputFileTracingRoot: process.cwd(),
    trailingSlash: true,
    poweredByHeader: false,
    experimental: { cpus: 1 },
    distDir: privatePreview ? '.next-local' : '.next',
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
