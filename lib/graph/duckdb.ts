import 'client-only'

import * as duckdb from '@duckdb/duckdb-wasm'
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import { getPaletteColors } from './colors'
import {
  buildGraphData,
  type GraphClusterRow,
  type GraphFacetRow,
  type GraphPointRow,
} from './transform'
import type {
  ChunkDetail,
  ChunkNode,
  ClusterExemplar,
  ClusterInfo,
  GraphBundle,
  GraphData,
  GraphPaperDetail,
  GraphSelectionDetail,
  PaperAuthor,
} from './types'

export interface GraphCanvasSource {
  duckDBConnection: {
    connection: AsyncDuckDBConnection
    duckdb: AsyncDuckDB
  }
  pointsTableName: string
}

interface GraphBundleSession {
  canvas: GraphCanvasSource
  data: GraphData
  getSelectionDetail: (node: ChunkNode) => Promise<GraphSelectionDetail>
}

interface BundleRelationResolver {
  relation: (tableName: string) => string
}

interface GraphClusterDetailRow {
  candidate_count: number | null
  centroid_x: number
  centroid_y: number
  cluster_id: number
  entity_candidate_count: number | null
  is_noise: boolean | null
  label: string | null
  label_mode: string | null
  label_source: string | null
  lexical_candidate_count: number | null
  mean_cluster_probability: number | null
  mean_outlier_score: number | null
  member_count: number
  paper_count: number | null
  representative_rag_chunk_id: string | null
}

interface GraphClusterExemplarRow {
  chunk_preview: string | null
  citekey: string | null
  cluster_id: number
  exemplar_score: number | null
  is_representative: boolean | null
  page_number: number | null
  paper_id: string
  rag_chunk_id: string
  rank: number
  section_canonical: string | null
  section_type: string | null
  title: string | null
}

interface GraphPaperDetailRow {
  abstract: string | null
  asset_count: number | string | null
  author_count: number | string | null
  authors_json: string | null
  chunk_count: number | string | null
  citekey: string | null
  doi: string | null
  entity_count: number | string | null
  figure_count: number | string | null
  graph_cluster_count: number | string | null
  graph_point_count: number | string | null
  journal: string | null
  page_count: number | string | null
  paper_id: string
  pmcid: string | null
  pmid: number | string | null
  reference_count: number | string | null
  relation_count: number | string | null
  sentence_count: number | string | null
  table_count: number | string | null
  title: string | null
  year: number | null
}

interface GraphChunkDetailRow {
  abstract: string | null
  block_id: string | null
  block_type: string | null
  char_count: number | string | null
  chunk_index: number | string | null
  chunk_kind: string | null
  chunk_preview: string | null
  chunk_text: string | null
  citekey: string | null
  cluster_id: number | string | null
  cluster_label: string | null
  cluster_probability: number | null
  doi: string | null
  journal: string | null
  outlier_score: number | null
  page_number: number | string | null
  paper_id: string
  pmcid: string | null
  pmid: number | string | null
  rag_chunk_id: string
  section_canonical: string | null
  section_path: string | null
  section_type: string | null
  source_embedding_id: string | null
  stable_chunk_id: string | null
  title: string | null
  token_count: number | string | null
  year: number | null
}

const DEFAULT_CLUSTER_COLORS = getPaletteColors('default')

let selectedBundlePromise: Promise<duckdb.DuckDBBundle> | null = null
const sessionCache = new Map<string, Promise<GraphBundleSession>>()

function getAbsoluteUrl(relativeOrAbsoluteUrl: string) {
  if (/^https?:\/\//.test(relativeOrAbsoluteUrl)) {
    return relativeOrAbsoluteUrl
  }

  return new URL(relativeOrAbsoluteUrl, window.location.origin).toString()
}

function escapeSqlString(value: string) {
  return value.replaceAll("'", "''")
}

function coerceNullableNumber(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function coerceNullableString(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return null
  }

  return String(value)
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeValue(entry),
      ])
    )
  }

  return value
}

function mapQueryRows<T>(table: { toArray(): Array<T & { toJSON?: () => unknown }> }) {
  return table
    .toArray()
    .map((row) =>
      normalizeValue(typeof row.toJSON === 'function' ? row.toJSON() : row)
    ) as T[]
}

async function getSelectedDuckDBBundle() {
  if (!selectedBundlePromise) {
    selectedBundlePromise = duckdb.selectBundle(duckdb.getJsDelivrBundles())
  }

  return selectedBundlePromise
}

async function createConnection() {
  const bundle = await getSelectedDuckDBBundle()
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: 'text/javascript',
    })
  )
  const worker = new Worker(workerUrl)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(workerUrl)
  const conn = await db.connect()

  return { conn, db, worker }
}

async function closeConnection(
  conn: AsyncDuckDBConnection,
  db: AsyncDuckDB,
  worker: Worker
) {
  await conn.close()
  await db.terminate()
  worker.terminate()
}

async function queryRows<T>(
  conn: AsyncDuckDBConnection,
  sql: string,
  params: unknown[] = []
) {
  if (params.length === 0) {
    return mapQueryRows<T>(await conn.query(sql))
  }

  const statement = await conn.prepare(sql)

  try {
    return mapQueryRows<T>(await statement.query(...params))
  } finally {
    await statement.close()
  }
}

async function resolveBundleRelations(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle
): Promise<BundleRelationResolver> {
  const absoluteDuckdbUrl = getAbsoluteUrl(bundle.duckdbUrl)

  try {
    await conn.query(`ATTACH '${escapeSqlString(absoluteDuckdbUrl)}' AS graph_bundle`)
    await conn.query('SELECT 1 FROM graph_bundle.graph_points LIMIT 1')

    return {
      relation: (tableName) => `graph_bundle.${tableName}`,
    }
  } catch {
    for (const [tableName, tableUrl] of Object.entries(bundle.tableUrls)) {
      const absoluteTableUrl = getAbsoluteUrl(tableUrl)
      await conn.query(
        `CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM read_parquet('${escapeSqlString(
          absoluteTableUrl
        )}')`
      )
    }

    return {
      relation: (tableName) => tableName,
    }
  }
}

function mapCluster(row: GraphClusterDetailRow): ClusterInfo {
  return {
    clusterId: row.cluster_id,
    label: row.label ?? (row.cluster_id === 0 ? 'Noise' : `Cluster ${row.cluster_id}`),
    labelMode: row.label_mode,
    labelSource: row.label_source,
    memberCount: row.member_count,
    centroidX: row.centroid_x,
    centroidY: row.centroid_y,
    representativeRagChunkId: row.representative_rag_chunk_id,
    candidateCount: row.candidate_count ?? null,
    entityCandidateCount: row.entity_candidate_count ?? null,
    lexicalCandidateCount: row.lexical_candidate_count ?? null,
    meanClusterProbability: row.mean_cluster_probability ?? null,
    meanOutlierScore: row.mean_outlier_score ?? null,
    paperCount: row.paper_count ?? null,
    isNoise: Boolean(row.is_noise ?? row.cluster_id === 0),
  }
}

function mapExemplar(row: GraphClusterExemplarRow): ClusterExemplar {
  return {
    clusterId: row.cluster_id,
    rank: row.rank,
    ragChunkId: row.rag_chunk_id,
    paperId: row.paper_id,
    citekey: row.citekey,
    paperTitle: row.title,
    sectionType: row.section_type,
    sectionCanonical: row.section_canonical,
    pageNumber: row.page_number ?? null,
    exemplarScore: row.exemplar_score ?? 0,
    isRepresentative: Boolean(row.is_representative),
    chunkPreview: row.chunk_preview,
  }
}

function parseAuthors(authorsJson: string | null): PaperAuthor[] {
  if (!authorsJson) {
    return []
  }

  try {
    const parsed = JSON.parse(authorsJson)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((author): author is Record<string, unknown> => Boolean(author))
      .map((author) => ({
        affiliation:
          typeof author.affiliation === 'string' ? author.affiliation : null,
        givenName:
          typeof author.given_name === 'string'
            ? author.given_name
            : typeof author.givenName === 'string'
              ? author.givenName
              : null,
        name:
          typeof author.name === 'string'
            ? author.name
            : typeof author.full_name === 'string'
              ? author.full_name
              : 'Unknown author',
        orcid: typeof author.orcid === 'string' ? author.orcid : null,
        surname:
          typeof author.surname === 'string'
            ? author.surname
            : typeof author.family_name === 'string'
              ? author.family_name
              : null,
      }))
  } catch {
    return []
  }
}

function mapPaper(row: GraphPaperDetailRow): GraphPaperDetail {
  return {
    abstract: row.abstract,
    assetCount: coerceNullableNumber(row.asset_count),
    authorCount: coerceNullableNumber(row.author_count),
    authors: parseAuthors(row.authors_json),
    chunkCount: coerceNullableNumber(row.chunk_count),
    citekey: row.citekey,
    doi: row.doi,
    entityCount: coerceNullableNumber(row.entity_count),
    figureCount: coerceNullableNumber(row.figure_count),
    graphClusterCount: coerceNullableNumber(row.graph_cluster_count),
    graphPointCount: coerceNullableNumber(row.graph_point_count),
    journal: row.journal,
    paperId: row.paper_id,
    pageCount: coerceNullableNumber(row.page_count),
    pmcid: row.pmcid,
    pmid: coerceNullableString(row.pmid),
    referenceCount: coerceNullableNumber(row.reference_count),
    relationCount: coerceNullableNumber(row.relation_count),
    sentenceCount: coerceNullableNumber(row.sentence_count),
    tableCount: coerceNullableNumber(row.table_count),
    title: row.title,
    year: row.year ?? null,
  }
}

function mapChunkDetail(row: GraphChunkDetailRow): ChunkDetail {
  return {
    abstract: row.abstract,
    blockId: row.block_id,
    blockType: row.block_type,
    charCount: coerceNullableNumber(row.char_count),
    chunkIndex: coerceNullableNumber(row.chunk_index),
    chunkKind: row.chunk_kind,
    chunkPreview: row.chunk_preview,
    chunkText: row.chunk_text,
    citekey: row.citekey,
    clusterId: coerceNullableNumber(row.cluster_id),
    clusterLabel: row.cluster_label,
    clusterProbability: row.cluster_probability ?? null,
    doi: row.doi,
    journal: row.journal,
    outlierScore: row.outlier_score ?? null,
    pageNumber: coerceNullableNumber(row.page_number),
    paperId: row.paper_id,
    pmcid: row.pmcid,
    pmid: coerceNullableString(row.pmid),
    ragChunkId: row.rag_chunk_id,
    sectionCanonical: row.section_canonical,
    sectionPath: row.section_path,
    sectionType: row.section_type,
    sourceEmbeddingId: row.source_embedding_id,
    stableChunkId: row.stable_chunk_id,
    title: row.title,
    tokenCount: coerceNullableNumber(row.token_count),
    year: row.year ?? null,
  }
}

async function createGraphBundleSession(bundle: GraphBundle): Promise<GraphBundleSession> {
  const { conn, db, worker } = await createConnection()

  try {
    const relations = await resolveBundleRelations(conn, bundle)
    const colorCase = DEFAULT_CLUSTER_COLORS.map(
      (color, index) => `WHEN ${index} THEN '${color}'`
    ).join('\n        ')
    await conn.query(
      `CREATE OR REPLACE VIEW graph_points_web AS
      SELECT
        ROW_NUMBER() OVER (ORDER BY cluster_id, paper_id, chunk_index, node_id) - 1 AS index,
        node_id AS id,
        CASE
          WHEN COALESCE(cluster_id, 0) = 0 THEN '#555555'
          ELSE CASE MOD(COALESCE(cluster_id, 0), ${DEFAULT_CLUSTER_COLORS.length})
        ${colorCase}
            ELSE '#a8c5e9'
          END
        END AS color,
        x,
        y,
        COALESCE(cluster_id, 0) AS clusterId,
        cluster_label AS clusterLabel,
        COALESCE(cluster_probability, 0) AS clusterProbability,
        COALESCE(outlier_score, 0) AS outlierScore,
        paper_id AS paperId,
        title AS paperTitle,
        citekey,
        journal,
        year,
        doi,
        CAST(pmid AS VARCHAR) AS pmid,
        pmcid,
        stable_chunk_id AS stableChunkId,
        chunk_index AS chunkIndex,
        section_type AS sectionType,
        section_canonical AS sectionCanonical,
        section_path AS sectionPath,
        page_number AS pageNumber,
        token_count AS tokenCount,
        char_count AS charCount,
        chunk_kind AS chunkKind,
        block_type AS blockType,
        block_id AS blockId,
        chunk_preview AS chunkPreview,
        paper_author_count AS paperAuthorCount,
        paper_reference_count AS paperReferenceCount,
        paper_asset_count AS paperAssetCount,
        paper_chunk_count AS paperChunkCount,
        CAST(paper_entity_count AS DOUBLE) AS paperEntityCount,
        CAST(paper_relation_count AS DOUBLE) AS paperRelationCount,
        paper_sentence_count AS paperSentenceCount,
        paper_page_count AS paperPageCount,
        paper_table_count AS paperTableCount,
        paper_figure_count AS paperFigureCount,
        COALESCE(has_table_context, false) AS hasTableContext,
        COALESCE(has_figure_context, false) AS hasFigureContext
      FROM ${relations.relation('graph_points')}`
    )
    const points = await queryRows<GraphPointRow>(
      conn,
      `SELECT
        id,
        id AS node_id,
        paperId AS paper_id,
        x,
        y,
        clusterId AS cluster_id,
        clusterLabel AS cluster_label,
        clusterProbability AS cluster_probability,
        outlierScore AS outlier_score,
        citekey,
        paperTitle AS title,
        journal,
        year,
        doi,
        pmid,
        pmcid,
        stableChunkId AS stable_chunk_id,
        chunkIndex AS chunk_index,
        sectionType AS section_type,
        sectionCanonical AS section_canonical,
        sectionPath AS section_path,
        pageNumber AS page_number,
        tokenCount AS token_count,
        charCount AS char_count,
        chunkKind AS chunk_kind,
        blockType AS block_type,
        blockId AS block_id,
        chunkPreview AS chunk_preview,
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
        hasTableContext AS has_table_context,
        hasFigureContext AS has_figure_context
      FROM graph_points_web
      ORDER BY index`
    )

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
      FROM ${relations.relation('graph_clusters')}
      ORDER BY cluster_id`
    )

    const facets = bundle.bundleManifest.tables.graph_facets
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
          FROM ${relations.relation('graph_facets')}
          ORDER BY facet_name, sort_key, facet_value`
        )
      : []

    const data = buildGraphData({
      points,
      clusters,
      facets,
    })

    const selectionCache = new Map<string, Promise<GraphSelectionDetail>>()

    return {
      canvas: {
        duckDBConnection: {
          duckdb: db,
          connection: conn,
        },
        pointsTableName: 'graph_points_web',
      },
      data,
      getSelectionDetail(node: ChunkNode) {
        const cached = selectionCache.get(node.id)

        if (cached) {
          return cached
        }

        const next = (async () => {
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
            FROM ${relations.relation('graph_chunk_details')}
            WHERE rag_chunk_id = ?
            LIMIT 1`,
            [node.id]
          )

          const paperRows = await queryRows<GraphPaperDetailRow>(
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
            FROM ${relations.relation('graph_papers')}
            WHERE paper_id = ?
            LIMIT 1`,
            [node.paperId]
          )

          const clusterRows = await queryRows<GraphClusterDetailRow>(
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
            FROM ${relations.relation('graph_clusters')}
            WHERE cluster_id = ?
            LIMIT 1`,
            [node.clusterId]
          )

          const exemplarRows = await queryRows<GraphClusterExemplarRow>(
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
            FROM ${relations.relation('graph_cluster_exemplars')}
            WHERE cluster_id = ?
            ORDER BY rank
            LIMIT 5`,
            [node.clusterId]
          )

          return {
            chunk: chunkRows[0] ? mapChunkDetail(chunkRows[0]) : null,
            cluster: clusterRows[0] ? mapCluster(clusterRows[0]) : null,
            exemplars: exemplarRows.map(mapExemplar),
            paper: paperRows[0] ? mapPaper(paperRows[0]) : null,
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
      throw error
    })
    sessionCache.set(bundle.bundleChecksum, session)
  }

  return session
}
