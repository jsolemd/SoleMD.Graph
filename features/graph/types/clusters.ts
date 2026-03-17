export interface ClusterInfo {
  clusterId: number
  label: string
  labelMode: string | null
  labelSource: string | null
  memberCount: number
  centroidX: number
  centroidY: number
  representativeRagChunkId: string | null
  candidateCount: number | null
  entityCandidateCount: number | null
  lexicalCandidateCount: number | null
  meanClusterProbability: number | null
  meanOutlierScore: number | null
  paperCount: number | null
  isNoise: boolean
}

export interface ClusterExemplar {
  clusterId: number
  rank: number
  ragChunkId: string
  paperId: string
  citekey: string | null
  paperTitle: string | null
  sectionType: string | null
  sectionCanonical: string | null
  pageNumber: number | null
  exemplarScore: number
  isRepresentative: boolean
  chunkPreview: string | null
}

export interface GraphFacet {
  facetName: string
  facetValue: string
  facetLabel: string | null
  pointCount: number
  paperCount: number
  clusterCount: number
  sortKey: string | null
}

export interface GraphStats {
  points: number
  pointLabel: string
  papers: number
  clusters: number
  noise: number
}

import type { GraphNode, PaperNode, GeoNode, GeoLink, GeoCitationLink } from './nodes'

export interface GraphData {
  clusters: ClusterInfo[]
  facets: GraphFacet[]
  nodes: GraphNode[]
  paperNodes: PaperNode[]
  geoNodes: GeoNode[]
  geoLinks: GeoLink[]
  geoCitationLinks: GeoCitationLink[]
  paperStats: GraphStats | null
  geoStats: GraphStats | null
  stats: GraphStats
}
