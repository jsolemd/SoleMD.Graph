'use client'

import type {
  GraphEntityDetailRequestPayload,
  GraphEntityDetailResponsePayload,
  GraphEntityErrorResponsePayload,
  GraphEntityMatchRequestPayload,
  GraphEntityMatchResponsePayload,
} from '@/features/graph/types/entity-service'

export class GraphEntityRequestError extends Error {
  readonly payload: GraphEntityErrorResponsePayload

  constructor(payload: GraphEntityErrorResponsePayload) {
    super(payload.errorMessage)
    this.name = 'GraphEntityRequestError'
    this.payload = payload
  }
}

async function postGraphEntityJson<TRequest, TResponse>(
  path: string,
  input: TRequest,
  options?: { signal?: AbortSignal },
): Promise<TResponse> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    cache: 'no-store',
    signal: options?.signal,
  })

  const payload = (await response.json().catch(() => null)) as
    | TResponse
    | GraphEntityErrorResponsePayload
    | null

  if (!response.ok) {
    throw new GraphEntityRequestError(
      payload && typeof payload === 'object'
        ? ({
            errorCode: 'unknown_error',
            errorMessage: 'Entity request failed',
            requestId: null,
            retryAfter: null,
            status: response.status,
            ...payload,
          } as GraphEntityErrorResponsePayload)
        : {
            errorCode: 'unknown_error',
            errorMessage: 'Entity request failed',
            requestId: null,
            retryAfter: null,
            status: response.status,
          },
    )
  }

  return payload as TResponse
}

export async function fetchGraphEntityMatches(
  input: GraphEntityMatchRequestPayload,
  options?: { signal?: AbortSignal },
): Promise<GraphEntityMatchResponsePayload> {
  return postGraphEntityJson<
    GraphEntityMatchRequestPayload,
    GraphEntityMatchResponsePayload
  >('/api/entities/match', input, options)
}

export async function fetchGraphEntityDetail(
  input: GraphEntityDetailRequestPayload,
  options?: { signal?: AbortSignal },
): Promise<GraphEntityDetailResponsePayload> {
  return postGraphEntityJson<
    GraphEntityDetailRequestPayload,
    GraphEntityDetailResponsePayload
  >('/api/entities/detail', input, options)
}
