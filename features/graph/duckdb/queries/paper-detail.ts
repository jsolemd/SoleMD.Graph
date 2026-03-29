import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { PaperDocument } from '@/features/graph/types'

import {
  mapPaperDocument,
  type GraphPaperDetailRow,
  type PaperDocumentRow,
} from '../mappers'

import { queryRows } from './core'

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
