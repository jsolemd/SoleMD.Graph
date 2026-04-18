import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { EngineApiError } from "@solemd/api-client/server/client";

export type WikiSlugRouteContext = {
  params: Promise<{
    slug: string[];
  }>;
};

export function resolveWikiSlug(slugParts: string[] | undefined): string | null {
  const slug = (slugParts ?? []).join("/").trim();
  return slug.length > 0 ? slug : null;
}

export async function resolveWikiSlugFromContext(
  context: WikiSlugRouteContext,
): Promise<string | NextResponse> {
  const { slug: slugParts } = await context.params;
  const slug = resolveWikiSlug(slugParts);
  if (!slug) {
    return NextResponse.json({ error: "Wiki slug is required" }, { status: 400 });
  }
  return slug;
}

export function readWikiGraphReleaseId(request: NextRequest): string | undefined {
  return request.nextUrl.searchParams.get("graph_release_id") ?? undefined;
}

export function resolveRequiredWikiGraphReleaseId(
  request: NextRequest,
): string | NextResponse {
  const graphReleaseId = readWikiGraphReleaseId(request)?.trim() ?? "";
  if (graphReleaseId.length === 0) {
    return NextResponse.json(
      { error: "graph_release_id is required" },
      { status: 400 },
    );
  }
  return graphReleaseId;
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
