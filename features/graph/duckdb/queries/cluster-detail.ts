import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import {
  type GraphClusterDetailRow,
  type GraphClusterExemplarRow,
} from '../mappers'

import { queryRows } from './core'

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
