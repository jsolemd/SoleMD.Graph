import { NextRequest, NextResponse } from "next/server";
import { fetchWikiPage } from "@/lib/engine/wiki";
import {
  readWikiGraphReleaseId,
  resolveWikiSlugFromContext,
  toWikiErrorResponse,
  type WikiSlugRouteContext,
} from "../../_lib";

export async function GET(request: NextRequest, context: WikiSlugRouteContext) {
  const slug = await resolveWikiSlugFromContext(context);
  if (slug instanceof NextResponse) {
    return slug;
  }
  const graphReleaseId = readWikiGraphReleaseId(request);

  try {
    const page = await fetchWikiPage(slug, graphReleaseId);
    if (!page) {
      return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to load wiki page");
  }
}
