import { overlayGraphEntities } from "@/lib/engine/entities";
import type { GraphEntityOverlayRequestPayload } from "@/features/graph/types/entity-service";
import { handleEntityPost } from "../_lib";

export async function POST(request: Request) {
  return handleEntityPost<GraphEntityOverlayRequestPayload, Awaited<ReturnType<typeof overlayGraphEntities>>>(
    request,
    (payload) => overlayGraphEntities(payload, {
      signal: request.signal,
    }),
  );
}
