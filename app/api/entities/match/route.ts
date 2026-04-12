import { matchGraphEntities } from "@/lib/engine/entities";
import type { GraphEntityMatchRequestPayload } from "@/features/graph/types/entity-service";
import { handleEntityPost } from "../_lib";

export async function POST(request: Request) {
  return handleEntityPost<GraphEntityMatchRequestPayload, Awaited<ReturnType<typeof matchGraphEntities>>>(
    request,
    (payload) => matchGraphEntities(payload, {
      signal: request.signal,
    }),
  );
}
