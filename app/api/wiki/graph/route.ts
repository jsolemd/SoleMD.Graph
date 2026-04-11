import { NextRequest, NextResponse } from "next/server";
import { fetchWikiGraph } from "@/lib/engine/wiki";
import { toWikiErrorResponse } from "../_lib";

export async function GET(request: NextRequest) {
  const graphReleaseId =
    request.nextUrl.searchParams.get("graph_release_id")?.trim() ?? "";
  if (graphReleaseId.length === 0) {
    return NextResponse.json(
      { error: "graph_release_id is required" },
      { status: 400 },
    );
  }

  try {
    const graph = await fetchWikiGraph(graphReleaseId);
    return NextResponse.json(graph);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to load wiki graph");
  }
}
