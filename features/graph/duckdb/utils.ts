import type { GraphBundle, GraphData } from '@/features/graph/types'

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
  const lazyTables = getBundleArtifactTableSet(bundle, ['universe', 'evidence'])
  return Object.keys(bundle.bundleManifest.tables).filter((tableName) => !lazyTables.has(tableName))
}

export function createEmptyGraphData(): GraphData {
  return {
    clusters: [],
    facets: [],
    nodes: [],
    paperNodes: [],
    geoNodes: [],
    geoLinks: [],
    geoCitationLinks: [],
    paperStats: null,
    geoStats: null,
    stats: {
      points: 0,
      pointLabel: 'nodes',
      papers: 0,
      clusters: 0,
      noise: 0,
    },
  }
}

export function buildPlaceholderList(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}
