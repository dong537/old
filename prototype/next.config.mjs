import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {import('next').NextConfig} */
const config = (phase) => {
  if (process.env.ELDERCARE_PROTOTYPE_LOCAL !== '1' || phase !== PHASE_DEVELOPMENT_SERVER) {
    throw new Error('Local prototype is only available through npm run dev:prototype during local development.');
  }

  return {
    reactStrictMode: true,
    outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
    devIndicators: false,
    async headers() {
      return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
    },
  };
};

export default config;
