export type CorpusNodeKind =
  | 'term'
  | 'chunk'
  | 'paper'
  | 'relation_assertion'
  | 'alias'

/** Fields shared by all graph node types. */
export interface GraphNodeBase {
  index: number
  id: string
  x: number
  y: number
  color: string
  colorLight: string
  clusterId: number
  clusterLabel: string | null
  clusterProbability: number
  outlierScore: number
  paperId: string | null
  paperTitle: string | null
  citekey: string | null
  year: number | null
  journal: string | null
  doi: string | null
  pmid: string | null
  pmcid: string | null
  displayLabel: string | null
  searchText: string | null
  chunkPreview: string | null
  canonicalName: string | null
  category: string | null
  semanticGroups: string | null
  organSystems: string | null
  mentionCount: number | null
  paperCount: number | null
  chunkCount: number | null
  relationCount: number | null
  aliasCount: number | null
  relationType: string | null
  relationCategory: string | null
  relationDirection: string | null
  relationCertainty: string | null
  assertionStatus: string | null
  evidenceStatus: string | null
  aliasText: string | null
  aliasType: string | null
  aliasQualityScore: number | null
  aliasSource: string | null
  nodeRole: 'primary' | 'overlay'
  isDefaultVisible: boolean
  payloadJson: string | null
  paperAuthorCount: number | null
  paperReferenceCount: number | null
  paperAssetCount: number | null
  paperChunkCount: number | null
  paperEntityCount: number | null
  paperRelationCount: number | null
  paperSentenceCount: number | null
  paperPageCount: number | null
  paperTableCount: number | null
  paperFigureCount: number | null
}

export interface ChunkNode extends GraphNodeBase {
  nodeKind: 'chunk'
  stableChunkId: string | null
  chunkIndex: number | null
  sectionCanonical: string | null
  pageNumber: number | null
  tokenCount: number | null
  charCount: number | null
  chunkKind: string | null
  hasTableContext: boolean
  hasFigureContext: boolean
}

export interface PaperNode extends GraphNodeBase {
  nodeKind: 'paper'
  displayPreview: string | null
  payloadWasTruncated: boolean
}

export interface TermNode extends GraphNodeBase {
  nodeKind: 'term'
  definition: string | null
  semanticTypes: string | null
  aliasesCsv: string | null
}

export interface RelationAssertionNode extends GraphNodeBase {
  nodeKind: 'relation_assertion'
}

export interface AliasNode extends GraphNodeBase {
  nodeKind: 'alias'
}

/** Geographic institution node for the map layer. */
export interface GeoNode extends GraphNodeBase {
  nodeKind: 'institution'
  institution: string | null
  rorId: string | null
  city: string | null
  region: string | null
  country: string | null
  countryCode: string | null
  paperCount: number
  authorCount: number
  firstYear: number | null
  lastYear: number | null
}

export type GraphNode = ChunkNode | PaperNode | TermNode | RelationAssertionNode | AliasNode | GeoNode

/** Collaboration edge between two institutions for the geo layer. */
export interface GeoLink {
  sourceId: string
  targetId: string
  sourceIndex: number
  targetIndex: number
  paperCount: number
  sourceLng: number
  sourceLat: number
  targetLng: number
  targetLat: number
}

/** Citation edge between two institutions for the geo layer. */
export interface GeoCitationLink {
  sourceId: string
  targetId: string
  sourceIndex: number
  targetIndex: number
  citationCount: number
  sourceLng: number
  sourceLat: number
  targetLng: number
  targetLat: number
}

/** Author row from the graph_author_geo table for institution drill-down. */
export interface AuthorGeoRow {
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
}
