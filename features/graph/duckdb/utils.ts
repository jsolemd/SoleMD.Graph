import type { GraphBundle } from '@/features/graph/types'

const CACHE_MAX_ENTRIES = 200

/** Simple bounded Map that evicts the oldest entry when full. */
export function createBoundedCache<K, V>(max = CACHE_MAX_ENTRIES): Map<K, V> {
  const map = new Map<K, V>()
  const originalSet = map.set.bind(map)
  map.set = (key: K, value: V) => {
    if (map.size >= max && !map.has(key)) {
      const oldest = map.keys().next().value
      if (oldest !== undefined) map.delete(oldest)
    }
    return originalSet(key, value)
  }
  return map
}

/**
 * Cache-aside helper for promise-based queries.
 *
 * Deduplicates in-flight requests via the same cache key, auto-evicts on error,
 * and optionally evicts empty/falsy results.
 */
export function cachedQuery<V>(
  cache: Map<string, Promise<V>>,
  keyParts: Record<string, unknown>,
  query: () => Promise<V>,
  opts?: { evictWhen?: (result: V) => boolean },
): Promise<V> {
  const cacheKey = JSON.stringify(keyParts)
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const next = query()
    .then((result) => {
      if (opts?.evictWhen?.(result)) cache.delete(cacheKey)
      return result
    })
    .catch((error) => {
      cache.delete(cacheKey)
      throw error
    })
  cache.set(cacheKey, next)
  return next
}

const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/i

export function validateTableName(name: string): string {
  if (!TABLE_NAME_RE.test(name)) {
    throw new Error(`Invalid table name: ${name}`)
  }
  return name
}

export function requireBundleTable(bundle: GraphBundle, tableName: string) {
  const table = bundle.bundleManifest.tables[tableName]
  if (!table) {
    throw new Error(`Canonical graph bundle is missing required table "${tableName}"`)
  }
  return table
}

export function getBundleArtifactTableSet(
  bundle: GraphBundle,
  groups: Array<keyof GraphBundle['bundleManifest']['contract']['artifactSets']>
): Set<string> {
  const tables = new Set<string>()
  for (const group of groups) {
    for (const tableName of bundle.bundleManifest.contract.artifactSets[group] ?? []) {
      if (bundle.bundleManifest.tables[tableName]) {
        tables.add(tableName)
      }
    }
  }
  return tables
}

export function getAutoloadBundleTables(bundle: GraphBundle): string[] {
  return [...getBundleArtifactTableSet(bundle, ['base'])]
}

export function buildPlaceholderList(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}
