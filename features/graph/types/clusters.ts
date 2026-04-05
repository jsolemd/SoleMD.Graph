export interface ClusterInfo {
  clusterId: number
  label: string
  labelMode: string | null
  labelSource: string | null
  memberCount: number
  centroidX: number
  centroidY: number
  representativePointId: string | null
  candidateCount: number | null
  entityCandidateCount: number | null
  lexicalCandidateCount: number | null
  meanClusterProbability: number | null
  meanOutlierScore: number | null
  paperCount: number | null
  isNoise: boolean
  description: string | null
}

export interface ClusterExemplar {
  clusterId: number
  rank: number
  pointId: string
  paperId: string
  citekey: string | null
  paperTitle: string | null
  exemplarScore: number
  isRepresentative: boolean
  preview: string | null
}

export interface GraphStats {
  points: number
  pointLabel: string
  papers: number
  clusters: number
  noise: number
}
