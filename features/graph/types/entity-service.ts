export interface GraphEntityRef {
  entityType: string
  conceptNamespace: string | null
  conceptId: string
  sourceIdentifier: string
  canonicalName: string
}

export interface GraphEntityTextMatch extends GraphEntityRef {
  matchId: string
  matchedText: string
  aliasText: string
  aliasSource: string
  startOffset: number
  endOffset: number
  paperCount: number
  isCanonical: boolean
  score: number
}

export interface GraphEntityAlias {
  aliasText: string
  isCanonical: boolean
  aliasSource: string | null
}

export interface GraphEntityDetail extends GraphEntityRef {
  paperCount: number
  aliases: GraphEntityAlias[]
  summary: string | null
}

export interface GraphEntityMatchRequestPayload {
  text: string
  entityTypes?: string[]
  limit?: number
  maxTokensPerAlias?: number
}

export interface GraphEntityMatchResponsePayload {
  matches: GraphEntityTextMatch[]
}

export interface GraphEntityDetailRequestPayload {
  entityType: string
  sourceIdentifier: string
}

export type GraphEntityDetailResponsePayload = GraphEntityDetail

export interface GraphEntityErrorResponsePayload {
  errorCode:
    | 'bad_request'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'rate_limited'
    | 'engine_request_failed'
    | 'unknown_error'
  errorMessage: string
  requestId: string | null
  retryAfter: number | null
  status: number
}

export type GraphEntityMatchActionResponsePayload =
  | {
      ok: true
      data: GraphEntityMatchResponsePayload
    }
  | {
      ok: false
      error: GraphEntityErrorResponsePayload
    }

export type GraphEntityDetailActionResponsePayload =
  | {
      ok: true
      data: GraphEntityDetailResponsePayload
    }
  | {
      ok: false
      error: GraphEntityErrorResponsePayload
    }
