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

async function parseErrorBody(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }
  return response.text().catch(() => null)
}

export async function postEngineJson<TRequest, TResponse>(
  path: string,
  body: TRequest,
  init?: {
    signal?: AbortSignal
  },
): Promise<TResponse> {
  const response = await fetch(`${getEngineUrl()}${path}`, {
    method: 'POST',
    headers: getEngineHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: init?.signal,
  })

  if (!response.ok) {
    const errorBody = await parseErrorBody(response)
    const message =
      typeof errorBody === 'string'
        ? errorBody
        : (errorBody as { error_message?: string; detail?: string } | null)?.error_message ||
          (errorBody as { detail?: string } | null)?.detail ||
          `Engine request failed with ${response.status}`
    throw new EngineApiError(message, response.status, errorBody)
  }

  return response.json() as Promise<TResponse>
}
