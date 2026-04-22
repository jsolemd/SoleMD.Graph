import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { graphRuns } from '@/lib/db/schema'
import type { GraphBundle } from "@solemd/graph"

import { buildGraphBundleAssetUrl } from './bundle-assets'
import {
  GRAPH_NAME,
  NODE_KIND,
} from './fetch/constants'
import type { GraphRunRow } from './fetch/constants'
import {
  getDevFixtureBundleChecksum,
  loadDevFixtureGraphRun,
} from './fetch/dev-fixture'
import {
  assertCanonicalBundleManifest,
  coerceNumber,
  normalizeBundleManifest,
} from './fetch/normalize'

const graphRunByChecksumCache = new Map<string, Promise<GraphRunRow>>()
const DEFAULT_GRAPH_BUNDLE_QUERY_TIMEOUT_MS = 5000

function resolveGraphBundleQueryTimeoutMs() {
  const rawValue = process.env.GRAPH_BUNDLE_QUERY_TIMEOUT_MS
  if (!rawValue) {
    return DEFAULT_GRAPH_BUNDLE_QUERY_TIMEOUT_MS
  }

  const parsedValue = Number(rawValue)
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_GRAPH_BUNDLE_QUERY_TIMEOUT_MS
}

async function withGraphBundleTimeout<T>(
  operation: string,
  work: Promise<T>
): Promise<T> {
  const timeoutMs = resolveGraphBundleQueryTimeoutMs()

  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Timed out resolving ${operation} after ${timeoutMs}ms. Check local Postgres reachability and restart next dev if the client is stale.`
        )
      )
    }, timeoutMs)

    void work.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
      }
    )
  })
}

function normalizeGraphRunRow(row: {
  id: string
  graphName: string
  nodeKind: string
  bundleUri: string
  bundleFormat: string
  bundleVersion: string
  bundleChecksum: string
  bundleBytes: number | null
  bundleManifest: Record<string, unknown> | null
  qaSummary: Record<string, unknown> | null
  createdAt: Date
}): GraphRunRow {
  return {
    id: row.id,
    graph_name: row.graphName,
    node_kind: row.nodeKind,
    bundle_uri: row.bundleUri,
    bundle_format: row.bundleFormat,
    bundle_version: row.bundleVersion,
    bundle_checksum: row.bundleChecksum,
    bundle_bytes: row.bundleBytes,
    bundle_manifest: row.bundleManifest,
    qa_summary: row.qaSummary,
    created_at: row.createdAt.toISOString(),
  }
}

function rememberGraphRun(row: GraphRunRow) {
  graphRunByChecksumCache.set(row.bundle_checksum, Promise.resolve(row))
  return row
}

function buildGraphBundle(row: GraphRunRow): GraphBundle {
  const manifest = normalizeBundleManifest(row)
  assertCanonicalBundleManifest(manifest)
  const assetBaseUrl = `/graph-bundles/${row.bundle_checksum}`
  const tableUrls = Object.fromEntries(
    Object.entries(manifest.tables).map(([tableName, tableManifest]) => [
      tableName,
      buildGraphBundleAssetUrl(row.bundle_checksum, tableManifest.parquetFile),
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
    graphName: row.graph_name,
    manifestUrl: buildGraphBundleAssetUrl(row.bundle_checksum, 'manifest.json'),
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

  return rememberGraphRun(
    normalizeGraphRunRow({
      id: row.id,
      graphName: row.graphName,
      nodeKind: row.nodeKind,
      bundleUri: row.bundleUri,
      bundleFormat: row.bundleFormat,
      bundleVersion: row.bundleVersion,
      bundleChecksum: row.bundleChecksum,
      bundleBytes: row.bundleBytes,
      bundleManifest: row.bundleManifest as Record<string, unknown> | null,
      qaSummary: row.qaSummary as Record<string, unknown> | null,
      createdAt: row.createdAt,
    })
  )
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

  return rememberGraphRun(
    normalizeGraphRunRow({
      id: row.id,
      graphName: row.graphName,
      nodeKind: row.nodeKind,
      bundleUri: row.bundleUri,
      bundleFormat: row.bundleFormat,
      bundleVersion: row.bundleVersion,
      bundleChecksum: row.bundleChecksum,
      bundleBytes: row.bundleBytes,
      bundleManifest: row.bundleManifest as Record<string, unknown> | null,
      qaSummary: row.qaSummary as Record<string, unknown> | null,
      createdAt: row.createdAt,
    })
  )
}

async function getCachedGraphRunByChecksum(bundleChecksum: string): Promise<GraphRunRow> {
  let cached = graphRunByChecksumCache.get(bundleChecksum)
  if (!cached) {
    cached = queryGraphRunByChecksum(bundleChecksum).catch((error) => {
      graphRunByChecksumCache.delete(bundleChecksum)
      throw error
    })
    graphRunByChecksumCache.set(bundleChecksum, cached)
  }

  return cached
}

export async function fetchActiveGraphBundle(): Promise<GraphBundle> {
  // Pre-rebuild dev path: resolve the active bundle from
  // /mnt/solemd-graph/bundles/by-checksum/<checksum>/ when
  // GRAPH_DEV_FIXTURE_BUNDLE_CHECKSUM is set. Remove when the warehouse/serve
  // rebuild restores solemd.graph_runs. See docs/rag/05b-graph-bundles.md §11.7.
  const fixtureChecksum = getDevFixtureBundleChecksum()
  if (fixtureChecksum) {
    return buildGraphBundle(
      await withGraphBundleTimeout(
        `dev fixture graph bundle ${fixtureChecksum}`,
        loadDevFixtureGraphRun(fixtureChecksum)
      )
    )
  }

  return buildGraphBundle(
    await withGraphBundleTimeout('active graph bundle metadata', queryCurrentGraphRun())
  )
}

export async function fetchGraphBundleByChecksum(
  bundleChecksum: string
): Promise<GraphBundle> {
  return buildGraphBundle(
    await withGraphBundleTimeout(
      `graph bundle metadata for checksum ${bundleChecksum}`,
      getCachedGraphRunByChecksum(bundleChecksum)
    )
  )
}
