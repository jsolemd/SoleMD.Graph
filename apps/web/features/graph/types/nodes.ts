import type { GraphPointRecord } from './points'

export type CorpusNodeKind = 'paper'

export interface PaperNode extends GraphPointRecord {
  nodeKind: 'paper'
  payloadWasTruncated: boolean
}

export type GraphNode = PaperNode
