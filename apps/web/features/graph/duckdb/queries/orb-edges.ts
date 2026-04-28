import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import type { GraphLayer } from '@solemd/graph'

import { EDGE_SOURCE_BITMAP, type EdgeSource } from '@/features/graph/lib/edge-types'
import {
  buildCurrentViewPredicate,
  getLayerTableName,
} from '../sql-helpers'
import { queryRows } from './core'

export interface OrbClusterChordRow {
  sourceClusterId: number
  targetClusterId: number
  sourceX: number
  sourceY: number
  sourceZ: number
  targetX: number
  targetY: number
  targetZ: number
  weight: number
  edgeCount: number
  sourceBitmap: number
}

export interface QueryOrbClusterChordsArgs {
  activeLayer: GraphLayer
  currentPointScopeSql: string | null
  sources?: readonly EdgeSource[]
  limit?: number
}

const DEFAULT_CLUSTER_CHORD_LIMIT = 384
const EDGE_SOURCES: readonly EdgeSource[] = ['citation', 'entity']

function normalizeEdgeSources(sources?: readonly EdgeSource[]): EdgeSource[] {
  const selected = sources ?? EDGE_SOURCES
  return EDGE_SOURCES.filter((source) => selected.includes(source))
}

function buildSourceEdgeSql(sources: readonly EdgeSource[]): string {
  const parts: string[] = []

  if (sources.includes('citation')) {
    parts.push(`
      SELECT
        source_node_id,
        target_node_id,
        COALESCE(weight, 1.0) AS weight,
        ${EDGE_SOURCE_BITMAP.citation}::INTEGER AS source_bitmap
      FROM active_links_web
      WHERE source_node_id IS NOT NULL
        AND target_node_id IS NOT NULL
    `)
  }

  if (sources.includes('entity')) {
    parts.push(`
      SELECT
        source_node_id,
        target_node_id,
        COALESCE(weight, 1.0) AS weight,
        COALESCE(source_bitmap, ${EDGE_SOURCE_BITMAP.entity})::INTEGER AS source_bitmap
      FROM orb_entity_edges_current
      WHERE source_node_id IS NOT NULL
        AND target_node_id IS NOT NULL
    `)
  }

  if (parts.length === 0) {
    return `
      SELECT
        NULL::VARCHAR AS source_node_id,
        NULL::VARCHAR AS target_node_id,
        NULL::DOUBLE AS weight,
        0::INTEGER AS source_bitmap
      WHERE false
    `
  }

  return parts.join('\nUNION ALL\n')
}

function isMissingClusterCentroidRelation(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return (
    message.includes('release_cluster_centroids') &&
    (
      message.includes('Catalog Error') ||
      message.includes('does not exist') ||
      message.includes('not found')
    )
  )
}

export function buildOrbClusterChordSql(args: QueryOrbClusterChordsArgs): string {
  const pointTable = getLayerTableName(args.activeLayer)
  const scopePredicate = buildCurrentViewPredicate({
    currentPointScopeSql: args.currentPointScopeSql,
  })
  const sources = normalizeEdgeSources(args.sources)
  const limit = Math.max(0, Math.floor(args.limit ?? DEFAULT_CLUSTER_CHORD_LIMIT))

  return `
    WITH scoped_points AS (
      SELECT
        id,
        clusterId
      FROM ${pointTable}
      WHERE ${scopePredicate}
    ),
    source_edges AS (
      ${buildSourceEdgeSql(sources)}
    ),
    cluster_edges AS (
      SELECT
        LEAST(src.clusterId, dst.clusterId)::INTEGER AS sourceClusterId,
        GREATEST(src.clusterId, dst.clusterId)::INTEGER AS targetClusterId,
        SUM(edge.weight)::DOUBLE AS weight,
        COUNT(*)::INTEGER AS edgeCount,
        COALESCE(SUM(DISTINCT edge.source_bitmap), 0)::INTEGER AS sourceBitmap
      FROM source_edges edge
      JOIN scoped_points src
        ON src.id = edge.source_node_id
      JOIN scoped_points dst
        ON dst.id = edge.target_node_id
      WHERE src.clusterId IS NOT NULL
        AND dst.clusterId IS NOT NULL
        AND src.clusterId <> dst.clusterId
      GROUP BY sourceClusterId, targetClusterId
      ORDER BY weight DESC, edgeCount DESC, sourceClusterId, targetClusterId
      LIMIT ${limit}
    )
    SELECT
      cluster_edges.sourceClusterId,
      cluster_edges.targetClusterId,
      source_centroid.centroid_x AS sourceX,
      source_centroid.centroid_y AS sourceY,
      source_centroid.centroid_z AS sourceZ,
      target_centroid.centroid_x AS targetX,
      target_centroid.centroid_y AS targetY,
      target_centroid.centroid_z AS targetZ,
      cluster_edges.weight,
      cluster_edges.edgeCount,
      cluster_edges.sourceBitmap
    FROM cluster_edges
    JOIN release_cluster_centroids source_centroid
      ON source_centroid.cluster_id = cluster_edges.sourceClusterId
    JOIN release_cluster_centroids target_centroid
      ON target_centroid.cluster_id = cluster_edges.targetClusterId
    ORDER BY cluster_edges.weight DESC, cluster_edges.edgeCount DESC
  `
}

export async function queryOrbClusterChords(
  conn: AsyncDuckDBConnection,
  args: QueryOrbClusterChordsArgs,
): Promise<OrbClusterChordRow[]> {
  try {
    return await queryRows<OrbClusterChordRow>(
      conn,
      buildOrbClusterChordSql(args),
    )
  } catch (error) {
    if (isMissingClusterCentroidRelation(error)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[OrbEdges] release_cluster_centroids is not registered; Tier-0 cluster chords are disabled.',
        )
      }
      return []
    }
    throw error
  }
}
