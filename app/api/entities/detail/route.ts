import { NextResponse } from "next/server";
import {
  fetchGraphEntityDetail,
  toGraphEntityErrorResponse,
} from "@/lib/engine/entities";
import type { GraphEntityDetailRequestPayload } from "@/features/graph/types/entity-service";

export async function POST(request: Request) {
  let payload: GraphEntityDetailRequestPayload;

  try {
    payload = (await request.json()) as GraphEntityDetailRequestPayload;
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
    const data = await fetchGraphEntityDetail(payload, {
      signal: request.signal,
    });
    return NextResponse.json(data);
  } catch (error) {
    const response = toGraphEntityErrorResponse(error);
    return NextResponse.json(response, { status: response.status });
  }
}
