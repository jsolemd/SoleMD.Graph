import { NextResponse } from "next/server";
import { EngineApiError } from "@/lib/engine/client";

export function resolveWikiSlug(slugParts: string[] | undefined): string | null {
  const slug = (slugParts ?? []).join("/").trim();
  return slug.length > 0 ? slug : null;
}

export function toWikiErrorResponse(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof EngineApiError) {
    return NextResponse.json(
      {
        error: error.message,
        error_code: error.errorCode ?? "engine_request_failed",
        request_id: error.requestId,
        retry_after: error.retryAfter,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}
