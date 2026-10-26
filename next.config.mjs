import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // no ESLint toolchain is installed in this workspace; type-checking still runs during `next build`
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // monorepo: trace hoisted dependencies from the workspace root into the standalone bundle
    outputFileTracingRoot: path.join(here, '../../'),
  },
};

export default nextConfig;
