import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: [
      '@mantine/core',
      '@mantine/hooks',
      'lucide-react',
      'framer-motion',
      'zustand',
    ],
  },
  turbopack: {},
  webpack: (config) => {
    // DuckDB-WASM ships browser and Node entries. Webpack can warn when it
    // inspects the optional Node-side bundle even though the app runs the WASM
    // path in the browser. Keep the suppression narrow to that file only.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /duckdb-node\.cjs$/, message: /Critical dependency/ },
    ]

    return config
  },
}

export default nextConfig
