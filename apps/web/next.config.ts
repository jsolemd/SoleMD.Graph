import type { NextConfig } from 'next'

const DUCKDB_BROWSER_ENTRY = '@duckdb/duckdb-wasm/dist/duckdb-browser.mjs'
// lottie-react's package.json `browser` field points at build/index.umd.js.
// Turbopack picks that for client code and the UMD entry fails to load as an
// ESM chunk. Force the ESM build (the `module` field) on both bundlers.
const LOTTIE_REACT_ESM_ENTRY = 'lottie-react/build/index.es.js'

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
    optimizePackageImports: [
      '@mantine/core',
      '@mantine/hooks',
      'lucide-react',
      'framer-motion',
      'zustand',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      'gsap',
      '@gsap/react',
      'lottie-react',
      '@google/model-viewer',
    ],
  },
  // @google/model-viewer ships as a web component; transpile so SSR and
  // Next's module resolver agree on a single CJS/ESM entry.
  transpilePackages: ['@google/model-viewer'],
  turbopack: {
    resolveAlias: {
      // DuckDB-WASM ships browser and Node entries. Force the browser entry in
      // dev as well so Turbopack does not walk the larger Node-side surface.
      '@duckdb/duckdb-wasm': DUCKDB_BROWSER_ENTRY,
      'lottie-react': LOTTIE_REACT_ESM_ENTRY,
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@duckdb/duckdb-wasm': DUCKDB_BROWSER_ENTRY,
      'lottie-react': LOTTIE_REACT_ESM_ENTRY,
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
