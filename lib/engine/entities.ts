import 'server-only'

import type {
  GraphEntityDetailRequestPayload,
  GraphEntityDetailResponsePayload,
  GraphEntityErrorResponsePayload,
  GraphEntityMatchRequestPayload,
  GraphEntityMatchResponsePayload,
} from '@/features/graph/types/entity-service'
import { EngineApiError, postEngineJson } from './client'

interface EngineEntityMatchRequest {
  text: string
  entity_types?: string[]
  limit?: number
  max_tokens_per_alias?: number
}

interface EngineEntityMatchHit {
  match_id: string
  entity_type: string
  concept_namespace: string | null
  concept_id: string
  source_identifier: string
  canonical_name: string
  matched_text: string
  alias_text: string
  alias_source: string
  start: number
  end: number
  paper_count: number
  is_canonical_alias: boolean
  score: number
}

interface EngineEntityMatchResponse {
  matches: EngineEntityMatchHit[]
}

interface EngineEntityDetailRequest {
  entity_type: string
  source_identifier: string
}

interface EngineEntityDetailResponse {
  entity: {
    entity_type: string
    concept_namespace: string | null
    concept_id: string
    source_identifier: string
    canonical_name: string
    paper_count: number
    aliases: Array<{
      alias_text: string
      is_canonical: boolean
      alias_source: string | null
    }>
    summary: string | null
  }
}

export async function matchGraphEntities(
  input: GraphEntityMatchRequestPayload,
  options?: {
    signal?: AbortSignal
  },
): Promise<GraphEntityMatchResponsePayload> {
  const response = await postEngineJson<
    EngineEntityMatchRequest,
    EngineEntityMatchResponse
  >(
    '/api/v1/entities/match',
    {
      text: input.text,
      entity_types: input.entityTypes,
      limit: input.limit,
      max_tokens_per_alias: input.maxTokensPerAlias,
    },
    options,
  )

  return {
    matches: response.matches.map((match) => ({
      matchId: match.match_id,
      entityType: match.entity_type,
      conceptNamespace: match.concept_namespace,
      conceptId: match.concept_id,
      sourceIdentifier: match.source_identifier,
      canonicalName: match.canonical_name,
      matchedText: match.matched_text,
      aliasText: match.alias_text,
      aliasSource: match.alias_source,
      startOffset: match.start,
      endOffset: match.end,
      paperCount: match.paper_count,
      isCanonical: match.is_canonical_alias,
      score: match.score,
    })),
  }
}

export async function fetchGraphEntityDetail(
  input: GraphEntityDetailRequestPayload,
  options?: {
    signal?: AbortSignal
  },
): Promise<GraphEntityDetailResponsePayload> {
  const response = await postEngineJson<
    EngineEntityDetailRequest,
    EngineEntityDetailResponse
  >(
    '/api/v1/entities/detail',
    {
      entity_type: input.entityType,
      source_identifier: input.sourceIdentifier,
    },
    options,
  )

  return {
    entityType: response.entity.entity_type,
    conceptNamespace: response.entity.concept_namespace,
    conceptId: response.entity.concept_id,
    sourceIdentifier: response.entity.source_identifier,
    canonicalName: response.entity.canonical_name,
    paperCount: response.entity.paper_count,
    aliases: response.entity.aliases.map((alias) => ({
      aliasText: alias.alias_text,
      isCanonical: alias.is_canonical,
      aliasSource: alias.alias_source,
    })),
    summary: response.entity.summary,
  }
}

export function toGraphEntityErrorResponse(
  error: unknown,
): GraphEntityErrorResponsePayload {
  if (error instanceof EngineApiError) {
    return {
      errorCode:
        isGraphEntityErrorCode(error.errorCode) ? error.errorCode : getErrorCode(error.status),
      errorMessage: error.message,
      requestId: error.requestId ?? getBodyStringField(error.body, 'request_id'),
      retryAfter: error.retryAfter,
      status: error.status,
    }
  }

  if (error instanceof Error) {
    return {
      errorCode: 'unknown_error',
      errorMessage: error.message,
      requestId: null,
      retryAfter: null,
      status: 500,
    }
  }

  return {
    errorCode: 'unknown_error',
    errorMessage: 'Unknown entity request error',
    requestId: null,
    retryAfter: null,
    status: 500,
  }
}

function getErrorCode(
  status: number,
): GraphEntityErrorResponsePayload['errorCode'] {
  if (status === 400) {
    return 'bad_request'
  }
  if (status === 401) {
    return 'unauthorized'
  }
  if (status === 403) {
    return 'forbidden'
  }
  if (status === 404) {
    return 'not_found'
  }
  if (status === 429) {
    return 'rate_limited'
  }
  if (status === 503) {
    return 'engine_request_failed'
  }
  return 'unknown_error'
}

function isGraphEntityErrorCode(
  value: string | null,
): value is GraphEntityErrorResponsePayload['errorCode'] {
  return (
    value === 'bad_request' ||
    value === 'unauthorized' ||
    value === 'forbidden' ||
    value === 'not_found' ||
    value === 'rate_limited' ||
    value === 'engine_request_failed' ||
    value === 'unknown_error'
  )
}

function getBodyStringField(body: unknown, key: string) {
  if (!body || typeof body !== 'object') {
    return null
  }

  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}
