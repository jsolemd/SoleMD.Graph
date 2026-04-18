import { NextResponse } from "next/server";
import { fetchWikiBacklinks } from "@solemd/api-client/server/wiki";
import { resolveWikiSlug, toWikiErrorResponse } from "../../_lib";

type RouteContext = {
  params: Promise<{
    slug: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug: slugParts } = await context.params;
  const slug = resolveWikiSlug(slugParts);
  if (!slug) {
    return NextResponse.json({ error: "Wiki slug is required" }, { status: 400 });
  }

  try {
    const backlinks = await fetchWikiBacklinks(slug);
    return NextResponse.json(backlinks);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to load wiki backlinks");
  }
}
