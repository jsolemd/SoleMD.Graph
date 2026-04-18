import type { ClusterExemplar, ClusterInfo } from './clusters'

export interface PaperDocument {
  paperId: string
  sourceEmbeddingId: string | null
  citekey: string | null
  title: string | null
  sourcePayloadPolicy: string | null
  sourceTextHash: string | null
  contextLabel: string | null
  displayPreview: string | null
  wasTruncated: boolean
  contextCharCount: number | null
  bodyCharCount: number | null
  textCharCount: number | null
  contextTokenCount: number | null
  bodyTokenCount: number | null
}

export interface PaperAuthor {
  affiliation: string | null
  givenName: string | null
  name: string
  orcid: string | null
  surname: string | null
}

export interface GraphPaperDetail {
  abstract: string | null
  assetCount: number | null
  authorCount: number | null
  authors: PaperAuthor[]
  chunkCount: number | null
  citekey: string | null
  doi: string | null
  entityCount: number | null
  figureCount: number | null
  graphClusterCount: number | null
  graphPointCount: number | null
  journal: string | null
  isOpenAccess: boolean | null
  openAccessPdfLicense: string | null
  openAccessPdfStatus: string | null
  openAccessPdfUrl: string | null
  paperId: string
  pageCount: number | null
  pmcid: string | null
  pmid: string | null
  referenceCount: number | null
  relationCount: number | null
  sentenceCount: number | null
  tableCount: number | null
  textAvailability: string | null
  title: string | null
  year: number | null
}

export interface GraphSelectionDetail {
  cluster: ClusterInfo | null
  exemplars: ClusterExemplar[]
  paper: GraphPaperDetail | null
  paperDocument: PaperDocument | null
}

export interface GraphClusterDetail {
  cluster: ClusterInfo | null
  exemplars: ClusterExemplar[]
}
