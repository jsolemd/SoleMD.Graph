import { NextRequest, NextResponse } from "next/server";
import { fetchWikiPageBundle } from "@/lib/engine/wiki";
import {
  readWikiGraphReleaseId,
  resolveWikiSlugFromContext,
  toWikiErrorResponse,
} from "../../_lib";
import type { WikiSlugRouteContext } from "../../_lib";

export async function GET(
  request: NextRequest,
  context: WikiSlugRouteContext,
) {
  const slug = await resolveWikiSlugFromContext(context);
  if (slug instanceof NextResponse) {
    return slug;
  }

  const graphReleaseId = readWikiGraphReleaseId(request);

  try {
    const bundle = await fetchWikiPageBundle(slug, graphReleaseId);
    if (!bundle) {
      return NextResponse.json(
        { error: `Wiki page not found: ${slug}` },
        { status: 404 },
      );
    }
    return NextResponse.json(bundle);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to load wiki page bundle");
  }
}
