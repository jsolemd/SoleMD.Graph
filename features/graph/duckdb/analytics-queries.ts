import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import {
  buildGeoNodes,
  buildGraphNode,
  buildPaperNodes,
  type GeoPointRow,
  type GraphPointRow,
} from '@/features/graph/lib/transform'
import type {
  GraphInfoFacetRow,
  GraphInfoHistogramBin,
  GraphInfoScope,
  GraphInfoSummary,
  GraphSearchResult,
  GraphVisibilityBudget,
  MapLayer,
} from '@/features/graph/types'

import { queryRows } from './queries'
import {
  buildCurrentViewPredicate,
  buildIndexWhereClause,
  buildScopedLayerPredicate,
  getColumnMetaForLayer,
  getLayerTableName,
  getSearchLabelExpression,
  resolveInfoColumn,
  resolveSearchColumn,
  sliceScopeIndices,
} from './sql-helpers'

export async function queryPointSearch(
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

export async function queryVisibilityBudget(
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

export async function queryPointIndicesForScope(
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

export async function queryInfoSummary(
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
    base_count: number
    overlay_count: number
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
       count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') <> 'overlay')::INTEGER AS base_count,
       count(*) FILTER (WHERE COALESCE(nodeRole, 'primary') = 'overlay')::INTEGER AS overlay_count,
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
    base_count: 0,
    overlay_count: 0,
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
    baseCount: summaryRow.base_count,
    overlayCount: summaryRow.overlay_count,
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

export async function queryInfoBars(
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

export async function queryInfoHistogram(
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

export async function queryFacetSummary(
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

export async function queryChunkTablePage(
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
             FROM active_points_web
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
      isInBase AS is_in_base,
      baseRank AS base_rank,
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
    FROM active_points_web
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

export async function queryPaperTablePage(
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
             FROM active_paper_points_web
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
      isInBase AS is_in_base,
      baseRank AS base_rank,
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
    FROM active_paper_points_web
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

export async function queryGeoTablePage(
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
    ORDER by index${
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
