import { NextRequest, NextResponse } from "next/server";
import { searchWiki } from "@solemd/api-client/server/wiki";
import { toWikiErrorResponse } from "../_lib";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limitValue = request.nextUrl.searchParams.get("limit");
  const parsedLimit = limitValue == null ? 20 : Number.parseInt(limitValue, 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 100)
    : 20;

  if (query.length === 0) {
    return NextResponse.json({ hits: [], total: 0 });
  }

  try {
    const result = await searchWiki(query, limit);
    return NextResponse.json(result);
  } catch (error) {
    return toWikiErrorResponse(error, "Failed to search wiki pages");
  }
}
