import { NextRequest, NextResponse } from "next/server";
import { fetchWikiGraph } from "@/lib/engine/wiki";
import { resolveRequiredWikiGraphReleaseId, toWikiErrorResponse } from "../_lib";

export async function GET(request: NextRequest) {
  const graphReleaseId = resolveRequiredWikiGraphReleaseId(request);
  if (graphReleaseId instanceof NextResponse) {
    return graphReleaseId;
  }

  try {
    const graph = await fetchWikiGraph(graphReleaseId);
    return NextResponse.json(graph);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to load wiki graph");
  }
}
