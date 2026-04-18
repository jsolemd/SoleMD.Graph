'use server'

import type {
  GraphRagQueryActionResponsePayload,
} from "@solemd/api-client/shared/graph-rag"
import {
  searchGraphEvidence,
  type GraphEvidenceSearchInput,
  toGraphRagErrorResponse,
} from "@solemd/api-client/server/graph-rag"

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
