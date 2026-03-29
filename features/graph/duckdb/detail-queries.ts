import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import {
  buildGeoNodes,
  buildGeoStats,
  type GeoPointRow,
} from '@/features/graph/lib/transform'
import type {
  GeoCitationLink,
  GeoLink,
  GraphBundle,
  GraphData,
  MapLayer,
  PaperDocument,
} from '@/features/graph/types'

import {
  mapPaperDocument,
  type GraphClusterDetailRow,
  type GraphClusterExemplarRow,
  type GraphPaperDetailRow,
  type PaperDocumentRow,
} from './mappers'
import { queryRows } from './queries'
import type { ProgressCallback } from './types'
import { createEmptyGraphData } from './utils'

export async function queryClusterRows(
  conn: AsyncDuckDBConnection,
  clusterId: number
): Promise<GraphClusterDetailRow[]> {
  return queryRows<GraphClusterDetailRow>(
    conn,
    `SELECT
      cluster_id,
      label,
      label_mode,
      member_count,
      centroid_x,
      centroid_y,
      representative_rag_chunk_id,
      label_source,
      candidate_count,
      entity_candidate_count,
      lexical_candidate_count,
      mean_cluster_probability,
      mean_outlier_score,
      paper_count,
      is_noise
    FROM graph_clusters
    WHERE cluster_id = ?
    LIMIT 1`,
    [clusterId]
  )
}

export async function queryExemplarRows(
  conn: AsyncDuckDBConnection,
  clusterId: number
): Promise<GraphClusterExemplarRow[]> {
  return queryRows<GraphClusterExemplarRow>(
    conn,
    `SELECT
      cluster_id,
      rank,
      rag_chunk_id,
      paper_id,
      citekey,
      title,
      section_type,
      section_canonical,
      page_number,
      exemplar_score,
      is_representative,
      chunk_preview
    FROM graph_cluster_exemplars
    WHERE cluster_id = ?
    ORDER BY rank
    LIMIT 5`,
    [clusterId]
  )
}

export async function queryPaperDocument(
  conn: AsyncDuckDBConnection,
  paperId: string
): Promise<PaperDocument | null> {
  const rows = await queryRows<PaperDocumentRow>(
    conn,
    `SELECT
      paper_id,
      source_embedding_id,
      citekey,
      title,
      source_payload_policy,
      source_text_hash,
      context_label,
      display_preview,
      was_truncated,
      context_char_count,
      body_char_count,
      text_char_count,
      context_token_count,
      body_token_count
    FROM paper_documents_web
    WHERE paper_id = ?
    LIMIT 1`,
    [paperId]
  )
  return rows[0] ? mapPaperDocument(rows[0]) : null
}

export async function queryPaperDetail(
  conn: AsyncDuckDBConnection,
  paperId: string
): Promise<GraphPaperDetailRow[]> {
  return queryRows<GraphPaperDetailRow>(
    conn,
    `SELECT
      paper_id,
      citekey,
      title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      abstract,
      authors_json,
      author_count,
      reference_count,
      asset_count,
      chunk_count,
      entity_count,
      relation_count,
      sentence_count,
      page_count,
      table_count,
      figure_count,
      graph_point_count,
      graph_cluster_count
    FROM paper_catalog_web
    WHERE paper_id = ?
    LIMIT 1`,
    [paperId]
  )
}

export async function hydrateGeoData(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  availableLayers: MapLayer[],
  onProgress: ProgressCallback
): Promise<GraphData> {
  const data = createEmptyGraphData()

  if (!availableLayers.includes('geo')) {
    onProgress(bundle.bundleChecksum, {
      stage: 'ready',
      message: 'Graph bundle is ready.',
      percent: 100,
    })
    return data
  }

  onProgress(bundle.bundleChecksum, {
    stage: 'hydrating',
    message: 'Loading geographic metadata for the map layer.',
    percent: 88,
  })

  const geoPointRows = await queryRows<GeoPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      hexColor AS color_hex,
      sizeValue AS size_value,
      institution,
      rorId AS ror_id,
      city,
      region,
      country,
      countryCode AS country_code,
      paperCount AS paper_count,
      authorCount AS author_count,
      firstYear AS first_year,
      lastYear AS last_year
    FROM geo_points_web
    ORDER BY index`
  )

  data.geoNodes = buildGeoNodes(geoPointRows)
  data.geoStats = buildGeoStats(data.geoNodes)

  const geoNodeLookup = new Map(data.geoNodes.map((node) => [node.id, node]))

  if (bundle.bundleManifest.tables.geo_links) {
    const linkRows = await queryRows<{
      sourceId: string
      sourceIndex: number
      targetId: string
      targetIndex: number
      paperCount: number
    }>(
      conn,
      `SELECT sourceId, sourceIndex, targetId, targetIndex, paperCount
       FROM geo_links_web`
    )
    data.geoLinks = linkRows
      .map((row) => {
        const source = geoNodeLookup.get(row.sourceId)
        const target = geoNodeLookup.get(row.targetId)
        if (!source || !target) {
          return null
        }
        return {
          sourceId: row.sourceId,
          targetId: row.targetId,
          sourceIndex: row.sourceIndex,
          targetIndex: row.targetIndex,
          paperCount: row.paperCount ?? 1,
          sourceLng: source.x,
          sourceLat: source.y,
          targetLng: target.x,
          targetLat: target.y,
        } satisfies GeoLink
      })
      .filter((link): link is GeoLink => link !== null)
  }

  if (bundle.bundleManifest.tables.geo_citation_links) {
    const citationLinkRows = await queryRows<{
      sourceId: string
      sourceIndex: number
      targetId: string
      targetIndex: number
      citationCount: number
    }>(
      conn,
      `SELECT sourceId, sourceIndex, targetId, targetIndex, citationCount
       FROM geo_citation_links_web`
    )
    data.geoCitationLinks = citationLinkRows
      .map((row) => {
        const source = geoNodeLookup.get(row.sourceId)
        const target = geoNodeLookup.get(row.targetId)
        if (!source || !target) {
          return null
        }
        return {
          sourceId: row.sourceId,
          targetId: row.targetId,
          sourceIndex: row.sourceIndex,
          targetIndex: row.targetIndex,
          citationCount: row.citationCount ?? 1,
          sourceLng: source.x,
          sourceLat: source.y,
          targetLng: target.x,
          targetLat: target.y,
        } satisfies GeoCitationLink
      })
      .filter((link): link is GeoCitationLink => link !== null)
  }

  onProgress(bundle.bundleChecksum, {
    stage: 'ready',
    message: 'Geographic metadata is ready.',
    percent: 100,
  })
  return data
}

export { mapCluster, mapExemplar, mapPaper, mapChunkDetail } from './mappers'
export type { GraphClusterDetailRow, GraphClusterExemplarRow, GraphPaperDetailRow, GraphChunkDetailRow } from './mappers'
