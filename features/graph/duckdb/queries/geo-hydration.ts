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
} from '@/features/graph/types'

import type { ProgressCallback } from '../types'
import { createEmptyGraphData } from '../utils'

import { queryRows } from './core'

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
