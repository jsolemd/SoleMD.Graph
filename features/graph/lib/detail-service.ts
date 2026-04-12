'use client'

import { getGraphRagQuery } from '@/app/actions/graph'

import type { GraphBundle, GraphPointRecord } from '@/features/graph/types'
import type {
  GraphRagQueryRequestPayload,
  GraphRagErrorResponsePayload,
  GraphRagQueryResponsePayload,
} from '@/features/graph/types/detail-service'
import { resolveGraphReleaseId } from '@/features/graph/lib/graph-release'

interface FetchGraphRagQueryArgs {
  bundle: GraphBundle
  query: string
  selectedNode?: GraphPointRecord | null
  selectionGraphPaperRefs?: string[] | null
  scopeMode?: 'global' | 'selection_only' | null
  selectedClusterId?: number | null
  evidenceIntent?: 'support' | 'refute' | 'both' | null
  k?: number
  rerankTopn?: number
  useLexical?: boolean
  generateAnswer?: boolean
}

interface GraphRagRequestContextArgs {
  bundle: GraphBundle
  selectedNode?: GraphPointRecord | null
  selectionGraphPaperRefs?: string[] | null
  scopeMode?: 'global' | 'selection_only' | null
  selectedClusterId?: number | null
  evidenceIntent?: 'support' | 'refute' | 'both' | null
}

export class GraphRagRequestError extends Error {
  readonly payload: GraphRagErrorResponsePayload

  constructor(payload: GraphRagErrorResponsePayload) {
    super(payload.error_message)
    this.name = 'GraphRagRequestError'
    this.payload = payload
  }
}

export function buildGraphRagRequestContext({
  bundle,
  selectedNode,
  selectionGraphPaperRefs,
  scopeMode,
  selectedClusterId,
  evidenceIntent,
}: GraphRagRequestContextArgs): Omit<GraphRagQueryRequestPayload, 'query'> {
  return {
    graph_release_id: resolveGraphReleaseId(bundle),
    selected_layer_key: selectedNode ? 'paper' : null,
    selected_node_id: selectedNode?.id ?? null,
    selected_graph_paper_ref: selectedNode?.paperId ?? selectedNode?.id ?? null,
    selection_graph_paper_refs: selectionGraphPaperRefs ?? null,
    selected_cluster_id: selectedClusterId ?? null,
    scope_mode: scopeMode ?? null,
    evidence_intent: evidenceIntent ?? null,
  }
}

export async function fetchGraphRagQuery({
  bundle,
  query,
  selectedNode,
  selectionGraphPaperRefs,
  scopeMode,
  selectedClusterId,
  evidenceIntent,
  k,
  rerankTopn,
  useLexical,
  generateAnswer,
}: FetchGraphRagQueryArgs): Promise<GraphRagQueryResponsePayload> {
  const result = await getGraphRagQuery({
    ...buildGraphRagRequestContext({
      bundle,
      selectedNode,
      selectionGraphPaperRefs,
      scopeMode,
      selectedClusterId,
      evidenceIntent,
    }),
    query,
    k,
    rerank_topn: rerankTopn,
    use_lexical: useLexical,
    generate_answer: generateAnswer,
  })

  if (!result.ok) {
    throw new GraphRagRequestError(result.error)
  }

  return result.data
}
