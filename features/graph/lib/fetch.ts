import 'server-only'

import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { graphRuns } from '@/lib/db/schema'
import type { GraphBundle } from '@/features/graph/types'

import {
  GRAPH_BUNDLE_ROOT,
  GRAPH_NAME,
  NODE_KIND,
} from './fetch/constants'
import type { GraphRunRow } from './fetch/constants'
import {
  assertCanonicalBundleManifest,
  coerceNumber,
  normalizeBundleManifest,
} from './fetch/normalize'

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

  for (const table of Object.values(bundle.bundleManifest.tables)) {
    assetNames.add(table.parquetFile)
  }

  return assetNames
}
