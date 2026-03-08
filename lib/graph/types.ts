export interface ChunkNode {
  index: number
  id: string
  x: number
  y: number
  color: string
  clusterId: number
  clusterLabel: string | null
  clusterProbability: number
  outlierScore: number
  paperId: string
  paperTitle: string
  citekey: string
  year: number | null
}

export interface ClusterInfo {
  clusterId: number
  label: string
  memberCount: number
  centroidX: number
  centroidY: number
}

export interface ClusterExemplar {
  clusterId: number
  rank: number
  ragChunkId: string
  paperId: string
  chunkText: string
  exemplarScore: number
  isRepresentative: boolean
}

export interface GraphData {
  nodes: ChunkNode[]
  clusters: ClusterInfo[]
  exemplars: ClusterExemplar[]
  stats: GraphStats
  clusterColors: Record<number, string>
}

export interface GraphStats {
  chunks: number
  papers: number
  clusters: number
  noise: number
}

export type GraphMode = 'ask' | 'explore' | 'learn' | 'write'

export type PointColorStrategy = 'categorical' | 'continuous' | 'direct' | 'single'
export type PointSizeStrategy = 'auto' | 'direct' | 'single'
export type ColorSchemeName = 'default' | 'warm' | 'cool' | 'spectral' | 'viridis' | 'plasma' | 'turbo'
