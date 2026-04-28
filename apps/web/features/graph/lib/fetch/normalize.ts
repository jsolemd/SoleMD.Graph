import { coerceNullableNumber } from '@/lib/helpers'
import type {
  GraphBundleArtifactSet,
  GraphBundleContract,
  GraphBundleContractFileSet,
  GraphBundleDuckDBFile,
  GraphBundleManifest,
  GraphBundleProfile,
  GraphBundleTableManifest,
} from "@solemd/graph"
import {
  CANONICAL_BUNDLE_VERSION,
  DEFAULT_BUNDLE_CONTRACT,
  DEPRECATED_BUNDLE_TABLES,
  REQUIRED_BUNDLE_TABLES,
} from './constants'
import type { GraphRunRow } from './constants'

export function coerceNumber(value: number | string | null | undefined): number {
  return coerceNullableNumber(value) ?? 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDuckDBFile(value: unknown): GraphBundleDuckDBFile | null {
  if (!isRecord(value)) {
    return null
  }

  const rawPath = value.path
  const rawSha = value.sha256

  if (typeof rawPath !== 'string' || typeof rawSha !== 'string') {
    return null
  }

  return {
    path: rawPath,
    bytes: coerceNumber(value.bytes as number | string | null | undefined),
    sha256: rawSha,
  }
}

function normalizeBundleTableManifest(value: unknown): GraphBundleTableManifest | null {
  if (!isRecord(value)) {
    return null
  }

  const parquetFile = value.parquet_file
  const sha256 = value.sha256

  if (typeof parquetFile !== 'string' || typeof sha256 !== 'string') {
    return null
  }

  const rawColumns = Array.isArray(value.columns) ? value.columns : []
  const rawSchema = Array.isArray(value.schema) ? value.schema : []

  return {
    bytes: coerceNumber(value.bytes as number | string | null | undefined),
    columns: rawColumns.filter((column): column is string => typeof column === 'string'),
    parquetFile,
    rowCount: coerceNumber(value.row_count as number | string | null | undefined),
    schema: rawSchema
      .filter(isRecord)
      .map((column) => ({
        name: typeof column.name === 'string' ? column.name : '',
        type: typeof column.type === 'string' ? column.type : 'UNKNOWN',
      }))
      .filter((column) => column.name.length > 0),
    sha256,
  }
}

function normalizeArtifactSet(value: unknown): GraphBundleArtifactSet | null {
  if (!isRecord(value)) {
    return null
  }

  const normalizeList = (entry: unknown) =>
    Array.isArray(entry)
      ? [...new Set(entry.filter((item): item is string => typeof item === 'string'))]
      : []

  return {
    base: normalizeList(value.base),
    universe: normalizeList(value.universe),
    evidence: normalizeList(value.evidence),
  }
}

function normalizeBundleProfile(value: unknown): GraphBundleProfile {
  return value === 'full' ? 'full' : 'base'
}

function normalizeContractFileSet(value: unknown): GraphBundleContractFileSet | null {
  if (!isRecord(value)) {
    return null
  }

  const fileSet: GraphBundleContractFileSet = {}
  for (const key of [
    'base_points',
    'base_clusters',
    'universe_points',
    'paper_documents',
    'cluster_exemplars',
    'universe_links',
    'orb_entity_edges',
    'manifest',
  ] as const) {
    const rawValue = value[key]
    if (typeof rawValue === 'string') {
      fileSet[key] = rawValue
    }
  }
  return fileSet
}

export function assertCanonicalBundleManifest(manifest: GraphBundleManifest) {
  assertSupportedBundleVersion(manifest.bundleVersion)

  const missingTables = REQUIRED_BUNDLE_TABLES.filter((tableName) => !manifest.tables[tableName])
  if (missingTables.length > 0) {
    throw new Error(
      `Canonical graph bundle is missing required tables: ${missingTables.join(', ')}.`
    )
  }

  const deprecatedTables = DEPRECATED_BUNDLE_TABLES.filter((tableName) => manifest.tables[tableName])
  if (deprecatedTables.length > 0) {
    throw new Error(
      `Canonical graph bundle includes deprecated tables: ${deprecatedTables.join(', ')}.`
    )
  }
}

function normalizeBundleContract(value: unknown): GraphBundleContract | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    artifactSets: normalizeArtifactSet(value.artifact_sets) ?? {
      base: [],
      universe: [],
      evidence: [],
    },
    files: normalizeContractFileSet(value.files) ?? {},
  }
}

export function normalizeBundleManifest(row: GraphRunRow): GraphBundleManifest {
  const manifest = isRecord(row.bundle_manifest) ? row.bundle_manifest : {}
  const rawTables = isRecord(manifest.tables) ? manifest.tables : {}
  const tables = Object.fromEntries(
    Object.entries(rawTables)
      .map(([tableName, tableValue]) => {
        const normalized = normalizeBundleTableManifest(tableValue)
        return normalized ? [tableName, normalized] : null
      })
      .filter((entry): entry is [string, GraphBundleTableManifest] => entry !== null)
  )

  return {
    bundleFormat:
      typeof manifest.bundle_format === 'string' ? manifest.bundle_format : row.bundle_format,
    bundleProfile: normalizeBundleProfile(manifest.bundle_profile),
    bundleVersion:
      typeof manifest.bundle_version === 'string' ? manifest.bundle_version : row.bundle_version,
    contract: normalizeBundleContract(manifest.contract) ?? DEFAULT_BUNDLE_CONTRACT,
    createdAt:
      typeof manifest.created_at === 'string'
        ? manifest.created_at
        : row.created_at ?? null,
    duckdbFile: normalizeDuckDBFile(manifest.duckdb_file),
    graphName:
      typeof manifest.graph_name === 'string' ? manifest.graph_name : row.graph_name,
    graphRunId:
      typeof manifest.graph_run_id === 'string' ? manifest.graph_run_id : row.id,
    nodeKind:
      typeof manifest.node_kind === 'string' ? manifest.node_kind : row.node_kind,
    tables,
  }
}

function assertSupportedBundleVersion(bundleVersion: string) {
  if (bundleVersion === CANONICAL_BUNDLE_VERSION) {
    return
  }

  throw new Error(
    `Unsupported graph bundle version "${bundleVersion}". Frontend requires ${CANONICAL_BUNDLE_VERSION}.`
  )
}
