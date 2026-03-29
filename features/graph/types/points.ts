export interface GraphPointRecord {
  index: number
  id: string
  paperId: string | null
  nodeKind: 'paper'
  nodeRole: 'primary' | 'overlay'
  color: string
  colorLight: string
  x: number
  y: number
  clusterId: number
  clusterLabel: string | null
  clusterProbability: number
  displayLabel: string | null
  displayPreview: string | null
  paperTitle: string | null
  citekey: string | null
  journal: string | null
  year: number | null
  semanticGroups: string | null
  organSystems: string | null
  relationCategories: string | null
  textAvailability: string | null
  paperAuthorCount: number | null
  paperReferenceCount: number | null
  paperEntityCount: number | null
  paperRelationCount: number | null
  isInBase: boolean
  baseRank: number | null
  isOverlayActive: boolean
}
