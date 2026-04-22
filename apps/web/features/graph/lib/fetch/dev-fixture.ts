import 'server-only'

import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import { GRAPH_BUNDLE_PUBLISHED_ROOT, GRAPH_NAME, NODE_KIND } from './constants'
import type { GraphRunRow } from './constants'

// Dev-only escape hatch: resolve the active bundle straight off the bind mount
// when GRAPH_DEV_FIXTURE_BUNDLE_CHECKSUM is set, so frontend work can run while
// the backend rebuild has not yet landed the solemd.graph_runs row.
// See docs/rag/05b-graph-bundles.md §11.7 for the cleanup contract.

let cachedRowByChecksum: Map<string, Promise<GraphRunRow>> | null = null

export function getDevFixtureBundleChecksum(): string | null {
  const raw = process.env.GRAPH_DEV_FIXTURE_BUNDLE_CHECKSUM?.trim()
  if (!raw) {
    return null
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new Error(
      'GRAPH_DEV_FIXTURE_BUNDLE_CHECKSUM must be an alphanumeric bundle checksum.'
    )
  }
  return raw
}

export async function loadDevFixtureGraphRun(
  bundleChecksum: string
): Promise<GraphRunRow> {
  if (!cachedRowByChecksum) {
    cachedRowByChecksum = new Map()
  }

  let cached = cachedRowByChecksum.get(bundleChecksum)
  if (!cached) {
    cached = buildDevFixtureGraphRun(bundleChecksum).catch((error) => {
      cachedRowByChecksum?.delete(bundleChecksum)
      throw error
    })
    cachedRowByChecksum.set(bundleChecksum, cached)
  }

  return cached
}

async function buildDevFixtureGraphRun(bundleChecksum: string): Promise<GraphRunRow> {
  const publishedAlias = path.resolve(GRAPH_BUNDLE_PUBLISHED_ROOT, bundleChecksum)
  const bundleDir = await realpath(publishedAlias)
  const manifestPath = path.resolve(bundleDir, 'manifest.json')
  const manifestRaw = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>

  const runId =
    typeof manifest.graph_run_id === 'string'
      ? manifest.graph_run_id
      : path.basename(bundleDir)
  const graphName =
    typeof manifest.graph_name === 'string' ? manifest.graph_name : GRAPH_NAME
  const nodeKind =
    typeof manifest.node_kind === 'string' ? manifest.node_kind : NODE_KIND
  const bundleFormat =
    typeof manifest.bundle_format === 'string'
      ? manifest.bundle_format
      : 'parquet-manifest'
  const bundleVersion =
    typeof manifest.bundle_version === 'string' ? manifest.bundle_version : '4'
  const createdAtIso =
    typeof manifest.created_at === 'string'
      ? manifest.created_at
      : new Date(0).toISOString()

  return {
    id: runId,
    graph_name: graphName,
    node_kind: nodeKind,
    bundle_uri: bundleDir,
    bundle_format: bundleFormat,
    bundle_version: bundleVersion,
    bundle_checksum: bundleChecksum,
    bundle_bytes: Buffer.byteLength(manifestRaw),
    bundle_manifest: manifest,
    qa_summary: null,
    created_at: createdAtIso,
  } satisfies GraphRunRow
}
