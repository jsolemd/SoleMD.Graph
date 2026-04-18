import { matchGraphEntities } from "@solemd/api-client/server/entities";
import type { GraphEntityMatchRequestPayload } from "@solemd/api-client/shared/graph-entity";
import { handleEntityPost } from "../_lib";

export async function POST(request: Request) {
  return handleEntityPost<GraphEntityMatchRequestPayload, Awaited<ReturnType<typeof matchGraphEntities>>>(
    request,
    (payload) => matchGraphEntities(payload, {
      signal: request.signal,
    }),
  );
}
