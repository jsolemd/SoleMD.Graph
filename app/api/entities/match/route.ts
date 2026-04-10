import { NextResponse } from "next/server";
import { matchGraphEntities, toGraphEntityErrorResponse } from "@/lib/engine/entities";
import type { GraphEntityMatchRequestPayload } from "@/features/graph/types/entity-service";

export async function POST(request: Request) {
  let payload: GraphEntityMatchRequestPayload;

  try {
    payload = (await request.json()) as GraphEntityMatchRequestPayload;
  } catch {
    return NextResponse.json(
      {
        errorCode: "bad_request",
        errorMessage: "Invalid JSON body",
        requestId: null,
        retryAfter: null,
        status: 400,
      },
      { status: 400 },
    );
  }

  try {
    const data = await matchGraphEntities(payload, {
      signal: request.signal,
    });
    return NextResponse.json(data);
  } catch (error) {
    const response = toGraphEntityErrorResponse(error);
    return NextResponse.json(response, { status: response.status });
  }
}
