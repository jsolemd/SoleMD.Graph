import 'server-only'

const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8300'

export class EngineApiError extends Error {
  status: number
  body: unknown
  errorCode: string | null
  requestId: string | null
  retryAfter: number | null

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'EngineApiError'
    this.status = status
    this.body = body
    this.errorCode =
      typeof body === 'object' && body !== null && 'error_code' in body
        ? String((body as { error_code?: unknown }).error_code ?? '')
        : null
    this.requestId =
      typeof body === 'object' && body !== null && 'request_id' in body
        ? String((body as { request_id?: unknown }).request_id ?? '')
        : null
    this.retryAfter =
      typeof body === 'object' &&
      body !== null &&
      'retry_after' in body &&
      typeof (body as { retry_after?: unknown }).retry_after === 'number'
        ? (body as { retry_after: number }).retry_after
        : null
  }
}

function getEngineUrl() {
  return (process.env.ENGINE_URL || DEFAULT_ENGINE_URL).replace(/\/+$/, '')
}

function getEngineHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const apiKey = process.env.ENGINE_API_KEY
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

function buildEngineRequestInit(body: unknown, signal?: AbortSignal, accept?: string) {
  const headers = getEngineHeaders()
  if (accept) {
    headers.Accept = accept
  }

  return {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store' as const,
    signal,
  }
}

async function parseErrorBody(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }
  return response.text().catch(() => null)
}

function getErrorMessage(status: number, errorBody: unknown) {
  if (typeof errorBody === 'string' && errorBody.trim().length > 0) {
    return errorBody
  }

  if (!errorBody || typeof errorBody !== 'object') {
    return `Engine request failed with ${status}`
  }

  const body = errorBody as {
    error_message?: unknown
    detail?: unknown
  }

  if (typeof body.error_message === 'string' && body.error_message.trim().length > 0) {
    return body.error_message
  }

  if (typeof body.detail === 'string' && body.detail.trim().length > 0) {
    return body.detail
  }

  if (Array.isArray(body.detail)) {
    const parts = body.detail
      .map((item) => formatValidationError(item))
      .filter((message): message is string => Boolean(message))
    if (parts.length > 0) {
      return parts.join('; ')
    }
  }

  return `Engine request failed with ${status}`
}

function formatValidationError(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as {
    loc?: unknown
    msg?: unknown
  }
  const location = Array.isArray(item.loc)
    ? item.loc
        .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
        .join('.')
    : null
  const message = typeof item.msg === 'string' ? item.msg : null

  if (location && message) {
    return `${location}: ${message}`
  }
  return message
}

async function executeEnginePost(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  accept?: string,
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${getEngineUrl()}${path}`, buildEngineRequestInit(body, signal, accept))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new EngineApiError(
      `Evidence engine unavailable at ${getEngineUrl()}. Start the engine or set ENGINE_URL.`,
      503,
      { error_code: 'engine_request_failed', request_id: null, retry_after: null },
    )
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response)
    throw new EngineApiError(getErrorMessage(response.status, errorBody), response.status, errorBody)
  }

  return response
}

export async function getEngineJson<TResponse>(
  path: string,
  init?: {
    signal?: AbortSignal
  },
): Promise<TResponse> {
  const headers = getEngineHeaders()
  let response: Response
  try {
    response = await fetch(`${getEngineUrl()}${path}`, {
      method: 'GET',
      headers,
      cache: 'no-store' as const,
      signal: init?.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new EngineApiError(
      `Evidence engine unavailable at ${getEngineUrl()}. Start the engine or set ENGINE_URL.`,
      503,
      { error_code: 'engine_request_failed', request_id: null, retry_after: null },
    )
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response)
    throw new EngineApiError(getErrorMessage(response.status, errorBody), response.status, errorBody)
  }

  return response.json() as Promise<TResponse>
}

export async function postEngineJson<TRequest, TResponse>(
  path: string,
  body: TRequest,
  init?: {
    signal?: AbortSignal
  },
): Promise<TResponse> {
  const response = await executeEnginePost(path, body, init?.signal)
  return response.json() as Promise<TResponse>
}

export async function postEngineBinary<TRequest>(
  path: string,
  body: TRequest,
  init?: {
    signal?: AbortSignal
    accept?: string
  },
): Promise<Uint8Array> {
  const response = await executeEnginePost(path, body, init?.signal, init?.accept)
  return new Uint8Array(await response.arrayBuffer())
}
