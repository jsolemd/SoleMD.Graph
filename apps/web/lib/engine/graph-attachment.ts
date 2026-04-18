import 'server-only'

import { postEngineBinary } from './client'

export const GRAPH_POINT_ATTACHMENT_MEDIA_TYPE = 'application/vnd.apache.arrow.stream'

export interface EngineGraphPointAttachmentRequest {
  graph_release_id: string
  graph_paper_refs: string[]
}

export function fetchGraphPointAttachment(
  request: EngineGraphPointAttachmentRequest,
  options?: {
    signal?: AbortSignal
  },
): Promise<Uint8Array> {
  return postEngineBinary(
    '/api/v1/graph/attach-points',
    request,
    {
      signal: options?.signal,
      accept: GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
    },
  )
}
