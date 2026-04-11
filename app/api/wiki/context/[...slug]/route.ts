import { NextRequest, NextResponse } from "next/server";
import { fetchWikiPageContext } from "@/lib/engine/wiki";
import { resolveWikiSlug, toWikiErrorResponse } from "../../_lib";

type RouteContext = {
  params: Promise<{
    slug: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug: slugParts } = await context.params;
  const slug = resolveWikiSlug(slugParts);
  if (!slug) {
    return NextResponse.json({ error: "Wiki slug is required" }, { status: 400 });
  }

  const graphReleaseId =
    request.nextUrl.searchParams.get("graph_release_id") ?? undefined;

  try {
    const pageContext = await fetchWikiPageContext(slug, graphReleaseId);
    return NextResponse.json(pageContext);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to load wiki page context");
  }
}
