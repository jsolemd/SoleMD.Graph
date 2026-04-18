import { coerceNullableNumber, coerceNullableString } from '@/lib/helpers'
import type {
  ClusterExemplar,
  ClusterInfo,
  GraphPaperDetail,
  PaperAuthor,
  PaperDocument,
} from "@solemd/graph"

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
  representative_point_id: string | null
  description: string | null
}

export interface GraphClusterExemplarRow {
  citekey: string | null
  cluster_id: number
  exemplar_score: number | null
  is_representative: boolean | null
  paper_id: string
  point_id: string
  preview: string | null
  rank: number
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
  is_open_access: boolean | null
  journal: string | null
  open_access_pdf_license: string | null
  open_access_pdf_status: string | null
  open_access_pdf_url: string | null
  page_count: number | string | null
  paper_id: string
  pmcid: string | null
  pmid: number | string | null
  reference_count: number | string | null
  relation_count: number | string | null
  sentence_count: number | string | null
  table_count: number | string | null
  text_availability: string | null
  title: string | null
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
    representativePointId: row.representative_point_id,
    candidateCount: row.candidate_count ?? null,
    entityCandidateCount: row.entity_candidate_count ?? null,
    lexicalCandidateCount: row.lexical_candidate_count ?? null,
    meanClusterProbability: row.mean_cluster_probability ?? null,
    meanOutlierScore: row.mean_outlier_score ?? null,
    paperCount: row.paper_count ?? null,
    isNoise: Boolean(row.is_noise ?? row.cluster_id === 0),
    description: row.description ?? null,
  }
}

export function mapExemplar(row: GraphClusterExemplarRow): ClusterExemplar {
  return {
    clusterId: row.cluster_id,
    rank: row.rank,
    pointId: row.point_id,
    paperId: row.paper_id,
    citekey: row.citekey,
    paperTitle: row.title,
    exemplarScore: row.exemplar_score ?? 0,
    isRepresentative: Boolean(row.is_representative),
    preview: row.preview,
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
    isOpenAccess: row.is_open_access ?? null,
    journal: row.journal,
    openAccessPdfLicense: row.open_access_pdf_license,
    openAccessPdfStatus: row.open_access_pdf_status,
    openAccessPdfUrl: row.open_access_pdf_url,
    paperId: row.paper_id,
    pageCount: coerceNullableNumber(row.page_count),
    pmcid: row.pmcid,
    pmid: coerceNullableString(row.pmid),
    referenceCount: coerceNullableNumber(row.reference_count),
    relationCount: coerceNullableNumber(row.relation_count),
    sentenceCount: coerceNullableNumber(row.sentence_count),
    tableCount: coerceNullableNumber(row.table_count),
    textAvailability: row.text_availability,
    title: row.title,
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
