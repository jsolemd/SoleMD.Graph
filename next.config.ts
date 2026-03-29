import type { NextConfig } from 'next'

const DUCKDB_BROWSER_ENTRY = '@duckdb/duckdb-wasm/dist/duckdb-browser.mjs'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  reactCompiler: true,
  cacheComponents: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ]
  },
  experimental: {
    viewTransition: true,
    optimizePackageImports: [
      '@mantine/core',
      '@mantine/hooks',
      'lucide-react',
      'framer-motion',
      'zustand',
    ],
  },
  turbopack: {
    resolveAlias: {
      // DuckDB-WASM ships browser and Node entries. Force the browser entry in
      // dev as well so Turbopack does not walk the larger Node-side surface.
      '@duckdb/duckdb-wasm': DUCKDB_BROWSER_ENTRY,
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@duckdb/duckdb-wasm': DUCKDB_BROWSER_ENTRY,
    }

    // Keep the suppression narrow to DuckDB's optional Node-side bundle.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /duckdb-node\.cjs$/, message: /Critical dependency/ },
    ]

    return config
  },
}

export default nextConfig
