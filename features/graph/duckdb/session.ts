import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import { NOISE_COLOR, NOISE_COLOR_LIGHT, DEFAULT_POINT_COLOR } from '@/features/graph/lib/brand-colors'
import { getPaletteColors } from '@/features/graph/lib/colors'
import { getColumnMetaForLayer, getColumnsForLayer } from '@/features/graph/lib/columns'
import { getLayerConfig } from '@/features/graph/lib/layers'
import {
  buildGeoNodes,
  buildGeoStats,
  buildGraphData,
  buildGraphNode,
  buildPaperNodes,
  type GeoPointRow,
  type GraphClusterRow,
  type GraphFacetRow,
  type GraphPointRow,
  type PaperPointRow,
} from '@/features/graph/lib/transform'
import type {
  AuthorGeoRow,
  GraphBundleLoadProgress,
  GeoCitationLink,
  GeoLink,
  GraphBundle,
  GraphClusterDetail,
  GraphInfoFacetRow,
  GraphInfoHistogramBin,
  GraphInfoScope,
  GraphInfoSummary,
  GraphSearchResult,
  GraphVisibilityBudget,
  GraphData,
  GraphNode,
  GraphQueryResult,
  GraphTablePageResult,
  GraphSelectionDetail,
  MapLayer,
  PaperDocument,
} from '@/features/graph/types'

import { createConnection, closeConnection } from './connection'
import {
  mapCluster,
  mapExemplar,
  mapPaper,
  mapChunkDetail,
  mapPaperDocument,
  type GraphClusterDetailRow,
  type GraphClusterExemplarRow,
  type GraphPaperDetailRow,
  type GraphChunkDetailRow,
  type PaperDocumentRow,
} from './mappers'
import { escapeSqlString, getAbsoluteUrl, executeReadOnlyQuery, queryRows } from './queries'

const CACHE_MAX_ENTRIES = 200

/** Simple bounded Map that evicts the oldest entry when full. */
function createBoundedCache<K, V>(max = CACHE_MAX_ENTRIES): Map<K, V> {
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

function validateTableName(name: string): string {
  if (!TABLE_NAME_RE.test(name)) {
    throw new Error(`Invalid table name: ${name}`)
  }
  return name
}

function requireBundleTable(bundle: GraphBundle, tableName: string) {
  const table = bundle.bundleManifest.tables[tableName]
  if (!table) {
    throw new Error(`Canonical graph bundle is missing required table "${tableName}"`)
  }
  return table
}

export interface GraphCanvasSource {
  duckDBConnection: {
    connection: AsyncDuckDBConnection
    duckdb: import('@duckdb/duckdb-wasm').AsyncDuckDB
  }
  pointsTableName: string
  pointCounts: Record<MapLayer, number>
}

interface GraphBundleSession {
  availableLayers: MapLayer[]
  canvas: GraphCanvasSource
  getData: () => Promise<GraphData>
  getClusterDetail: (clusterId: number) => Promise<GraphClusterDetail>
  getInstitutionAuthors: (institutionKey: string) => Promise<AuthorGeoRow[]>
  getAuthorInstitutions: (name: string, orcid: string | null) => Promise<AuthorGeoRow[]>
  getPaperDocument: (paperId: string) => Promise<PaperDocument | null>
  resolvePointSelection: (
    layer: MapLayer,
    selector: { id?: string; index?: number }
  ) => Promise<GraphNode | null>
  getTablePage: (args: {
    layer: MapLayer
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<GraphTablePageResult>
  getInfoSummary: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<GraphInfoSummary>
  getInfoBars: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<Array<{ value: string; count: number }>>
  getInfoHistogram: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    bins?: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<{ bins: GraphInfoHistogramBin[]; totalCount: number }>
  getFacetSummary: (args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems?: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }) => Promise<GraphInfoFacetRow[]>
  searchPoints: (args: {
    layer: MapLayer
    column: string
    query: string
    limit?: number
  }) => Promise<GraphSearchResult[]>
  getVisibilityBudget: (args: {
    layer: MapLayer
    selector: { id?: string; index?: number }
    scopeSql?: string | null
  }) => Promise<GraphVisibilityBudget | null>
  getPointIndicesForScope: (args: {
    layer: MapLayer
    scopeSql: string
  }) => Promise<number[]>
  getSelectionDetail: (node: GraphNode) => Promise<GraphSelectionDetail>
  runReadOnlyQuery: (sql: string) => Promise<GraphQueryResult>
}

const DEFAULT_CLUSTER_COLORS = getPaletteColors('default', 'dark')
const DEFAULT_CLUSTER_COLORS_LIGHT = getPaletteColors('default', 'light')
const sessionCache = new Map<string, Promise<GraphBundleSession>>()
const progressCache = new Map<string, GraphBundleLoadProgress>()
const progressListeners = new Map<
  string,
  Set<(progress: GraphBundleLoadProgress) => void>
>()
const POINT_LOAD_CHUNK_SIZE = 100_000

function emitProgress(bundleChecksum: string, progress: GraphBundleLoadProgress) {
  progressCache.set(bundleChecksum, progress)
  const listeners = progressListeners.get(bundleChecksum)
  if (!listeners) return
  for (const listener of listeners) {
    listener(progress)
  }
}

export function subscribeToGraphBundleProgress(
  bundleChecksum: string,
  listener: (progress: GraphBundleLoadProgress) => void
) {
  let listeners = progressListeners.get(bundleChecksum)
  if (!listeners) {
    listeners = new Set()
    progressListeners.set(bundleChecksum, listeners)
  }
  listeners.add(listener)

  const latest = progressCache.get(bundleChecksum)
  if (latest) {
    listener(latest)
  }

  return () => {
    listeners?.delete(listener)
    if (listeners && listeners.size === 0) {
      progressListeners.delete(bundleChecksum)
    }
  }
}

async function resolveBundleRelations(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle
): Promise<void> {
  const probeTable = Object.keys(bundle.bundleManifest.tables)[0]

  if (!probeTable) {
    throw new Error('Graph bundle manifest does not declare any tables')
  }

  if (bundle.duckdbUrl) {
    const absoluteDuckdbUrl = getAbsoluteUrl(bundle.duckdbUrl)
    try {
      await conn.query(`ATTACH '${escapeSqlString(absoluteDuckdbUrl)}' AS graph_bundle`)
      await conn.query(`SELECT 1 FROM graph_bundle.${validateTableName(probeTable)} LIMIT 1`)

      for (const tableName of Object.keys(bundle.bundleManifest.tables)) {
        const safe = validateTableName(tableName)
        await conn.query(
          `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM graph_bundle.${safe}`
        )
      }
      return
    } catch {
      // Fall back to direct parquet table registration below.
    }
  }

  for (const [tableName, tableUrl] of Object.entries(bundle.tableUrls)) {
    const safe = validateTableName(tableName)
    const absoluteTableUrl = getAbsoluteUrl(tableUrl)
    await conn.query(
      `CREATE OR REPLACE VIEW ${safe} AS SELECT * FROM read_parquet('${escapeSqlString(
        absoluteTableUrl
      )}')`
    )
  }
}

/* ─── Reusable SQL query helpers ────────────────────────────────── */

async function queryClusterRows(
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

async function queryExemplarRows(
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

async function queryPaperDocument(
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

async function queryPaperDetail(
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
    FROM graph_papers
    WHERE paper_id = ?
    LIMIT 1`,
    [paperId]
  )
}

async function loadPointRowsInChunks(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  onProgress: (progress: GraphBundleLoadProgress) => void
): Promise<GraphPointRow[]> {
  const tableManifest = requireBundleTable(bundle, 'corpus_points')
  const totalRows =
    tableManifest?.rowCount ??
    (
      await queryRows<{ count: number }>(
        conn,
        `SELECT count(*)::INTEGER AS count FROM graph_points_web`
      )
    )[0]?.count ??
    0

  if (totalRows === 0) {
    onProgress({
      stage: 'points',
      message: 'No graph points found in the bundle.',
      percent: 88,
      loadedRows: 0,
      totalRows: 0,
    })
    return []
  }

  const rows: GraphPointRow[] = []

  for (let start = 0; start < totalRows; start += POINT_LOAD_CHUNK_SIZE) {
    const end = Math.min(start + POINT_LOAD_CHUNK_SIZE, totalRows)
    const chunk = await queryRows<GraphPointRow>(
      conn,
      `SELECT
        index AS point_index,
        id,
        id AS node_id,
        nodeKind AS node_kind,
        nodeRole AS node_role,
        paperId AS paper_id,
        x,
        y,
        clusterId AS cluster_id,
        clusterLabel AS cluster_label,
        clusterProbability AS cluster_probability,
        citekey,
        paperTitle AS title,
        journal,
        year,
        doi,
        pmid,
        pmcid,
        NULL::VARCHAR AS stable_chunk_id,
        NULL::INTEGER AS chunk_index,
        NULL::VARCHAR AS section_canonical,
        NULL::INTEGER AS page_number,
        NULL::INTEGER AS token_count,
        NULL::INTEGER AS char_count,
        NULL::VARCHAR AS chunk_kind,
        NULL::VARCHAR AS chunk_preview,
        displayLabel AS display_label,
        searchText AS search_text,
        NULL::VARCHAR AS canonical_name,
        NULL::VARCHAR AS category,
        NULL::VARCHAR AS definition,
        NULL::VARCHAR AS semantic_types_csv,
        semanticGroups AS semantic_groups_csv,
        organSystems AS organ_systems_csv,
        topEntities AS top_entities_csv,
        relationCategories AS relation_categories_csv,
        NULL::REAL AS mention_count,
        NULL::REAL AS paper_count,
        NULL::REAL AS chunk_count,
        paperRelationCount AS relation_count,
        NULL::REAL AS alias_count,
        NULL::VARCHAR AS relation_type,
        NULL::VARCHAR AS relation_category,
        NULL::VARCHAR AS relation_direction,
        NULL::VARCHAR AS relation_certainty,
        NULL::VARCHAR AS assertion_status,
        NULL::VARCHAR AS evidence_status,
        NULL::VARCHAR AS alias_text,
        NULL::VARCHAR AS alias_type,
        NULL::REAL AS alias_quality_score,
        NULL::VARCHAR AS alias_source,
        isDefaultVisible AS is_default_visible,
        NULL::VARCHAR AS payload_json,
        textAvailability AS text_availability,
        isOpenAccess AS is_open_access,
        hasOpenAccessPdf AS has_open_access_pdf,
        paperAuthorCount AS paper_author_count,
        paperReferenceCount AS paper_reference_count,
        paperAssetCount AS paper_asset_count,
        NULL::INTEGER AS paper_chunk_count,
        paperEntityCount AS paper_entity_count,
        paperRelationCount AS paper_relation_count,
        NULL::INTEGER AS paper_sentence_count,
        NULL::INTEGER AS paper_page_count,
        NULL::INTEGER AS paper_table_count,
        NULL::INTEGER AS paper_figure_count,
        paperClusterIndex AS paper_cluster_index,
        false AS has_table_context,
        false AS has_figure_context
      FROM graph_points_web
      WHERE index >= ? AND index < ?
      ORDER BY index`,
      [start, end]
    )
    rows.push(...chunk)
    onProgress({
      stage: 'points',
      message: `Loading point geometry and filter metadata (${end.toLocaleString()} / ${totalRows.toLocaleString()})`,
      percent: 18 + Math.round((end / totalRows) * 68),
      loadedRows: end,
      totalRows,
    })
  }

  return rows
}

async function queryGraphPointSelection(
  conn: AsyncDuckDBConnection,
  selector: { id?: string; index?: number }
): Promise<GraphNode | null> {
  const { id, index } = selector
  if (id == null && index == null) {
    return null
  }

  const rows = await queryRows<GraphPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      nodeKind AS node_kind,
      nodeRole AS node_role,
      paperId AS paper_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      clusterProbability AS cluster_probability,
      citekey,
      paperTitle AS title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      NULL::VARCHAR AS stable_chunk_id,
      NULL::INTEGER AS chunk_index,
      NULL::VARCHAR AS section_canonical,
      NULL::INTEGER AS page_number,
      NULL::INTEGER AS token_count,
      NULL::INTEGER AS char_count,
      NULL::VARCHAR AS chunk_kind,
      NULL::VARCHAR AS chunk_preview,
      displayLabel AS display_label,
      searchText AS search_text,
      NULL::VARCHAR AS canonical_name,
      NULL::VARCHAR AS category,
      NULL::VARCHAR AS definition,
      NULL::VARCHAR AS semantic_types_csv,
      semanticGroups AS semantic_groups_csv,
      organSystems AS organ_systems_csv,
      topEntities AS top_entities_csv,
      relationCategories AS relation_categories_csv,
      NULL::REAL AS mention_count,
      NULL::REAL AS paper_count,
      NULL::REAL AS chunk_count,
      paperRelationCount AS relation_count,
      NULL::REAL AS alias_count,
      NULL::VARCHAR AS relation_type,
      NULL::VARCHAR AS relation_category,
      NULL::VARCHAR AS relation_direction,
      NULL::VARCHAR AS relation_certainty,
      NULL::VARCHAR AS assertion_status,
      NULL::VARCHAR AS evidence_status,
      NULL::VARCHAR AS alias_text,
      NULL::VARCHAR AS alias_type,
      NULL::REAL AS alias_quality_score,
      NULL::VARCHAR AS alias_source,
      isDefaultVisible AS is_default_visible,
      NULL::VARCHAR AS payload_json,
      textAvailability AS text_availability,
      isOpenAccess AS is_open_access,
      hasOpenAccessPdf AS has_open_access_pdf,
      paperAuthorCount AS paper_author_count,
      paperReferenceCount AS paper_reference_count,
      paperAssetCount AS paper_asset_count,
      NULL::INTEGER AS paper_chunk_count,
      paperEntityCount AS paper_entity_count,
      paperRelationCount AS paper_relation_count,
      NULL::INTEGER AS paper_sentence_count,
      NULL::INTEGER AS paper_page_count,
      NULL::INTEGER AS paper_table_count,
      NULL::INTEGER AS paper_figure_count,
      paperClusterIndex AS paper_cluster_index,
      false AS has_table_context,
      false AS has_figure_context
    FROM graph_points_web
    WHERE ${id != null ? 'id = ?' : 'index = ?'}
    LIMIT 1`,
    [id ?? index ?? null]
  )

  return rows[0] ? buildGraphNode(rows[0]) : null
}

async function queryPaperPointSelection(
  conn: AsyncDuckDBConnection,
  selector: { id?: string; index?: number }
): Promise<GraphNode | null> {
  const { id, index } = selector
  if (id == null && index == null) {
    return null
  }

  const rows = await queryRows<PaperPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      paperId AS paper_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      clusterProbability AS cluster_probability,
      citekey,
      paperTitle AS title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      chunkPreview AS chunk_preview,
      displayPreview AS display_preview,
      payloadWasTruncated AS payload_was_truncated,
      paperAuthorCount AS paper_author_count,
      paperReferenceCount AS paper_reference_count,
      paperAssetCount AS paper_asset_count,
      paperChunkCount AS paper_chunk_count,
      paperEntityCount AS paper_entity_count,
      paperRelationCount AS paper_relation_count,
      paperSentenceCount AS paper_sentence_count,
      paperPageCount AS paper_page_count,
      paperTableCount AS paper_table_count,
      paperFigureCount AS paper_figure_count,
      0::INTEGER AS paper_cluster_index
    FROM paper_points_web
    WHERE ${id != null ? 'id = ?' : 'index = ?'}
    LIMIT 1`,
    [id ?? index ?? null]
  )

  return rows[0] ? buildPaperNodes(rows)[0] ?? null : null
}

async function queryGeoPointSelection(
  conn: AsyncDuckDBConnection,
  selector: { id?: string; index?: number }
): Promise<GraphNode | null> {
  const { id, index } = selector
  if (id == null && index == null) {
    return null
  }

  const rows = await queryRows<GeoPointRow>(
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
    WHERE ${id != null ? 'id = ?' : 'index = ?'}
    LIMIT 1`,
    [id ?? index ?? null]
  )

  return rows[0] ? buildGeoNodes(rows)[0] ?? null : null
}

function sliceScopeIndices(args: {
  view: 'current' | 'selected'
  page: number
  pageSize: number
  currentPointIndices: number[] | null
  selectedPointIndices: number[]
}) {
  const { view, page, pageSize, currentPointIndices, selectedPointIndices } = args
  const sourceIndices =
    view === 'selected'
      ? selectedPointIndices
      : currentPointIndices

  if (sourceIndices == null) {
    return {
      totalRows: null as number | null,
      pageIndices: null as number[] | null,
    }
  }

  const totalRows = sourceIndices.length
  const start = Math.max(0, (Math.max(page, 1) - 1) * Math.max(pageSize, 1))
  const end = Math.min(totalRows, start + Math.max(pageSize, 1))

  return {
    totalRows,
    pageIndices: sourceIndices.slice(start, end),
  }
}

function buildIndexWhereClause(indices: number[]): string {
  if (indices.length === 0) {
    return '1 = 0'
  }

  return `index IN (${indices.map((value) => Number(value) || 0).join(', ')})`
}

function buildCurrentViewPredicate(args: {
  currentPointIndices: number[] | null
  currentPointScopeSql: string | null
}): string {
  const { currentPointIndices, currentPointScopeSql } = args
  if (currentPointScopeSql && currentPointScopeSql.trim().length > 0) {
    return currentPointScopeSql
  }

  if (currentPointIndices !== null) {
    return buildIndexWhereClause(currentPointIndices)
  }

  return 'TRUE'
}

function getLayerTableName(layer: MapLayer): string {
  if (layer === 'paper') {
    return 'paper_points_web'
  }
  if (layer === 'geo') {
    return 'geo_points_web'
  }
  return 'graph_points_web'
}

function resolveInfoColumn(layer: MapLayer, column: string): string {
  if (!getColumnsForLayer(layer).some((meta) => meta.key === column)) {
    throw new Error(`Unsupported info column "${column}" for ${layer} layer`)
  }

  const safe = validateTableName(column)
  return safe
}

function resolveSearchColumn(layer: MapLayer, column: string): string {
  if (!(column in getLayerConfig(layer).searchableFields)) {
    throw new Error(`Unsupported search column "${column}" for ${layer} layer`)
  }

  return validateTableName(column)
}

function getSearchLabelExpression(layer: MapLayer): string {
  if (layer === 'paper') {
    return "COALESCE(NULLIF(paperTitle, ''), NULLIF(citekey, ''), NULLIF(clusterLabel, ''), id)"
  }
  if (layer === 'geo') {
    return "COALESCE(NULLIF(institution, ''), NULLIF(country, ''), NULLIF(city, ''), id)"
  }
  return "COALESCE(NULLIF(clusterLabel, ''), NULLIF(paperTitle, ''), NULLIF(citekey, ''), id)"
}

async function queryPointSearch(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    column: string
    query: string
    limit?: number
  }
): Promise<GraphSearchResult[]> {
  const term = args.query.trim()
  if (term.length < 2) {
    return []
  }

  const tableName = getLayerTableName(args.layer)
  const column = resolveSearchColumn(args.layer, args.column)
  const normalized = term.toLowerCase()
  const limit = Math.max(1, Math.min(args.limit ?? 12, 25))
  const labelExpr = getSearchLabelExpression(args.layer)

  const rows = await queryRows<{
    id: string
    index: number
    label: string | null
    matched_value: string | null
    subtitle: string | null
  }>(
    conn,
    `SELECT
       id,
       index,
       ${labelExpr} AS label,
       CAST(${column} AS VARCHAR) AS matched_value,
       concat_ws(
         ' · ',
         NULLIF(citekey, ''),
         NULLIF(paperTitle, ''),
         NULLIF(clusterLabel, ''),
         NULLIF(journal, ''),
         CASE
           WHEN year IS NULL THEN NULL
           ELSE CAST(year AS VARCHAR)
         END
       ) AS subtitle
     FROM ${tableName}
     WHERE ${column} IS NOT NULL
       AND LOWER(CAST(${column} AS VARCHAR)) LIKE ?
     ORDER BY
       CASE
         WHEN LOWER(CAST(${column} AS VARCHAR)) = ? THEN 0
         WHEN LOWER(CAST(${column} AS VARCHAR)) LIKE ? THEN 1
         ELSE 2
       END,
       length(CAST(${column} AS VARCHAR)) ASC,
       index ASC
     LIMIT ?`,
    [`%${normalized}%`, normalized, `${normalized}%`, limit]
  )

  return rows.map((row) => ({
    id: row.id,
    index: row.index,
    label: row.label ?? row.matched_value ?? row.id,
    matchedValue: row.matched_value,
    subtitle: row.subtitle,
  }))
}

async function queryVisibilityBudget(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    selector: { id?: string; index?: number }
    scopeSql?: string | null
  }
): Promise<GraphVisibilityBudget | null> {
  const { layer, selector, scopeSql } = args
  const { id, index } = selector
  if (id == null && index == null) {
    return null
  }

  const tableName = getLayerTableName(layer)
  const whereClause = id != null ? 'id = ?' : 'index = ?'
  const normalizedScopeSql =
    typeof scopeSql === 'string' && scopeSql.trim().length > 0
      ? scopeSql.trim()
      : null

  const rows = await queryRows<{
    seed_index: number
    cluster_id: number | null
    include_cluster: boolean
    x_min: number | null
    x_max: number | null
    y_min: number | null
    y_max: number | null
  }>(
    conn,
    `WITH seed AS (
       SELECT
         index AS seed_index,
         x AS seed_x,
         y AS seed_y,
         CASE
           WHEN COALESCE(clusterId, 0) > 0 THEN clusterId
           ELSE NULL
         END AS cluster_id
       FROM ${tableName}
       WHERE ${whereClause}
       LIMIT 1
     ),
     scoped AS (
       SELECT *
       FROM ${tableName}
       ${normalizedScopeSql == null ? '' : `WHERE ${normalizedScopeSql}`}
     ),
     scope_extents AS (
       SELECT
         max(x) - min(x) AS scope_width,
         max(y) - min(y) AS scope_height
       FROM scoped
     ),
     cluster_scope AS (
       SELECT
         count(*)::INTEGER AS cluster_count,
         max(x) - min(x) AS cluster_width,
         max(y) - min(y) AS cluster_height
       FROM scoped, seed
       WHERE seed.cluster_id IS NOT NULL
         AND scoped.clusterId = seed.cluster_id
     )
     SELECT
       seed.seed_index,
       CASE
         WHEN seed.cluster_id IS NOT NULL
           AND COALESCE(cluster_scope.cluster_count, 0) > 0 THEN seed.cluster_id
         ELSE NULL
       END AS cluster_id
       ,
       CASE
         WHEN seed.cluster_id IS NOT NULL
           AND COALESCE(cluster_scope.cluster_count, 0) BETWEEN 1 AND 4000 THEN TRUE
         ELSE FALSE
       END AS include_cluster,
       CASE
         WHEN seed.seed_x IS NULL THEN NULL
         ELSE seed.seed_x - LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_width
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_width * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_width * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_width * 0.08, 0.02), 0.02)
         )
       END AS x_min,
       CASE
         WHEN seed.seed_x IS NULL THEN NULL
         ELSE seed.seed_x + LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_width
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_width * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_width * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_width * 0.08, 0.02), 0.02)
         )
       END AS x_max,
       CASE
         WHEN seed.seed_y IS NULL THEN NULL
         ELSE seed.seed_y - LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_height
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_height * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_height * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_height * 0.08, 0.02), 0.02)
         )
       END AS y_min,
       CASE
         WHEN seed.seed_y IS NULL THEN NULL
         ELSE seed.seed_y + LEAST(
           GREATEST(
             COALESCE(
               cluster_scope.cluster_height
                 * CASE
                     WHEN COALESCE(cluster_scope.cluster_count, 0) > 4000 THEN 0.12
                     ELSE 0.18
                   END,
               scope_extents.scope_height * 0.02,
               0.001
             ),
             COALESCE(scope_extents.scope_height * 0.01, 0.001),
             0.001
           ),
           GREATEST(COALESCE(scope_extents.scope_height * 0.08, 0.02), 0.02)
         )
       END AS y_max
     FROM seed
     LEFT JOIN scope_extents ON TRUE
     LEFT JOIN cluster_scope ON TRUE`,
    [id ?? index ?? null]
  )

  const row = rows[0]
  if (!row) {
    return null
  }

  return {
    seedIndex: row.seed_index,
    clusterId: row.cluster_id,
    includeCluster: row.include_cluster,
    xMin: row.x_min,
    xMax: row.x_max,
    yMin: row.y_min,
    yMax: row.y_max,
  }
}

async function queryPointIndicesForScope(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scopeSql: string
  }
): Promise<number[]> {
  const normalizedScopeSql = args.scopeSql.trim()
  if (normalizedScopeSql.length === 0) {
    return []
  }

  const tableName = getLayerTableName(args.layer)
  const rows = await queryRows<{ index: number }>(
    conn,
    `SELECT index
     FROM ${tableName}
     WHERE ${normalizedScopeSql}
     ORDER BY index`
  )

  return rows
    .map((row) => row.index)
    .filter((index): index is number => Number.isFinite(index))
}

function buildScopedLayerPredicate(
  layer: MapLayer,
  scope: GraphInfoScope,
  currentPointIndices: number[] | null,
  currentPointScopeSql: string | null,
  selectedPointIndices: number[]
): string {
  void layer
  if (scope === 'selected') {
    return buildIndexWhereClause(selectedPointIndices)
  }

  if (scope === 'current') {
    if (currentPointScopeSql && currentPointScopeSql.trim().length > 0) {
      return currentPointScopeSql
    }

    if (currentPointIndices !== null) {
      return buildIndexWhereClause(currentPointIndices)
    }
  }

  return 'TRUE'
}

async function queryInfoSummary(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
): Promise<GraphInfoSummary> {
  const { layer, scope, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )
  const rows = await queryRows<{
    total_count: number
    scoped_count: number
    paper_count: number
    cluster_count: number
    noise_count: number
    year_min: number | null
    year_max: number | null
  }>(
    conn,
    `WITH scoped AS (
       SELECT * FROM ${tableName} WHERE ${scopedPredicate}
     ),
     totals AS (
       SELECT
         count(*)::INTEGER AS total_count
       FROM ${tableName}
     )
     SELECT
       totals.total_count,
       count(*)::INTEGER AS scoped_count,
       count(DISTINCT CASE WHEN paperId IS NOT NULL AND paperId <> '' THEN paperId END)::INTEGER AS paper_count,
       count(DISTINCT CASE WHEN COALESCE(clusterId, 0) > 0 THEN clusterId END)::INTEGER AS cluster_count,
       count(*) FILTER (WHERE COALESCE(clusterId, 0) <= 0)::INTEGER AS noise_count,
       min(year)::INTEGER AS year_min,
       max(year)::INTEGER AS year_max
     FROM scoped, totals
     GROUP BY totals.total_count`
  )
  const summaryRow = rows[0] ?? {
    total_count: 0,
    scoped_count: 0,
    paper_count: 0,
    cluster_count: 0,
    noise_count: 0,
    year_min: null,
    year_max: null,
  }

  const clusterRows = await queryRows<{
    cluster_id: number
    label: string | null
    count: number
  }>(
    conn,
    `SELECT
       COALESCE(clusterId, 0)::INTEGER AS cluster_id,
       COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR)) AS label,
       count(*)::INTEGER AS count
     FROM ${tableName}
     WHERE ${scopedPredicate}
       AND COALESCE(clusterId, 0) > 0
     GROUP BY COALESCE(clusterId, 0), COALESCE(NULLIF(clusterLabel, ''), 'Cluster ' || CAST(COALESCE(clusterId, 0) AS VARCHAR))
     ORDER BY count DESC, cluster_id
     LIMIT 8`
  )

  return {
    totalCount: summaryRow.total_count,
    scopedCount: summaryRow.scoped_count,
    scope,
    isSubset: scope !== 'dataset' && summaryRow.scoped_count < summaryRow.total_count,
    hasSelection: scope === 'selected',
    papers: summaryRow.paper_count,
    clusters: summaryRow.cluster_count,
    noise: summaryRow.noise_count,
    yearRange:
      summaryRow.year_min != null && summaryRow.year_max != null
        ? { min: summaryRow.year_min, max: summaryRow.year_max }
        : null,
    topClusters: clusterRows.map((row) => ({
      clusterId: row.cluster_id,
      label: row.label ?? `Cluster ${row.cluster_id}`,
      count: row.count,
    })),
  }
}

async function queryInfoBars(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
): Promise<Array<{ value: string; count: number }>> {
  const { layer, scope, column, maxItems, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const safeColumn = resolveInfoColumn(layer, column)
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )

  const rows = await queryRows<{ value: string | null; count: number }>(
    conn,
    `SELECT
       CAST(${safeColumn} AS VARCHAR) AS value,
       count(*)::INTEGER AS count
     FROM ${tableName}
     WHERE ${scopedPredicate}
       AND ${safeColumn} IS NOT NULL
       AND CAST(${safeColumn} AS VARCHAR) <> ''
     GROUP BY CAST(${safeColumn} AS VARCHAR)
     ORDER BY count DESC, value
     LIMIT ${Math.max(1, maxItems)}`
  )

  return rows
    .filter((row): row is { value: string; count: number } => Boolean(row.value))
    .map((row) => ({ value: row.value, count: row.count }))
}

async function queryInfoHistogram(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    bins: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
): Promise<{ bins: GraphInfoHistogramBin[]; totalCount: number }> {
  const { layer, scope, column, bins, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const safeColumn = resolveInfoColumn(layer, column)
  const columnMeta = getColumnMetaForLayer(column, layer)
  if (columnMeta?.type !== 'numeric') {
    return { bins: [], totalCount: 0 }
  }
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )
  const safeBins = Math.max(1, Math.min(64, bins))

  const rows = await queryRows<{
    bin_min: number
    bin_max: number
    count: number
  }>(
    conn,
    `WITH scoped AS (
       SELECT CAST(${safeColumn} AS DOUBLE) AS value
       FROM ${tableName}
       WHERE ${scopedPredicate}
         AND ${safeColumn} IS NOT NULL
     ),
     stats AS (
       SELECT min(value) AS min_value, max(value) AS max_value, count(*)::INTEGER AS total_count
       FROM scoped
     ),
     binned AS (
       SELECT
         CASE
           WHEN stats.min_value = stats.max_value THEN stats.min_value
           ELSE stats.min_value + ((stats.max_value - stats.min_value) / ${safeBins}) *
             LEAST(FLOOR((value - stats.min_value) / ((stats.max_value - stats.min_value) / ${safeBins})), ${safeBins - 1})
         END AS bin_min,
         CASE
           WHEN stats.min_value = stats.max_value THEN stats.max_value
           ELSE stats.min_value + ((stats.max_value - stats.min_value) / ${safeBins}) *
             (LEAST(FLOOR((value - stats.min_value) / ((stats.max_value - stats.min_value) / ${safeBins})), ${safeBins - 1}) + 1)
         END AS bin_max
       FROM scoped, stats
       WHERE stats.total_count > 0
     )
     SELECT
       bin_min,
       bin_max,
       count(*)::INTEGER AS count
     FROM binned
     GROUP BY bin_min, bin_max
     ORDER BY bin_min`
  )

  const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
  return {
    bins: rows.map((row) => ({
      min: row.bin_min,
      max: row.bin_max,
      count: row.count,
    })),
    totalCount,
  }
}

async function queryFacetSummary(
  conn: AsyncDuckDBConnection,
  args: {
    layer: MapLayer
    scope: GraphInfoScope
    column: string
    maxItems: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
): Promise<GraphInfoFacetRow[]> {
  const { layer, scope, column, maxItems, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const tableName = getLayerTableName(layer)
  const safeColumn = resolveInfoColumn(layer, column)
  const safeMaxItems = Math.max(1, maxItems)
  const scopedPredicate = buildScopedLayerPredicate(
    layer,
    scope,
    currentPointIndices,
    currentPointScopeSql,
    selectedPointIndices
  )

  const allRows = await queryRows<{ value: string | null; count: number }>(
    conn,
    `SELECT
       CAST(${safeColumn} AS VARCHAR) AS value,
       count(*)::INTEGER AS count
     FROM ${tableName}
     WHERE ${safeColumn} IS NOT NULL
       AND CAST(${safeColumn} AS VARCHAR) <> ''
     GROUP BY CAST(${safeColumn} AS VARCHAR)
     ORDER BY count DESC, value
     LIMIT ${safeMaxItems * 4}`
  )

  const scopedRows =
    scope === 'dataset'
      ? allRows
      : await queryRows<{ value: string | null; count: number }>(
          conn,
          `SELECT
             CAST(${safeColumn} AS VARCHAR) AS value,
             count(*)::INTEGER AS count
           FROM ${tableName}
           WHERE ${scopedPredicate}
             AND ${safeColumn} IS NOT NULL
             AND CAST(${safeColumn} AS VARCHAR) <> ''
           GROUP BY CAST(${safeColumn} AS VARCHAR)
           ORDER BY count DESC, value
           LIMIT ${safeMaxItems * 4}`
        )

  const allCounts = new Map<string, number>()
  for (const row of allRows) {
    if (row.value) {
      allCounts.set(row.value, row.count)
    }
  }
  const scopedCounts = new Map<string, number>()
  for (const row of scopedRows) {
    if (row.value) {
      scopedCounts.set(row.value, row.count)
    }
  }

  if (scope === 'dataset') {
    return [...allCounts.entries()]
      .slice(0, safeMaxItems)
      .map(([value, count]) => ({
        value,
        scopedCount: count,
        totalCount: count,
      }))
  }

  const selectedRows: GraphInfoFacetRow[] = [...scopedCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, safeMaxItems)
    .map(([value, scopedCount]) => ({
      value,
      scopedCount,
      totalCount: allCounts.get(value) ?? 0,
    }))

  if (selectedRows.length < safeMaxItems) {
    const selectedValues = new Set(selectedRows.map((row) => row.value))
    for (const [value, totalCount] of [...allCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      if (selectedValues.has(value)) {
        continue
      }
      selectedRows.push({ value, scopedCount: 0, totalCount })
      if (selectedRows.length >= safeMaxItems) {
        break
      }
    }
  }

  return selectedRows
}

async function queryChunkTablePage(
  conn: AsyncDuckDBConnection,
  args: {
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
) {
  const { page, pageSize, view, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const scoped = view === 'selected'
    ? sliceScopeIndices({
        view,
        page,
        pageSize,
        currentPointIndices,
        selectedPointIndices,
      })
    : null
  const currentPredicate = buildCurrentViewPredicate({
    currentPointIndices,
    currentPointScopeSql,
  })
  const totalRows =
    view === 'selected'
      ? (scoped?.totalRows ?? 0)
      : (
          await queryRows<{ count: number }>(
            conn,
            `SELECT count(*)::INTEGER AS count
             FROM graph_points_web
             WHERE ${currentPredicate}`
          )
        )[0]?.count ??
        0

  if (totalRows === 0) {
    return { totalRows: 0, page, pageSize, rows: [] }
  }

  const rows = await queryRows<GraphPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      nodeKind AS node_kind,
      nodeRole AS node_role,
      paperId AS paper_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      clusterProbability AS cluster_probability,
      citekey,
      paperTitle AS title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      NULL::VARCHAR AS stable_chunk_id,
      NULL::INTEGER AS chunk_index,
      NULL::VARCHAR AS section_canonical,
      NULL::INTEGER AS page_number,
      NULL::INTEGER AS token_count,
      NULL::INTEGER AS char_count,
      NULL::VARCHAR AS chunk_kind,
      NULL::VARCHAR AS chunk_preview,
      displayLabel AS display_label,
      searchText AS search_text,
      NULL::VARCHAR AS canonical_name,
      NULL::VARCHAR AS category,
      NULL::VARCHAR AS definition,
      NULL::VARCHAR AS semantic_types_csv,
      semanticGroups AS semantic_groups_csv,
      organSystems AS organ_systems_csv,
      topEntities AS top_entities_csv,
      relationCategories AS relation_categories_csv,
      NULL::REAL AS mention_count,
      NULL::REAL AS paper_count,
      NULL::REAL AS chunk_count,
      paperRelationCount AS relation_count,
      NULL::REAL AS alias_count,
      NULL::VARCHAR AS relation_type,
      NULL::VARCHAR AS relation_category,
      NULL::VARCHAR AS relation_direction,
      NULL::VARCHAR AS relation_certainty,
      NULL::VARCHAR AS assertion_status,
      NULL::VARCHAR AS evidence_status,
      NULL::VARCHAR AS alias_text,
      NULL::VARCHAR AS alias_type,
      NULL::REAL AS alias_quality_score,
      NULL::VARCHAR AS alias_source,
      isDefaultVisible AS is_default_visible,
      NULL::VARCHAR AS payload_json,
      textAvailability AS text_availability,
      isOpenAccess AS is_open_access,
      hasOpenAccessPdf AS has_open_access_pdf,
      paperAuthorCount AS paper_author_count,
      paperReferenceCount AS paper_reference_count,
      paperAssetCount AS paper_asset_count,
      NULL::INTEGER AS paper_chunk_count,
      paperEntityCount AS paper_entity_count,
      paperRelationCount AS paper_relation_count,
      NULL::INTEGER AS paper_sentence_count,
      NULL::INTEGER AS paper_page_count,
      NULL::INTEGER AS paper_table_count,
      NULL::INTEGER AS paper_figure_count,
      paperClusterIndex AS paper_cluster_index,
      false AS has_table_context,
      false AS has_figure_context
    FROM graph_points_web
    WHERE ${
      scoped?.pageIndices
        ? buildIndexWhereClause(scoped.pageIndices)
        : currentPredicate
    }
    ORDER BY index${
      scoped?.pageIndices ? '' : '\n    LIMIT ? OFFSET ?'
    }`,
    scoped?.pageIndices ? [] : [pageSize, (Math.max(page, 1) - 1) * Math.max(pageSize, 1)]
  )

  return {
    totalRows,
    page,
    pageSize,
    rows: rows.map((row) => buildGraphNode(row)),
  }
}

async function queryPaperTablePage(
  conn: AsyncDuckDBConnection,
  args: {
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
) {
  const { page, pageSize, view, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const scoped = view === 'selected'
    ? sliceScopeIndices({
        view,
        page,
        pageSize,
        currentPointIndices,
        selectedPointIndices,
      })
    : null
  const currentPredicate = buildCurrentViewPredicate({
    currentPointIndices,
    currentPointScopeSql,
  })
  const totalRows =
    view === 'selected'
      ? (scoped?.totalRows ?? 0)
      : (
          await queryRows<{ count: number }>(
            conn,
            `SELECT count(*)::INTEGER AS count
             FROM paper_points_web
             WHERE ${currentPredicate}`
          )
        )[0]?.count ??
        0

  if (totalRows === 0) {
    return { totalRows: 0, page, pageSize, rows: [] }
  }

  const rows = await queryRows<PaperPointRow>(
    conn,
    `SELECT
      index AS point_index,
      id,
      id AS node_id,
      paperId AS paper_id,
      x,
      y,
      clusterId AS cluster_id,
      clusterLabel AS cluster_label,
      clusterProbability AS cluster_probability,
      citekey,
      paperTitle AS title,
      journal,
      year,
      doi,
      pmid,
      pmcid,
      chunkPreview AS chunk_preview,
      displayPreview AS display_preview,
      payloadWasTruncated AS payload_was_truncated,
      paperAuthorCount AS paper_author_count,
      paperReferenceCount AS paper_reference_count,
      paperAssetCount AS paper_asset_count,
      paperChunkCount AS paper_chunk_count,
      paperEntityCount AS paper_entity_count,
      paperRelationCount AS paper_relation_count,
      paperSentenceCount AS paper_sentence_count,
      paperPageCount AS paper_page_count,
      paperTableCount AS paper_table_count,
      paperFigureCount AS paper_figure_count,
      0::INTEGER AS paper_cluster_index
    FROM paper_points_web
    WHERE ${
      scoped?.pageIndices
        ? buildIndexWhereClause(scoped.pageIndices)
        : currentPredicate
    }
    ORDER BY index${
      scoped?.pageIndices ? '' : '\n    LIMIT ? OFFSET ?'
    }`,
    scoped?.pageIndices ? [] : [pageSize, (Math.max(page, 1) - 1) * Math.max(pageSize, 1)]
  )

  return {
    totalRows,
    page,
    pageSize,
    rows: buildPaperNodes(rows),
  }
}

async function queryGeoTablePage(
  conn: AsyncDuckDBConnection,
  args: {
    view: 'current' | 'selected'
    page: number
    pageSize: number
    currentPointIndices: number[] | null
    currentPointScopeSql: string | null
    selectedPointIndices: number[]
  }
) {
  const { page, pageSize, view, currentPointIndices, currentPointScopeSql, selectedPointIndices } = args
  const scoped = view === 'selected'
    ? sliceScopeIndices({
        view,
        page,
        pageSize,
        currentPointIndices,
        selectedPointIndices,
      })
    : null
  const currentPredicate = buildCurrentViewPredicate({
    currentPointIndices,
    currentPointScopeSql,
  })
  const totalRows =
    view === 'selected'
      ? (scoped?.totalRows ?? 0)
      : (
          await queryRows<{ count: number }>(
            conn,
            `SELECT count(*)::INTEGER AS count
             FROM geo_points_web
             WHERE ${currentPredicate}`
          )
        )[0]?.count ??
        0

  if (totalRows === 0) {
    return { totalRows: 0, page, pageSize, rows: [] }
  }

  const rows = await queryRows<GeoPointRow>(
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
    WHERE ${
      scoped?.pageIndices
        ? buildIndexWhereClause(scoped.pageIndices)
        : currentPredicate
    }
    ORDER BY index${
      scoped?.pageIndices ? '' : '\n    LIMIT ? OFFSET ?'
    }`,
    scoped?.pageIndices ? [] : [pageSize, (Math.max(page, 1) - 1) * Math.max(pageSize, 1)]
  )

  return {
    totalRows,
    page,
    pageSize,
    rows: buildGeoNodes(rows),
  }
}

async function hydrateGraphData({
  conn,
  bundle,
  facetTable,
  availableLayers,
}: {
  conn: AsyncDuckDBConnection
  bundle: GraphBundle
  facetTable: string | null
  availableLayers: MapLayer[]
}): Promise<GraphData> {
  const clusters = await queryRows<GraphClusterRow>(
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
    ORDER BY cluster_id`
  )
  emitProgress(bundle.bundleChecksum, {
    stage: 'clusters',
    message: `Loaded ${clusters.length.toLocaleString()} clusters.`,
    percent: 14,
  })

  const facets = facetTable
    ? await queryRows<GraphFacetRow>(
        conn,
        `SELECT
          facet_name,
          facet_value,
          facet_label,
          point_count,
          paper_count,
          cluster_count,
          sort_key
        FROM graph_facets
        ORDER BY facet_name, sort_key, facet_value`
      )
    : []
  emitProgress(bundle.bundleChecksum, {
    stage: 'facets',
    message: facetTable
      ? `Loaded ${facets.length.toLocaleString()} filter facets.`
      : 'No facet table present; proceeding to points.',
    percent: 18,
  })

  const points = await loadPointRowsInChunks(conn, bundle, (progress) =>
    emitProgress(bundle.bundleChecksum, progress)
  )
  emitProgress(bundle.bundleChecksum, {
    stage: 'hydrating',
    message: 'Hydrating client-side graph nodes and statistics.',
    percent: 92,
    loadedRows: points.length,
    totalRows: points.length,
  })

  const data = buildGraphData({
    points,
    clusters,
    facets,
  })
  emitProgress(bundle.bundleChecksum, {
    stage: 'hydrating',
    message: 'Preparing paper and cluster views.',
    percent: 96,
    loadedRows: points.length,
    totalRows: points.length,
  })

  if (availableLayers.includes('geo')) {
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

    const geoNodeLookup = new Map(data.geoNodes.map((n) => [n.id, n]))

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
          const src = geoNodeLookup.get(row.sourceId)
          const tgt = geoNodeLookup.get(row.targetId)
          if (!src || !tgt) return null
          return {
            sourceId: row.sourceId,
            targetId: row.targetId,
            sourceIndex: row.sourceIndex,
            targetIndex: row.targetIndex,
            paperCount: row.paperCount ?? 1,
            sourceLng: src.x,
            sourceLat: src.y,
            targetLng: tgt.x,
            targetLat: tgt.y,
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
          const src = geoNodeLookup.get(row.sourceId)
          const tgt = geoNodeLookup.get(row.targetId)
          if (!src || !tgt) return null
          return {
            sourceId: row.sourceId,
            targetId: row.targetId,
            sourceIndex: row.sourceIndex,
            targetIndex: row.targetIndex,
            citationCount: row.citationCount ?? 1,
            sourceLng: src.x,
            sourceLat: src.y,
            targetLng: tgt.x,
            targetLat: tgt.y,
          } satisfies GeoCitationLink
        })
        .filter((link): link is GeoCitationLink => link !== null)
    }
  }

  emitProgress(bundle.bundleChecksum, {
    stage: 'ready',
    message: 'Graph bundle is ready.',
    percent: 100,
  })
  return data
}

async function createGraphBundleSession(bundle: GraphBundle): Promise<GraphBundleSession> {
  const { conn, db, worker } = await createConnection()

  try {
    emitProgress(bundle.bundleChecksum, {
      stage: 'resolving',
      message: 'Opening DuckDB-Wasm and resolving the active graph bundle.',
      percent: 2,
    })
    await resolveBundleRelations(conn, bundle)
    emitProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Registering bundle tables and compatibility views.',
      percent: 10,
    })
    requireBundleTable(bundle, 'corpus_points')
    requireBundleTable(bundle, 'corpus_clusters')
    const pointTable = validateTableName('corpus_points')
    const pointManifest = requireBundleTable(bundle, 'corpus_points')
    const pointColumns = new Set((pointManifest?.columns ?? []).map((column) => column.toLowerCase()))
    const clusterTable = validateTableName('corpus_clusters')
    const facetTable =
      bundle.bundleManifest.tables.corpus_facets
        ? validateTableName('corpus_facets')
        : null
    const exemplarTable =
      bundle.bundleManifest.tables.corpus_cluster_exemplars
        ? validateTableName('corpus_cluster_exemplars')
        : null
    const documentTable =
      bundle.bundleManifest.tables.corpus_documents
        ? validateTableName('corpus_documents')
        : null
    const corpusLinksTable =
      bundle.bundleManifest.tables.corpus_links
        ? validateTableName('corpus_links')
        : null
    const colorCase = DEFAULT_CLUSTER_COLORS.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    const colorCaseLight = DEFAULT_CLUSTER_COLORS_LIGHT.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    const pointExpr = (column: string, fallback: string) =>
      pointColumns.has(column.toLowerCase()) ? column : fallback
    const defaultHexColorExpr = `CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS.length})
             ${colorCase}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END`
    const defaultHexColorLightExpr = `CASE
               WHEN COALESCE(cluster_id, 0) = 0 THEN '${NOISE_COLOR_LIGHT}'
               ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS_LIGHT.length})
             ${colorCaseLight}
                 ELSE '${DEFAULT_POINT_COLOR}'
               END
             END`
    await conn.query(
      `CREATE OR REPLACE VIEW graph_points_web AS
       SELECT
         point_index AS index,
         id,
         id AS node_id,
         node_kind AS nodeKind,
         node_role AS nodeRole,
         ${pointExpr('hex_color', defaultHexColorExpr)} AS hexColor,
         ${pointExpr('hex_color_light', defaultHexColorLightExpr)} AS hexColorLight,
         ${pointExpr('hex_color', defaultHexColorExpr)} AS hex_color,
         ${pointExpr('hex_color_light', defaultHexColorLightExpr)} AS hex_color_light,
         x,
         y,
         COALESCE(cluster_id, 0) AS clusterId,
         cluster_label AS clusterLabel,
         COALESCE(cluster_probability, 0) AS clusterProbability,
         paper_id AS paperId,
         title AS paperTitle,
         citekey,
         journal,
         year,
         doi,
         CAST(pmid AS VARCHAR) AS pmid,
         pmcid,
         NULL::VARCHAR AS stableChunkId,
         NULL::INTEGER AS chunkIndex,
         NULL::VARCHAR AS sectionCanonical,
         NULL::VARCHAR AS sectionType,
         NULL::INTEGER AS pageNumber,
         NULL::INTEGER AS tokenCount,
         NULL::INTEGER AS charCount,
         NULL::VARCHAR AS chunkKind,
         NULL::VARCHAR AS chunkPreview,
         display_label AS displayLabel,
         search_text AS searchText,
         NULL::VARCHAR AS canonicalName,
         NULL::VARCHAR AS category,
         NULL::VARCHAR AS definition,
         NULL::VARCHAR AS semanticTypes,
         semantic_groups_csv AS semanticGroups,
         organ_systems_csv AS organSystems,
         ${pointExpr('top_entities_csv', 'NULL::VARCHAR')} AS topEntities,
         ${pointExpr('relation_categories_csv', 'NULL::VARCHAR')} AS relationCategories,
         NULL::VARCHAR AS aliasesCsv,
         NULL::DOUBLE AS mentionCount,
         NULL::DOUBLE AS paperCount,
         NULL::DOUBLE AS chunkCount,
         CAST(${pointExpr('relation_count', 'paper_relation_count')} AS DOUBLE) AS relationCount,
         NULL::DOUBLE AS aliasCount,
         NULL::VARCHAR AS relationType,
         NULL::VARCHAR AS relationCategory,
         NULL::VARCHAR AS relationDirection,
         NULL::VARCHAR AS relationCertainty,
         NULL::VARCHAR AS assertionStatus,
         NULL::VARCHAR AS evidenceStatus,
         NULL::VARCHAR AS aliasText,
         NULL::VARCHAR AS aliasType,
         NULL::DOUBLE AS aliasQualityScore,
         NULL::VARCHAR AS aliasSource,
         is_default_visible AS isDefaultVisible,
         NULL::VARCHAR AS payloadJson,
         title AS displayPreview,
         false AS payloadWasTruncated,
         ${pointExpr("text_availability", "json_extract_string(payload_json, '$.text_availability')")} AS textAvailability,
         COALESCE(${pointExpr("is_open_access", "TRY_CAST(json_extract(payload_json, '$.is_open_access') AS BOOLEAN)")}, false) AS isOpenAccess,
         COALESCE(${pointExpr("has_open_access_pdf", "(json_extract_string(payload_json, '$.open_access_pdf_url') IS NOT NULL AND json_extract_string(payload_json, '$.open_access_pdf_url') <> '')")}, false) AS hasOpenAccessPdf,
         paper_author_count AS paperAuthorCount,
         paper_reference_count AS paperReferenceCount,
         paper_asset_count AS paperAssetCount,
         0::INTEGER AS paperChunkCount,
         CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
         CAST(paper_relation_count AS DOUBLE) AS paperRelationCount,
         NULL::INTEGER AS paperSentenceCount,
         NULL::INTEGER AS paperPageCount,
         NULL::INTEGER AS paperTableCount,
         NULL::INTEGER AS paperFigureCount,
         COALESCE(paper_cluster_index, 0) AS paperClusterIndex,
         false AS hasTableContext,
         false AS hasFigureContext
       FROM ${pointTable}`
    )

    await conn.query(
      `CREATE OR REPLACE VIEW corpus_links_web AS
       ${
         corpusLinksTable
           ? `SELECT
                l.source_node_id,
                l.source_point_index,
                l.target_node_id,
                l.target_point_index,
                l.link_kind,
                l.weight,
                l.is_directed,
                l.is_default_visible,
                l.certainty,
                l.relation_id,
                l.paper_id
              FROM ${corpusLinksTable} l`
           : `SELECT
                NULL::VARCHAR AS source_node_id,
                NULL::INTEGER AS source_point_index,
                NULL::VARCHAR AS target_node_id,
                NULL::INTEGER AS target_point_index,
                NULL::VARCHAR AS link_kind,
                NULL::DOUBLE AS weight,
                false AS is_directed,
                false AS is_default_visible,
                NULL::VARCHAR AS certainty,
                NULL::VARCHAR AS relation_id,
                NULL::VARCHAR AS paper_id
              WHERE false`
       }`
    )

    await conn.query(
      `CREATE OR REPLACE VIEW paper_points_web AS
       SELECT
         *,
         index AS paperIndex
       FROM graph_points_web
       WHERE nodeKind = 'paper'`
    )

    // Paper links reuse the exported dense point indices from the corpus link
    // artifact, keeping the browser session on Cosmograph's native indexed path.
    await conn.query(
      bundle.bundleManifest.tables.corpus_links
        ? `CREATE OR REPLACE VIEW paper_links AS
           SELECT
             l.source_node_id,
             l.source_point_index,
             l.target_node_id,
             l.target_point_index
           FROM ${corpusLinksTable} l
           WHERE l.link_kind = 'citation'`
        : bundle.bundleManifest.tables.paper_links
          ? `CREATE OR REPLACE VIEW paper_links AS
             SELECT
               source_node_id,
               source_point_index,
               target_node_id,
               target_point_index
             FROM paper_links`
        : `CREATE OR REPLACE VIEW paper_links AS
           SELECT
             NULL::VARCHAR AS source_node_id,
             NULL::INTEGER AS source_point_index,
             NULL::VARCHAR AS target_node_id,
             NULL::INTEGER AS target_point_index
           WHERE false`
    )

    await conn.query(
      `CREATE OR REPLACE VIEW graph_clusters AS
       SELECT
         cluster_id,
         label,
         label_mode,
         member_count,
         centroid_x,
         centroid_y,
         CASE
           WHEN representative_node_kind = 'chunk' THEN representative_node_id
           ELSE NULL
         END AS representative_rag_chunk_id,
         label_source,
         candidate_count,
         NULL::INTEGER AS entity_candidate_count,
         NULL::INTEGER AS lexical_candidate_count,
         mean_cluster_probability,
         mean_outlier_score,
         paper_count,
         is_noise
       FROM ${clusterTable}`
    )

    if (facetTable) {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_facets AS
         SELECT * FROM ${facetTable}`
      )
    } else {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_facets AS
         SELECT
           NULL::VARCHAR AS facet_name,
           NULL::VARCHAR AS facet_value,
           NULL::VARCHAR AS facet_label,
           NULL::INTEGER AS point_count,
           NULL::INTEGER AS paper_count,
           NULL::INTEGER AS cluster_count,
           NULL::VARCHAR AS sort_key
         WHERE false`
      )
    }

    const availableLayers: MapLayer[] = ['chunk']

    if (documentTable) {
      await conn.query(
        `CREATE OR REPLACE VIEW paper_documents_web AS
         SELECT
           paper_id,
           NULL::VARCHAR AS source_embedding_id,
           citekey,
           title,
           NULL::VARCHAR AS source_payload_policy,
           NULL::VARCHAR AS source_text_hash,
           NULL::VARCHAR AS context_label,
           display_preview,
           COALESCE(payload_was_truncated, false) AS was_truncated,
           NULL::INTEGER AS context_char_count,
           NULL::INTEGER AS body_char_count,
           NULL::INTEGER AS text_char_count,
           NULL::INTEGER AS context_token_count,
           NULL::INTEGER AS body_token_count,
           journal,
           year,
           doi,
           CAST(pmid AS VARCHAR) AS pmid,
           pmcid,
           abstract,
           author_count,
           reference_count,
           asset_count,
           chunk_count,
           entity_count,
           relation_count,
           page_count,
           table_count,
           figure_count,
           text_availability,
           is_open_access,
           open_access_pdf_url,
           open_access_pdf_status,
           open_access_pdf_license,
           authors_json
         FROM ${documentTable}`
      )

      await conn.query(
        `CREATE OR REPLACE VIEW graph_papers AS
         SELECT
           COALESCE(p.paperId, d.paper_id) AS paper_id,
           COALESCE(MAX(p.citekey), MAX(d.citekey)) AS citekey,
           COALESCE(MAX(p.paperTitle), MAX(d.title)) AS title,
           COALESCE(MAX(p.journal), MAX(d.journal)) AS journal,
           COALESCE(MAX(p.year), MAX(d.year)) AS year,
           COALESCE(MAX(p.doi), MAX(d.doi)) AS doi,
           COALESCE(MAX(p.pmid), MAX(d.pmid)) AS pmid,
           COALESCE(MAX(p.pmcid), MAX(d.pmcid)) AS pmcid,
           MAX(d.abstract) AS abstract,
           COALESCE(MAX(d.authors_json), '[]') AS authors_json,
           COALESCE(MAX(p.paperAuthorCount), MAX(d.author_count)) AS author_count,
           COALESCE(MAX(p.paperReferenceCount), MAX(d.reference_count)) AS reference_count,
           COALESCE(MAX(p.paperAssetCount), MAX(d.asset_count)) AS asset_count,
           COALESCE(MAX(p.paperChunkCount), MAX(d.chunk_count)) AS chunk_count,
           COALESCE(MAX(p.paperEntityCount), MAX(d.entity_count)) AS entity_count,
           COALESCE(MAX(p.paperRelationCount), MAX(d.relation_count)) AS relation_count,
           NULL::INTEGER AS sentence_count,
           COALESCE(MAX(p.paperPageCount), MAX(d.page_count)) AS page_count,
           COALESCE(MAX(p.paperTableCount), MAX(d.table_count)) AS table_count,
           COALESCE(MAX(p.paperFigureCount), MAX(d.figure_count)) AS figure_count,
           MAX(d.text_availability) AS text_availability,
           MAX(d.is_open_access) AS is_open_access,
           MAX(d.open_access_pdf_url) AS open_access_pdf_url,
           MAX(d.open_access_pdf_status) AS open_access_pdf_status,
           MAX(d.open_access_pdf_license) AS open_access_pdf_license,
           COUNT(*) FILTER (WHERE p.id IS NOT NULL) AS graph_point_count,
           COUNT(DISTINCT CASE WHEN p.clusterId > 0 THEN p.clusterId END) AS graph_cluster_count
         FROM paper_points_web p
         FULL OUTER JOIN paper_documents_web d
           ON p.paperId = d.paper_id
         GROUP BY
           COALESCE(p.paperId, d.paper_id)`
      )
    } else {
      await conn.query(
        `CREATE OR REPLACE VIEW paper_documents_web AS
         SELECT
           NULL::VARCHAR AS paper_id,
           NULL::VARCHAR AS source_embedding_id,
           NULL::VARCHAR AS citekey,
           NULL::VARCHAR AS title,
           NULL::VARCHAR AS source_payload_policy,
           NULL::VARCHAR AS source_text_hash,
           NULL::VARCHAR AS context_label,
           NULL::VARCHAR AS display_preview,
           false AS was_truncated,
           NULL::INTEGER AS context_char_count,
           NULL::INTEGER AS body_char_count,
           NULL::INTEGER AS text_char_count,
           NULL::INTEGER AS context_token_count,
           NULL::INTEGER AS body_token_count,
           NULL::VARCHAR AS journal,
           NULL::INTEGER AS year,
           NULL::VARCHAR AS doi,
           NULL::VARCHAR AS pmid,
           NULL::VARCHAR AS pmcid,
           NULL::VARCHAR AS abstract,
           NULL::INTEGER AS author_count,
           NULL::INTEGER AS reference_count,
           NULL::INTEGER AS asset_count,
           NULL::INTEGER AS chunk_count,
           NULL::INTEGER AS entity_count,
           NULL::INTEGER AS relation_count,
           NULL::INTEGER AS page_count,
           NULL::INTEGER AS table_count,
           NULL::INTEGER AS figure_count,
           NULL::VARCHAR AS text_availability,
           NULL::BOOLEAN AS is_open_access,
           NULL::VARCHAR AS open_access_pdf_url,
           NULL::VARCHAR AS open_access_pdf_status,
           NULL::VARCHAR AS open_access_pdf_license,
           '[]' AS authors_json
         WHERE false`
      )
    }

    if (!documentTable) {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_papers AS
         SELECT
           NULL::VARCHAR AS paper_id,
           NULL::VARCHAR AS citekey,
           NULL::VARCHAR AS title,
           NULL::VARCHAR AS journal,
           NULL::INTEGER AS year,
           NULL::VARCHAR AS doi,
           NULL::VARCHAR AS pmid,
           NULL::VARCHAR AS pmcid,
           NULL::VARCHAR AS abstract,
           '[]' AS authors_json,
           NULL::INTEGER AS author_count,
           NULL::INTEGER AS reference_count,
           NULL::INTEGER AS asset_count,
           NULL::INTEGER AS chunk_count,
           NULL::INTEGER AS entity_count,
           NULL::INTEGER AS relation_count,
           NULL::INTEGER AS sentence_count,
           NULL::INTEGER AS page_count,
           NULL::INTEGER AS table_count,
           NULL::INTEGER AS figure_count,
           NULL::VARCHAR AS text_availability,
           NULL::BOOLEAN AS is_open_access,
           NULL::VARCHAR AS open_access_pdf_url,
           NULL::VARCHAR AS open_access_pdf_status,
           NULL::VARCHAR AS open_access_pdf_license,
           NULL::BIGINT AS graph_point_count,
           NULL::BIGINT AS graph_cluster_count
         WHERE false`
      )
    }

    await conn.query(
      `CREATE OR REPLACE VIEW graph_chunk_details AS
       SELECT
         gp.id AS rag_chunk_id,
         gp.paperId AS paper_id,
         gp.citekey,
         gp.paperTitle AS title,
         gp.journal,
         gp.year,
         gp.doi,
         CAST(gp.pmid AS VARCHAR) AS pmid,
         gp.pmcid,
         gp.stableChunkId AS stable_chunk_id,
         gp.chunkIndex AS chunk_index,
         gp.sectionType AS section_type,
         gp.sectionCanonical AS section_canonical,
         NULL::VARCHAR AS section_path,
         gp.pageNumber AS page_number,
         gp.tokenCount AS token_count,
         gp.charCount AS char_count,
         gp.chunkKind AS chunk_kind,
         NULL::VARCHAR AS block_type,
         NULL::VARCHAR AS block_id,
         gp.chunkPreview AS chunk_text,
         gp.chunkPreview AS chunk_preview,
         papers.abstract,
         gp.clusterId AS cluster_id,
         gp.clusterLabel AS cluster_label,
         gp.clusterProbability AS cluster_probability,
         NULL::DOUBLE AS outlier_score,
         NULL::VARCHAR AS source_embedding_id
       FROM graph_points_web gp
       LEFT JOIN graph_papers papers ON papers.paper_id = gp.paperId
       WHERE gp.nodeKind = 'chunk'`
    )

    if (exemplarTable) {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_cluster_exemplars AS
         SELECT
           e.cluster_id,
           e.rank,
           e.node_id AS rag_chunk_id,
           COALESCE(e.paper_id, p.paperId) AS paper_id,
           p.citekey,
           p.paperTitle AS title,
           p.sectionType AS section_type,
           p.sectionCanonical AS section_canonical,
           p.pageNumber AS page_number,
           e.exemplar_score,
           e.is_representative,
           COALESCE(p.chunkPreview, p.displayLabel) AS chunk_preview
         FROM ${exemplarTable} e
         LEFT JOIN graph_points_web p
           ON p.id = e.node_id`
      )
    } else {
      await conn.query(
        `CREATE OR REPLACE VIEW graph_cluster_exemplars AS
         SELECT
           NULL::INTEGER AS cluster_id,
           NULL::INTEGER AS rank,
           NULL::VARCHAR AS rag_chunk_id,
           NULL::VARCHAR AS paper_id,
           NULL::VARCHAR AS citekey,
           NULL::VARCHAR AS title,
           NULL::VARCHAR AS section_type,
           NULL::VARCHAR AS section_canonical,
           NULL::INTEGER AS page_number,
           NULL::DOUBLE AS exemplar_score,
           false AS is_representative,
           NULL::VARCHAR AS chunk_preview
         WHERE false`
      )
    }

    availableLayers.push('paper')

    // Geo layer — real-world lat/lng, no UMAP/HDBSCAN
    if (bundle.bundleManifest.tables.geo_points) {
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

    const pointCounts: Record<MapLayer, number> = {
      chunk: bundle.bundleManifest.tables.corpus_points?.rowCount ?? 0,
      paper: bundle.bundleManifest.tables.corpus_points?.rowCount ?? 0,
      geo: bundle.bundleManifest.tables.geo_points?.rowCount ?? 0,
    }

    emitProgress(bundle.bundleChecksum, {
      stage: 'views',
      message: 'Canvas tables are ready. Graph rendering can begin immediately.',
      percent: 12,
      loadedRows: 0,
      totalRows: pointCounts.chunk,
    })

    let dataPromise: Promise<GraphData> | null = null

    const hasAuthorGeo = Boolean(bundle.bundleManifest.tables.graph_author_geo)
    const selectionCache = createBoundedCache<string, Promise<GraphSelectionDetail>>()
    const clusterCache = createBoundedCache<number, Promise<GraphClusterDetail>>()
    const paperDocumentCache = createBoundedCache<string, Promise<PaperDocument | null>>()
    const authorCache = createBoundedCache<string, Promise<AuthorGeoRow[]>>()
    const searchCache = createBoundedCache<string, Promise<GraphSearchResult[]>>()
    const visibilityBudgetCache = createBoundedCache<string, Promise<GraphVisibilityBudget | null>>()
    const scopeIndicesCache = createBoundedCache<string, Promise<number[]>>()

    return {
      availableLayers,
      canvas: {
        duckDBConnection: {
          duckdb: db,
          connection: conn,
        },
        pointsTableName: 'graph_points_web',
        pointCounts,
      },
      getData() {
        if (!dataPromise) {
          dataPromise = hydrateGraphData({
            conn,
            bundle,
            facetTable,
            availableLayers,
          })
        }
        return dataPromise
      },
      runReadOnlyQuery(sql: string) {
        return executeReadOnlyQuery(conn, sql)
      },
      getInstitutionAuthors(institutionKey: string) {
        const cached = authorCache.get(institutionKey)
        if (cached) return cached

        const next = (async (): Promise<AuthorGeoRow[]> => {
          if (!hasAuthorGeo) return []

          const rows = await queryRows<{
            authorId: string
            name: string | null
            surname: string | null
            givenName: string | null
            orcid: string | null
            citekey: string | null
            paperTitle: string | null
            year: number | null
            institution: string | null
            department: string | null
            institutionKey: string | null
          }>(
            conn,
            `SELECT * FROM author_geo_web WHERE institutionKey = ? ORDER BY year DESC, surname`,
            [institutionKey]
          )
          return rows.map((r) => ({ ...r }))
        })()

        authorCache.set(institutionKey, next)
        return next
      },
      getAuthorInstitutions(name: string, orcid: string | null) {
        const cacheKey = orcid ? `orcid:${orcid}` : `name:${name}`
        const cached = authorCache.get(cacheKey)
        if (cached) return cached

        const next = (async (): Promise<AuthorGeoRow[]> => {
          if (!hasAuthorGeo) return []

          const rows = await queryRows<{
            authorId: string
            name: string | null
            surname: string | null
            givenName: string | null
            orcid: string | null
            citekey: string | null
            paperTitle: string | null
            year: number | null
            institution: string | null
            department: string | null
            institutionKey: string | null
          }>(
            conn,
            orcid
              ? `SELECT * FROM author_geo_web WHERE orcid = ? ORDER BY year DESC, institutionKey`
              : `SELECT * FROM author_geo_web WHERE name = ? ORDER BY year DESC, institutionKey`,
            [orcid ?? name]
          )
          return rows.map((r) => ({ ...r }))
        })()

        authorCache.set(cacheKey, next)
        return next
      },
      getPaperDocument(paperId: string) {
        const cached = paperDocumentCache.get(paperId)
        if (cached) return cached

        const next = queryPaperDocument(conn, paperId)

        paperDocumentCache.set(paperId, next)
        return next
      },
      resolvePointSelection(layer, selector) {
        if (layer === 'paper') {
          return queryPaperPointSelection(conn, selector)
        }
        if (layer === 'chunk') {
          return queryGraphPointSelection(conn, selector)
        }
        if (layer === 'geo') {
          return queryGeoPointSelection(conn, selector)
        }
        return Promise.resolve(null)
      },
      getTablePage(args) {
        if (args.layer === 'paper') {
          return queryPaperTablePage(conn, args)
        }
        if (args.layer === 'geo') {
          return queryGeoTablePage(conn, args)
        }
        return queryChunkTablePage(conn, args)
      },
      getInfoSummary(args) {
        return queryInfoSummary(conn, args)
      },
      getInfoBars(args) {
        return queryInfoBars(conn, {
          ...args,
          maxItems: args.maxItems ?? 8,
        })
      },
      getInfoHistogram(args) {
        return queryInfoHistogram(conn, {
          ...args,
          bins: args.bins ?? 16,
        })
      },
      getFacetSummary(args) {
        return queryFacetSummary(conn, {
          ...args,
          maxItems: args.maxItems ?? 6,
        })
      },
      searchPoints(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          column: args.column,
          query: args.query.trim().toLowerCase(),
          limit: args.limit ?? 12,
        })
        const cached = searchCache.get(cacheKey)
        if (cached) return cached

        const next = queryPointSearch(conn, args)
        searchCache.set(cacheKey, next)
        return next
      },
      getVisibilityBudget(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          id: args.selector.id ?? null,
          index: args.selector.index ?? null,
          scopeSql: args.scopeSql?.trim() || null,
        })
        const cached = visibilityBudgetCache.get(cacheKey)
        if (cached) return cached

        const next = queryVisibilityBudget(conn, args)
        visibilityBudgetCache.set(cacheKey, next)
        return next
      },
      getPointIndicesForScope(args) {
        const cacheKey = JSON.stringify({
          layer: args.layer,
          scopeSql: args.scopeSql.trim(),
        })
        const cached = scopeIndicesCache.get(cacheKey)
        if (cached) return cached

        const next = queryPointIndicesForScope(conn, args)
        scopeIndicesCache.set(cacheKey, next)
        return next
      },
      getClusterDetail(clusterId: number) {
        const cached = clusterCache.get(clusterId)
        if (cached) return cached

        const next = (async (): Promise<GraphClusterDetail> => {
          const [clusterRows, exemplarRows] = await Promise.all([
            queryClusterRows(conn, clusterId),
            queryExemplarRows(conn, clusterId),
          ])

          return {
            cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
            exemplars: exemplarRows.map(mapExemplar),
          }
        })()

        clusterCache.set(clusterId, next)
        return next
      },
      getSelectionDetail(node: GraphNode) {
        const cached = selectionCache.get(node.id)

        if (cached) {
          return cached
        }

        const next = (async (): Promise<GraphSelectionDetail> => {
          const [clusterRows, exemplarRows] = await Promise.all([
            queryClusterRows(conn, node.clusterId),
            queryExemplarRows(conn, node.clusterId),
          ])

          if (node.nodeKind === 'paper') {
            // Paper node: query paper details + cluster + exemplars (no chunk_details)
            const paperRows = await queryPaperDetail(conn, node.paperId ?? node.id)

            // Load paper document on demand
            const paperDocument = await queryPaperDocument(conn, node.paperId ?? node.id)

            return {
              chunk: null,
              cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
              exemplars: exemplarRows.map(mapExemplar),
              paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
              paperDocument,
            }
          }

          const paperRows = node.paperId
            ? await queryPaperDetail(conn, node.paperId)
            : []

          if (node.nodeKind !== 'chunk') {
            const paperDocument = node.paperId
              ? await queryPaperDocument(conn, node.paperId)
              : null

            return {
              chunk: null,
              cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
              exemplars: exemplarRows.map(mapExemplar),
              paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
              paperDocument,
            }
          }

          const chunkRows = await queryRows<GraphChunkDetailRow>(
            conn,
            `SELECT
              rag_chunk_id,
              paper_id,
              citekey,
              title,
              journal,
              year,
              doi,
              pmid,
              pmcid,
              stable_chunk_id,
              chunk_index,
              section_type,
              section_canonical,
              section_path,
              page_number,
              token_count,
              char_count,
              chunk_kind,
              block_type,
              block_id,
              chunk_text,
              chunk_preview,
              abstract,
              cluster_id,
              cluster_label,
              cluster_probability,
              outlier_score,
              source_embedding_id
            FROM graph_chunk_details
            WHERE rag_chunk_id = ?
            LIMIT 1`,
            [node.id]
          )

          return {
            chunk: chunkRows[0] ? mapChunkDetail(chunkRows[0]) : null,
            cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
            exemplars: exemplarRows.map(mapExemplar),
            paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
            paperDocument: null,
          }
        })()

        selectionCache.set(node.id, next)
        return next
      },
    }
  } catch (error) {
    await closeConnection(conn, db, worker)
    throw error
  }
}

export function loadGraphBundle(bundle: GraphBundle) {
  let session = sessionCache.get(bundle.bundleChecksum)

  if (!session) {
    session = createGraphBundleSession(bundle).catch((error) => {
      sessionCache.delete(bundle.bundleChecksum)
      progressCache.delete(bundle.bundleChecksum)
      throw error
    })
    sessionCache.set(bundle.bundleChecksum, session)
  }

  return session
}
