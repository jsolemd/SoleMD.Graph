import { NextResponse } from "next/server";
import { toGraphEntityErrorResponse } from "@/lib/engine/entities";

const BAD_REQUEST_ENTITY_RESPONSE = {
  errorCode: "bad_request",
  errorMessage: "Invalid JSON body",
  requestId: null,
  retryAfter: null,
  status: 400,
} as const;

export async function readEntityRequestJson<TPayload>(
  request: Request,
): Promise<TPayload | NextResponse> {
  try {
    return (await request.json()) as TPayload;
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
