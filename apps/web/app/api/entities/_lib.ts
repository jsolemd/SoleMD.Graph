import { NextResponse } from "next/server";
import { toGraphEntityErrorResponse } from "@solemd/api-client/server/entities";

export const ENTITY_ROUTE_MAX_BODY_BYTES = 64 * 1024;

const BAD_REQUEST_ENTITY_RESPONSE = {
  errorCode: "bad_request",
  errorMessage: "Invalid JSON body",
  requestId: null,
  retryAfter: null,
  status: 400,
} as const;

const PAYLOAD_TOO_LARGE_ENTITY_RESPONSE = {
  errorCode: "bad_request",
  errorMessage: `Entity request body exceeds the allowed size (${ENTITY_ROUTE_MAX_BODY_BYTES} bytes max)`,
  requestId: null,
  retryAfter: null,
  status: 413,
} as const;

export async function readEntityRequestJson<TPayload>(
  request: Request,
): Promise<TPayload | NextResponse> {
  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > ENTITY_ROUTE_MAX_BODY_BYTES) {
    return NextResponse.json(PAYLOAD_TOO_LARGE_ENTITY_RESPONSE, { status: 413 });
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(BAD_REQUEST_ENTITY_RESPONSE, { status: 400 });
  }

  if (getUtf8ByteLength(rawBody) > ENTITY_ROUTE_MAX_BODY_BYTES) {
    return NextResponse.json(PAYLOAD_TOO_LARGE_ENTITY_RESPONSE, { status: 413 });
  }

  try {
    return JSON.parse(rawBody) as TPayload;
  } catch {
    return NextResponse.json(BAD_REQUEST_ENTITY_RESPONSE, { status: 400 });
  }
}

export async function handleEntityPost<TPayload, TResponse>(
  request: Request,
  handler: (payload: TPayload) => Promise<TResponse>,
): Promise<NextResponse> {
  const payload = await readEntityRequestJson<TPayload>(request);
  if (payload instanceof NextResponse) {
    return payload;
  }

  try {
    const data = await handler(payload);
    return NextResponse.json(data);
  } catch (error) {
    return toEntityErrorResponse(error);
  }
}

export function toEntityErrorResponse(error: unknown): NextResponse {
  const response = toGraphEntityErrorResponse(error);
  return NextResponse.json(response, { status: response.status });
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
