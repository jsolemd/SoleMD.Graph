import { NextRequest, NextResponse } from "next/server";
import { fetchWikiPageContext } from "@solemd/api-client/server/wiki";
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
    const pageContext = await fetchWikiPageContext(slug, graphReleaseId);
    return NextResponse.json(pageContext);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to load wiki page context");
  }
}
