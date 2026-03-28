import 'server-only'

import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, desc, eq } from 'drizzle-orm'
import { coerceNullableNumber } from '@/lib/helpers'
import { db } from '@/lib/db'
import { graphRuns } from '@/lib/db/schema'
import type {
  GraphBundle,
  GraphBundleArtifactSet,
  GraphBundleContract,
  GraphBundleDuckDBFile,
  GraphBundleManifest,
  GraphBundleContractFileSet,
  GraphBundleTableManifest,
} from '@/features/graph/types'

const GRAPH_NAME = 'cosmograph'
const NODE_KIND = 'corpus'
const GRAPH_BUNDLE_ROOT =
  process.env.GRAPH_BUNDLE_ROOT ??
  '/mnt/e/SoleMD.Graph/graph/bundles'

const DEFAULT_BUNDLE_CONTRACT: GraphBundleContract = {
  artifactSets: {
    hot: ['corpus_points', 'corpus_clusters'],
    warm: ['corpus_documents', 'corpus_cluster_exemplars'],
    cold: [
      'corpus_links',
      'citation_neighborhood',
      'pubtator_annotations',
      'pubtator_relations',
      'paper_assets',
      'full_text',
      'rag_chunks',
    ],
  },
  files: {
    corpus_points: 'corpus_points.parquet',
    corpus_clusters: 'corpus_clusters.parquet',
    corpus_documents: 'corpus_documents.parquet',
    corpus_cluster_exemplars: 'corpus_cluster_exemplars.parquet',
    corpus_links: 'corpus_links.parquet',
    manifest: 'manifest.json',
  },
}

const CANONICAL_BUNDLE_VERSION = '2'
const REQUIRED_BUNDLE_TABLES = ['corpus_points', 'corpus_clusters'] as const
const DEPRECATED_BUNDLE_TABLES = [
  'graph_points',
  'graph_clusters',
  'graph_facets',
  'graph_cluster_exemplars',
  'graph_chunk_details',
  'paper_documents',
  'paper_points',
] as const

function assertSupportedBundleVersion(bundleVersion: string) {
  if (bundleVersion === CANONICAL_BUNDLE_VERSION) {
    return
  }

  throw new Error(
    `Unsupported graph bundle version "${bundleVersion}". Frontend requires ${CANONICAL_BUNDLE_VERSION}.`
  )
}

interface GraphRunRow {
  bundle_bytes: number | string | null
  bundle_checksum: string
  bundle_format: string
  bundle_manifest: Record<string, unknown> | null
  bundle_uri: string
  bundle_version: string
  created_at: string
  graph_name: string
  id: string
  node_kind: string
  qa_summary: Record<string, unknown> | null
}

function coerceNumber(value: number | string | null | undefined): number {
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
      ? [...new Set(
          entry
            .filter((item): item is string => typeof item === 'string')
        )]
      : []

  return {
    hot: normalizeList(value.hot),
    warm: normalizeList(value.warm),
    cold: normalizeList(value.cold),
  }
}

function normalizeContractFileSet(value: unknown): GraphBundleContractFileSet | null {
  if (!isRecord(value)) {
    return null
  }

  const fileSet: GraphBundleContractFileSet = {}
  for (const key of [
    'corpus_points',
    'corpus_clusters',
    'corpus_documents',
    'corpus_cluster_exemplars',
    'corpus_links',
    'manifest',
  ] as const) {
    const rawValue = value[key]
    if (typeof rawValue === 'string') {
      fileSet[key] = rawValue
    }
  }
  return fileSet
}

function assertCanonicalBundleManifest(manifest: GraphBundleManifest) {
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
      hot: [],
      warm: [],
      cold: [],
    },
    files: normalizeContractFileSet(value.files) ?? {},
  }
}

function normalizeBundleManifest(row: GraphRunRow): GraphBundleManifest {
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
    bundleProfile:
      typeof manifest.bundle_profile === 'string' ? manifest.bundle_profile : 'hot',
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

function buildBundleAssetUrl(bundleChecksum: string, assetPath: string) {
  const encodedAssetPath = assetPath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `/api/graph-bundles/${bundleChecksum}/${encodedAssetPath}`
}

function resolveBundleUriPath(bundleUri: string) {
  if (bundleUri.startsWith('file://')) {
    return fileURLToPath(bundleUri)
  }

  if (path.isAbsolute(bundleUri)) {
    return bundleUri
  }

  throw new Error(`Unsupported graph bundle URI: ${bundleUri}`)
}

function buildGraphBundle(row: GraphRunRow): GraphBundle {
  const manifest = normalizeBundleManifest(row)
  assertCanonicalBundleManifest(manifest)
  const assetBaseUrl = `/api/graph-bundles/${row.bundle_checksum}`
  const tableUrls = Object.fromEntries(
    Object.entries(manifest.tables).map(([tableName, tableManifest]) => [
      tableName,
      buildBundleAssetUrl(row.bundle_checksum, tableManifest.parquetFile),
    ])
  )

  return {
    assetBaseUrl,
    bundleBytes: coerceNumber(row.bundle_bytes),
    bundleChecksum: row.bundle_checksum,
    bundleFormat: row.bundle_format,
    bundleManifest: manifest,
    bundleUri: row.bundle_uri,
    bundleVersion: manifest.bundleVersion,
    duckdbUrl: manifest.duckdbFile
      ? buildBundleAssetUrl(row.bundle_checksum, manifest.duckdbFile.path)
      : null,
    graphName: row.graph_name,
    manifestUrl: buildBundleAssetUrl(row.bundle_checksum, 'manifest.json'),
    nodeKind: row.node_kind,
    qaSummary: row.qa_summary,
    runId: row.id,
    tableUrls,
  }
}

async function queryCurrentGraphRun(): Promise<GraphRunRow> {
  const rows = await db
    .select()
    .from(graphRuns)
    .where(
      and(
        eq(graphRuns.graphName, GRAPH_NAME),
        eq(graphRuns.nodeKind, NODE_KIND),
        eq(graphRuns.status, 'completed'),
        eq(graphRuns.isCurrent, true),
      )
    )
    .orderBy(desc(graphRuns.createdAt))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new Error('No current graph bundle found in solemd.graph_runs')
  }

  return {
    id: row.id,
    graph_name: row.graphName,
    node_kind: row.nodeKind,
    bundle_uri: row.bundleUri,
    bundle_format: row.bundleFormat,
    bundle_version: row.bundleVersion,
    bundle_checksum: row.bundleChecksum,
    bundle_bytes: row.bundleBytes,
    bundle_manifest: row.bundleManifest as Record<string, unknown> | null,
    qa_summary: row.qaSummary as Record<string, unknown> | null,
    created_at: row.createdAt.toISOString(),
  }
}

async function queryGraphRunByChecksum(bundleChecksum: string): Promise<GraphRunRow> {
  const rows = await db
    .select()
    .from(graphRuns)
    .where(
      and(
        eq(graphRuns.graphName, GRAPH_NAME),
        eq(graphRuns.nodeKind, NODE_KIND),
        eq(graphRuns.status, 'completed'),
        eq(graphRuns.bundleChecksum, bundleChecksum),
      )
    )
    .orderBy(desc(graphRuns.createdAt))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new Error(`No completed graph bundle found for checksum ${bundleChecksum}`)
  }

  return {
    id: row.id,
    graph_name: row.graphName,
    node_kind: row.nodeKind,
    bundle_uri: row.bundleUri,
    bundle_format: row.bundleFormat,
    bundle_version: row.bundleVersion,
    bundle_checksum: row.bundleChecksum,
    bundle_bytes: row.bundleBytes,
    bundle_manifest: row.bundleManifest as Record<string, unknown> | null,
    qa_summary: row.qaSummary as Record<string, unknown> | null,
    created_at: row.createdAt.toISOString(),
  }
}

// TODO: Replace with `"use cache"` + `cacheLife('minutes')` when real queries are in place
async function getCachedGraphRunByChecksum(bundleChecksum: string): Promise<GraphRunRow> {
  return queryGraphRunByChecksum(bundleChecksum)
}

export async function fetchActiveGraphBundle(): Promise<GraphBundle> {
  return buildGraphBundle(await queryCurrentGraphRun())
}

export async function fetchGraphBundleByChecksum(
  bundleChecksum: string
): Promise<GraphBundle> {
  return buildGraphBundle(await getCachedGraphRunByChecksum(bundleChecksum))
}

export async function resolveGraphBundleDirectory(bundle: GraphBundle) {
  const bundleDirectory = resolveBundleUriPath(bundle.bundleUri)
  const [resolvedRoot, resolvedDirectory] = await Promise.all([
    realpath(GRAPH_BUNDLE_ROOT),
    realpath(bundleDirectory),
  ])

  if (
    resolvedDirectory !== resolvedRoot &&
    !resolvedDirectory.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Graph bundle path escapes configured root: ${resolvedDirectory}`)
  }

  return resolvedDirectory
}

export function getGraphBundleAssetNames(bundle: GraphBundle) {
  const assetNames = new Set<string>(['manifest.json'])
  const duckdbPath = bundle.bundleManifest.duckdbFile?.path

  if (duckdbPath) {
    assetNames.add(duckdbPath)
  }

  for (const table of Object.values(bundle.bundleManifest.tables)) {
    assetNames.add(table.parquetFile)
  }

  return assetNames
}
