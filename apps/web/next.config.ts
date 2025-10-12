import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

const config: NextConfig = {
  output: 'standalone',
  // Trace dependencies from the monorepo root so the standalone build includes workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@mcg/core'],
  // Pulled in through Base Account for SSR only. Its x402 code paths are lazy imports of optional
  // peers we do not use, so let Node load it instead of making the bundler resolve them.
  serverExternalPackages: ['@coinbase/cdp-sdk'],
  async rewrites() {
    // The browser only ever talks to this origin, so the session cookie stays first-party.
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default config
