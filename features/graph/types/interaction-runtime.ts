import type { MapLayer } from './config'

// Canonical source-agnostic contracts for any surface that resolves references
// into graph annotations or graph-visible state.
export type GraphInteractionSurface =
  | 'prompt'
  | 'manuscript'
  | 'selection'
  | 'search'
  | 'system'

export type ReferenceIntentAction =
  | 'hover'
  | 'preview'
  | 'resolve'
  | 'project'
  | 'select'

export type ReferenceSubjectKind =
  | 'paper'
  | 'paper_set'
  | 'concept'
  | 'claim'
  | 'citation_anchor'
  | 'text_span'
  | 'graph_selection'

export interface GraphInteractionOrigin {
  // Origin is observability and orchestration metadata only.
  // Runtime semantics come from subjects plus requested outputs.
  surface: GraphInteractionSurface
  interactionKey: string
  producerId?: string | null
  sessionId?: string | null
  metadata?: Record<string, unknown>
}

export interface ReferenceSubject {
  kind: ReferenceSubjectKind
  ref: string
  label?: string | null
  sourceText?: string | null
  metadata?: Record<string, unknown>
}

export type GraphAnnotationMode =
  | 'none'
  | 'summary'
  | 'hover-card'
  | 'fingerprint'

export type GraphProjectionMode =
  | 'none'
  | 'highlight'
  | 'select'
  | 'overlay'
  | 'neighborhood'
  | 'fingerprint'

export interface GraphProjectionConfig {
  mode: GraphProjectionMode
  layer: MapLayer
  producerId?: string | null
  maxPapers?: number | null
  includeConnected?: boolean
  metadata?: Record<string, unknown>
}

export interface ReferenceIntent {
  intentId: string
  origin: GraphInteractionOrigin
  action: ReferenceIntentAction
  subjects: ReferenceSubject[]
  currentPointScopeSql?: string | null
  selectedGraphPaperRefs?: string[] | null
  annotationMode?: GraphAnnotationMode
  projection?: GraphProjectionConfig | null
  metadata?: Record<string, unknown>
}

export type ReferenceResolutionStatus = 'resolved' | 'partial' | 'unresolved'

export interface ResolvedReferenceSubject {
  subject: ReferenceSubject
  graphPaperRefs: string[]
  conceptIds: string[]
  unresolvedRefs: string[]
  metadata?: Record<string, unknown>
}

export interface ReferenceResolution {
  intentId: string
  status: ReferenceResolutionStatus
  subjects: ResolvedReferenceSubject[]
  activeGraphPaperRefs: string[]
  overlayCapableGraphPaperRefs: string[]
  unresolvedGraphPaperRefs: string[]
  metadata?: Record<string, unknown>
}

export type GraphAnnotationKind =
  | 'definition'
  | 'paper-preview'
  | 'citation-summary'
  | 'connection-summary'
  | 'count-badge'
  | 'fingerprint-summary'

export interface GraphAnnotation {
  annotationId: string
  kind: GraphAnnotationKind
  title?: string | null
  body?: string | null
  graphPaperRefs?: string[]
  conceptIds?: string[]
  metadata?: Record<string, unknown>
}

export interface GraphAnnotationSet {
  intentId: string
  annotations: GraphAnnotation[]
  metadata?: Record<string, unknown>
}

export interface GraphProjectionRequest {
  projectionId: string
  mode: GraphProjectionMode
  layer: MapLayer
  producerId: string | null
  graphPaperRefs: string[]
  pointIds?: string[]
  metadata?: Record<string, unknown>
}

export interface GraphProjectionResult {
  projectionId: string
  mode: GraphProjectionMode
  producerId: string | null
  activeGraphPaperRefs: string[]
  promotedGraphPaperRefs: string[]
  unresolvedGraphPaperRefs: string[]
  pointIds: string[]
  selectedPointIndices: number[]
  overlayCount: number
  overlayRevision?: number | null
  metadata?: Record<string, unknown>
}

export type GraphInteractionTraceStageName =
  | 'intent'
  | 'resolve'
  | 'availability'
  | 'attach'
  | 'annotate'
  | 'project'
  | 'refresh'
  | 'render'

export interface GraphInteractionTraceStage {
  stage: GraphInteractionTraceStageName
  durationMs: number
  metadata?: Record<string, unknown>
}

export interface GraphInteractionTrace {
  interactionId: string
  intentId: string
  origin: GraphInteractionOrigin
  totalDurationMs: number
  stages: GraphInteractionTraceStage[]
  metadata?: Record<string, unknown>
}
