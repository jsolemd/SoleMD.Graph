import { coerceNullableNumber, coerceNullableString } from '@/lib/helpers'
import type {
  ChunkDetail,
  ClusterExemplar,
  ClusterInfo,
  GraphPaperDetail,
  PaperAuthor,
  PaperDocument,
} from '@/features/graph/types'

export interface GraphClusterDetailRow {
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

export interface GraphClusterExemplarRow {
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

export interface GraphPaperDetailRow {
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

export interface GraphChunkDetailRow {
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

export function mapCluster(row: GraphClusterDetailRow): ClusterInfo {
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

export function mapExemplar(row: GraphClusterExemplarRow): ClusterExemplar {
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

export function parseAuthors(authorsJson: string | null): PaperAuthor[] {
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

export function mapPaper(row: GraphPaperDetailRow): GraphPaperDetail {
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

export function mapChunkDetail(row: GraphChunkDetailRow): ChunkDetail {
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

/* ─── Paper Document ───────────────────────────────────────────── */

export interface PaperDocumentRow {
  paper_id: string
  source_embedding_id: string | null
  citekey: string | null
  title: string | null
  source_payload_policy: string | null
  source_text_hash: string | null
  context_label: string | null
  display_preview: string | null
  was_truncated: boolean | null
  context_char_count: number | string | null
  body_char_count: number | string | null
  text_char_count: number | string | null
  context_token_count: number | string | null
  body_token_count: number | string | null
}

export function mapPaperDocument(row: PaperDocumentRow): PaperDocument {
  return {
    paperId: row.paper_id,
    sourceEmbeddingId: row.source_embedding_id,
    citekey: row.citekey,
    title: row.title,
    sourcePayloadPolicy: row.source_payload_policy,
    sourceTextHash: row.source_text_hash,
    contextLabel: row.context_label,
    displayPreview: row.display_preview,
    wasTruncated: Boolean(row.was_truncated),
    contextCharCount: coerceNullableNumber(row.context_char_count),
    bodyCharCount: coerceNullableNumber(row.body_char_count),
    textCharCount: coerceNullableNumber(row.text_char_count),
    contextTokenCount: coerceNullableNumber(row.context_token_count),
    bodyTokenCount: coerceNullableNumber(row.body_token_count),
  }
}
