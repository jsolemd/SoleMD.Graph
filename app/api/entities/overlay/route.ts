import { NextResponse } from "next/server";
import { overlayGraphEntities, toGraphEntityErrorResponse } from "@/lib/engine/entities";
import type { GraphEntityOverlayRequestPayload } from "@/features/graph/types/entity-service";

export async function POST(request: Request) {
  let payload: GraphEntityOverlayRequestPayload;

  try {
    payload = (await request.json()) as GraphEntityOverlayRequestPayload;
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
    const data = await overlayGraphEntities(payload, {
      signal: request.signal,
    });
    return NextResponse.json(data);
  } catch (error) {
    const response = toGraphEntityErrorResponse(error);
    return NextResponse.json(response, { status: response.status });
  }
}
