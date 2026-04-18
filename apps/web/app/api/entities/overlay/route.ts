import { overlayGraphEntities } from "@solemd/api-client/server/entities";
import type { GraphEntityOverlayRequestPayload } from "@solemd/api-client/shared/graph-entity";
import { handleEntityPost } from "../_lib";

export async function POST(request: Request) {
  return handleEntityPost<GraphEntityOverlayRequestPayload, Awaited<ReturnType<typeof overlayGraphEntities>>>(
    request,
    (payload) => overlayGraphEntities(payload, {
      signal: request.signal,
    }),
  );
}
