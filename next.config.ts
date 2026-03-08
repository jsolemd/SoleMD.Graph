import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: [
      '@mantine/core',
      '@mantine/hooks',
      '@cosmograph/react',
      '@cosmograph/cosmograph',
      'lucide-react',
      'framer-motion',
      'zustand',
    ],
  },
  webpack: (config) => {
    // DuckDB-WASM ships browser and Node.js entries. Webpack's conditional
    // exports can resolve to duckdb-node.cjs which uses dynamic require()
    // for Node-only modules (url, vm, worker_threads). Suppress the
    // "Critical dependency" warning only for those specific files.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /duckdb-node\.cjs$/, message: /Critical dependency/ },
    ]
    return config
  },
}

export default nextConfig
