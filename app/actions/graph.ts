'use server'

import type {
  GraphRagQueryActionResponsePayload,
} from '@/features/graph/types'
import {
  searchGraphEvidence,
  type GraphEvidenceSearchInput,
  toGraphRagErrorResponse,
} from '@/lib/engine/graph-rag'

type GraphRagQueryInput = GraphEvidenceSearchInput

export async function getGraphRagQuery(
  input: GraphRagQueryInput,
): Promise<GraphRagQueryActionResponsePayload> {
  try {
    return {
      ok: true,
      data: await searchGraphEvidence(input),
    }
  } catch (error) {
    return {
      ok: false,
      error: toGraphRagErrorResponse(error),
    }
  }
}
