import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { DEFAULT_POINT_COLOR } from '@/features/graph/lib/brand-colors'
import type { GraphBundle, MapLayer } from '@/features/graph/types'

export async function registerGeoViews(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  availableLayers: MapLayer[]
) {
  if (!bundle.bundleManifest.tables.geo_points) {
    return
  }

  await conn.query(
    `CREATE OR REPLACE VIEW geo_points_web AS
    SELECT
      point_index AS index,
      node_id AS id,
      COALESCE(color_hex, '${DEFAULT_POINT_COLOR}') AS hexColor,
      -- TODO: geo_points parquet lacks a color_hex_light column. Once the
      -- pipeline emits a light-palette variant, use it here instead of
      -- reusing the dark color.
      COALESCE(color_hex, '${DEFAULT_POINT_COLOR}') AS hexColorLight,
      x,
      y,
      COALESCE(cluster_id, 0) AS clusterId,
      cluster_label AS clusterLabel,
      1.0 AS clusterProbability,
      '' AS paperId,
      institution AS paperTitle,
      '' AS citekey,
      NULL::VARCHAR AS journal,
      first_year AS year,
      NULL::VARCHAR AS doi,
      NULL::VARCHAR AS pmid,
      NULL::VARCHAR AS pmcid,
      institution AS chunkPreview,
      -- Geo-specific columns
      institution,
      ror_id AS rorId,
      city,
      region,
      country,
      country_code AS countryCode,
      COALESCE(paper_count, 0) AS paperCount,
      COALESCE(author_count, 0) AS authorCount,
      first_year AS firstYear,
      last_year AS lastYear,
      COALESCE(size_value, paper_count, 1) AS sizeValue,
      -- Placeholder columns for crossfilter compatibility
      NULL::VARCHAR AS stableChunkId,
      NULL::INTEGER AS chunkIndex,
      NULL::VARCHAR AS sectionCanonical,
      NULL::INTEGER AS pageNumber,
      NULL::INTEGER AS tokenCount,
      NULL::INTEGER AS charCount,
      NULL::VARCHAR AS chunkKind,
      false AS hasTableContext,
      false AS hasFigureContext,
      NULL::INTEGER AS paperAuthorCount,
      NULL::INTEGER AS paperReferenceCount,
      NULL::INTEGER AS paperAssetCount,
      NULL::INTEGER AS paperChunkCount,
      NULL::DOUBLE AS paperEntityCount,
      NULL::DOUBLE AS paperRelationCount,
      NULL::INTEGER AS paperSentenceCount,
      NULL::INTEGER AS paperPageCount,
      NULL::INTEGER AS paperTableCount,
      NULL::INTEGER AS paperFigureCount
    FROM geo_points`
  )
  availableLayers.push('geo')

  // Geo links — collaboration edges between institutions
  if (bundle.bundleManifest.tables.geo_links) {
    await conn.query(
      `CREATE OR REPLACE VIEW geo_links_web AS
      SELECT
        source_node_id AS sourceId,
        source_point_index AS sourceIndex,
        target_node_id AS targetId,
        target_point_index AS targetIndex,
        paper_count AS paperCount
      FROM geo_links`
    )
  }

  // Geo citation links — citation edges between institutions
  if (bundle.bundleManifest.tables.geo_citation_links) {
    await conn.query(
      `CREATE OR REPLACE VIEW geo_citation_links_web AS
      SELECT
        source_node_id AS sourceId,
        source_point_index AS sourceIndex,
        target_node_id AS targetId,
        target_point_index AS targetIndex,
        citation_count AS citationCount
      FROM geo_citation_links`
    )
  }

  // Author-institution mapping for drill-down
  if (bundle.bundleManifest.tables.graph_author_geo) {
    await conn.query(
      `CREATE OR REPLACE VIEW author_geo_web AS
      SELECT
        paper_author_id AS authorId,
        name,
        surname,
        given_name AS givenName,
        orcid,
        citekey,
        paper_title AS paperTitle,
        year,
        institution,
        department,
        institution_key AS institutionKey
      FROM graph_author_geo`
    )
  }
}
